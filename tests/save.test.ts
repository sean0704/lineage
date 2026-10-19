import { describe, expect, it } from 'vitest';
import { normalizePlayer, readSave, SAVE_KEY, writeSave, type StorageLike } from '../src/core/save';
import { createInitialPlayer } from '../src/core/state';
import { addItem } from '../src/systems/inventory';

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('save', () => {
  it('存檔後讀回內容一致', () => {
    const s = memStorage();
    const p = createInitialPlayer('亞丁');
    addItem(p, 'longSword');
    p.gold = 777;
    expect(writeSave(s, p, 42)).toBe(true);
    const loaded = readSave(s)!;
    expect(loaded.runSeed).toBe(42);
    expect(loaded.player.name).toBe('亞丁');
    expect(loaded.player.gold).toBe(777);
    expect(loaded.player.bag[0].key).toBe('longSword');
  });

  it('毀損的 JSON 或未來版本回傳 null', () => {
    const s = memStorage();
    s.setItem(SAVE_KEY, '{not json');
    expect(readSave(s)).toBeNull();
    s.setItem(SAVE_KEY, JSON.stringify({ version: 999, player: {} }));
    expect(readSave(s)).toBeNull();
  });

  it('正規化會移除未知物品、修正越界數值與重複 uid', () => {
    const p = normalizePlayer({
      level: 999, gold: -5, hp: 1e9,
      consumables: { redPotion: 3, fakeItem: 5, bluePotion: -1 },
      bag: [{ uid: 'a', key: 'longSword', enchant: 2 }, { uid: 'a', key: 'dagger', enchant: 0 }, { key: 'nope' }],
      equipped: { weapon: { uid: 'w', key: 'leatherHelm', enchant: 0 }, helm: { uid: 'h', key: 'ironHelm', enchant: 1 } },
    });
    expect(p.level).toBe(50);
    expect(p.gold).toBe(0);
    expect(p.consumables).toEqual({ redPotion: 3 });
    expect(p.bag).toHaveLength(2);
    expect(new Set(p.bag.map((g) => g.uid)).size).toBe(2);
    expect(p.equipped.weapon).toBeNull();
    expect(p.equipped.helm?.key).toBe('ironHelm');
  });

  it('儲存空間拋錯時不會讓遊戲崩潰', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(writeSave(broken, createInitialPlayer(), 1)).toBe(false);
    expect(readSave(broken)).toBeNull();
    expect(readSave(null)).toBeNull();
  });
});
