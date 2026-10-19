import { getItem, isEquip, MAX_ENCHANT, SAFE_ENCHANT, sellPrice, type ConsumableDef, type Slot } from '../data/items';
import type { Rng } from '../core/rng';
import { createGear, type GearItem, type PlayerState } from '../core/state';
import { clampVitals, getStats } from './progression';

export function countOf(player: PlayerState, key: string): number {
  return player.consumables[key] ?? 0;
}

export function addItem(player: PlayerState, key: string, qty = 1): GearItem | null {
  const def = getItem(key);
  if (isEquip(def)) {
    let last: GearItem | null = null;
    for (let i = 0; i < qty; i++) {
      last = createGear(player, key);
      player.bag.push(last);
    }
    return last;
  }
  player.consumables[key] = countOf(player, key) + qty;
  return null;
}

export function removeConsumable(player: PlayerState, key: string, qty = 1): boolean {
  const have = countOf(player, key);
  if (have < qty) return false;
  if (have === qty) delete player.consumables[key];
  else player.consumables[key] = have - qty;
  return true;
}

export function gearName(gear: GearItem): string {
  const def = getItem(gear.key);
  return gear.enchant > 0 ? `+${gear.enchant} ${def.name}` : def.name;
}

export function equip(player: PlayerState, uid: string): { ok: boolean; replaced: GearItem | null } {
  const idx = player.bag.findIndex((g) => g.uid === uid);
  if (idx < 0) return { ok: false, replaced: null };
  const gear = player.bag[idx];
  const def = getItem(gear.key);
  if (!isEquip(def)) return { ok: false, replaced: null };
  const replaced = player.equipped[def.slot];
  player.bag.splice(idx, 1);
  if (replaced) player.bag.push(replaced);
  player.equipped[def.slot] = gear;
  clampVitals(player);
  return { ok: true, replaced };
}

export function unequip(player: PlayerState, slot: Slot): GearItem | null {
  const gear = player.equipped[slot];
  if (!gear) return null;
  player.equipped[slot] = null;
  player.bag.push(gear);
  clampVitals(player);
  return gear;
}

/** 戰鬥中才存在的異常狀態（翡翠藥水可解除） */
export interface Afflictions {
  poison: number;
  paralyze: number;
}

export type UseResult =
  | { ok: true; text: string; teleport?: boolean; heal?: number; mana?: number }
  | { ok: false; text: string };

/**
 * 使用消耗品。enchant 類卷軸須改用 enchantGear()。
 * afflictions 只在戰鬥中傳入。
 */
export function useConsumable(
  player: PlayerState,
  key: string,
  opts: { inCombat: boolean; afflictions?: Afflictions },
): UseResult {
  const def = getItem(key);
  if (def.kind !== 'consumable') return { ok: false, text: '這不是可以使用的道具。' };
  if (countOf(player, key) <= 0) return { ok: false, text: `你沒有${def.name}。` };
  if (opts.inCombat && !def.combat) return { ok: false, text: `戰鬥中無法使用${def.name}。` };

  const stats = getStats(player);
  const eff = (def as ConsumableDef).effect;
  let result: UseResult;
  switch (eff.type) {
    case 'heal': {
      if (player.hp >= stats.maxHp) return { ok: false, text: '體力已經是滿的。' };
      const heal = Math.min(eff.amount, stats.maxHp - player.hp);
      player.hp += heal;
      result = { ok: true, text: `你喝下${def.name}，恢復了 ${heal} 點體力。`, heal };
      break;
    }
    case 'mana': {
      if (player.mp >= stats.maxMp) return { ok: false, text: '魔力已經是滿的。' };
      const mana = Math.min(eff.amount, stats.maxMp - player.mp);
      player.mp += mana;
      result = { ok: true, text: `你喝下${def.name}，恢復了 ${mana} 點魔力。`, mana };
      break;
    }
    case 'restore': {
      if (player.hp >= stats.maxHp && player.mp >= stats.maxMp) return { ok: false, text: '體力與魔力都是滿的。' };
      const heal = Math.min(eff.hp, stats.maxHp - player.hp);
      const mana = Math.min(eff.mp, stats.maxMp - player.mp);
      player.hp += heal;
      player.mp += mana;
      result = { ok: true, text: `你吃下${def.name}，恢復 ${heal} 體力與 ${mana} 魔力。`, heal, mana };
      break;
    }
    case 'haste':
      player.buffs.haste = eff.turns;
      result = { ok: true, text: `你喝下${def.name}，身體變得輕盈迅捷！（加速 ${eff.turns} 回合）` };
      break;
    case 'brave':
      player.buffs.brave = eff.turns;
      result = { ok: true, text: `你喝下${def.name}，勇氣湧上心頭！（勇敢 ${eff.turns} 回合）` };
      break;
    case 'cure': {
      const a = opts.afflictions;
      if (!a || (a.poison <= 0 && a.paralyze <= 0)) return { ok: false, text: '你目前沒有中毒或麻痺。' };
      a.poison = 0;
      a.paralyze = 0;
      result = { ok: true, text: `你喝下${def.name}，體內的毒素與麻痺消散了。` };
      break;
    }
    case 'teleportHome':
      result = { ok: true, text: `你展開${def.name}，藍光包覆全身……`, teleport: true };
      break;
    case 'enchant':
      return { ok: false, text: '請在背包中選擇要強化的裝備。' };
  }
  removeConsumable(player, key);
  return result;
}

