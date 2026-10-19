import type { Rng } from '../core/rng';
import type { PlayerState } from '../core/state';
import { getItem } from '../data/items';
import { getMonster, type MonsterDef, type MonsterMove } from '../data/monsters';
import { getSkill } from '../data/skills';
import { useConsumable, type Afflictions } from './inventory';
import { getStats } from './progression';

/** 防禦減傷常數：傷害 × K / (K + 防禦) */
export const MITIGATION_K = 40;
export const PLAYER_CRIT = 0.1;
export const BRAVE_CRIT_BONUS = 0.15;
export const BRAVE_DAMAGE_BONUS = 0.15;
export const HASTE_EXTRA_CHANCE = 0.35;
export const DEFEND_REDUCTION = 0.55;
export const ENRAGE_MULT = 1.3;

export interface MonsterInstance {
  def: MonsterDef;
  key: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  boss: boolean;
}

export function monsterStats(def: MonsterDef, level: number): { hp: number; attack: number; defense: number } {
  return {
    hp: Math.round((18 + level * 10) * def.hpMul),
    attack: Math.round((6 + level * 2.5) * def.atkMul),
    defense: Math.round(level * 1.1 * def.defMul),
  };
}

export function createMonster(key: string, level: number): MonsterInstance {
  const def = getMonster(key);
  const s = monsterStats(def, level);
  return { def, key, name: def.name, level, hp: s.hp, maxHp: s.hp, attack: s.attack, defense: s.defense, boss: !!def.boss };
}

export type PlayerAction =
  | { type: 'attack' }
  | { type: 'skill'; id: string }
  | { type: 'item'; key: string }
  | { type: 'defend' }
  | { type: 'flee' };

export type CombatEvent =
  | { kind: 'heroHit'; dmg: number; crit: boolean; extra?: boolean; skill?: string; text: string }
  | { kind: 'heroMiss'; text: string }
  | { kind: 'heroHeal'; amount: number; text: string }
  | { kind: 'heroMana'; amount: number; text: string }
  | { kind: 'heroBuff'; text: string }
  | { kind: 'heroDefend'; text: string }
  | { kind: 'monsterHit'; dmg: number; crit: boolean; move: string; heavy: boolean; text: string }
  | { kind: 'monsterMiss'; text: string }
  | { kind: 'monsterCharge'; text: string }
  | { kind: 'barrierCounter'; dmg: number; text: string }
  | { kind: 'poisonTick'; dmg: number; text: string }
  | { kind: 'afflicted'; status: 'poison' | 'paralyze'; text: string }
  | { kind: 'monsterStunned'; text: string }
  | { kind: 'monsterSkip'; text: string }
  | { kind: 'heroParalyzed'; text: string }
  | { kind: 'enrage'; text: string }
  | { kind: 'mpDrain'; amount: number; text: string }
  | { kind: 'fleeSuccess'; text: string }
  | { kind: 'fleeFail'; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'monsterDefeated'; text: string }
  | { kind: 'heroDefeated'; text: string };

export interface CombatState {
  monster: MonsterInstance;
  afflictions: Afflictions;
  guard: { turns: number; reduction: number };
  barrier: { turns: number; chance: number };
  monsterStun: number;
  charging: MonsterMove | null;
  cooldowns: Record<string, number>;
  enraged: boolean;
  turn: number;
  outcome: null | 'win' | 'lose' | 'fled';
}

export function startCombat(monster: MonsterInstance): CombatState {
  return {
    monster,
    afflictions: { poison: 0, paralyze: 0 },
    guard: { turns: 0, reduction: 0 },
    barrier: { turns: 0, chance: 0 },
    monsterStun: 0,
    charging: null,
    cooldowns: {},
    enraged: false,
    turn: 0,
    outcome: null,
  };
}

export function hitChance(attackerLevel: number, defenderLevel: number, mod = 0): number {
  return Math.max(0.55, Math.min(0.98, 0.92 + (attackerLevel - defenderLevel) * 0.02 + mod));
}

export function mitigate(raw: number, defense: number, pierce = 0): number {
  const effDef = Math.max(0, defense * (1 - pierce));
  return Math.max(1, Math.round((raw * MITIGATION_K) / (MITIGATION_K + effDef)));
}

export function fleeChance(playerLevel: number, monster: MonsterInstance): number {
  if (monster.boss) return 0;
  return Math.max(0.25, Math.min(0.9, 0.6 + (playerLevel - monster.level) * 0.04));
}

export function monsterAttackValue(cs: CombatState): number {
  return cs.monster.attack * (cs.enraged ? ENRAGE_MULT : 1);
}

interface TurnResult {
  events: CombatEvent[];
  /** false 表示行動無效（例如魔力不足），不消耗回合 */
  turnUsed: boolean;
}

