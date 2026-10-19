import type { Rng } from '../core/rng';
import { ITEMS, type Rarity } from '../data/items';
import type { ChestTier } from './dungeonGen';

export const CHEST_NAMES: Record<ChestTier, string> = {
  wooden: '木製寶箱',
  sturdy: '堅固寶箱',
  ornate: '華麗寶箱',
  legendary: '傳說寶箱',
};

export const CHEST_RARITY: Record<ChestTier, Rarity> = {
  wooden: 'common',
  sturdy: 'uncommon',
  ornate: 'rare',
  legendary: 'legendary',
};

const RARITY_TABLE: Record<ChestTier, [Rarity, number][]> = {
  wooden: [['common', 0.85], ['uncommon', 0.15]],
  sturdy: [['common', 0.4], ['uncommon', 0.48], ['rare', 0.12]],
  ornate: [['uncommon', 0.45], ['rare', 0.45], ['legendary', 0.1]],
  legendary: [['rare', 0.6], ['legendary', 0.4]],
};

const TIER_GOLD: Record<ChestTier, number> = { wooden: 1, sturdy: 1.8, ornate: 3, legendary: 5 };

/** 各稀有度可開出的消耗品（數量依樓層增加） */
const CONSUMABLE_LOOT: Record<Rarity, string[]> = {
  common: ['redPotion', 'orangePotion', 'bluePotion', 'antidote', 'teleportHomeScroll'],
  uncommon: ['orangePotion', 'whitePotion', 'greenPotion', 'elvenWafer', 'bluePotion'],
  rare: ['whitePotion', 'bravePotion', 'scrollEnchantArmor', 'scrollEnchantWeapon'],
  legendary: ['bravePotion', 'scrollEnchantWeapon', 'scrollEnchantArmor'],
};

export interface ChestLoot {
  gold: number;
  items: { key: string; qty: number }[];
}

export function rollChest(tier: ChestTier, floor: number, rng: Rng): ChestLoot {
  const gold = Math.round(rng.int(12, 30) * floor * TIER_GOLD[tier]);
  const rarity = rng.weighted(RARITY_TABLE[tier], (r) => r[1])[0];
  const items: ChestLoot['items'] = [];

  const gearPool = Object.values(ITEMS).filter((it) => it.kind === 'equip' && it.rarity === rarity);
  const gearChance = rarity === 'legendary' ? 0.85 : tier === 'wooden' ? 0.3 : 0.5;
  if (gearPool.length && rng.chance(gearChance)) {
    items.push({ key: rng.pick(gearPool).key, qty: 1 });
  } else {
    const key = rng.pick(CONSUMABLE_LOOT[rarity]);
    const isPotion = key.endsWith('Potion');
    items.push({ key, qty: isPotion ? rng.int(1, 1 + Math.ceil(floor / 2)) : 1 });
  }
  // 高階寶箱額外附贈藥水
  if (tier === 'ornate' || tier === 'legendary') {
    items.push({ key: floor >= 4 ? 'whitePotion' : 'orangePotion', qty: rng.int(1, 3) });
  }
  return { gold, items };
}

/** 首領額外寶物 */
export function rollBossBonus(floor: number, rng: Rng): ChestLoot {
  return rollChest(floor >= 7 ? 'legendary' : rng.chance(0.5) ? 'legendary' : 'ornate', floor, rng);
}
