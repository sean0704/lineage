import * as THREE from 'three';
import { audio } from '../audio/Audio';
import { createRng, randomSeed, type Rng } from '../core/rng';
import { defaultStorage, deleteSave, hasLegacySave, readSave, writeSave, type StorageLike } from '../core/save';
import { createInitialPlayer, type PlayerState } from '../core/state';
import { getFloor, MAX_FLOOR } from '../data/floors';
import { getItem, type ConsumableDef, type Slot } from '../data/items';
import { getMonster } from '../data/monsters';
import { innCost } from '../data/shop';
import { createMonster, resolveTurn, rollRewards, startCombat, type CombatEvent, type CombatState, type PlayerAction } from '../systems/combat';
import { DIRS, generateFloor, idx, mostOpenDir, TILE, type Dir, type DungeonFloor, type MapMonster } from '../systems/dungeonGen';
import { adjacentHostile, bossAlive, reveal, step, turn, type Position } from '../systems/exploration';
import { addItem, buy, countOf, enchantGear, equip, gearName, sellConsumable, sellGear, unequip, useConsumable } from '../systems/inventory';
import { rollBossBonus, rollChest, CHEST_NAMES, type ChestLoot } from '../systems/loot';
import { applyDeathPenalty, fullRestore, gainXp, getStats, knownSkills, type LevelUpInfo } from '../systems/progression';
import { DungeonView, EYE_HEIGHT } from '../render/DungeonView';
import { Effects } from '../render/effects';
import { HeroView } from '../render/HeroView';
import { CELL, type AttackStyle, type MonsterView } from '../render/MonsterView';
import { Renderer } from '../render/Renderer';
import type { Quality } from '../render/PostFX';
import { loadSettings, saveSettings, type Settings } from './settings';
import { ease, lerpAngle } from '../render/Tween';
import { VillageView } from '../render/VillageView';
import { $, btn, h } from '../ui/dom';
import { Fx } from '../ui/Fx';
import { Toasts } from '../ui/Toasts';
import { Tips } from '../ui/Tips';
import { Hud, QUICK_ITEMS } from '../ui/Hud';
import { Log, type LogTone } from '../ui/Log';
import { drawMinimap } from '../ui/Minimap';
import { Modal } from '../ui/Modal';
import { helpBody, openEnchantPicker, openInventory, openShop, statsBody, teleportBody, type PanelHost } from '../ui/panels';

type Mode = 'title' | 'village' | 'dungeon' | 'combat' | 'dead';

const SKILL_KEYS = ['z', 'x', 'c', 'v', 'b'];
const RANGED_MOVES = new Set(['shoot']);
const MAGIC_MOVES = new Set(['iceLance', 'blizzard', 'hellfire', 'gaze', 'drain', 'paralyzeGaze', 'curse', 'fireBreath', 'venom']);

const yawFor = (dir: Dir) => -dir * (Math.PI / 2);

/** 樓層環境音的頻率 → 配樂主音（MIDI，升高兩個八度） */
const musicRoot = (droneHz: number) => Math.round(12 * Math.log2(droneHz / 440) + 69) + 24;

export class Game implements PanelHost {
  readonly renderer: Renderer;
  readonly modal = new Modal();
  private readonly effects: Effects;
  private readonly hero: HeroView;
  private readonly hud: Hud;
  private readonly log = new Log();
  private readonly fx = new Fx();
  private readonly toasts = new Toasts();
  private readonly tips = new Tips();
  private stepsThisFloor = 0;
  private readonly storage: StorageLike | null = defaultStorage();
  private readonly minimap = $('minimap') as HTMLCanvasElement;
  private readonly actionsEl = $('actions');
  private readonly promptEl = $('prompt');
  private readonly dpadEl = $('dpad');

  player: PlayerState = createInitialPlayer();
  private readonly settings: Settings = loadSettings();
  private runSeed = randomSeed();
  private rng: Rng = createRng(randomSeed());
  private mode: Mode = 'title';
  private busy = false;
  private queued: (() => Promise<void>) | null = null;
  private dungeon: DungeonFloor | null = null;
  private dview: DungeonView | null = null;
  private pos: Position | null = null;
  private combat: { cs: CombatState; map: MapMonster; view: MonsterView | undefined } | null = null;
  private pendingStairs: 'up' | 'down' | null = null;
  private floorVisits = 0;
  private saveTimer = 0;
  private stopTitleOrbit: (() => void) | null = null;
  /** 玩家手持火把的光源，跟著攝影機移動 */
  private readonly handLight = new THREE.PointLight(0xffb27a, 7, 12, 1.6);

  constructor() {
    this.renderer = new Renderer($('viewport'), this.settings.quality);
    this.effects = new Effects(this.renderer.tweens);
    this.renderer.scene.add(this.effects.group);
    this.hero = new HeroView(this.renderer.camera);
    this.handLight.position.set(0.35, 0.25, 0.1);
    this.handLight.visible = false;
    this.renderer.rig.add(this.handLight);
    this.hud = new Hud((key) => this.quickUse(key));
    this.renderer.onFrame((dt, t) => {
      this.effects.update(dt);
      this.hero.update(dt);
      if (this.handLight.visible) this.handLight.intensity = 7 + Math.sin(t * 2.7) * 0.35 + Math.sin(t * 4.3) * 0.25;
    });
    this.bindInput();
    this.buildDpad();
    $('btn-bag').addEventListener('click', () => this.openBag());
    $('btn-menu').addEventListener('click', () => this.openMenu());
    window.addEventListener('beforeunload', () => this.save());
    this.renderer.start();
  }

  // ═════════════════════ PanelHost ═════════════════════

  get inCombat(): boolean {
    return this.mode === 'combat';
  }

  get inVillage(): boolean {
    return this.mode === 'village';
  }

  useItem(key: string): void {
    this.quickUse(key);
  }

  equip(uid: string): void {
    const gear = this.player.bag.find((g) => g.uid === uid);
    if (!gear || this.inCombat) return;
    const r = equip(this.player, uid);
    if (r.ok) {
      audio.click();
      this.say(`裝備了 ${gearName(gear)}${r.replaced ? `，換下 ${gearName(r.replaced)}` : ''}。`, 'sys');
      this.afterInventoryChange();
    }
  }

  unequip(slot: Slot): void {
    if (this.inCombat) return;
    const g = unequip(this.player, slot);
    if (g) {
      audio.click();
      this.say(`卸下了 ${gearName(g)}。`, 'sys');
      this.afterInventoryChange();
    }
  }

  enchant(uid: string, scrollKey: string): void {
    const res = enchantGear(this.player, uid, scrollKey, this.rng);
    if (res.outcome === 'invalid' || !res.gear) return;
    const name = getItem(res.gear.key).name;
    if (res.outcome === 'success') {
      audio.enchantSuccess();
      this.renderer.post.pulse(0x78b4ff, 0.45);
      this.say(`${name} 散發出一陣藍光……強化成功！現在是 +${res.gear.enchant}。`, 'level');
    } else {
      audio.enchantFail();
      this.renderer.post.pulse(0xffffff, 0.6);
      this.say(`${name} 發出強烈的光芒後……蒸發消失了。`, 'hurt');
      this.fx.showBanner('裝備蒸發了……', `+${res.gear.enchant} ${name}`, 'warn');
    }
    this.afterInventoryChange();
  }

