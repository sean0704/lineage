import { createRng, type Rng } from '../core/rng';
import { BOSS_ROTATION, getFloor, MAX_FLOOR } from '../data/floors';

export const TILE = { wall: 0, floor: 1, stairsUp: 2, stairsDown: 3 } as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

/** 0=北 1=東 2=南 3=西 */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export type ChestTier = 'wooden' | 'sturdy' | 'ornate' | 'legendary';

export interface MapMonster {
  id: number;
  key: string;
  level: number;
  x: number;
  y: number;
  boss: boolean;
  alive: boolean;
  /** 逃跑後的冷卻步數，期間不會追擊或觸發戰鬥 */
  calm: number;
}

export interface Chest {
  id: number;
  x: number;
  y: number;
  tier: ChestTier;
  opened: boolean;
}

/** 壁掛火把：位於地板格 (x,y)，牆在 dir 方向 */
export interface Torch {
  x: number;
  y: number;
  dir: Dir;
}

export interface DungeonFloor {
  floor: number;
  seed: number;
  size: number;
  tiles: Tile[];
  rooms: Room[];
  up: { x: number; y: number };
  down: { x: number; y: number } | null;
  spawn: { x: number; y: number; facing: Dir };
  bossKey: string | null;
  monsters: MapMonster[];
  chests: Chest[];
  torches: Torch[];
  explored: boolean[];
}

export function idx(size: number, x: number, y: number): number {
  return y * size + x;
}

export function tileAt(d: DungeonFloor, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= d.size || y >= d.size) return TILE.wall;
  return d.tiles[idx(d.size, x, y)];
}

/** 依樓層與種子挑出 3F/5F 的輪替首領（同一趟冒險固定） */
export function bossForFloor(floor: number, runSeed: number): string | null {
  const def = getFloor(floor);
  if (!def.boss) return null;
  if (def.boss !== 'random') return def.boss;
  const order = createRng(runSeed ^ 0x9e3779b9).shuffle([...BOSS_ROTATION]);
  return floor <= 3 ? order[0] : order[1];
}

export interface GenOptions {
  /** 首領已被擊敗則不再生成 */
  bossDefeated?: boolean;
  runSeed?: number;
}

