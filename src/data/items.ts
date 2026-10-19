export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Slot = 'weapon' | 'shield' | 'helm' | 'armor' | 'legs';

export const SLOTS: readonly Slot[] = ['weapon', 'shield', 'helm', 'armor', 'legs'];

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: '武器',
  shield: '盾牌',
  helm: '頭盔',
  armor: '盔甲',
  legs: '護腿',
};

export const RARITY_NAMES: Record<Rarity, string> = {
  common: '普通',
  uncommon: '罕見',
  rare: '稀有',
  legendary: '傳說',
};

export type ConsumableEffect =
  | { type: 'heal'; amount: number }
  | { type: 'mana'; amount: number }
  | { type: 'restore'; hp: number; mp: number }
  | { type: 'haste'; turns: number }
  | { type: 'brave'; turns: number }
  | { type: 'cure' }
  | { type: 'teleportHome' }
  | { type: 'enchant'; target: 'weapon' | 'armor' };

interface ItemBase {
  key: string;
  name: string;
  rarity: Rarity;
  /** 商店購買價；0 表示商店不販售此物的基準價（仍可販賣） */
  price: number;
  desc: string;
}

export interface EquipDef extends ItemBase {
  kind: 'equip';
  slot: Slot;
  attack?: number;
  defense?: number;
  maxMp?: number;
  maxHp?: number;
}

export interface ConsumableDef extends ItemBase {
  kind: 'consumable';
  icon: string;
  effect: ConsumableEffect;
  /** 是否可在戰鬥中使用 */
  combat: boolean;
}

export type ItemDef = EquipDef | ConsumableDef;

/** 武器安定值：在此強化值以下施法必定成功 */
export const SAFE_ENCHANT: Record<'weapon' | 'armor', number> = { weapon: 6, armor: 4 };
export const MAX_ENCHANT = 12;

const consumables: ConsumableDef[] = [
  { key: 'redPotion', name: '紅色藥水', kind: 'consumable', rarity: 'common', icon: '🔴', price: 20, combat: true, effect: { type: 'heal', amount: 30 }, desc: '恢復 30 點體力。' },
  { key: 'orangePotion', name: '橙色藥水', kind: 'consumable', rarity: 'common', icon: '🟠', price: 70, combat: true, effect: { type: 'heal', amount: 80 }, desc: '恢復 80 點體力。' },
  { key: 'whitePotion', name: '白色藥水', kind: 'consumable', rarity: 'uncommon', icon: '⚪', price: 180, combat: true, effect: { type: 'heal', amount: 180 }, desc: '恢復 180 點體力。' },
  { key: 'bluePotion', name: '藍色藥水', kind: 'consumable', rarity: 'common', icon: '🔵', price: 50, combat: true, effect: { type: 'mana', amount: 25 }, desc: '恢復 25 點魔力。' },
  { key: 'greenPotion', name: '綠色藥水', kind: 'consumable', rarity: 'uncommon', icon: '🟢', price: 120, combat: true, effect: { type: 'haste', turns: 10 }, desc: '自我加速 10 回合：攻擊後有 35% 機率追加一擊。' },
  { key: 'bravePotion', name: '勇敢藥水', kind: 'consumable', rarity: 'rare', icon: '🟣', price: 300, combat: true, effect: { type: 'brave', turns: 10 }, desc: '勇氣激昂 10 回合：暴擊率 +15%、傷害 +15%。' },
  { key: 'antidote', name: '翡翠藥水', kind: 'consumable', rarity: 'common', icon: '💚', price: 30, combat: true, effect: { type: 'cure' }, desc: '解除中毒與麻痺。' },
  { key: 'elvenWafer', name: '精靈餅乾', kind: 'consumable', rarity: 'uncommon', icon: '🍪', price: 0, combat: true, effect: { type: 'restore', hp: 60, mp: 15 }, desc: '妖精的乾糧，恢復 60 體力與 15 魔力。' },
  { key: 'teleportHomeScroll', name: '傳送回家的卷軸', kind: 'consumable', rarity: 'common', icon: '📜', price: 60, combat: false, effect: { type: 'teleportHome' }, desc: '立即傳送回奇岩村。戰鬥中無法使用。' },
  { key: 'scrollEnchantWeapon', name: '對武器施法的卷軸', kind: 'consumable', rarity: 'rare', icon: '✨', price: 900, combat: false, effect: { type: 'enchant', target: 'weapon' }, desc: '使裝備中的武器 +1。超過安定值 +6 後有機率蒸發。' },
  { key: 'scrollEnchantArmor', name: '對盔甲施法的卷軸', kind: 'consumable', rarity: 'rare', icon: '🛡️', price: 600, combat: false, effect: { type: 'enchant', target: 'armor' }, desc: '使選定的防具 +1。超過安定值 +4 後有機率蒸發。' },
];