export type EnchantOutcome = 'success' | 'evaporated' | 'invalid';

export function enchantSuccessChance(current: number, target: 'weapon' | 'armor'): number {
  const safe = SAFE_ENCHANT[target];
  if (current < safe) return 1;
  // 超過安定值後每 +1 機率遞減
  return Math.max(0.1, 0.5 - (current - safe) * 0.1);
}

export function canEnchant(gear: GearItem, scrollKey: string): boolean {
  const scroll = getItem(scrollKey);
  const def = getItem(gear.key);
  if (scroll.kind !== 'consumable' || scroll.effect.type !== 'enchant' || !isEquip(def)) return false;
  const isWeapon = def.slot === 'weapon';
  return (scroll.effect.target === 'weapon') === isWeapon && gear.enchant < MAX_ENCHANT;
}

/** 對裝備（背包或身上）施法 +1；超過安定值失敗則裝備蒸發 */
export function enchantGear(player: PlayerState, uid: string, scrollKey: string, rng: Rng): { outcome: EnchantOutcome; gear?: GearItem; chance: number } {
  const gear = findGear(player, uid);
  if (!gear || !canEnchant(gear, scrollKey) || countOf(player, scrollKey) <= 0) return { outcome: 'invalid', chance: 0 };
  const target = getItem(gear.key) as { slot: Slot };
  const chance = enchantSuccessChance(gear.enchant, target.slot === 'weapon' ? 'weapon' : 'armor');
  removeConsumable(player, scrollKey);
  if (rng.chance(chance)) {
    gear.enchant++;
    return { outcome: 'success', gear, chance };
  }
  destroyGear(player, uid);
  clampVitals(player);
  return { outcome: 'evaporated', gear, chance };
}

export function findGear(player: PlayerState, uid: string): GearItem | null {
  const inBag = player.bag.find((g) => g.uid === uid);
  if (inBag) return inBag;
  for (const g of Object.values(player.equipped)) if (g?.uid === uid) return g;
  return null;
}

function destroyGear(player: PlayerState, uid: string): void {
  player.bag = player.bag.filter((g) => g.uid !== uid);
  for (const [slot, g] of Object.entries(player.equipped)) {
    if (g?.uid === uid) player.equipped[slot as Slot] = null;
  }
}

export function buy(player: PlayerState, key: string, qty = 1): { ok: boolean; text: string } {
  const def = getItem(key);
  const cost = def.price * qty;
  if (def.price <= 0) return { ok: false, text: '這件物品不販售。' };
  if (player.gold < cost) return { ok: false, text: '金幣不足。' };
  player.gold -= cost;
  addItem(player, key, qty);
  return { ok: true, text: `購買了 ${def.name}${qty > 1 ? ` ×${qty}` : ''}，花費 ${cost} 金幣。` };
}

export function sellConsumable(player: PlayerState, key: string, qty = 1): { ok: boolean; text: string; gold: number } {
  const def = getItem(key);
  if (!removeConsumable(player, key, qty)) return { ok: false, text: '數量不足。', gold: 0 };
  const gold = sellPrice(def) * qty;
  player.gold += gold;
  return { ok: true, text: `賣出 ${def.name}${qty > 1 ? ` ×${qty}` : ''}，獲得 ${gold} 金幣。`, gold };
}

export function sellGear(player: PlayerState, uid: string): { ok: boolean; text: string; gold: number } {
  const idx = player.bag.findIndex((g) => g.uid === uid);
  if (idx < 0) return { ok: false, text: '只能販賣背包中（未裝備）的裝備。', gold: 0 };
  const gear = player.bag[idx];
  const gold = sellPrice(getItem(gear.key), gear.enchant);
  player.bag.splice(idx, 1);
  player.gold += gold;
  return { ok: true, text: `賣出 ${gearName(gear)}，獲得 ${gold} 金幣。`, gold };
}
