/** 奇岩村商店販售清單 */
export const SHOP_STOCK: { item: string; minFloor: number }[] = [
  { item: 'redPotion', minFloor: 0 },
  { item: 'orangePotion', minFloor: 0 },
  { item: 'whitePotion', minFloor: 3 },
  { item: 'bluePotion', minFloor: 0 },
  { item: 'antidote', minFloor: 0 },
  { item: 'greenPotion', minFloor: 2 },
  { item: 'bravePotion', minFloor: 4 },
  { item: 'teleportHomeScroll', minFloor: 0 },
  { item: 'scrollEnchantWeapon', minFloor: 2 },
  { item: 'scrollEnchantArmor', minFloor: 2 },
  { item: 'dagger', minFloor: 0 },
  { item: 'shortBow', minFloor: 0 },
  { item: 'longSword', minFloor: 2 },
  { item: 'woodenShield', minFloor: 0 },
  { item: 'leatherHelm', minFloor: 0 },
  { item: 'ironHelm', minFloor: 3 },
  { item: 'leatherArmor', minFloor: 0 },
  { item: 'vineArmor', minFloor: 3 },
  { item: 'leatherPants', minFloor: 0 },
  { item: 'chainmailPants', minFloor: 3 },
];

/** 旅館住宿費用 */
export function innCost(level: number): number {
  return 10 + level * 6;
}