export function generateFloor(floor: number, seed: number, opts: GenOptions = {}): DungeonFloor {
  const def = getFloor(floor);
  const rng = createRng(seed);
  const size = def.size;
  const tiles: Tile[] = new Array(size * size).fill(TILE.wall);

  const rooms = placeRooms(rng, size, 6 + Math.floor(floor / 2));
  for (const r of rooms) carveRect(tiles, size, r.x, r.y, r.w, r.h);

  // 依序把每個房間連到最近的既有房間，保證全圖連通
  for (let i = 1; i < rooms.length; i++) {
    let best = 0;
    let bestDist = Infinity;
    for (let j = 0; j < i; j++) {
      const dd = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
      if (dd < bestDist) {
        bestDist = dd;
        best = j;
      }
    }
    carveCorridor(tiles, size, rooms[i], rooms[best], rng);
  }
  // 額外迴路，減少死路
  for (let k = 0; k < 2 + Math.floor(rooms.length / 4); k++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carveCorridor(tiles, size, a, b, rng);
  }

  const start = rooms[0];
  const up = { x: start.cx, y: start.cy };
  tiles[idx(size, up.x, up.y)] = TILE.stairsUp;
  const spawnCell = firstOpenNeighbor(tiles, size, up.x, up.y);
  const spawn = { x: spawnCell.x, y: spawnCell.y, facing: mostOpenDir(tiles, size, spawnCell.x, spawnCell.y) };

  const dist = bfs(tiles, size, spawn.x, spawn.y);
  const roomDist = (r: Room) => dist[idx(size, r.cx, r.cy)];
  const far = rooms.slice(1).reduce((a, b) => (roomDist(b) > roomDist(a) ? b : a));

  let down: DungeonFloor['down'] = null;
  if (floor < MAX_FLOOR) {
    down = { x: far.cx, y: far.cy };
    tiles[idx(size, down.x, down.y)] = TILE.stairsDown;
  }

  const occupied = new Set<number>([idx(size, up.x, up.y), idx(size, spawn.x, spawn.y)]);
  if (down) occupied.add(idx(size, down.x, down.y));
  const monsters: MapMonster[] = [];
  let nextId = 1;

  // 首領：守在下樓梯旁（7F 則坐鎮最深處房間中央）
  const bossKey = bossForFloor(floor, opts.runSeed ?? seed);
  if (bossKey && !opts.bossDefeated) {
    const pos = down ? nearestOpenTowards(tiles, size, down, dist) : { x: far.cx, y: far.cy };
    occupied.add(idx(size, pos.x, pos.y));
    monsters.push({ id: nextId++, key: bossKey, level: def.bossLevel ?? def.levelRange[1] + 2, x: pos.x, y: pos.y, boss: true, alive: true, calm: 0 });
  }

  const floorCells: { x: number; y: number }[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (tiles[idx(size, x, y)] === TILE.floor) floorCells.push({ x, y });
    }
  }
  rng.shuffle(floorCells);

  const chests: Chest[] = [];
  const chestRooms = rng.shuffle(rooms.slice(1));
  for (let i = 0; i < def.chestCount && i < chestRooms.length * 2; i++) {
    const r = chestRooms[i % chestRooms.length];
    const cell = pickRoomCorner(rng, tiles, size, r, occupied);
    if (!cell) continue;
    occupied.add(idx(size, cell.x, cell.y));
    chests.push({ id: i + 1, x: cell.x, y: cell.y, tier: rollChestTier(floor, rng), opened: false });
  }

  for (const cell of floorCells) {
    if (monsters.filter((m) => !m.boss).length >= def.monsterCount) break;
    const k = idx(size, cell.x, cell.y);
    if (occupied.has(k) || dist[k] < 6) continue;
    const key = rng.pick(def.pool);
    const level = rng.int(def.levelRange[0], def.levelRange[1]);
    occupied.add(k);
    monsters.push({ id: nextId++, key, level, x: cell.x, y: cell.y, boss: false, alive: true, calm: 0 });
  }

  return {
    floor, seed, size, tiles, rooms, up, down, spawn, bossKey: bossKey && !opts.bossDefeated ? bossKey : null,
    monsters, chests, torches: placeTorches(rng, tiles, size, rooms),
    explored: new Array(size * size).fill(false),
  };
}

function placeRooms(rng: Rng, size: number, target: number): Room[] {
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 400 && rooms.length < target; attempt++) {
    const w = rng.pick([3, 3, 5, 5, 7]);
    const h = rng.pick([3, 3, 5, 5, 7]);
    const x = 1 + 2 * rng.int(0, Math.floor((size - w - 2) / 2));
    const y = 1 + 2 * rng.int(0, Math.floor((size - h - 2) / 2));
    const overlaps = rooms.some((r) => x <= r.x + r.w + 1 && x + w + 1 >= r.x && y <= r.y + r.h + 1 && y + h + 1 >= r.y);
    if (overlaps) continue;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  return rooms;
}

function carveRect(tiles: Tile[], size: number, x: number, y: number, w: number, h: number): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) tiles[idx(size, i, j)] = TILE.floor;
}

function carveCorridor(tiles: Tile[], size: number, a: Room, b: Room, rng: Rng): void {
  const carve = (x: number, y: number) => {
    if (tiles[idx(size, x, y)] === TILE.wall) tiles[idx(size, x, y)] = TILE.floor;
  };
  const hLine = (x1: number, x2: number, y: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y);
  };
  const vLine = (y1: number, y2: number, x: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x, y);
  };
  if (rng.chance(0.5)) {
    hLine(a.cx, b.cx, a.cy);
    vLine(a.cy, b.cy, b.cx);
  } else {
    vLine(a.cy, b.cy, a.cx);
    hLine(a.cx, b.cx, b.cy);
  }
}

export function isWalkableTile(t: Tile): boolean {
  return t === TILE.floor;
}

