import { ITEMS, SLOTS } from '../data/items';
import { MAX_FLOOR } from '../data/floors';
import { clampVitals } from '../systems/progression';
import { createInitialPlayer, type GearItem, type PlayerState } from './state';

export const SAVE_KEY = 'lineage3d.save';
export const SAVE_VERSION = 2;
/** 舊版（v1，單檔 index.html）的存檔鍵；格式與數值皆不相容 */
export const LEGACY_SAVE_KEY = 'lineageGameSave';

export interface SaveFile {
  version: number;
  savedAt: number;
  runSeed: number;
  player: PlayerState;
}

/** 最小化的 Storage 介面，方便在測試中注入 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike | null, player: PlayerState, runSeed: number): boolean {
  if (!storage) return false;
  try {
    const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), runSeed, player };
    storage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function readSave(storage: StorageLike | null): SaveFile | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number' || parsed.version > SAVE_VERSION) return null;
    return {
      version: SAVE_VERSION,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      runSeed: typeof parsed.runSeed === 'number' ? parsed.runSeed : 1,
      player: normalizePlayer(parsed.player),
    };
  } catch {
    return null;
  }
}

export function deleteSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* 儲存空間不可用時忽略 */
  }
}

export function hasLegacySave(storage: StorageLike | null): boolean {
  try {
    return !!storage?.getItem(LEGACY_SAVE_KEY);
  } catch {
    return false;
  }
}

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function normalizeGear(g: unknown): GearItem | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  if (typeof o.key !== 'string' || !ITEMS[o.key] || ITEMS[o.key].kind !== 'equip') return null;
  return { uid: typeof o.uid === 'string' ? o.uid : '', key: o.key, enchant: num(o.enchant, 0, 0, 20) };
}

/** 把任何來源（含毀損/舊格式）的玩家資料修正為合法狀態 */
export function normalizePlayer(input: unknown): PlayerState {
  const base = createInitialPlayer();
  if (!input || typeof input !== 'object') return base;
  const o = input as Record<string, unknown>;
  const p: PlayerState = {
    ...base,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 16) : base.name,
    level: Math.floor(num(o.level, 1, 1, 50)),
    xp: num(o.xp, 0, 0),
    hp: num(o.hp, base.hp, 0),
    mp: num(o.mp, base.mp, 0),
    gold: Math.floor(num(o.gold, base.gold, 0)),
    deepestFloor: Math.floor(num(o.deepestFloor, 1, 1, MAX_FLOOR)),
    victory: o.victory === true,
    nextUid: Math.floor(num(o.nextUid, 1, 1)),
  };

  p.consumables = {};
  if (o.consumables && typeof o.consumables === 'object') {
    for (const [k, v] of Object.entries(o.consumables as Record<string, unknown>)) {
      const n = Math.floor(num(v, 0, 0, 9999));
      if (ITEMS[k]?.kind === 'consumable' && n > 0) p.consumables[k] = n;
    }
  }

  p.bag = Array.isArray(o.bag) ? (o.bag.map(normalizeGear).filter(Boolean) as GearItem[]) : [];
  p.equipped = { ...base.equipped };
  const eq = (o.equipped ?? {}) as Record<string, unknown>;
  for (const slot of SLOTS) {
    const g = normalizeGear(eq[slot]);
    p.equipped[slot] = g && (ITEMS[g.key] as { slot: string }).slot === slot ? g : null;
  }
  // 確保 uid 唯一
  const seen = new Set<string>();
  for (const g of [...p.bag, ...SLOTS.map((s) => p.equipped[s]).filter(Boolean) as GearItem[]]) {
    if (!g.uid || seen.has(g.uid)) g.uid = `g${p.nextUid++}`;
    seen.add(g.uid);
  }

  const buffs = (o.buffs ?? {}) as Record<string, unknown>;
  p.buffs = { haste: num(buffs.haste, 0, 0, 99), brave: num(buffs.brave, 0, 0, 99) };
  p.bossesDefeated = Array.isArray(o.bossesDefeated) ? o.bossesDefeated.filter((f): f is number => typeof f === 'number') : [];
  const st = (o.stats ?? {}) as Record<string, unknown>;
  p.stats = {
    kills: num(st.kills, 0, 0), deaths: num(st.deaths, 0, 0), chests: num(st.chests, 0, 0),
    bossKills: num(st.bossKills, 0, 0), steps: num(st.steps, 0, 0),
  };
  clampVitals(p);
  if (p.hp <= 0) p.hp = 1;
  return p;
}
