/**
 * 可設定種子的亂數產生器（mulberry32）。
 * 所有遊戲邏輯都透過 Rng 取亂數，測試時可固定種子重現結果。
 */
export interface Rng {
  /** [0, 1) 浮點數 */
  next(): number;
  /** [min, max] 整數（含兩端） */
  int(min: number, max: number): number;
  /** [min, max) 浮點數 */
  range(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** 依權重挑選 */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() on empty list');
      return items[Math.floor(next() * items.length)];
    },
    weighted: (items, weight) => {
      const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
      if (total <= 0) return rng.pick(items);
      let roll = next() * total;
      for (const it of items) {
        roll -= Math.max(0, weight(it));
        if (roll < 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
  return rng;
}

/** 產生一個新的隨機種子（非測試環境使用） */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