  buy(key: string, qty: number): void {
    const r = buy(this.player, key, qty);
    if (r.ok) audio.coin();
    else audio.error();
    this.say(r.text, r.ok ? 'loot' : 'warn');
    this.afterInventoryChange();
  }

  sellConsumable(key: string, qty: number): void {
    const r = sellConsumable(this.player, key, qty);
    if (r.ok) audio.coin();
    this.say(r.text, 'loot');
    this.afterInventoryChange();
  }

  sellGear(uid: string): void {
    const r = sellGear(this.player, uid);
    if (r.ok) audio.coin();
    this.say(r.text, 'loot');
    this.afterInventoryChange();
  }

  private afterInventoryChange(): void {
    this.syncHeroEquipment();
    this.refresh();
    this.scheduleSave();
  }

  // ═════════════════════ 流程 ═════════════════════

  showTitle(): void {
    this.mode = 'title';
    this.renderer.setView(new VillageView(this.effects));
    this.placeVillageCamera();
    this.startTitleOrbit();
    this.hero.group.visible = false;
    this.handLight.visible = false;
    const title = $('title');
    title.classList.remove('is-hidden');
    title.inert = false;
    const actions = $('title-actions');
    const note = $('title-note');
    const save = readSave(this.storage);
    actions.replaceChildren();
    if (save) {
      const p = save.player;
      actions.append(btn(`繼續冒險　Lv.${p.level} ${p.name}`, () => this.beginFromSave(), { variant: 'gold' }));
      actions.append(btn('新的冒險', () => this.confirmNewGame(), { variant: 'ghost' }));
    } else {
      actions.append(btn('開始冒險', () => this.askName(), { variant: 'gold' }));
    }
    actions.append(btn('操作說明', () => this.modal.open({ title: '操作說明', body: helpBody(), wide: true }), { variant: 'ghost' }));
    note.textContent = hasLegacySave(this.storage) ? '偵測到舊版（v1）存檔，因數值系統全面重製已無法沿用。' : '';
    this.renderActions();
    this.refresh();
    audio.setAmbient('village');
    audio.setMusic('village');
  }

  /** 標題畫面時鏡頭繞營火緩慢環繞（遊玩中不會有任何鏡頭搖擺） */
  private startTitleOrbit(): void {
    this.stopTitleOrbit?.();
    const start = performance.now();
    this.stopTitleOrbit = this.renderer.onFrame(() => {
      if (this.mode !== 'title') {
        this.stopTitleOrbit?.();
        this.stopTitleOrbit = null;
        return;
      }
      const a = ((performance.now() - start) / 1000) * 0.06 + 0.2;
      this.renderer.rig.position.set(Math.sin(a) * 6.2, 1.9, Math.cos(a) * 6.2);
      this.renderer.rig.rotation.set(0, 0, 0);
      this.renderer.camera.lookAt(0, 0.9, 0);
    });
  }

  private hideTitle(): void {
    audio.unlock();
    const title = $('title');
    title.classList.add('is-hidden');
    title.inert = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private confirmNewGame(): void {
    this.modal.open({
      title: '開始新的冒險？',
      body: h('p', { text: '目前的存檔將會被覆蓋，此動作無法復原。' }),
      actions: [btn('取消', () => this.modal.close(), { variant: 'neutral' }), btn('覆蓋並開始', () => this.askName(), { variant: 'danger' })],
    });
  }

  private askName(): void {
    const input = h('input', { class: 'text-input', attrs: { maxlength: '12', placeholder: '騎士', 'aria-label': '角色名稱', value: '' } });
    const start = () => {
      const name = input.value.trim() || '騎士';
      this.modal.close(true);
      this.newGame(name);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') start();
    });
    this.modal.open({
      title: '為你的騎士命名',
      body: h('div', {}, h('p', { class: 'row__meta', text: '你是一名剛結束木人場訓練的見習騎士，奇岩村的村民都在等待你討伐死亡騎士的好消息。' }), input),
      actions: [btn('出發！', start, { variant: 'gold' })],
    });
    window.setTimeout(() => input.focus(), 30);
  }

  private newGame(name: string): void {
    deleteSave(this.storage);
    this.player = createInitialPlayer(name);
    this.runSeed = randomSeed();
    this.rng = createRng(randomSeed());
    this.log.clear();
    this.hideTitle();
    this.say(`${name}，歡迎來到奇岩村。`, 'level');
    this.say('從村莊出發，走進古魯丁地監吧。按 Esc 可隨時查看操作說明。', 'sys');
    this.save();
    this.goVillage(false);
  }

  private beginFromSave(): void {
    const save = readSave(this.storage);
    if (!save) return this.askName();
    this.player = save.player;
    this.runSeed = save.runSeed;
    this.rng = createRng(randomSeed());
    this.log.clear();
    this.hideTitle();
    this.say(`歡迎回來，${this.player.name}。`, 'level');
    this.goVillage(false);
  }

  private async goVillage(withFade = true): Promise<void> {
    this.clearPrompt();
    this.combat = null;
    if (withFade) await this.fx.fadeOut();
    this.mode = 'village';
    this.dungeon = null;
    this.dview = null;
    this.pos = null;
    this.player.buffs = { haste: 0, brave: 0 };
    this.renderer.setView(new VillageView(this.effects));
    this.placeVillageCamera();
    this.hero.group.visible = false;
    this.handLight.visible = false;
    this.hud.setLocation('奇岩村', '安全區域');
    audio.setAmbient('village');
    audio.setMusic('village');
    this.renderActions();
    this.refresh();
    this.save();
    if (withFade) await this.fx.fadeIn();
    this.tips.show('village');
  }

  private placeVillageCamera(): void {
    this.renderer.rig.position.copy(VillageView.CAMERA_POS);
    this.renderer.rig.rotation.set(0, 0, 0);
    this.renderer.camera.lookAt(VillageView.CAMERA_TARGET);
  }