/** 解算一個完整回合：玩家行動 → 中毒 → 怪物行動 → 狀態遞減 */
export function resolveTurn(player: PlayerState, cs: CombatState, action: PlayerAction, rng: Rng): TurnResult {
  if (cs.outcome) return { events: [], turnUsed: false };
  const events: CombatEvent[] = [];
  let defending = false;

  if (cs.afflictions.paralyze > 0) {
    cs.afflictions.paralyze--;
    events.push({ kind: 'heroParalyzed', text: '你全身麻痺，動彈不得！' });
  } else {
    const r = performHeroAction(player, cs, action, rng, events);
    if (!r.turnUsed) return { events, turnUsed: false };
    defending = r.defending;
    if (cs.outcome) return { events, turnUsed: true };
  }

  cs.turn++;

  // 中毒
  if (cs.afflictions.poison > 0) {
    const maxHp = getStats(player).maxHp;
    const dmg = Math.max(2, Math.round(maxHp * 0.05));
    player.hp = Math.max(0, player.hp - dmg);
    cs.afflictions.poison--;
    events.push({ kind: 'poisonTick', dmg, text: `毒素侵蝕你的身體，損失 ${dmg} 點體力。` });
    if (player.hp <= 0) {
      cs.outcome = 'lose';
      events.push({ kind: 'heroDefeated', text: '你被劇毒奪去了性命……' });
      return { events, turnUsed: true };
    }
  }

  monsterTurn(player, cs, rng, events, defending);
  endOfTurn(player, cs);
  return { events, turnUsed: true };
}

function rollHeroDamage(player: PlayerState, cs: CombatState, power: number, rng: Rng, accMod = 0): { hit: boolean; dmg: number; crit: boolean } {
  const stats = getStats(player);
  if (!rng.chance(hitChance(player.level, cs.monster.level, accMod))) return { hit: false, dmg: 0, crit: false };
  const brave = player.buffs.brave > 0;
  const crit = rng.chance(PLAYER_CRIT + (brave ? BRAVE_CRIT_BONUS : 0));
  let raw = stats.attack * power * rng.range(0.88, 1.12);
  if (brave) raw *= 1 + BRAVE_DAMAGE_BONUS;
  if (crit) raw *= 1.6;
  return { hit: true, dmg: mitigate(raw, cs.monster.defense), crit };
}

function damageMonster(cs: CombatState, dmg: number, events: CombatEvent[]): void {
  const m = cs.monster;
  m.hp = Math.max(0, m.hp - dmg);
  if (m.hp <= 0) {
    cs.outcome = 'win';
    events.push({ kind: 'monsterDefeated', text: `${m.name}倒下了！` });
    return;
  }
  if (!cs.enraged && m.def.enrageAt && m.hp <= m.maxHp * m.def.enrageAt) {
    cs.enraged = true;
    events.push({ kind: 'enrage', text: `${m.name}陷入狂暴！攻擊力大幅提升！` });
  }
}

function heroStrike(player: PlayerState, cs: CombatState, rng: Rng, events: CombatEvent[], power: number, accMod: number, skill?: string): boolean {
  const r = rollHeroDamage(player, cs, power, rng, accMod);
  const label = skill ? `【${skill}】` : '';
  if (!r.hit) {
    events.push({ kind: 'heroMiss', text: `${label}你的攻擊被${cs.monster.name}閃開了。` });
    return false;
  }
  events.push({
    kind: 'heroHit', dmg: r.dmg, crit: r.crit, skill,
    text: `${label}你${r.crit ? '看準破綻，暴擊' : '揮劍斬中'}${cs.monster.name}，造成 ${r.dmg} 點傷害！`,
  });
  damageMonster(cs, r.dmg, events);
  return true;
}

function hasteFollowUp(player: PlayerState, cs: CombatState, rng: Rng, events: CombatEvent[]): void {
  if (cs.outcome || player.buffs.haste <= 0 || !rng.chance(HASTE_EXTRA_CHANCE)) return;
  const r = rollHeroDamage(player, cs, 0.8, rng);
  if (!r.hit) return;
  events.push({ kind: 'heroHit', dmg: r.dmg, crit: r.crit, extra: true, text: `加速！你追加一擊，造成 ${r.dmg} 點傷害！` });
  damageMonster(cs, r.dmg, events);
}

