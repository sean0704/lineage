/**
 * 平衡模擬機器人：以「合理玩家」策略自動打完整座地監，用來檢驗數值曲線。
 */
import { createRng, type Rng } from '../src/core/rng';
import { createInitialPlayer, type PlayerState } from '../src/core/state';
import { getItem, isEquip, type EquipDef } from '../src/data/items';
import { MAX_FLOOR } from '../src/data/floors';
import { SHOP_STOCK, innCost } from '../src/data/shop';
import { createMonster, resolveTurn, rollRewards, startCombat, type CombatState, type PlayerAction } from '../src/systems/combat';
import { generateFloor } from '../src/systems/dungeonGen';
import { addItem, buy, countOf, equip, useConsumable } from '../src/systems/inventory';
import { rollBossBonus, rollChest } from '../src/systems/loot';
import { applyDeathPenalty, fullRestore, gainXp, getStats } from '../src/systems/progression';

const HEALS = ['whitePotion', 'orangePotion', 'redPotion', 'elvenWafer'];

function chooseAction(p: PlayerState, cs: CombatState): PlayerAction {
  const s = getStats(p);
  const hpPct = p.hp / s.maxHp;
  const lowThreshold = cs.monster.boss ? 0.5 : 0.35;
  if (hpPct < lowThreshold) {
    const potion = HEALS.find((k) => countOf(p, k) > 0);
    if (potion) return { type: 'item', key: potion };
    if (p.level >= 1 && p.mp >= 6) return { type: 'skill', id: 'minorHeal' };
  }
  if (cs.afflictions.poison > 2 && countOf(p, 'antidote') > 0) return { type: 'item', key: 'antidote' };
  if (cs.charging) {
    if (p.level >= 4 && p.mp >= 8) return { type: 'skill', id: 'shockStun' };
    return { type: 'defend' };
  }
  if (cs.monster.boss) {
    if (p.buffs.brave <= 0 && countOf(p, 'bravePotion') > 0) return { type: 'item', key: 'bravePotion' };
    if (p.level >= 12 && cs.guard.turns <= 0 && p.mp >= 14) return { type: 'skill', id: 'reductionArmor' };
  }
  if (p.level >= 8 && p.mp >= 10 + (cs.monster.boss ? 0 : 8)) return { type: 'skill', id: 'powerStrike' };
  return { type: 'attack' };
}

export interface FightResult {
  won: boolean;
  turns: number;
  hpLost: number;
}

export function fight(p: PlayerState, key: string, level: number, rng: Rng): FightResult {
  const cs = startCombat(createMonster(key, level));
  const startHp = p.hp;
  let turns = 0;
  while (!cs.outcome && turns < 200) {
    const r = resolveTurn(p, cs, chooseAction(p, cs), rng);
    if (!r.turnUsed) resolveTurn(p, cs, { type: 'attack' }, rng);
    turns++;
  }
  const won = cs.outcome === 'win';
  if (won) {
    const rw = rollRewards(cs.monster, rng);
    p.gold += rw.gold;
    gainXp(p, rw.xp);
    rw.drops.forEach((d) => addItem(p, d));
    autoEquip(p);
  }
  return { won, turns, hpLost: startHp - p.hp };
}

function gearScore(def: EquipDef, enchant: number): number {
  return (def.attack ?? 0) * 1.2 + (def.defense ?? 0) + enchant + (def.maxHp ?? 0) / 10;
}

export function autoEquip(p: PlayerState): void {
  for (const g of [...p.bag]) {
    const def = getItem(g.key);
    if (!isEquip(def)) continue;
    const cur = p.equipped[def.slot];
    const curScore = cur ? gearScore(getItem(cur.key) as EquipDef, cur.enchant) : -1;
    if (gearScore(def, g.enchant) > curScore) equip(p, g.uid);
  }
}

function shop(p: PlayerState, deepest: number): void {
  // 先升級裝備，再補藥水
  for (const s of SHOP_STOCK) {
    if (s.minFloor > deepest) continue;
    const def = getItem(s.item);
    if (!isEquip(def)) continue;
    const cur = p.equipped[def.slot];
    const curScore = cur ? gearScore(getItem(cur.key) as EquipDef, cur.enchant) : -1;
    if (gearScore(def, 0) > curScore && p.gold >= def.price * 1.5) {
      buy(p, s.item);
      autoEquip(p);
    }
  }
  const potion = deepest >= 3 ? 'whitePotion' : 'orangePotion';
  const target = 4 + deepest;
  while (countOf(p, potion) < target && p.gold >= getItem(potion).price) buy(p, potion);
  while (countOf(p, 'redPotion') < 5 && p.gold >= 20) buy(p, 'redPotion');
  if (deepest >= 4 && countOf(p, 'bravePotion') < 2 && p.gold > 2000) buy(p, 'bravePotion');
}