  private async enterFloor(floor: number, arriveAt: 'up' | 'down'): Promise<void> {
    this.clearPrompt();
    await this.fx.fadeOut();
    this.floorVisits++;
    const seed = (this.runSeed + floor * 7919 + this.floorVisits * 104729) >>> 0;
    const d = generateFloor(floor, seed, { runSeed: this.runSeed, bossDefeated: this.player.bossesDefeated.includes(floor) });
    const pos: Position = { ...d.spawn };
    if (arriveAt === 'down' && d.down) {
      const n = DIRS.map((dd, i) => ({ x: d.down!.x + dd.dx, y: d.down!.y + dd.dy, i }))
        .find((c) => d.tiles[idx(d.size, c.x, c.y)] === TILE.floor && !d.monsters.some((m) => m.x === c.x && m.y === c.y) && !d.chests.some((ch) => ch.x === c.x && ch.y === c.y));
      if (n) {
        pos.x = n.x;
        pos.y = n.y;
        pos.facing = mostOpenDir(d.tiles, d.size, n.x, n.y);
      }
      // 從下層上來時，附近的怪物先保持安靜
      for (const m of d.monsters) if (Math.abs(m.x - pos.x) + Math.abs(m.y - pos.y) < 6) m.calm = 3;
    }
    this.dungeon = d;
    this.pos = pos;
    reveal(d, pos);
    this.player.deepestFloor = Math.max(this.player.deepestFloor, floor);
    const theme = getFloor(floor).theme;
    this.dview = new DungeonView(d, theme, this.renderer.camera);
    this.renderer.setView(this.dview);
    this.renderer.camera.rotation.set(0, 0, 0);
    this.placeCamera(pos.x, pos.y, pos.facing);
    this.hero.group.visible = true;
    this.handLight.visible = true;
    this.syncHeroEquipment();
    this.mode = 'dungeon';
    this.hud.setLocation(`古魯丁地監 地下 ${floor} 層`, theme.name);
    audio.setAmbient('dungeon', theme.drone);
    audio.setMusic('dungeon', musicRoot(theme.drone));
    this.renderActions();
    this.refresh();
    this.save();
    await this.fx.fadeIn();
    this.fx.showBanner(`地下 ${floor} 層`, theme.name);
    this.stepsThisFloor = 0;
    this.tips.dismiss('village');
    this.tips.show('move');
    if (d.bossKey) window.setTimeout(() => this.tips.show('boss'), 2500);
    if (d.bossKey) {
      const boss = getMonster(d.bossKey);
      window.setTimeout(() => {
        this.say(`你感到一股強大的邪氣……${boss.name}就在這一層！`, 'boss');
        audio.bossAlert();
      }, 900);
    }
  }

  // ═════════════════════ 攝影機 ═════════════════════

  private placeCamera(x: number, y: number, facing: Dir): void {
    this.renderer.rig.position.set(x * CELL, EYE_HEIGHT, y * CELL);
    this.renderer.rig.rotation.set(0, yawFor(facing), 0);
  }

  private async moveCamera(x: number, y: number, ms = 210): Promise<void> {
    const rig = this.renderer.rig;
    const from = rig.position.clone();
    const to = new THREE.Vector3(x * CELL, EYE_HEIGHT, y * CELL);
    this.hero.setWalking(true);
    await this.renderer.tweens.to(ms, (k) => rig.position.lerpVectors(from, to, k), { easing: ease.inOutQuad });
    this.hero.setWalking(false);
  }

  private async turnCamera(facing: Dir, ms = 180): Promise<void> {
    const rig = this.renderer.rig;
    const from = rig.rotation.y;
    const to = yawFor(facing);
    await this.renderer.tweens.to(ms, (k) => (rig.rotation.y = lerpAngle(from, to, k)), { easing: ease.inOutQuad });
    rig.rotation.y = to;
  }

  /** 戰鬥時往後退一點，讓大型怪物完整入鏡 */
  private async dolly(back: number, ms = 260): Promise<void> {
    if (!this.pos) return;
    const rig = this.renderer.rig;
    const dir = DIRS[this.pos.facing];
    const from = rig.position.clone();
    const to = new THREE.Vector3(this.pos.x * CELL - dir.dx * back, EYE_HEIGHT, this.pos.y * CELL - dir.dy * back);
    await this.renderer.tweens.to(ms, (k) => rig.position.lerpVectors(from, to, k));
  }

  private async bump(dir: Dir): Promise<void> {
    if (!this.pos) return;
    audio.bump();
    const rig = this.renderer.rig;
    const d = DIRS[dir];
    const base = rig.position.clone();
    await this.renderer.tweens.to(160, (k) => {
      const s = Math.sin(k * Math.PI) * 0.12;
      rig.position.set(base.x + d.dx * s, base.y, base.z + d.dy * s);
    }, { easing: ease.linear });
    rig.position.copy(base);
  }

  // ═════════════════════ 輸入 ═════════════════════

  /** 依序執行動作；忙碌時只保留最新一個排隊動作（按住方向鍵可連續移動） */
  private run(fn: () => Promise<void>, queueable = false): void {
    if (this.busy) {
      if (queueable) this.queued = fn;
      return;
    }
    this.busy = true;
    this.actionsEl.classList.add('is-busy');
    void fn()
      .catch((err) => console.error(err))
      .finally(() => {
        this.busy = false;
        this.actionsEl.classList.remove('is-busy');
        const next = this.queued;
        this.queued = null;
        if (next) this.run(next, true);
        else {
          this.renderActions();
          this.refresh();
        }
      });
  }

