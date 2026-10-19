import type { PlayerState } from '../core/state';
import { getItem, type ConsumableDef } from '../data/items';
import type { CombatState } from '../systems/combat';
import { countOf } from '../systems/inventory';
import { getStats, MAX_LEVEL, xpToNext } from '../systems/progression';
import { $, h } from './dom';
import { itemIcon } from './icons';

export const QUICK_ITEMS = ['redPotion', 'orangePotion', 'whitePotion', 'bluePotion', 'greenPotion', 'bravePotion', 'antidote', 'teleportHomeScroll'] as const;

const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;

/** 右側角色面板、快捷列與怪物資訊卡 */
export class Hud {
  private readonly el = {
    name: $('char-name'), sub: $('char-sub'), gold: $('char-gold'),
    hpFill: $('hp-fill'), hpText: $('hp-text'), mpFill: $('mp-fill'), mpText: $('mp-text'),
    xpFill: $('xp-fill'), xpText: $('xp-text'),
    atk: $('stat-atk'), def: $('stat-def'), deep: $('stat-deep'), buffs: $('buffs'),
    quickbar: $('quickbar'), screenFx: $('screen-fx'),
    card: $('monster-card'), mName: $('monster-name'), mLevel: $('monster-level'),
    mHp: $('monster-hp'), mHpText: $('monster-hp-text'), mStatus: $('monster-status'),
    location: $('location'),
  };
  private readonly slots: HTMLButtonElement[];

  constructor(onQuickUse: (key: string) => void) {
    this.slots = QUICK_ITEMS.map((key, i) => {
      const def = getItem(key) as ConsumableDef;
      const b = h('button', {
        class: 'slot', type: 'button', title: `${def.name}：${def.desc}`, aria: { label: def.name },
        on: { click: () => onQuickUse(key) },
      },
      h('span', { class: 'slot__key', text: String(i + 1) }),
      h('span', { class: 'slot__icon' }, itemIcon(key, 26)),
      h('span', { class: 'slot__count', text: '0' }));
      this.el.quickbar.append(b);
      return b;
    });
  }

  setLocation(title: string, sub?: string): void {
    this.el.location.replaceChildren(title, sub ? h('small', { text: sub }) : '');
  }

  update(p: PlayerState, cs: CombatState | null, canUseItems: boolean): void {
    const s = getStats(p);
    this.el.name.textContent = p.name;
    this.el.sub.textContent = `Lv.${p.level} 騎士`;
    this.el.gold.textContent = p.gold.toLocaleString();
    this.el.hpFill.style.width = pct(p.hp, s.maxHp);
    this.el.hpText.textContent = `${p.hp} / ${s.maxHp}`;
    this.el.hpFill.parentElement!.classList.toggle('is-low', p.hp / s.maxHp < 0.3);
    this.el.screenFx.classList.toggle('is-low-hp', p.hp > 0 && p.hp / s.maxHp < 0.25);
    this.el.mpFill.style.width = pct(p.mp, s.maxMp);
    this.el.mpText.textContent = `${p.mp} / ${s.maxMp}`;
    const need = xpToNext(p.level);
    this.el.xpFill.style.width = p.level >= MAX_LEVEL ? '100%' : pct(p.xp, need);
    this.el.xpText.textContent = p.level >= MAX_LEVEL ? 'MAX' : `${p.xp.toLocaleString()} / ${need.toLocaleString()}`;
    this.el.atk.textContent = String(s.attack);
    this.el.def.textContent = String(s.defense);
    this.el.deep.textContent = `${p.deepestFloor}F`;

    const chips: HTMLElement[] = [];
    if (p.buffs.haste > 0) chips.push(h('span', { class: 'chip chip--haste', text: `加速 ${p.buffs.haste}` }));
    if (p.buffs.brave > 0) chips.push(h('span', { class: 'chip chip--brave', text: `勇敢 ${p.buffs.brave}` }));
    if (cs) {
      if (cs.afflictions.poison > 0) chips.push(h('span', { class: 'chip chip--poison', text: `中毒 ${cs.afflictions.poison}` }));
      if (cs.afflictions.paralyze > 0) chips.push(h('span', { class: 'chip chip--paralyze', text: '麻痺' }));
      if (cs.guard.turns > 0) chips.push(h('span', { class: 'chip chip--guard', text: `增幅防禦 ${cs.guard.turns}` }));
      if (cs.barrier.turns > 0) chips.push(h('span', { class: 'chip chip--barrier', text: `反擊屏障 ${cs.barrier.turns}` }));
    }
    this.el.buffs.replaceChildren(...chips);

    QUICK_ITEMS.forEach((key, i) => {
      const n = countOf(p, key);
      const slot = this.slots[i];
      (slot.querySelector('.slot__count') as HTMLElement).textContent = String(n);
      slot.disabled = n <= 0 || !canUseItems;
    });

    this.updateMonster(cs);
  }

  private updateMonster(cs: CombatState | null): void {
    if (!cs || cs.outcome === 'fled') {
      this.el.card.hidden = true;
      return;
    }
    const m = cs.monster;
    this.el.card.hidden = false;
    this.el.card.classList.toggle('is-boss', m.boss);
    this.el.mName.className = `monster-card__name r-${m.def.rarity}`;
    this.el.mName.textContent = m.boss ? `👑 ${m.name}` : m.name;
    this.el.mLevel.textContent = `Lv.${m.level}`;
    this.el.mHp.style.width = pct(m.hp, m.maxHp);
    this.el.mHpText.textContent = `${m.hp} / ${m.maxHp}`;
    const chips: HTMLElement[] = [];
    if (cs.charging) chips.push(h('span', { class: 'chip chip--charge', text: `蓄力：${cs.charging.name}` }));
    if (cs.monsterStun > 0) chips.push(h('span', { class: 'chip chip--stun', text: '暈眩' }));
    if (cs.enraged) chips.push(h('span', { class: 'chip chip--enrage', text: '狂暴' }));
    this.el.mStatus.replaceChildren(...chips);
  }
}