function performHeroAction(player: PlayerState, cs: CombatState, action: PlayerAction, rng: Rng, events: CombatEvent[]): { turnUsed: boolean; defending: boolean } {
  switch (action.type) {
    case 'attack':
      heroStrike(player, cs, rng, events, 1, 0);
      hasteFollowUp(player, cs, rng, events);
      return { turnUsed: true, defending: false };

    case 'defend': {
      const maxMp = getStats(player).maxMp;
      const mana = Math.min(maxMp - player.mp, Math.max(3, Math.round(maxMp * 0.08)));
      player.mp += mana;
      events.push({ kind: 'heroDefend', text: `你舉起武器擺出防禦架勢${mana > 0 ? `，調息恢復 ${mana} 點魔力` : ''}。` });
      return { turnUsed: true, defending: true };
    }

    case 'flee': {
      const chance = fleeChance(player.level, cs.monster);
      if (chance <= 0) {
        events.push({ kind: 'info', text: '首領的威壓籠罩四周，無處可逃！' });
        return { turnUsed: false, defending: false };
      }
      if (rng.chance(chance)) {
        cs.outcome = 'fled';
        events.push({ kind: 'fleeSuccess', text: '你轉身狂奔，成功甩開了敵人！' });
      } else {
        events.push({ kind: 'fleeFail', text: '逃跑失敗！敵人擋住了你的去路！' });
      }
      return { turnUsed: true, defending: false };
    }

    case 'item': {
      const res = useConsumable(player, action.key, { inCombat: true, afflictions: cs.afflictions });
      if (!res.ok) {
        events.push({ kind: 'info', text: res.text });
        return { turnUsed: false, defending: false };
      }
      if (res.heal) events.push({ kind: 'heroHeal', amount: res.heal, text: res.text });
      else if (res.mana) events.push({ kind: 'heroMana', amount: res.mana, text: res.text });
      else events.push({ kind: 'heroBuff', text: res.text });
      return { turnUsed: true, defending: false };
    }

    case 'skill': {
      const skill = getSkill(action.id);
      if (skill.level > player.level) {
        events.push({ kind: 'info', text: `你尚未習得${skill.name}。` });
        return { turnUsed: false, defending: false };
      }
      if (player.mp < skill.mp) {
        events.push({ kind: 'info', text: `魔力不足，無法施展${skill.name}（需要 ${skill.mp}）。` });
        return { turnUsed: false, defending: false };
      }
      const eff = skill.effect;
      if (eff.type === 'heal') {
        const maxHp = getStats(player).maxHp;
        if (player.hp >= maxHp) {
          events.push({ kind: 'info', text: '體力已經是滿的。' });
          return { turnUsed: false, defending: false };
        }
        player.mp -= skill.mp;
        const amount = Math.min(maxHp - player.hp, eff.base + eff.perLevel * player.level);
        player.hp += amount;
        events.push({ kind: 'heroHeal', amount, text: `【${skill.name}】聖光籠罩，恢復了 ${amount} 點體力。` });
        return { turnUsed: true, defending: false };
      }
      player.mp -= skill.mp;
      switch (eff.type) {
        case 'strike':
          heroStrike(player, cs, rng, events, eff.power, eff.accuracy, skill.name);
          hasteFollowUp(player, cs, rng, events);
          break;
        case 'stun': {
          const hit = heroStrike(player, cs, rng, events, eff.power, 0.05, skill.name);
          if (hit && !cs.outcome) {
            if (rng.chance(cs.monster.boss ? eff.bossChance : eff.chance)) {
              cs.monsterStun = 1;
              const interrupted = cs.charging ? '，蓄力被打斷了' : '';
              cs.charging = null;
              events.push({ kind: 'monsterStunned', text: `${cs.monster.name}被擊暈了${interrupted}！` });
            } else {
              events.push({ kind: 'info', text: `${cs.monster.name}抵抗了暈眩。` });
            }
          }
          break;
        }
        case 'guard':
          cs.guard = { turns: eff.turns, reduction: eff.reduction };
          events.push({ kind: 'heroBuff', text: `【${skill.name}】你的鎧甲泛起光芒，受到的傷害降低！` });
          break;
        case 'barrier':
          cs.barrier = { turns: eff.turns, chance: eff.chance };
          events.push({ kind: 'heroBuff', text: `【${skill.name}】劍氣在你周身凝聚成屏障！` });
          break;
      }
      return { turnUsed: true, defending: false };
    }
  }
}

function availableMoves(cs: CombatState): MonsterMove[] {
  const hpPct = cs.monster.hp / cs.monster.maxHp;
  const moves = cs.monster.def.moves.filter((mv) => (cs.cooldowns[mv.id] ?? 0) <= 0 && (mv.hpBelow === undefined || hpPct <= mv.hpBelow));
  return moves.length ? moves : cs.monster.def.moves.filter((mv) => mv.id === 'attack');
}