  private bindInput(): void {
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    window.addEventListener('keydown', (e) => {
      audio.unlock();
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      // 焦點在按鈕上時，Enter/空白鍵交給按鈕原生行為，避免重複觸發
      if (target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.modal.handleEscape()) return;
        if (this.pendingStairs) return this.clearPrompt();
        if (this.mode !== 'title') this.openMenu();
        return;
      }
      if (this.modal.isOpen || this.mode === 'title' || this.mode === 'dead') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (/^[1-8]$/.test(k)) {
        e.preventDefault();
        this.quickUse(QUICK_ITEMS[Number(k) - 1]);
        return;
      }
      if (k === 'i') return this.openBag();
      if (k === 'm') return this.openMap();

      if (this.mode === 'dungeon') {
        const moves: Record<string, () => void> = {
          w: () => this.moveRel(0), arrowup: () => this.moveRel(0),
          s: () => this.moveRel(2), arrowdown: () => this.moveRel(2),
          q: () => this.moveRel(3), e: () => this.moveRel(1),
          a: () => this.turnRel(-1), arrowleft: () => this.turnRel(-1),
          d: () => this.turnRel(1), arrowright: () => this.turnRel(1),
          enter: () => this.confirmPrompt(), ' ': () => this.confirmPrompt(),
        };
        const fn = moves[k];
        if (fn) {
          e.preventDefault();
          fn();
        }
      } else if (this.mode === 'combat') {
        let action: PlayerAction | null = null;
        if (k === ' ' || k === 'enter') action = { type: 'attack' };
        else if (k === 'f') action = { type: 'defend' };
        else if (k === 'r') action = { type: 'flee' };
        else if (SKILL_KEYS.includes(k)) {
          const skill = knownSkills(this.player)[SKILL_KEYS.indexOf(k)];
          if (skill) action = { type: 'skill', id: skill.id };
        }
        if (action) {
          e.preventDefault();
          if (!e.repeat) this.combatAction(action);
        }
      } else if (this.mode === 'village') {
        if (k === 'enter') this.enterDungeonFromVillage();
        else if (k === 'b') openShop(this);
        else if (k === 'n') this.openInn();
      }
    });
  }

  private buildDpad(): void {
    const mk = (label: string, aria: string, fn: () => void) =>
      h('button', { type: 'button', text: label, aria: { label: aria }, on: { click: (e) => { e.preventDefault(); fn(); } } });
    this.dpadEl.append(
      mk('↺', '左轉', () => this.turnRel(-1)),
      mk('▲', '前進', () => this.moveRel(0)),
      mk('↻', '右轉', () => this.turnRel(1)),
      mk('◀', '左移', () => this.moveRel(3)),
      mk('▼', '後退', () => this.moveRel(2)),
      mk('▶', '右移', () => this.moveRel(1)),
    );
  }

  private moveRel(rel: 0 | 1 | 2 | 3): void {
    if (this.mode !== 'dungeon' || this.modal.isOpen) return;
    this.run(() => this.doStep(((this.pos!.facing + rel) % 4) as Dir), true);
  }

  private turnRel(delta: 1 | -1): void {
    if (this.mode !== 'dungeon' || this.modal.isOpen || !this.pos) return;
    this.run(async () => {
      this.clearPrompt();
      this.pos!.facing = turn(this.pos!.facing, delta);
      await this.turnCamera(this.pos!.facing);
      this.drawMap();
    }, true);
  }

  // ═════════════════════ 探索 ═════════════════════

  private async doStep(dir: Dir): Promise<void> {
    const d = this.dungeon;
    const pos = this.pos;
    if (!d || !pos || this.mode !== 'dungeon') return;
    this.clearPrompt();
    const before = new Map(d.monsters.map((m) => [m.id, { x: m.x, y: m.y }]));
    const from = { x: pos.x, y: pos.y };
    const res = step(d, pos, dir, this.rng);
    const moved = pos.x !== from.x || pos.y !== from.y;

    if (moved) {
      this.player.stats.steps++;
      if (++this.stepsThisFloor >= 4) this.tips.dismiss('move');
      audio.footstep();
      const anims: Promise<void>[] = [this.moveCamera(pos.x, pos.y)];
      for (const m of d.monsters) {
        const b = before.get(m.id);
        if (m.alive && b && (b.x !== m.x || b.y !== m.y)) {
          const view = this.dview?.monsters.get(m.id);
          if (view) anims.push(view.moveTo(m.x, m.y, this.renderer.tweens));
        }
      }
      await Promise.all(anims);
      this.drawMap();
    }

    switch (res.type) {
      case 'blocked':
        await this.bump(dir);
        break;
      case 'stairs':
        this.showStairsPrompt(res.which, res.bossAlive);
        break;
      case 'chest':
        await this.openChest(res.chest.id);
        break;
      case 'encounter':
        await this.beginCombat(res.monster, res.ambush);
        break;
      case 'moved':
        break;
    }
  }

  private showStairsPrompt(which: 'up' | 'down', blocked: boolean): void {
    const floor = this.dungeon!.floor;
    if (which === 'down' && blocked) {
      audio.error();
      this.say('一股邪惡的力量封鎖了樓梯……必須先擊敗這一層的首領！', 'boss');
      return;
    }
    this.pendingStairs = which;
    const text = which === 'down' ? `走下樓梯，前往地下 ${floor + 1} 層？` : floor === 1 ? '走上樓梯回到奇岩村？' : `走上樓梯，回到地下 ${floor - 1} 層？`;
    this.promptEl.replaceChildren(
      h('span', { text }),
      btn('確認', () => this.confirmPrompt(), { variant: 'gold', key: 'Enter' }),
      btn('取消', () => this.clearPrompt(), { variant: 'ghost' }),
    );
    this.promptEl.hidden = false;
  }

  private clearPrompt(): void {
    this.pendingStairs = null;
    this.promptEl.hidden = true;
  }

  private confirmPrompt(): void {
    const which = this.pendingStairs;
    if (!which || !this.dungeon) return;
    const floor = this.dungeon.floor;
    this.clearPrompt();
    audio.stairs();
    this.run(async () => {
      if (which === 'down') await this.enterFloor(Math.min(MAX_FLOOR, floor + 1), 'up');
      else if (floor === 1) await this.goVillage();
      else await this.enterFloor(floor - 1, 'down');
    });
  }

  private async openChest(id: number): Promise<void> {
    const d = this.dungeon!;
    const chest = d.chests.find((c) => c.id === id);
    if (!chest || chest.opened || !this.dview) return;
    chest.opened = true;
    this.player.stats.chests++;
    audio.chest();
    const at = await this.dview.openChest(id, this.renderer.tweens);
    this.effects.burst(at, { color: chest.tier === 'legendary' ? 0xff9a3a : 0xffd23a, count: 40, speed: 1.6, lift: 1.5, gravity: -1.5, life: 1.2 });
    const loot = rollChest(chest.tier, d.floor, this.rng);
    this.say(`你打開了${CHEST_NAMES[chest.tier]}！`, 'loot');
    this.grantLoot(loot);
    this.fx.showBanner(CHEST_NAMES[chest.tier], '', '', 1600);
    this.drawMap();
    this.refresh();
    this.scheduleSave();
  }

  private grantLoot(loot: ChestLoot): void {
    this.player.gold += loot.gold;
    audio.coin();
    this.say(`獲得 ${loot.gold} 金幣。`, 'loot');
    this.toasts.gold(loot.gold);
    for (const it of loot.items) {
      addItem(this.player, it.key, it.qty);
      const def = getItem(it.key);
      this.say(`獲得 ${def.name}${it.qty > 1 ? ` ×${it.qty}` : ''}！`, def.rarity === 'legendary' ? 'level' : 'loot');
      this.toasts.item(it.key, it.qty);
      if (def.kind === 'equip') this.tips.show('loot');
      if (def.kind === 'consumable' && def.effect.type === 'enchant') this.tips.show('enchant');
      if (def.rarity === 'legendary') audio.levelUp();
    }
  }

  // ═════════════════════ 戰鬥 ═════════════════════

  private async beginCombat(map: MapMonster, ambush: boolean): Promise<void> {
    const pos = this.pos!;
    const dirIdx = DIRS.findIndex((dd) => dd.dx === map.x - pos.x && dd.dy === map.y - pos.y) as Dir;
    const monster = createMonster(map.key, map.level);
    const cs = startCombat(monster);
    this.combat = { cs, map, view: this.dview?.monsters.get(map.id) };
    this.mode = 'combat';
    this.clearPrompt();
    this.renderActions();
    if (dirIdx >= 0 && dirIdx !== pos.facing) {
      pos.facing = dirIdx;
      await this.turnCamera(dirIdx, 220);
    }
    await this.dolly(monster.boss || monster.def.model.kind !== 'humanoid' || (monster.def.model as { scale: number }).scale > 1.2 ? 0.75 : 0.45);
    const root = musicRoot(getFloor(this.dungeon!.floor).theme.drone);
    audio.setMusic(monster.boss ? 'boss' : 'combat', root);
    if (monster.boss) {
      audio.bossAlert();
      const view = this.combat.view;
      if (view) {
        this.effects.burst(view.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { color: 0x8a7a6a, count: 60, speed: 2.2, lift: 0.8, gravity: -1.2, life: 1.4, size: 0.09, spread: 1.2 });
        const aura = (monster.def.model as { aura?: number }).aura ?? 0xff3a1a;
        this.effects.burst(view.center(), { color: aura, count: 50, speed: 2.6, gravity: 0, life: 1.1, spread: 0.6 });
        this.renderer.post.impact(1.4);
        void view.intro(this.renderer.tweens);
      }
      this.renderer.shake(0.1, 1100);
      this.fx.showBanner(monster.name, `Lv.${monster.level}・${monster.def.flavor}`, 'boss', 3000);
      this.say(`⚠ ${monster.name}（Lv.${monster.level}）擋住了你的去路！`, 'boss');
    } else {
      this.say(ambush ? `${monster.name}（Lv.${monster.level}）從暗處撲了過來！` : `你向${monster.name}（Lv.${monster.level}）發起攻擊！`, 'warn');
    }
    this.drawMap();
    this.refresh();
    this.renderActions();
    this.tips.dismiss('move');
    this.tips.show('combat');
  }

  private combatAction(action: PlayerAction): void {
    if (this.mode !== 'combat' || !this.combat) return;
    this.run(async () => {
      const c = this.combat!;
      this.tips.dismiss('combat');
      this.tips.dismiss('charge');
      const res = resolveTurn(this.player, c.cs, action, this.rng);
      if (!res.turnUsed) {
        audio.error();
        for (const e of res.events) this.say(e.text, 'warn');
        return;
      }
      await this.present(res.events);
      this.refresh();
      if (c.cs.outcome) await this.endCombat();
    });
  }

  private attackStyle(moveId: string): AttackStyle {
    if (RANGED_MOVES.has(moveId)) return 'ranged';
    if (MAGIC_MOVES.has(moveId)) return 'magic';
    return 'melee';
  }

  private project(world: THREE.Vector3): { x: number; y: number } {
    return this.renderer.project(world);
  }

  private cameraPoint(forward = 0.7): THREE.Vector3 {
    const cam = this.renderer.camera;
    const p = new THREE.Vector3();
    cam.getWorldPosition(p);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    return p.addScaledVector(dir, forward).add(new THREE.Vector3(0, -0.25, 0));
  }

  /** 依序播放戰鬥事件的動畫、音效與文字 */
  private async present(events: CombatEvent[]): Promise<void> {
    const c = this.combat!;
    const view = c.view;
    const tw = this.renderer.tweens;
    const monsterColor = (c.cs.monster.def.model as { aura?: number; eye?: number }).aura ?? (c.cs.monster.def.model as { eye?: number }).eye ?? 0xff6a3a;

    for (const ev of events) {
      switch (ev.kind) {
        case 'heroHit':
        case 'heroMiss': {
          const heavy = ev.kind === 'heroHit' && (ev.crit || !!ev.skill);
          audio.swing();
          const swing = this.hero.attack(tw, heavy);
          await swing.impact;
          if (ev.kind === 'heroHit' && view) {
            audio.hit(ev.crit);
            const camQ = new THREE.Quaternion();
            this.renderer.camera.getWorldQuaternion(camQ);
            this.effects.slash(view.center(), camQ, ev.crit ? 0xffc04a : ev.skill ? 0x6ab8ff : 0xb8d4ff, heavy);
            this.effects.burst(view.center(), { color: 0xffc070, count: ev.crit ? 26 : 12, speed: 2.5, life: 0.5, size: 0.06 });
            void view.hit(tw, heavy);
            const p = this.project(view.anchor());
            this.fx.float(ev.crit ? `${ev.dmg}!` : String(ev.dmg), p.x, p.y, ev.crit ? 'crit' : 'dmg');
            if (ev.crit || heavy) this.renderer.hitStop(ev.crit ? 110 : 70);
            if (ev.crit) {
              this.renderer.shake(0.05, 220);
              this.renderer.post.impact(1);
            }
            this.say(ev.text, 'hit');
          } else {
            audio.miss();
            if (view) {
              const p = this.project(view.anchor());
              this.fx.float('MISS', p.x, p.y, 'miss');
            }
            this.say(ev.text, 'sys');
          }
          this.refresh();
          await swing.done;
          break;
        }
        case 'heroHeal':
          audio.potion();
          this.renderer.post.pulse(0x48bb78, 0.45);
          this.fx.floatSelf(`+${ev.amount}`, 'heal');
          this.effects.burst(this.cameraPoint(1.2), { color: 0x68d391, count: 24, speed: 0.8, lift: 1, gravity: 0.3, life: 0.9, spread: 0.8 });
          this.say(ev.text, 'heal');
          this.refresh();
          await tw.wait(380);
          break;
        case 'heroMana':
          audio.potion();
          this.renderer.post.pulse(0x4299e1, 0.45);
          this.fx.floatSelf(`+${ev.amount} MP`, 'mp');
          this.say(ev.text, 'heal');
          this.refresh();
          await tw.wait(320);
          break;
        case 'heroBuff':
          audio.magic();
          this.renderer.post.pulse(0xf6d26b, 0.35);
          this.effects.burst(this.cameraPoint(1.2), { color: 0xf6d26b, count: 30, speed: 1.2, lift: 0.8, gravity: 0, life: 0.9, spread: 1 });
          this.say(ev.text, 'heal');
          this.refresh();
          await tw.wait(380);
          break;
        case 'heroDefend':
          audio.block();
          await this.hero.defend(tw, true);
          this.say(ev.text, 'sys');
          this.refresh();
          break;
        case 'monsterCharge':
          this.tips.show('charge');
          audio.charge();
          view?.setCharging(true);
          this.fx.showBanner('⚠ 危險', ev.text.replace(/^⚠\s*/, ''), 'warn', 2400);
          this.say(ev.text, 'boss');
          this.refresh();
          await tw.wait(500);
          break;
        case 'monsterHit':
        case 'monsterMiss':
        case 'barrierCounter': {
          const moveId = ev.kind === 'monsterHit' ? ev.move : 'attack';
          const style = this.attackStyle(moveId);
          const impact = async () => {
            if (ev.kind === 'monsterHit') {
              audio.hurt(ev.heavy);
              this.renderer.post.hurt(ev.heavy ? 0.85 : 0.5);
              this.renderer.post.impact(ev.heavy ? 1.6 : 0.8);
              if (style === 'melee') this.fx.claw();
              this.fx.floatSelf(`-${ev.dmg}`, 'hurt');
              this.renderer.shake(ev.heavy ? 0.16 : 0.07, ev.heavy ? 500 : 260);
              this.say(ev.text, 'hurt');
            } else if (ev.kind === 'monsterMiss') {
              audio.miss();
              this.fx.floatSelf('閃避', 'miss');
              this.say(ev.text, 'sys');
            } else {
              audio.block();
              this.renderer.post.pulse(0x63b3ed, 0.5);
              this.fx.floatSelf('格擋', 'info');
              if (view) {
                const camQ = new THREE.Quaternion();
                this.renderer.camera.getWorldQuaternion(camQ);
                this.effects.slash(view.center(), camQ, 0x63b3ed, true);
                void view.hit(tw, true);
                const p = this.project(view.anchor());
                this.fx.float(String(ev.dmg), p.x, p.y, 'crit');
              }
              this.say(ev.text, 'hit');
            }
            this.refresh();
          };
          if (view) {
            let fired = false;
            await view.attack(tw, style, () => {
              fired = true;
              if (style !== 'melee') {
                void this.effects.projectile(view.center(), this.cameraPoint(0.5), style === 'ranged' ? 0xe8e0c0 : monsterColor, style === 'ranged' ? 0.25 : 0.6).then(impact);
              } else void impact();
            }, ev.kind === 'monsterHit' && ev.heavy);
            if (!fired) await impact();
            if (style !== 'melee') await tw.wait(280);
          } else await impact();
          await this.hero.defend(tw, false);
          break;
        }
        case 'poisonTick':
          audio.hurt(false);
          this.renderer.post.pulse(0x78c850, 0.45);
          this.fx.floatSelf(`-${ev.dmg}`, 'hurt');
          this.say(ev.text, 'hurt');
          this.refresh();
          await tw.wait(350);
          break;
        case 'afflicted':
          this.fx.floatSelf(ev.status === 'poison' ? '中毒' : '麻痺', 'info');
          this.say(ev.text, 'warn');
          this.refresh();
          await tw.wait(250);
          break;
        case 'monsterStunned':
          view?.setCharging(false);
          if (view) {
            this.effects.burst(view.anchor(), { color: 0xfaf089, count: 16, speed: 0.6, gravity: 0, life: 1.2, spread: 0.6 });
            const p = this.project(view.anchor());
            this.fx.float('暈眩', p.x, p.y, 'info');
          }
          this.say(ev.text, 'hit');
          this.refresh();
          await tw.wait(300);
          break;
        case 'monsterSkip':
          this.say(ev.text, 'sys');
          await tw.wait(350);
          break;
        case 'heroParalyzed':
          this.renderer.post.pulse(0xfbd38d, 0.4);
          this.say(ev.text, 'warn');
          await tw.wait(500);
          break;
        case 'enrage':
          if (view) void view.roar(tw);
          audio.bossAlert();
          this.renderer.shake(0.1, 600);
          if (view) this.effects.burst(view.center(), { color: 0xff3a1a, count: 60, speed: 3, life: 0.9 });
          this.fx.showBanner('狂暴化！', ev.text, 'boss', 2200);
          this.say(ev.text, 'boss');
          this.refresh();
          await tw.wait(600);
          break;
        case 'mpDrain':
          this.renderer.post.pulse(0x4264e1, 0.4);
          this.fx.floatSelf(`-${ev.amount} MP`, 'mp');
          this.say(ev.text, 'hurt');
          this.refresh();
          break;
        case 'fleeSuccess':
          audio.footstep();
          this.say(ev.text, 'sys');
          break;
        case 'fleeFail':
          audio.error();
          this.say(ev.text, 'warn');
          await tw.wait(250);
          break;
        case 'info':
          this.say(ev.text, 'sys');
          break;
        case 'monsterDefeated':
          audio.monsterDie();
          if (view) {
            this.effects.burst(view.center(), { color: 0xc8b8ff, count: 50, speed: 2, lift: 0.8, gravity: -0.5, life: 1.1, spread: 0.6 });
            await view.die(tw);
          }
          this.say(ev.text, 'hit');
          break;
        case 'heroDefeated':
          audio.death();
          this.renderer.post.pulse(0x780000, 0.9);
          this.say(ev.text, 'hurt');
          await this.renderer.tweens.to(900, (k) => {
            this.renderer.rig.position.y = EYE_HEIGHT - k * 1.05;
            this.renderer.rig.rotation.z = k * 0.5;
          }, { easing: ease.inQuad });
          break;
      }
    }
  }

  private async endCombat(): Promise<void> {
    const c = this.combat!;
    const outcome = c.cs.outcome;
    const d = this.dungeon!;
    if (outcome === 'lose') return this.handleDeath();

    if (outcome === 'fled') {
      c.map.calm = 4;
      c.view?.setCharging(false);
    } else if (outcome === 'win') {
      c.map.alive = false;
      this.dview?.removeMonster(c.map.id);
      const m = c.cs.monster;
      const rw = rollRewards(m, this.rng);
      this.player.gold += rw.gold;
      this.player.stats.kills++;
      this.say(`獲得 ${rw.xp} 經驗值與 ${rw.gold} 金幣。`, 'loot');
      audio.coin();
      this.toasts.gold(rw.gold, rw.xp);
      for (const drop of rw.drops) {
        addItem(this.player, drop);
        const def = getItem(drop);
        this.say(`${m.name}掉落了 ${def.name}！`, def.rarity === 'legendary' || def.rarity === 'rare' ? 'level' : 'loot');
        this.toasts.item(drop);
        if (def.kind === 'equip') this.tips.show('loot');
      }
      if (m.boss) {
        this.player.stats.bossKills++;
        if (!this.player.bossesDefeated.includes(d.floor)) this.player.bossesDefeated.push(d.floor);
        const bonus = rollBossBonus(d.floor, this.rng);
        this.say(`${m.name}留下了寶物！`, 'level');
        this.grantLoot(bonus);
      }
      this.celebrateLevelUps(gainXp(this.player, rw.xp));
    }

    this.combat = null;
    this.mode = 'dungeon';
    audio.setMusic('dungeon', musicRoot(getFloor(d.floor).theme.drone));
    await Promise.all([this.dolly(0), this.hero.defend(this.renderer.tweens, false)]);
    this.syncHeroEquipment();
    this.drawMap();
    this.refresh();
    this.renderActions();
    this.save();

    if (outcome === 'win' && c.cs.monster.key === 'deathKnight') {
      await this.renderer.tweens.wait(600);
      this.showVictory();
      return;
    }
    if (outcome === 'win' && c.cs.monster.boss) {
      this.fx.showBanner(`討伐 ${c.cs.monster.name}`, '通往下一層的封印解除了', 'level', 3000);
    }
    // 若還有怪物貼身，立刻開始下一場戰鬥
    const next = this.pos && adjacentHostile(d, this.pos);
    if (next) {
      await this.renderer.tweens.wait(300);
      await this.beginCombat(next, true);
    }
  }

  private celebrateLevelUps(ups: LevelUpInfo[]): void {
    if (!ups.length) return;
    audio.levelUp();
    this.effects.levelUp(this.cameraPoint(2.6));
    this.renderer.post.pulse(0xf6d26b, 0.5);
    const last = ups[ups.length - 1];
    const skills = ups.flatMap((u) => u.newSkills);
    this.fx.showBanner(`等級提升！Lv.${last.level}`, skills.length ? `習得新技能：${skills.map((s) => s.name).join('、')}` : '體力與魔力已完全恢復', 'level', 3000);
    for (const u of ups) {
      this.say(`🎉 升級到 Lv.${u.level}！體力 +${u.hpGain}、魔力 +${u.mpGain}、攻擊 +${u.attackGain}、防禦 +${u.defenseGain}`, 'level');
      for (const s of u.newSkills) this.say(`✦ 習得技能【${s.name}】：${s.desc}`, 'level');
    }
  }

  private async handleDeath(): Promise<void> {
    this.mode = 'dead';
    audio.setMusic(null);
    this.combat = null;
    this.renderActions();
    await this.renderer.tweens.wait(500);
    const pen = applyDeathPenalty(this.player);
    this.save();
    this.modal.open({
      title: '你倒下了……',
      dismissable: false,
      body: h('div', {},
        h('p', { text: '意識逐漸模糊……再次睜開眼時，你已經躺在奇岩村的神殿裡。' }),
        h('dl', { class: 'kv' },
          h('dt', { text: '損失經驗值' }), h('dd', { class: 'c-bad', text: String(pen.xpLost) }),
          h('dt', { text: '遺失金幣' }), h('dd', { class: 'c-bad', text: String(pen.goldLost) }))),
      actions: [btn('在村莊復活', () => {
        this.modal.close(true);
        this.renderer.rig.rotation.z = 0;
        void this.goVillage();
      }, { variant: 'gold' })],
    });
  }

  private showVictory(): void {
    const first = !this.player.victory;
    this.player.victory = true;
    this.save();
    audio.victory();
    this.fx.showBanner('死亡騎士 討伐成功', '古魯丁地監恢復了平靜', 'level', 4000);
    this.modal.open({
      title: first ? '✦ 討伐死亡騎士 ✦' : '再次擊敗死亡騎士',
      body: h('div', {},
        h('p', { text: first ? `${this.player.name}，你擊敗了盤踞古魯丁地監最深處的不死之王。奇岩村的人們將永遠傳頌你的名字。` : '死亡騎士再度倒在你的劍下。' }),
        statsBody(this.player),
        h('p', { class: 'row__meta', text: '你可以繼續探索地監、收集傳說裝備與挑戰更高的強化值。' })),
      actions: [btn('返回村莊', () => { this.modal.close(true); void this.goVillage(); }, { variant: 'neutral' }), btn('繼續探索', () => this.modal.close(), { variant: 'gold' })],
    });
  }

  // ═════════════════════ 道具 ═════════════════════

  private quickUse(key: string): void {
    if (this.busy || this.mode === 'title' || this.mode === 'dead') return;
    const def = getItem(key) as ConsumableDef;
    if (this.mode === 'combat') {
      if (this.modal.isOpen) this.modal.close(true);
      this.combatAction({ type: 'item', key });
      return;
    }
    if (def.effect.type === 'enchant') {
      openEnchantPicker(this, key);
      return;
    }
    if (def.effect.type === 'teleportHome' && this.mode === 'village') {
      this.say('你已經在村莊裡了。', 'sys');
      return;
    }
    const r = useConsumable(this.player, key, { inCombat: false });
    if (!r.ok) {
      audio.error();
      this.say(r.text, 'warn');
      return;
    }
    this.say(r.text, 'heal');
    if (r.teleport) {
      audio.magic();
      this.renderer.post.pulse(0x63b3ed, 0.7);
      if (this.modal.isOpen) this.modal.close(true);
      this.run(() => this.goVillage());
      return;
    }
    audio.potion();
    if (r.heal) {
      this.fx.floatSelf(`+${r.heal}`, 'heal');
      this.renderer.post.pulse(0x48bb78, 0.35);
    } else if (r.mana) {
      this.fx.floatSelf(`+${r.mana} MP`, 'mp');
      this.renderer.post.pulse(0x4299e1, 0.35);
    } else {
      this.renderer.post.pulse(0xf6d26b, 0.3);
    }
    this.refresh();
    this.scheduleSave();
  }

  // ═════════════════════ 村莊 ═════════════════════

  private enterDungeonFromVillage(): void {
    if (this.mode !== 'village') return;
    if (this.player.deepestFloor <= 1) {
      audio.stairs();
      this.run(() => this.enterFloor(1, 'up'));
      return;
    }
    this.modal.open({
      title: '傳送師',
      body: teleportBody(this.player.deepestFloor, (f) => {
        this.modal.close(true);
        audio.magic();
        this.run(() => this.enterFloor(f, 'up'));
      }),
    });
  }

  private openInn(): void {
    const cost = innCost(this.player.level);
    const s = getStats(this.player);
    const full = this.player.hp >= s.maxHp && this.player.mp >= s.maxMp;
    this.modal.open({
      title: '銀騎士旅館',
      body: h('p', { text: full ? '你精神飽滿，暫時不需要休息。' : `住宿一晚可完全恢復體力與魔力，費用 ${cost} 金幣。` }),
      actions: [
        btn('離開', () => this.modal.close(), { variant: 'neutral' }),
        btn(`休息（${cost} 金幣）`, () => {
          if (this.player.gold < cost) {
            audio.error();
            this.say('金幣不足，旅館老闆搖了搖頭。', 'warn');
            return;
          }
          this.player.gold -= cost;
          fullRestore(this.player);
          this.modal.close();
          audio.potion();
          this.renderer.post.pulse(0xf6d26b, 0.35);
          this.say('你在旅館好好睡了一覺，體力與魔力完全恢復了。', 'heal');
          this.refresh();
          this.save();
        }, { variant: 'success', disabled: full }),
      ],
    });
  }

  // ═════════════════════ 選單 / 地圖 ═════════════════════

  private openBag(): void {
    if (this.mode === 'title' || this.mode === 'dead' || this.busy) return;
    openInventory(this);
  }

  private openMap(): void {
    if (!this.dungeon || !this.pos) return;
    const canvas = h('canvas', { class: 'minimap', attrs: { width: '600', height: '600' } });
    this.modal.open({ title: `地下 ${this.dungeon.floor} 層 地圖`, body: canvas });
    requestAnimationFrame(() => drawMinimap(canvas, this.dungeon, this.pos));
  }

  private openMenu(): void {
    if (this.mode === 'title') return;
    const volume = h('input', { class: 'range', attrs: { type: 'range', min: '0', max: '100', value: String(Math.round(audio.volume * 100)), 'aria-label': '音量' } });
    volume.addEventListener('input', () => audio.setVolume(Number(volume.value) / 100));
    const music = h('input', { class: 'range', attrs: { type: 'range', min: '0', max: '100', value: String(Math.round(audio.musicVolume * 100)), 'aria-label': '音樂音量' } });
    music.addEventListener('input', () => audio.setMusicVolume(Number(music.value) / 100));
    const mute = btn(audio.muted ? '🔇 已靜音' : '🔊 音效開啟', () => {
      audio.setMuted(!audio.muted);
      mute.firstChild!.textContent = audio.muted ? '🔇 已靜音' : '🔊 音效開啟';
    }, { variant: 'ghost' });
    const qualityRow = h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': '畫質' } });
    const qualities: [Quality, string][] = [['high', '高'], ['medium', '中'], ['low', '低']];
    const renderQuality = () => {
      qualityRow.replaceChildren(...qualities.map(([q, label]) => h('button', {
        class: `segmented__item${this.settings.quality === q ? ' is-active' : ''}`, type: 'button', text: label,
        attrs: { role: 'radio', 'aria-checked': String(this.settings.quality === q) },
        on: { click: () => this.setQuality(q, renderQuality) },
      })));
    };
    renderQuality();
    const body = h('div', {},
      h('h3', { class: 'section-title', text: '音效' }),
      h('div', { style: { display: 'flex', gap: '0.75rem', alignItems: 'center' } }, mute, volume),
      h('div', { style: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' } }, h('span', { class: 'row__meta', text: '音樂', style: { minWidth: '6.6rem' } }), music),
      h('h3', { class: 'section-title', text: '畫質' }),
      qualityRow,
      h('p', { class: 'row__meta', text: '高：泛光＋多重取樣抗鋸齒；中：適合筆電與手機；低：關閉泛光，最省電。' }),
      h('h3', { class: 'section-title', text: '冒險統計' }),
      statsBody(this.player),
    );
    this.modal.open({
      title: '選單',
      body,
      actions: [
        btn('操作說明', () => this.modal.open({ title: '操作說明', body: helpBody(), wide: true }), { variant: 'ghost' }),
        btn('重新顯示提示', () => {
          this.tips.reset();
          audio.click();
          this.say('新手提示已重設，會在對應情境再次出現。', 'sys');
        }, { variant: 'ghost' }),
        btn('儲存並回到標題', () => {
          this.save();
          this.modal.close(true);
          this.combat = null;
          this.clearPrompt();
          this.showTitle();
        }, { variant: 'neutral', disabled: this.mode === 'combat' || this.busy }),
        btn('繼續遊戲', () => this.modal.close(), { variant: 'gold' }),
      ],
    });
  }

  private setQuality(q: Quality, rerender: () => void): void {
    this.settings.quality = q;
    saveSettings(this.settings);
    this.renderer.post.setQuality(q);
    audio.click();
    rerender();
  }

  // ═════════════════════ 畫面同步 ═════════════════════

  private say(text: string, tone: LogTone = 'plain'): void {
    this.log.add(text, tone);
  }

  private refresh(): void {
    if (this.mode === 'combat' && this.player.hp > 0 && this.player.hp < getStats(this.player).maxHp * 0.35) this.tips.show('lowhp');
    const canUse = !this.busy && (this.mode === 'dungeon' || this.mode === 'village' || this.mode === 'combat');
    this.hud.update(this.player, this.combat?.cs ?? null, canUse);
  }

  private drawMap(): void {
    drawMinimap(this.minimap, this.dungeon, this.pos, { zoom: 15 });
  }

  private syncHeroEquipment(): void {
    const w = this.player.equipped.weapon;
    this.hero.setEquipment(w?.key ?? null, w?.enchant ?? 0, !!this.player.equipped.shield);
  }

  private renderActions(): void {
    const el = this.actionsEl;
    el.className = 'actions';
    el.replaceChildren();
    this.dpadEl.hidden = this.mode !== 'dungeon';
    if (this.mode === 'village') {
      el.classList.add('actions--village');
      el.append(
        btn(this.player.deepestFloor > 1 ? '傳送至地監' : '進入地監', () => this.enterDungeonFromVillage(), { variant: 'gold', key: 'Enter' }),
        btn('商店', () => openShop(this), { key: 'B' }),
        btn('旅館', () => this.openInn(), { variant: 'success', key: 'N' }),
      );
    } else if (this.mode === 'dungeon') {
      el.append(h('div', { class: 'move-hint' }, h('span', {}, h('kbd', { text: 'W' }), ' 前進'), h('span', {}, h('kbd', { text: 'A' }), h('kbd', { text: 'D' }), ' 轉向'), h('span', {}, h('kbd', { text: 'Q' }), h('kbd', { text: 'E' }), ' 平移')));
    } else if (this.mode === 'combat' && this.combat) {
      el.classList.add('actions--combat');
      const cs = this.combat.cs;
      if (cs.afflictions.paralyze > 0) {
        el.append(btn('掙扎……（麻痺中）', () => this.combatAction({ type: 'attack' }), { variant: 'neutral', key: 'Space' }));
        return;
      }
      el.append(btn('攻擊', () => this.combatAction({ type: 'attack' }), { variant: 'danger', key: 'Space' }));
      knownSkills(this.player).forEach((s, i) => {
        const label = h('span', {}, h('span', { class: 'lbl-full', text: s.name }), h('span', { class: 'lbl-short', text: s.short }));
        el.append(btn(label, () => this.combatAction({ type: 'skill', id: s.id }), { key: SKILL_KEYS[i].toUpperCase(), disabled: this.player.mp < s.mp, small: `MP${s.mp}`, title: `${s.name}：${s.desc}` }));
      });
      el.append(btn('防禦', () => this.combatAction({ type: 'defend' }), { variant: 'neutral', key: 'F' }));
      el.append(btn('道具', () => openInventory(this, 'items'), { variant: 'success', key: 'I' }));
      if (!cs.monster.boss) el.append(btn('逃跑', () => this.combatAction({ type: 'flee' }), { variant: 'neutral', key: 'R' }));
    }
  }

  // ═════════════════════ 存檔 ═════════════════════

  private save(): void {
    if (this.mode === 'title') return;
    window.clearTimeout(this.saveTimer);
    writeSave(this.storage, this.player, this.runSeed);
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 400);
  }

  // ═════════════════════ 除錯（僅開發模式） ═════════════════════

  debugApi() {
    return {
      game: this,
      audio,
      floor: (n: number) => this.run(() => this.enterFloor(Math.max(1, Math.min(MAX_FLOOR, n)), 'up')),
      xp: (n: number) => { this.celebrateLevelUps(gainXp(this.player, n)); this.refresh(); },
      gold: (n: number) => { this.player.gold += n; this.refresh(); },
      god: () => { this.player.level = 50; fullRestore(this.player); this.refresh(); },
      give: (key: string, qty = 1) => { addItem(this.player, key, qty); this.refresh(); },
      heal: () => { fullRestore(this.player); this.refresh(); },
      /** 朝最近的怪物（或指定目標）走一步，用於自動化測試 */
      seek: (target: 'monster' | 'boss' | 'chest' | 'down' = 'monster') => {
        const d = this.dungeon;
        const pos = this.pos;
        if (!d || !pos || this.mode !== 'dungeon') return false;
        const goals = target === 'monster' ? d.monsters.filter((m) => m.alive) : target === 'boss' ? d.monsters.filter((m) => m.alive && m.boss) : target === 'chest' ? d.chests.filter((c) => !c.opened) : d.down ? [d.down] : [];
        const dist = new Map<number, number>();
        const prev = new Map<number, number>();
        const start = idx(d.size, pos.x, pos.y);
        const queue = [start];
        dist.set(start, 0);
        let found = -1;
        for (let head = 0; head < queue.length && found < 0; head++) {
          const cur = queue[head];
          const cx = cur % d.size;
          const cy = Math.floor(cur / d.size);
          for (const dd of DIRS) {
            const nx = cx + dd.dx;
            const ny = cy + dd.dy;
            const n = idx(d.size, nx, ny);
            if (dist.has(n)) continue;
            if (goals.some((g) => g.x === nx && g.y === ny)) {
              prev.set(n, cur);
              found = n;
              break;
            }
            if (d.tiles[n] !== TILE.floor || d.chests.some((c) => c.x === nx && c.y === ny)) continue;
            dist.set(n, dist.get(cur)! + 1);
            prev.set(n, cur);
            queue.push(n);
          }
        }
        if (found < 0) return false;
        let stepCell = found;
        while (prev.get(stepCell) !== start) stepCell = prev.get(stepCell)!;
        const dir = DIRS.findIndex((dd) => dd.dx === (stepCell % d.size) - pos.x && dd.dy === Math.floor(stepCell / d.size) - pos.y) as Dir;
        pos.facing = dir;
        this.placeCamera(pos.x, pos.y, dir);
        this.run(() => this.doStep(dir));
        return true;
      },
      act: (a: PlayerAction) => this.combatAction(a),
      revealMap: () => { if (this.dungeon) { this.dungeon.explored.fill(true); this.drawMap(); } },
      state: () => ({ mode: this.mode, pos: this.pos, floor: this.dungeon?.floor, busy: this.busy, monsters: this.dungeon?.monsters.filter((m) => m.alive).length, boss: this.dungeon ? bossAlive(this.dungeon) : false, hp: this.player.hp, count: countOf(this.player, 'redPotion') }),
    };
  }
}