function rest(p: PlayerState): void {
  const s = getStats(p);
  if (p.hp < s.maxHp && p.gold >= innCost(p.level)) {
    p.gold -= innCost(p.level);
    fullRestore(p);
  }
}

function heal(p: PlayerState): void {
  const s = getStats(p);
  while (p.hp < s.maxHp * 0.6) {
    const potion = ['redPotion', 'orangePotion', 'whitePotion'].find((k) => countOf(p, k) > 0);
    if (!potion) break;
    useConsumable(p, potion, { inCombat: false });
  }
}

export interface RunReport {
  cleared: boolean;
  deaths: number;
  levelAtFloor: number[];
  bossFights: { key: string; level: number; won: boolean; turns: number; playerLevel: number }[];
  avgTurnsPerFight: number;
  finalLevel: number;
  gold: number;
}

/** 依序清空每層的一般怪後挑戰首領；死亡則回村重整後重打該層（最多 maxAttempts 次） */
export function simulateRun(seed: number, maxAttempts = 6): RunReport {
  const rng = createRng(seed);
  const p = createInitialPlayer();
  const report: RunReport = { cleared: false, deaths: 0, levelAtFloor: [], bossFights: [], avgTurnsPerFight: 0, finalLevel: 1, gold: 0 };
  let fights = 0;
  let totalTurns = 0;

  for (let floor = 1; floor <= MAX_FLOOR; floor++) {
    report.levelAtFloor.push(p.level);
    let attempts = 0;
    let floorCleared = false;
    while (!floorCleared && attempts < maxAttempts) {
      attempts++;
      rest(p);
      shop(p, floor);
      const d = generateFloor(floor, rng.int(1, 1e9), { runSeed: seed });
      let dead = false;
      for (const c of d.chests) {
        const loot = rollChest(c.tier, floor, rng);
        p.gold += loot.gold;
        loot.items.forEach((it) => addItem(p, it.key, it.qty));
      }
      autoEquip(p);
      for (const m of d.monsters.filter((mm) => !mm.boss)) {
        heal(p);
        const r = fight(p, m.key, m.level, rng);
        fights++;
        totalTurns += r.turns;
        if (!r.won) {
          dead = true;
          break;
        }
      }
      if (!dead && d.bossKey) {
        rest(p);
        const boss = d.monsters.find((m) => m.boss)!;
        heal(p);
        const r = fight(p, boss.key, boss.level, rng);
        report.bossFights.push({ key: boss.key, level: boss.level, won: r.won, turns: r.turns, playerLevel: p.level });
        if (r.won) {
          const bonus = rollBossBonus(floor, rng);
          p.gold += bonus.gold;
          bonus.items.forEach((it) => addItem(p, it.key, it.qty));
          autoEquip(p);
        } else dead = true;
      }
      if (dead) {
        report.deaths++;
        applyDeathPenalty(p);
      } else floorCleared = true;
    }
    if (!floorCleared) break;
    if (floor === MAX_FLOOR) report.cleared = true;
  }
  report.avgTurnsPerFight = fights ? totalTurns / fights : 0;
  report.finalLevel = p.level;
  report.gold = p.gold;
  return report;
}

/** 測試某隻怪在指定等級對上指定玩家等級的勝率與回合數（玩家穿著商店基本裝） */
export function duel(key: string, monsterLevel: number, playerLevel: number, trials: number, seed = 1): { winRate: number; avgTurns: number; avgHpLostPct: number } {
  const rng = createRng(seed);
  let wins = 0;
  let turns = 0;
  let lost = 0;
  for (let i = 0; i < trials; i++) {
    const p = createInitialPlayer();
    gainXp(p, 0);
    p.level = playerLevel;
    fullRestore(p);
    const maxHp = getStats(p).maxHp;
    p.consumables = {};
    const r = fight(p, key, monsterLevel, rng);
    if (r.won) wins++;
    turns += r.turns;
    lost += r.hpLost / maxHp;
  }
  return { winRate: wins / trials, avgTurns: turns / trials, avgHpLostPct: lost / trials };
}
