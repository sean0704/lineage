export interface FloorTheme {
  name: string;
  /** 背景與迷霧顏色 */
  fog: number;
  fogDensity: number;
  /** 牆面、地板色調 */
  wallTint: number;
  floorTint: number;
  /** 火把光色 */
  torch: number;
  /** 環境光 */
  ambient: number;
  /** 環境低頻音高（Hz） */
  drone: number;
}

export interface FloorDef {
  floor: number;
  levelRange: [number, number];
  pool: string[];
  /** 首領：'random' 表示從輪替首領中挑選 */
  boss?: string | 'random';
  bossLevel?: number;
  /** 地圖尺寸（奇數） */
  size: number;
  monsterCount: number;
  chestCount: number;
  theme: FloorTheme;
}

const stone: FloorTheme = { name: '冷石迴廊', fog: 0x0b0f17, fogDensity: 0.075, wallTint: 0x9aa4b8, floorTint: 0x7d8494, torch: 0xff9a4a, ambient: 0x2a3550, drone: 55 };
const moss: FloorTheme = { name: '苔蘚墓穴', fog: 0x0a1410, fogDensity: 0.08, wallTint: 0x8aa890, floorTint: 0x6f8a74, torch: 0xffb04a, ambient: 0x1f3a2c, drone: 49 };
const arcane: FloorTheme = { name: '秘術祭壇', fog: 0x120c1a, fogDensity: 0.08, wallTint: 0xa094b8, floorTint: 0x7c7090, torch: 0xc88aff, ambient: 0x2c2045, drone: 46 };
const inferno: FloorTheme = { name: '煉獄深淵', fog: 0x1a0808, fogDensity: 0.085, wallTint: 0xb08a80, floorTint: 0x8a6a62, torch: 0xff6a2a, ambient: 0x401812, drone: 41 };

export const BOSS_ROTATION = ['sima', 'balthazar', 'casper', 'markus'] as const;

export const FLOORS: FloorDef[] = [
  { floor: 1, levelRange: [1, 2], pool: ['goblin', 'goblinArcher', 'skeleton', 'zombie'], size: 21, monsterCount: 9, chestCount: 3, theme: stone },
  { floor: 2, levelRange: [3, 5], pool: ['goblinFighter', 'skeletonArcher', 'sparto', 'skeletonAxeman', 'zombie'], size: 23, monsterCount: 11, chestCount: 4, theme: stone },
  { floor: 3, levelRange: [7, 9], pool: ['skeletonSpearman', 'shelob', 'ghoul', 'sparto', 'skeletonAxeman'], boss: 'random', bossLevel: 10, size: 23, monsterCount: 12, chestCount: 4, theme: moss },
  { floor: 4, levelRange: [10, 12], pool: ['ungoliant', 'ogre', 'stoneGolem', 'ghoul', 'skeletonSpearman'], size: 25, monsterCount: 13, chestCount: 4, theme: moss },
  { floor: 5, levelRange: [13, 15], pool: ['cerberus', 'floatingEye', 'ogre', 'ungoliant', 'stoneGolem'], boss: 'random', bossLevel: 17, size: 25, monsterCount: 13, chestCount: 5, theme: arcane },
  { floor: 6, levelRange: [16, 19], pool: ['ogreKing', 'floatingEye', 'cerberus', 'stoneGolem', 'ghoul'], size: 27, monsterCount: 14, chestCount: 5, theme: inferno },
  { floor: 7, levelRange: [20, 23], pool: ['ogreKing', 'cerberus', 'floatingEye', 'ungoliant'], boss: 'deathKnight', bossLevel: 26, size: 27, monsterCount: 14, chestCount: 5, theme: inferno },
];

export const MAX_FLOOR = FLOORS.length;

export function getFloor(n: number): FloorDef {
  const f = FLOORS[n - 1];
  if (!f) throw new Error(`Unknown floor: ${n}`);
  return f;
}
