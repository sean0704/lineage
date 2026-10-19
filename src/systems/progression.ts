import { getItem, isEquip, SLOTS } from '../data/items';
import { SKILLS, type SkillDef } from '../data/skills';
import type { PlayerState } from '../core/state';

export const MAX_LEVEL = 50;

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
}

/** 升級所需經驗值（沿用原版 L^k 曲線形狀，重新校準為 Lv1 起步） */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(18 * Math.pow(level, 1.85) + 12);
}

export function baseStats(level: number): DerivedStats {
  const l = level - 1;
  return {
    maxHp: 80 + l * 14,
    maxMp: 14 + l * 3,
    attack: 9 + l * 2,
    defense: 1 + l,
  };
}

export function getStats(player: PlayerState): DerivedStats {
  const s = baseStats(player.level);
  for (const slot of SLOTS) {
    const gear = player.equipped[slot];
    if (!gear) continue;
    const def = getItem(gear.key);
    if (!isEquip(def)) continue;
    s.maxHp += def.maxHp ?? 0;
    s.maxMp += def.maxMp ?? 0;
    if (slot === 'weapon') {
      s.attack += (def.attack ?? 0) + gear.enchant * 2;
    } else {
      s.attack += def.attack ?? 0;
      s.defense += (def.defense ?? 0) + gear.enchant;
    }
  }
  return s;
}

/** 體力/魔力超過上限時夾回（例如卸下加血裝備後） */
export function clampVitals(player: PlayerState): void {
  const s = getStats(player);
  player.hp = Math.max(0, Math.min(player.hp, s.maxHp));
  player.mp = Math.max(0, Math.min(player.mp, s.maxMp));
}

export function fullRestore(player: PlayerState): void {
  const s = getStats(player);
  player.hp = s.maxHp;
  player.mp = s.maxMp;
}

export interface LevelUpInfo {
  level: number;
  hpGain: number;
  mpGain: number;
  attackGain: number;
  defenseGain: number;
  newSkills: SkillDef[];
}

/** 加經驗並處理連續升級；升級時體力魔力全滿 */
export function gainXp(player: PlayerState, amount: number): LevelUpInfo[] {
  const ups: LevelUpInfo[] = [];
  player.xp += Math.max(0, Math.round(amount));
  while (player.level < MAX_LEVEL && player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    const before = baseStats(player.level);
    player.level++;
    const after = baseStats(player.level);
    ups.push({
      level: player.level,
      hpGain: after.maxHp - before.maxHp,
      mpGain: after.maxMp - before.maxMp,
      attackGain: after.attack - before.attack,
      defenseGain: after.defense - before.defense,
      newSkills: SKILLS.filter((sk) => sk.level === player.level),
    });
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  if (ups.length) fullRestore(player);
  return ups;
}

export function knownSkills(player: PlayerState): SkillDef[] {
  return SKILLS.filter((sk) => sk.level <= player.level);
}

export interface DeathPenalty {
  xpLost: number;
  goldLost: number;
}

/** 死亡懲罰：損失當前等級所需經驗的 10%（不降級）與 10% 金幣，於村莊復活 */
export function applyDeathPenalty(player: PlayerState): DeathPenalty {
  const xpLost = Math.min(player.xp, Math.floor(xpToNext(player.level) * 0.1));
  const goldLost = Math.floor(player.gold * 0.1);
  player.xp -= xpLost;
  player.gold -= goldLost;
  player.buffs = { haste: 0, brave: 0 };
  player.stats.deaths++;
  fullRestore(player);
  return { xpLost, goldLost };
}