const equipment: EquipDef[] = [
  // 武器
  { key: 'dagger', name: '匕首', kind: 'equip', slot: 'weapon', rarity: 'common', price: 60, attack: 3, desc: '新手冒險者的隨身短刃。' },
  { key: 'shortBow', name: '短弓', kind: 'equip', slot: 'weapon', rarity: 'common', price: 120, attack: 5, desc: '輕巧的木製短弓。' },
  { key: 'longSword', name: '長劍', kind: 'equip', slot: 'weapon', rarity: 'uncommon', price: 600, attack: 8, desc: '騎士團制式長劍，平衡良好。' },
  { key: 'greatAxe', name: '巨斧', kind: 'equip', slot: 'weapon', rarity: 'uncommon', price: 0, attack: 11, desc: '沉重的雙手巨斧。' },
  { key: 'mithrilDagger', name: '米索莉短劍', kind: 'equip', slot: 'weapon', rarity: 'rare', price: 0, attack: 14, desc: '以米索莉鍛造，輕若無物、鋒利無比。' },
  { key: 'wizardStaff', name: '巫杖', kind: 'equip', slot: 'weapon', rarity: 'rare', price: 0, attack: 10, maxMp: 30, desc: '蘊含魔力的法杖，提升魔力上限。' },
  { key: 'twoHandedSword', name: '雙手劍', kind: 'equip', slot: 'weapon', rarity: 'rare', price: 0, attack: 17, desc: '只有真正的騎士才揮得動的巨劍。' },
  { key: 'flameSwordOfDeathKnight', name: '死亡騎士的烈炎之劍', kind: 'equip', slot: 'weapon', rarity: 'legendary', price: 0, attack: 26, maxHp: 50, desc: '纏繞地獄業火的魔劍。' },
  // 盾牌
  { key: 'woodenShield', name: '木盾', kind: 'equip', slot: 'shield', rarity: 'common', price: 50, defense: 1, desc: '簡單的木製圓盾。' },
  { key: 'elvenShield', name: '精靈盾牌', kind: 'equip', slot: 'shield', rarity: 'rare', price: 0, defense: 4, desc: '妖精工匠打造的輕盾。' },
  { key: 'shieldOfAntharas', name: '安塔瑞斯之盾', kind: 'equip', slot: 'shield', rarity: 'legendary', price: 0, defense: 8, maxHp: 40, desc: '以地龍鱗片打造的傳說之盾。' },
  // 頭盔
  { key: 'leatherHelm', name: '皮頭盔', kind: 'equip', slot: 'helm', rarity: 'common', price: 80, defense: 1, desc: '硬化皮革製成的頭盔。' },
  { key: 'mageHat', name: '法師帽', kind: 'equip', slot: 'helm', rarity: 'common', price: 0, defense: 1, maxMp: 15, desc: '提升魔力上限的尖帽。' },
  { key: 'ironHelm', name: '鐵頭盔', kind: 'equip', slot: 'helm', rarity: 'uncommon', price: 450, defense: 3, desc: '厚實的鐵製頭盔。' },
  { key: 'dragonicHelm', name: '龍鱗頭盔', kind: 'equip', slot: 'helm', rarity: 'legendary', price: 0, defense: 6, maxHp: 30, desc: '龍鱗鍛成的頭盔。' },
  // 盔甲
  { key: 'leatherArmor', name: '皮甲', kind: 'equip', slot: 'armor', rarity: 'common', price: 150, defense: 2, desc: '基本的皮革護甲。' },
  { key: 'vineArmor', name: '藤甲', kind: 'equip', slot: 'armor', rarity: 'uncommon', price: 700, defense: 4, desc: '浸油藤條編織的輕甲。' },
  { key: 'scaleMail', name: '鱗甲', kind: 'equip', slot: 'armor', rarity: 'rare', price: 0, defense: 7, desc: '金屬鱗片層疊的重甲。' },
  { key: 'ancientRobe', name: '古老的長袍', kind: 'equip', slot: 'armor', rarity: 'legendary', price: 0, defense: 10, maxMp: 30, desc: '銘刻古代符文的長袍。' },
  // 護腿
  { key: 'leatherPants', name: '皮長褲', kind: 'equip', slot: 'legs', rarity: 'common', price: 70, defense: 1, desc: '耐磨的皮製長褲。' },
  { key: 'chainmailPants', name: '鎖子甲褲', kind: 'equip', slot: 'legs', rarity: 'uncommon', price: 500, defense: 3, desc: '鐵環編成的護腿。' },
  { key: 'elvenChainPants', name: '精靈鏈甲褲', kind: 'equip', slot: 'legs', rarity: 'rare', price: 0, defense: 5, desc: '細緻的精靈鏈甲。' },
  { key: 'shadowLeggings', name: '影之護腿', kind: 'equip', slot: 'legs', rarity: 'legendary', price: 0, defense: 8, desc: '在黑暗中幾乎看不見的護腿。' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [...consumables, ...equipment].map((it) => [it.key, it]),
);

export function getItem(key: string): ItemDef {
  const item = ITEMS[key];
  if (!item) throw new Error(`Unknown item: ${key}`);
  return item;
}

export function isEquip(item: ItemDef): item is EquipDef {
  return item.kind === 'equip';
}

/** 物品的「價值」：販售價以此為基準。商店不賣的掉落物依稀有度給定價值 */
const RARITY_VALUE: Record<Rarity, number> = { common: 60, uncommon: 500, rare: 2400, legendary: 9000 };

export function itemValue(item: ItemDef): number {
  if (item.price > 0) return item.price;
  if (item.kind === 'equip') {
    const power = (item.attack ?? 0) + (item.defense ?? 0) * 1.5;
    return Math.round(RARITY_VALUE[item.rarity] * (0.6 + power / 12));
  }
  return RARITY_VALUE[item.rarity] / 3;
}

export function sellPrice(item: ItemDef, enchant = 0): number {
  const base = Math.floor(itemValue(item) / 2);
  return Math.floor(base * (1 + enchant * 0.35));
}
