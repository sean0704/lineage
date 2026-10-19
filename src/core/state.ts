import { SLOTS, type Slot } from '../data/items';
import { fullRestore } from '../systems/progression';

export interface GearItem {
  uid: string;
  key: string;
  enchant: number;
}

/** 玩家身上會延續到下一場戰鬥的增益 */
export interface PlayerBuffs {
  haste: number;
  brave: number;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  chests: number;
  bossKills: number;
  steps: number;
}

export interface PlayerState {
  name: string;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  gold: number;
  consumables: Record<string, number>;
  bag: GearItem[];
  equipped: Record<Slot, GearItem | null>;
  buffs: PlayerBuffs;
  /** 曾抵達的最深樓層 */
  deepestFloor: number;
  /** 已擊敗首領的樓層 */
  bossesDefeated: number[];
  victory: boolean;
  stats: PlayerStats;
  nextUid: number;
}

export function emptyEquipped(): Record<Slot, GearItem | null> {
  return Object.fromEntries(SLOTS.map((s) => [s, null])) as Record<Slot, GearItem | null>;
}

export function createGear(player: PlayerState, key: string, enchant = 0): GearItem {
  return { uid: `g${player.nextUid++}`, key, enchant };
}

export function createInitialPlayer(name = '騎士'): PlayerState {
  const p: PlayerState = {
    name,
    level: 1,
    xp: 0,
    hp: 0,
    mp: 0,
    gold: 150,
    consumables: { redPotion: 5, bluePotion: 1, teleportHomeScroll: 1 },
    bag: [],
    equipped: emptyEquipped(),
    buffs: { haste: 0, brave: 0 },
    deepestFloor: 1,
    bossesDefeated: [],
    victory: false,
    stats: { kills: 0, deaths: 0, chests: 0, bossKills: 0, steps: 0 },
    nextUid: 1,
  };
  p.equipped.weapon = createGear(p, 'dagger');
  p.equipped.armor = createGear(p, 'leatherArmor');
  fullRestore(p);
  return p;
}
