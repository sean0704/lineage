import type { Rng } from '../core/rng';
import { bfs, DIRS, idx, isWalkableTile, tileAt, TILE, type Chest, type Dir, type DungeonFloor, type MapMonster } from './dungeonGen';

export const AGGRO_RANGE = 6;
export const VIEW_RADIUS = 2;

export interface Position {
  x: number;
  y: number;
  facing: Dir;
}

export type StepResult =
  | { type: 'moved' }
  | { type: 'blocked' }
  | { type: 'stairs'; which: 'up' | 'down'; bossAlive: boolean }
  | { type: 'chest'; chest: Chest }
  | { type: 'encounter'; monster: MapMonster; ambush: boolean };

export function turn(facing: Dir, delta: 1 | -1): Dir {
  return ((facing + delta + 4) % 4) as Dir;
}

export function monsterAt(d: DungeonFloor, x: number, y: number): MapMonster | undefined {
  return d.monsters.find((m) => m.alive && m.x === x && m.y === y);
}

export function chestAt(d: DungeonFloor, x: number, y: number): Chest | undefined {
  return d.chests.find((c) => !c.opened && c.x === x && c.y === y);
}

export function bossAlive(d: DungeonFloor): boolean {
  return d.monsters.some((m) => m.boss && m.alive);
}

/** 標記玩家周圍與視線方向上已探索的格子 */
export function reveal(d: DungeonFloor, pos: Position): void {
  for (let y = pos.y - VIEW_RADIUS; y <= pos.y + VIEW_RADIUS; y++) {
    for (let x = pos.x - VIEW_RADIUS; x <= pos.x + VIEW_RADIUS; x++) {
      if (x >= 0 && y >= 0 && x < d.size && y < d.size) d.explored[idx(d.size, x, y)] = true;
    }
  }
  // 沿四個方向直線看到牆為止
  for (const dir of DIRS) {
    let x = pos.x;
    let y = pos.y;
    for (let i = 0; i < 12; i++) {
      x += dir.dx;
      y += dir.dy;
      if (x < 0 || y < 0 || x >= d.size || y >= d.size) break;
      d.explored[idx(d.size, x, y)] = true;
      // 牆兩側也一併顯示
      for (const side of DIRS) {
        const sx = x + side.dx;
        const sy = y + side.dy;
        if (sx >= 0 && sy >= 0 && sx < d.size && sy < d.size) d.explored[idx(d.size, sx, sy)] = true;
      }
      if (!isWalkableTile(tileAt(d, x, y))) break;
    }
  }
}

/**
 * 嘗試朝 dir 移動一格（dir 可與面向不同以支援平移/後退）。
 * 成功移動後怪物會各自行動一步，並檢查是否有怪物貼身觸發戰鬥。
 */
export function step(d: DungeonFloor, pos: Position, dir: Dir, rng: Rng): StepResult {
  const nx = pos.x + DIRS[dir].dx;
  const ny = pos.y + DIRS[dir].dy;
  const t = tileAt(d, nx, ny);

  const m = monsterAt(d, nx, ny);
  if (m) return { type: 'encounter', monster: m, ambush: false };
  const c = d.chests.find((ch) => ch.x === nx && ch.y === ny);
  if (c) return c.opened ? { type: 'blocked' } : { type: 'chest', chest: c };
  if (t === TILE.stairsUp) return { type: 'stairs', which: 'up', bossAlive: false };
  if (t === TILE.stairsDown) return { type: 'stairs', which: 'down', bossAlive: bossAlive(d) };
  if (!isWalkableTile(t)) return { type: 'blocked' };

  pos.x = nx;
  pos.y = ny;
  reveal(d, pos);
  moveMonsters(d, pos, rng);

  const adj = adjacentHostile(d, pos);
  if (adj) return { type: 'encounter', monster: adj, ambush: true };
  return { type: 'moved' };
}

export function adjacentHostile(d: DungeonFloor, pos: Position): MapMonster | undefined {
  return d.monsters.find((m) => m.alive && m.calm <= 0 && Math.abs(m.x - pos.x) + Math.abs(m.y - pos.y) === 1);
}

function blocked(d: DungeonFloor, x: number, y: number, pos: Position): boolean {
  if (!isWalkableTile(tileAt(d, x, y))) return true;
  if (x === pos.x && y === pos.y) return true;
  if (monsterAt(d, x, y)) return true;
  if (d.chests.some((c) => c.x === x && c.y === y)) return true;
  return false;
}

export function moveMonsters(d: DungeonFloor, pos: Position, rng: Rng): void {
  const dist = bfs(d.tiles, d.size, pos.x, pos.y, AGGRO_RANGE + 1);
  for (const m of d.monsters) {
    if (!m.alive || m.boss) continue;
    if (m.calm > 0) {
      m.calm--;
      continue;
    }
    const here = dist[idx(d.size, m.x, m.y)];
    if (here <= AGGRO_RANGE) {
      // 追擊：朝距離玩家更近的格子移動（貼身則不動）
      if (here <= 1) continue;
      const options = DIRS.map((dd) => ({ x: m.x + dd.dx, y: m.y + dd.dy }))
        .filter((p) => !blocked(d, p.x, p.y, pos) && dist[idx(d.size, p.x, p.y)] < here);
      if (options.length) {
        const p = rng.pick(options);
        m.x = p.x;
        m.y = p.y;
      }
    } else if (rng.chance(0.3)) {
      const dd = rng.pick(DIRS);
      if (!blocked(d, m.x + dd.dx, m.y + dd.dy, pos)) {
        m.x += dd.dx;
        m.y += dd.dy;
      }
    }
  }
}

/** 玩家是否能看見該格（用於小地圖顯示怪物） */
export function canSee(d: DungeonFloor, pos: Position, x: number, y: number): boolean {
  const dx = x - pos.x;
  const dy = y - pos.y;
  if (Math.abs(dx) + Math.abs(dy) > 7) return false;
  // 簡易視線：沿直線取樣是否經過牆
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 1; i < steps; i++) {
    const sx = Math.round(pos.x + (dx * i) / steps);
    const sy = Math.round(pos.y + (dy * i) / steps);
    if ((sx !== x || sy !== y) && !isWalkableTile(tileAt(d, sx, sy)) && tileAt(d, sx, sy) === TILE.wall) return false;
  }
  return true;
}