export function bfs(tiles: Tile[], size: number, sx: number, sy: number, limit = Infinity): number[] {
  const dist = new Array(size * size).fill(Infinity);
  const queue: number[] = [idx(size, sx, sy)];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % size;
    const cy = Math.floor(cur / size);
    if (dist[cur] >= limit) continue;
    for (const d of DIRS) {
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = idx(size, nx, ny);
      if (dist[n] !== Infinity || !isWalkableTile(tiles[n])) continue;
      dist[n] = dist[cur] + 1;
      queue.push(n);
    }
  }
  return dist;
}

function firstOpenNeighbor(tiles: Tile[], size: number, x: number, y: number): { x: number; y: number } {
  for (const d of DIRS) {
    if (tiles[idx(size, x + d.dx, y + d.dy)] === TILE.floor) return { x: x + d.dx, y: y + d.dy };
  }
  throw new Error('stairs has no open neighbour');
}

/** 朝向直線可視距離最長的方向，避免一出生就面對牆壁 */
export function mostOpenDir(tiles: Tile[], size: number, x: number, y: number): Dir {
  let best: Dir = 0;
  let bestLen = -1;
  DIRS.forEach((d, i) => {
    let len = 0;
    while (tiles[idx(size, x + d.dx * (len + 1), y + d.dy * (len + 1))] === TILE.floor) len++;
    if (len > bestLen) {
      bestLen = len;
      best = i as Dir;
    }
  });
  return best;
}

/** 下樓梯旁、最靠近玩家來向的一格 */
function nearestOpenTowards(tiles: Tile[], size: number, p: { x: number; y: number }, dist: number[]): { x: number; y: number } {
  let best: { x: number; y: number } | null = null;
  for (const d of DIRS) {
    const x = p.x + d.dx;
    const y = p.y + d.dy;
    if (tiles[idx(size, x, y)] !== TILE.floor) continue;
    if (!best || dist[idx(size, x, y)] < dist[idx(size, best.x, best.y)]) best = { x, y };
  }
  return best ?? p;
}

function pickRoomCorner(rng: Rng, tiles: Tile[], size: number, r: Room, occupied: Set<number>): { x: number; y: number } | null {
  const candidates: { x: number; y: number }[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const k = idx(size, x, y);
      if (occupied.has(k) || tiles[k] !== TILE.floor) continue;
      // 只放在貼牆的格子，避免擋住走道
      const wallSides = DIRS.filter((d) => tiles[idx(size, x + d.dx, y + d.dy)] === TILE.wall).length;
      const openSides = DIRS.filter((d) => tiles[idx(size, x + d.dx, y + d.dy)] === TILE.floor).length;
      if (wallSides >= 1 && openSides >= 2 && (x !== r.cx || y !== r.cy)) candidates.push({ x, y });
    }
  }
  return candidates.length ? rng.pick(candidates) : null;
}

function rollChestTier(floor: number, rng: Rng): ChestTier {
  const table: [ChestTier, number][] =
    floor <= 2 ? [['wooden', 0.75], ['sturdy', 0.25]]
    : floor <= 4 ? [['wooden', 0.3], ['sturdy', 0.5], ['ornate', 0.2]]
    : [['sturdy', 0.4], ['ornate', 0.45], ['legendary', 0.15]];
  return rng.weighted(table, (t) => t[1])[0];
}

function placeTorches(rng: Rng, tiles: Tile[], size: number, rooms: Room[]): Torch[] {
  const torches: Torch[] = [];
  const taken = new Set<string>();
  const tryAdd = (x: number, y: number) => {
    const walls = DIRS.map((d, i) => ({ d, i: i as Dir })).filter(({ d }) => tiles[idx(size, x + d.dx, y + d.dy)] === TILE.wall);
    if (!walls.length) return;
    const w = rng.pick(walls);
    const key = `${x},${y}`;
    if (taken.has(key)) return;
    taken.add(key);
    torches.push({ x, y, dir: w.i });
  };
  for (const r of rooms) {
    // 房間兩側各一支
    tryAdd(r.x, r.cy);
    tryAdd(r.x + r.w - 1, r.cy);
  }
  // 走廊每隔一段距離補一支
  let counter = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (tiles[idx(size, x, y)] !== TILE.floor) continue;
      if (rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
      if (++counter % 9 === 0) tryAdd(x, y);
    }
  }
  return torches;
}