function monsterTurn(player: PlayerState, cs: CombatState, rng: Rng, events: CombatEvent[], defending: boolean): void {
  const m = cs.monster;
  for (const id of Object.keys(cs.cooldowns)) cs.cooldowns[id] = Math.max(0, cs.cooldowns[id] - 1);

  if (cs.monsterStun > 0) {
    cs.monsterStun--;
    events.push({ kind: 'monsterSkip', text: `${m.name}頭暈目眩，無法行動。` });
    return;
  }

  let move: MonsterMove;
  if (cs.charging) {
    move = cs.charging;
    cs.charging = null;
  } else {
    move = rng.weighted(availableMoves(cs), (mv) => mv.weight);
    if (move.telegraph) {
      cs.charging = move;
      if (move.cooldown) cs.cooldowns[move.id] = move.cooldown + 1;
      events.push({ kind: 'monsterCharge', text: `⚠ ${move.telegraph}（防禦可減輕傷害）` });
      return;
    }
  }
  if (move.cooldown && !move.telegraph) cs.cooldowns[move.id] = move.cooldown;

  if (!rng.chance(hitChance(m.level, player.level, move.accuracy ?? 0))) {
    events.push({ kind: 'monsterMiss', text: `${m.name}${move.verb}，但你閃開了！` });
    return;
  }

  // 反擊屏障：完全格擋並反擊
  if (cs.barrier.turns > 0 && move.power > 0 && rng.chance(cs.barrier.chance)) {
    const counter = rollHeroDamage(player, cs, 1, rng, 1);
    const dmg = Math.max(1, counter.dmg);
    events.push({ kind: 'barrierCounter', dmg, text: `反擊屏障擋下了${move.name}，並反擊造成 ${dmg} 點傷害！` });
    damageMonster(cs, dmg, events);
    return;
  }

  const stats = getStats(player);
  const heavy = !!move.telegraph || move.power >= 1.6;
  if (move.power > 0) {
    const crit = rng.chance(0.05);
    let raw = monsterAttackValue(cs) * move.power * rng.range(0.88, 1.12);
    if (crit) raw *= 1.5;
    let dmg = mitigate(raw, stats.defense, move.pierce ?? 0);
    if (defending) dmg = Math.max(1, Math.round(dmg * (1 - DEFEND_REDUCTION)));
    if (cs.guard.turns > 0) dmg = Math.max(1, Math.round(dmg * (1 - cs.guard.reduction)));
    player.hp = Math.max(0, player.hp - dmg);
    const prefix = move.id === 'attack' ? '' : `【${move.name}】`;
    events.push({
      kind: 'monsterHit', dmg, crit, move: move.id, heavy,
      text: `${prefix}${m.name}${move.verb}，${crit ? '重創' : ''}造成 ${dmg} 點傷害${defending ? '（已防禦）' : ''}。`,
    });
  }

  if (move.drainMp && player.mp > 0) {
    const amount = Math.min(player.mp, move.drainMp);
    player.mp -= amount;
    events.push({ kind: 'mpDrain', amount, text: `你被吸走了 ${amount} 點魔力。` });
  }

  if (player.hp <= 0) {
    cs.outcome = 'lose';
    events.push({ kind: 'heroDefeated', text: `你被${m.name}擊倒了……` });
    return;
  }

  if (move.inflict && rng.chance(move.inflict.chance)) {
    const { status, turns } = move.inflict;
    if (status === 'poison') {
      cs.afflictions.poison = Math.max(cs.afflictions.poison, turns);
      events.push({ kind: 'afflicted', status, text: `你中毒了！（${turns} 回合）` });
    } else if (!defending) {
      cs.afflictions.paralyze = Math.max(cs.afflictions.paralyze, turns);
      events.push({ kind: 'afflicted', status, text: '你的身體麻痺了，下回合無法行動！' });
    }
  }
}

function endOfTurn(player: PlayerState, cs: CombatState): void {
  if (cs.guard.turns > 0) cs.guard.turns--;
  if (cs.barrier.turns > 0) cs.barrier.turns--;
  if (player.buffs.haste > 0) player.buffs.haste--;
  if (player.buffs.brave > 0) player.buffs.brave--;
}

export interface Rewards {
  xp: number;
  gold: number;
  drops: string[];
}

export function monsterXp(def: MonsterDef, level: number): number {
  return Math.round((6 * Math.pow(level, 1.55) + 6) * def.xpMul);
}

export function rollRewards(m: MonsterInstance, rng: Rng): Rewards {
  const xp = monsterXp(m.def, m.level);
  const gold = Math.round(rng.int(m.level * 3 + 4, m.level * 6 + 10) * m.def.goldMul);
  const drops = m.def.drops.filter((d) => rng.chance(d.chance)).map((d) => d.item);
  // 驗證掉落物存在（資料錯誤時立即在測試中暴露）
  drops.forEach((k) => getItem(k));
  return { xp, gold, drops };
}
