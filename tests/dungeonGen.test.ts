import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { MAX_FLOOR, getFloor } from '../src/data/floors';
import { bfs, bossForFloor, generateFloor, idx, TILE, DIRS } from '../src/systems/dungeonGen';
import { reveal, step } from '../src/systems/exploration';

describe('dungeon generation', () => {
  it('同一種子產生相同地圖', () => {
    const a = generateFloor(3, 1234);
    const b = generateFloor(3, 1234);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.monsters).toEqual(b.monsters);
  });

  it('所有樓層、多種子：地板全部連通，樓梯與寶箱可從出生點抵達', () => {
    for (let floor = 1; floor <= MAX_FLOOR; floor++) {
      for (let seed = 1; seed <= 40; seed++) {
        const d = generateFloor(floor, seed * 101 + floor);
        const dist = bfs(d.tiles, d.size, d.spawn.x, d.spawn.y);
        for (let i = 0; i < d.tiles.length; i++) {
          if (d.tiles[i] === TILE.floor) expect(dist[i], `floor ${floor} seed ${seed}`).toBeLessThan(Infinity);
        }
        const reachable = (x: number, y: number) => DIRS.some((dd) => dist[idx(d.size, x + dd.dx, y + dd.dy)] < Infinity);
        expect(reachable(d.up.x, d.up.y)).toBe(true);
        if (floor < MAX_FLOOR) expect(d.down && reachable(d.down.x, d.down.y)).toBe(true);
        else expect(d.down).toBeNull();
        for (const c of d.chests) expect(reachable(c.x, c.y)).toBe(true);
        expect(d.monsters.filter((m) => !m.boss).length).toBeGreaterThan(getFloor(floor).monsterCount / 2);
      }
    }
  });

  it('物件不會重疊，怪物不會生在出生點附近', () => {
    for (let seed = 1; seed < 30; seed++) {
      const d = generateFloor(5, seed);
      const cells = new Set<string>();
      for (const o of [...d.monsters, ...d.chests, d.spawn, d.up, ...(d.down ? [d.down] : [])]) {
        const k = `${o.x},${o.y}`;
        expect(cells.has(k)).toBe(false);
        cells.add(k);
      }
      const dist = bfs(d.tiles, d.size, d.spawn.x, d.spawn.y);
      for (const m of d.monsters.filter((mm) => !mm.boss)) expect(dist[idx(d.size, m.x, m.y)]).toBeGreaterThanOrEqual(6);
    }
  });

  it('3F、5F、7F 有首領；擊敗後不再出現', () => {
    expect(generateFloor(3, 9, { runSeed: 77 }).bossKey).toBe(bossForFloor(3, 77));
    expect(generateFloor(7, 9).bossKey).toBe('deathKnight');
    expect(generateFloor(7, 9, { bossDefeated: true }).monsters.some((m) => m.boss)).toBe(false);
    expect(generateFloor(2, 9).bossKey).toBeNull();
    expect(bossForFloor(3, 77)).not.toBe(bossForFloor(5, 77));
  });

  it('移動：撞牆不動、走動會揭露地圖、碰到寶箱回報 chest', () => {
    const d = generateFloor(1, 55);
    const pos = { ...d.spawn };
    reveal(d, pos);
    expect(d.explored[idx(d.size, pos.x, pos.y)]).toBe(true);
    const rng = createRng(1);
    let moved = 0;
    for (let i = 0; i < 4; i++) {
      const r = step(d, pos, i as 0 | 1 | 2 | 3, rng);
      if (r.type === 'moved') moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });
});
