import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, type Rng } from '../core/rng';
import type { FloorTheme } from '../data/floors';
import { DIRS, idx, TILE, type Dir, type DungeonFloor, type Room } from '../systems/dungeonGen';
import { enhanceMaterial } from './materialFx';
import { CELL } from './MonsterView';
import { decalTexture, flame, glow, webTexture, bannerTexture, type DecalKind } from './textures';

const WALL_H = 3;

/** 依材質把靜態幾何合併成單一網格，大幅降低繪製呼叫 */
class StaticBatch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** 加入一份幾何的變換副本（原始幾何不會被修改，可重複使用） */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    // 統一屬性，才能合併
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  build(group: THREE.Group, disposables: { dispose(): void }[]): void {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      group.add(mesh);
      disposables.push(merged);
    }
    this.parts.clear();
  }
}

const m4 = () => new THREE.Matrix4();
const compose = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | THREE.Vector3 = 1) =>
  m4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : s);

export interface FlameSpot {
  sprite: THREE.Sprite;
  halo: THREE.Sprite;
  base: THREE.Vector2;
  seed: number;
}

export interface DecorResult {
  group: THREE.Group;
  flames: FlameSpot[];
  /** 可分配光源的位置（火盆、蠟燭群） */
  lightSpots: { pos: THREE.Vector3; color: number; strength: number }[];
  /** 旗幟等會輕微擺動的物件 */
  swaying: { obj: THREE.Object3D; seed: number }[];
  disposables: { dispose(): void }[];
}

/** 依主題選擇的材質集合 */
function materials(theme: FloorTheme) {
  const tint = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
  const std = (color: number, rough = 0.85, metal = 0) =>
    enhanceMaterial(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true }), { rim: false, groundAO: 0.35, mottle: 0.18, mottleScale: 5 });
  return {
    stone: std(tint(theme.wallTint, 0.62), 0.95),
    stoneDark: std(tint(theme.wallTint, 0.42), 0.95),
    wood: std(0x5a3a22, 0.9),
    woodDark: std(0x3a2416, 0.9),
    iron: std(0x3c3c44, 0.55, 0.5),
    bone: std(0xcfc6ae, 0.75),
    clay: std(0x8a5236, 0.9),
    wax: enhanceMaterial(new THREE.MeshStandardMaterial({ color: 0xeee2c4, roughness: 0.6, emissive: 0x402a10, emissiveIntensity: 0.6 }), { rim: false, groundAO: 0.2, mottle: 0.05 }),
    coal: new THREE.MeshStandardMaterial({ color: 0x220c04, emissive: 0xff4a10, emissiveIntensity: 1.6, roughness: 1 }),
  };
}

type Mats = ReturnType<typeof materials>;

export function buildDecor(d: DungeonFloor, theme: FloorTheme): DecorResult {
  const rng = createRng(d.seed ^ 0x51ed27);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const flames: FlameSpot[] = [];
  const lightSpots: DecorResult['lightSpots'] = [];
  const swaying: DecorResult['swaying'] = [];
  const mats = materials(theme);
  Object.values(mats).forEach((m) => disposables.push(m));
  const batch = new StaticBatch();

  const n = d.size;
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? TILE.wall : d.tiles[idx(n, x, y)]);
  const isOpen = (x: number, y: number) => tile(x, y) !== TILE.wall;
  const roomAt = (x: number, y: number): Room | undefined => d.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const occupied = new Set<string>();
  for (const m of d.monsters) occupied.add(`${m.x},${m.y}`);
  for (const c of d.chests) occupied.add(`${c.x},${c.y}`);
  occupied.add(`${d.up.x},${d.up.y}`);
  if (d.down) occupied.add(`${d.down.x},${d.down.y}`);
  occupied.add(`${d.spawn.x},${d.spawn.y}`);

  const addFlame = (pos: THREE.Vector3, size: number, color: number) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(size * 0.55, size, 1);
    sprite.position.copy(pos).add(new THREE.Vector3(0, size * 0.4, 0));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(size * 4);
    halo.position.copy(sprite.position);
    group.add(sprite, halo);
    disposables.push(sprite.material, halo.material);
    flames.push({ sprite, halo, base: new THREE.Vector2(size * 0.55, size), seed: rng.next() * 10 });
  };

  // ───────── 建築：牆頂飛簷、房間石柱、入口拱門、走廊石肋 ─────────
  const corniceGeo = new THREE.BoxGeometry(CELL + 0.12, 0.2, CELL + 0.12);
  const corniceGeo2 = new THREE.BoxGeometry(CELL + 0.22, 0.08, CELL + 0.22);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (isOpen(x, y)) continue;
      const touches = DIRS.some((dd) => isOpen(x + dd.dx, y + dd.dy));
      if (!touches) continue;
      batch.add(corniceGeo, mats.stoneDark, compose(x * CELL, WALL_H - 0.18, y * CELL));
      batch.add(corniceGeo2, mats.stone, compose(x * CELL, WALL_H - 0.3, y * CELL));
    }
  }

  const shaft = new THREE.CylinderGeometry(0.26, 0.3, WALL_H - 0.5, 8);
  const plinth = new THREE.BoxGeometry(0.78, 0.28, 0.78);
  const capital = new THREE.BoxGeometry(0.72, 0.22, 0.72);
  for (const r of d.rooms) {
    if (r.w < 3 || r.h < 3) continue;
    const x0 = r.x * CELL - CELL / 2;
    const x1 = (r.x + r.w - 1) * CELL + CELL / 2;
    const z0 = r.y * CELL - CELL / 2;
    const z1 = (r.y + r.h - 1) * CELL + CELL / 2;
    for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]] as const) {
      const px = cx + sx * 0.28;
      const pz = cz + sz * 0.28;
      batch.add(plinth, mats.stoneDark, compose(px, 0.14, pz));
      batch.add(shaft, mats.stone, compose(px, 0.28 + (WALL_H - 0.5) / 2, pz));
      batch.add(capital, mats.stoneDark, compose(px, WALL_H - 0.33, pz));
    }
    // 大房間的天花板橫樑
    const beam = new THREE.BoxGeometry(0.28, 0.3, r.h * CELL);
    for (let i = 1; i < r.w; i += 2) {
      const bx = (r.x + i) * CELL - CELL / 2;
      batch.add(beam, mats.woodDark, compose(bx, WALL_H - 0.15, (z0 + z1) / 2));
    }
    beam.dispose();
  }

  // 入口拱門：房間外緣的走廊格，且兩側都是牆（真正的門洞）
  const archGeo = new THREE.TorusGeometry(0.82, 0.16, 5, 12, Math.PI);
  const postGeo = new THREE.BoxGeometry(0.34, 2.2, 0.5);
  const keyGeo = new THREE.BoxGeometry(0.26, 0.36, 0.56);
  const doorways: { x: number; y: number; dir: Dir }[] = [];
  for (const r of d.rooms) {
    const sides: { x: number; y: number; dir: Dir }[] = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      sides.push({ x, y: r.y - 1, dir: 0 }, { x, y: r.y + r.h, dir: 2 });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      sides.push({ x: r.x - 1, y, dir: 3 }, { x: r.x + r.w, y, dir: 1 });
    }
    for (const s of sides) {
      if (!isOpen(s.x, s.y) || roomAt(s.x, s.y)) continue;
      const horizontal = s.dir === 0 || s.dir === 2;
      const sideA = horizontal ? isOpen(s.x - 1, s.y) : isOpen(s.x, s.y - 1);
      const sideB = horizontal ? isOpen(s.x + 1, s.y) : isOpen(s.x, s.y + 1);
      if (sideA || sideB) continue;
      doorways.push(s);
    }
  }
  for (const dw of doorways) {
    const dd = DIRS[dw.dir];
    // 拱門位於走廊格與房間的交界面
    const bx = dw.x * CELL - dd.dx * (CELL / 2);
    const bz = dw.y * CELL - dd.dy * (CELL / 2);
    const ry = dd.dx !== 0 ? Math.PI / 2 : 0;
    const across = new THREE.Vector3(dd.dx !== 0 ? 0 : 1, 0, dd.dx !== 0 ? 1 : 0);
    for (const side of [-1, 1]) {
      batch.add(postGeo, mats.stoneDark, compose(bx + across.x * side * 0.86, 1.1, bz + across.z * side * 0.86, ry));
    }
    batch.add(archGeo, mats.stoneDark, compose(bx, 2.2, bz, ry));
    batch.add(keyGeo, mats.stone, compose(bx, 3.0 - 0.02, bz, ry));
  }

  // 走廊石肋：每隔兩格一道
  const ribGeo = new THREE.BoxGeometry(CELL, 0.24, 0.32);
  const ribPost = new THREE.BoxGeometry(0.18, WALL_H, 0.36);
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      if (tile(x, y) !== TILE.floor || roomAt(x, y)) continue;
      const ns = !isOpen(x - 1, y) && !isOpen(x + 1, y);
      const ew = !isOpen(x, y - 1) && !isOpen(x, y + 1);
      if (!(ns || ew) || (x + y) % 3 !== 0) continue;
      const ry = ns ? 0 : Math.PI / 2;
      batch.add(ribGeo, mats.stoneDark, compose(x * CELL, WALL_H - 0.12, y * CELL, ry));
      for (const side of [-1, 1]) {
        batch.add(ribPost, mats.stoneDark, compose(x * CELL + (ns ? side * 0.94 : 0), WALL_H / 2, y * CELL + (ew ? side * 0.94 : 0), ry));
      }
    }
  }

  // ───────── 物件 ─────────
  const wallCells: { x: number; y: number; wall: Dir; room: Room | undefined }[] = [];
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      if (tile(x, y) !== TILE.floor || occupied.has(`${x},${y}`)) continue;
      const walls = DIRS.map((dd, i) => ({ dd, i: i as Dir })).filter(({ dd }) => !isOpen(x + dd.dx, y + dd.dy));
      if (!walls.length) continue;
      wallCells.push({ x, y, wall: rng.pick(walls).i, room: roomAt(x, y) });
    }
  }
  rng.shuffle(wallCells);

  const roomCells = wallCells.filter((c) => c.room);
  const corridorCells = wallCells.filter((c) => !c.room);
  const propBudget = Math.min(roomCells.length, 10 + d.rooms.length * 3);
  for (let i = 0; i < propBudget; i++) {
    const c = roomCells[i];
    const dd = DIRS[c.wall];
    const base = new THREE.Vector3(c.x * CELL + dd.dx * 0.62, 0, c.y * CELL + dd.dy * 0.62);
    const facing = Math.atan2(-dd.dx, -dd.dy);
    const roll = rng.next();
    if (roll < 0.22) barrels(batch, mats, base, rng);
    else if (roll < 0.4) crates(batch, mats, base, facing, rng);
    else if (roll < 0.52) pottery(batch, mats, base, rng);
    else if (roll < 0.66) bonePile(batch, mats, base, rng);
    else if (roll < 0.8) {
      candles(batch, mats, base, rng, addFlame);
      lightSpots.push({ pos: base.clone().add(new THREE.Vector3(0, 0.4, 0)), color: 0xffb060, strength: 0.5 });
    } else if (roll < 0.9) chain(batch, mats, base.clone().add(new THREE.Vector3(dd.dx * 0.2, 0, dd.dy * 0.2)), rng);
    else {
      const b = banner(theme, base, dd);
      group.add(b.group);
      disposables.push(b);
      swaying.push({ obj: b.cloth, seed: rng.next() * 10 });
    }
  }

  // 走廊角落：骨頭、碎石
  for (const c of corridorCells.slice(0, Math.floor(corridorCells.length * 0.12))) {
    const dd = DIRS[c.wall];
    const base = new THREE.Vector3(c.x * CELL + dd.dx * 0.7, 0, c.y * CELL + dd.dy * 0.7);
    if (rng.chance(0.5)) bonePile(batch, mats, base, rng, true);
    else pottery(batch, mats, base, rng);
  }

  // 大房間角落的火盆
  for (const r of d.rooms) {
    if (r.w < 5 || r.h < 5 || !rng.chance(0.7)) continue;
    const corners: [number, number][] = [[r.x, r.y], [r.x + r.w - 1, r.y + r.h - 1], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1]];
    for (const [cx, cy] of corners.slice(0, 2)) {
      if (occupied.has(`${cx},${cy}`)) continue;
      const px = cx * CELL + (cx === r.x ? -0.45 : 0.45);
      const pz = cy * CELL + (cy === r.y ? -0.45 : 0.45);
      brazier(batch, mats, new THREE.Vector3(px, 0, pz), addFlame, theme.torch);
      lightSpots.push({ pos: new THREE.Vector3(px, 1.3, pz), color: theme.torch, strength: 1 });
    }
  }

  // 蜘蛛網：走廊與房間的上方牆角
  const webMat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55, color: 0xd8d8e0 });
  disposables.push(webMat);
  const webGeo = new THREE.PlaneGeometry(1.2, 1.2);
  disposables.push(webGeo);
  let webs = 0;
  for (const c of wallCells) {
    if (webs > 18 || !rng.chance(0.18)) continue;
    const dd = DIRS[c.wall];
    const perp = DIRS[(c.wall + 1) % 4];
    if (isOpen(c.x + perp.dx, c.y + perp.dy)) continue;
    const web = new THREE.Mesh(webGeo, webMat);
    web.position.set(c.x * CELL + dd.dx * 0.62 + perp.dx * 0.62, WALL_H - 0.62, c.y * CELL + dd.dy * 0.62 + perp.dy * 0.62);
    web.lookAt(c.x * CELL - dd.dx - perp.dx, WALL_H - 1.5, c.y * CELL - dd.dy - perp.dy);
    group.add(web);
    webs++;
  }

  // ───────── 地面貼花 ─────────
  const decalKinds: DecalKind[] = ['grime', theme.key === 'moss' ? 'moss' : theme.key === 'arcane' ? 'rune' : theme.key === 'inferno' ? 'lava' : 'grime'];
  const floorCells: [number, number][] = [];
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (tile(x, y) === TILE.floor) floorCells.push([x, y]);
  for (const kind of new Set(decalKinds)) {
    const count = Math.round(floorCells.length * (kind === 'grime' ? 0.28 : kind === 'rune' ? 0.03 : 0.16));
    const glowing = kind === 'lava' || kind === 'rune';
    const mat = glowing
      ? new THREE.MeshBasicMaterial({ map: decalTexture(kind), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(kind === 'lava' ? 0xff5a1a : 0xb07aff).multiplyScalar(kind === 'lava' ? 2.2 : 1.6) })
      : new THREE.MeshStandardMaterial({ map: decalTexture(kind), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      const [x, y] = rng.pick(floorCells);
      const s = kind === 'rune' ? 1.7 : rng.range(0.8, 1.9);
      inst.setMatrixAt(i, compose(x * CELL + rng.range(-0.6, 0.6), 0.005 + i * 0.00002, y * CELL + rng.range(-0.6, 0.6), rng.range(0, Math.PI * 2), 0, 0, s));
    }
    inst.renderOrder = 1;
    group.add(inst);
    disposables.push(geo, mat, inst);
  }

  // ───────── 主題物件 ─────────
  if (theme.key === 'moss') mushrooms(group, disposables, wallCells, rng);
  if (theme.key === 'arcane') crystals(group, disposables, wallCells, rng);

  batch.build(group, disposables);
  [corniceGeo, corniceGeo2, shaft, plinth, capital, archGeo, postGeo, keyGeo, ribGeo, ribPost].forEach((g) => g.dispose());
  return { group, flames, lightSpots, swaying, disposables };
}

// ───────────────── 物件建構 ─────────────────

let barrelGeo: THREE.LatheGeometry | null = null;
function barrels(b: StaticBatch, mats: Mats, base: THREE.Vector3, rng: Rng): void {
  if (!barrelGeo) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(0.26 + Math.sin(t * Math.PI) * 0.05, t * 0.7));
    }
    barrelGeo = new THREE.LatheGeometry(pts, 10);
  }
  const hoop = new THREE.TorusGeometry(0.3, 0.018, 4, 12);
  const lid = new THREE.CircleGeometry(0.26, 10).rotateX(-Math.PI / 2);
  const count = rng.int(1, 3);
  for (let i = 0; i < count; i++) {
    const ox = base.x + (i - (count - 1) / 2) * 0.55 * (rng.chance(0.5) ? 1 : -1) * 0.6;
    const oz = base.z + rng.range(-0.15, 0.15);
    const tipped = i === 2;
    if (tipped) {
      b.add(barrelGeo, mats.wood, compose(ox, 0.3, oz + 0.3, rng.range(0, 3), 0, Math.PI / 2));
      continue;
    }
    b.add(barrelGeo, mats.wood, compose(ox, 0, oz, rng.range(0, 3)));
    b.add(lid, mats.woodDark, compose(ox, 0.7, oz));
    for (const hy of [0.12, 0.58]) b.add(hoop, mats.iron, compose(ox, hy, oz, 0, Math.PI / 2));
  }
  hoop.dispose();
  lid.dispose();
}

function crates(b: StaticBatch, mats: Mats, base: THREE.Vector3, facing: number, rng: Rng): void {
  const box = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const plank = new THREE.BoxGeometry(0.66, 0.08, 0.66);
  const brace = new THREE.BoxGeometry(0.07, 0.86, 0.04);
  const place = (x: number, y: number, z: number, rot: number, s: number) => {
    b.add(box, mats.wood, compose(x, y + 0.31 * s, z, rot, 0, 0, s));
    b.add(plank, mats.woodDark, compose(x, y + 0.04 * s, z, rot, 0, 0, s));
    b.add(plank, mats.woodDark, compose(x, y + 0.58 * s, z, rot, 0, 0, s));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
    const front = new THREE.Vector3(0, 0, 0.32 * s).applyQuaternion(q);
    b.add(brace, mats.woodDark, m4().compose(new THREE.Vector3(x + front.x, y + 0.31 * s, z + front.z), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.78))), new THREE.Vector3(s, s, s)));
  };
  place(base.x, 0, base.z, facing + rng.range(-0.2, 0.2), 1);
  if (rng.chance(0.6)) place(base.x + rng.range(-0.3, 0.3), 0.62, base.z + rng.range(-0.1, 0.1), facing + rng.range(-0.5, 0.5), 0.7);
  box.dispose();
  plank.dispose();
  brace.dispose();
}

function pottery(b: StaticBatch, mats: Mats, base: THREE.Vector3, rng: Rng): void {
  const pts = [0, 0.1, 0.18, 0.22, 0.2, 0.12, 0.08, 0.1].map((r, i) => new THREE.Vector2(r + 0.02, i * 0.07));
  const pot = new THREE.LatheGeometry(pts, 8);
  const shard = new THREE.BoxGeometry(0.12, 0.02, 0.08);
  for (let i = 0; i < rng.int(1, 3); i++) {
    const s = rng.range(0.7, 1.2);
    b.add(pot, mats.clay, compose(base.x + rng.range(-0.4, 0.4), 0, base.z + rng.range(-0.2, 0.2), 0, 0, 0, s));
  }
  for (let i = 0; i < 5; i++) b.add(shard, mats.clay, compose(base.x + rng.range(-0.5, 0.5), 0.01, base.z + rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.3, 0.3)));
  pot.dispose();
  shard.dispose();
}

function bonePile(b: StaticBatch, mats: Mats, base: THREE.Vector3, rng: Rng, small = false): void {
  const skull = new THREE.IcosahedronGeometry(0.1, 1);
  const bone = new THREE.CylinderGeometry(0.02, 0.025, 0.42, 5);
  const knob = new THREE.IcosahedronGeometry(0.035, 0);
  const rib = new THREE.TorusGeometry(0.12, 0.012, 3, 8, Math.PI);
  const n = small ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const x = base.x + rng.range(-0.4, 0.4);
    const z = base.z + rng.range(-0.3, 0.3);
    const ry = rng.range(0, Math.PI * 2);
    b.add(bone, mats.bone, compose(x, 0.03 + i * 0.012, z, ry, 0, Math.PI / 2));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
    for (const e of [-0.21, 0.21]) {
      const p = new THREE.Vector3(e, 0, 0).applyQuaternion(q);
      b.add(knob, mats.bone, compose(x + p.x, 0.04 + i * 0.012, z + p.z));
    }
  }
  if (!small) b.add(rib, mats.bone, compose(base.x + rng.range(-0.2, 0.2), 0.05, base.z, rng.range(0, 3), -Math.PI / 2));
  for (let i = 0; i < (small ? 1 : 2); i++) b.add(skull, mats.bone, compose(base.x + rng.range(-0.3, 0.3), 0.09 + i * 0.12, base.z + rng.range(-0.2, 0.2), rng.range(0, 6), rng.range(-0.4, 0.4), 0, new THREE.Vector3(0.95, 1, 1.1)));
  [skull, bone, knob, rib].forEach((g) => g.dispose());
}

function candles(b: StaticBatch, mats: Mats, base: THREE.Vector3, rng: Rng, addFlame: (p: THREE.Vector3, size: number, color: number) => void): void {
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.12, 0.38);
    const x = base.x + rng.range(-0.3, 0.3);
    const z = base.z + rng.range(-0.25, 0.25);
    const geo = new THREE.CylinderGeometry(0.035, 0.04, h, 7);
    b.add(geo, mats.wax, compose(x, h / 2, z));
    geo.dispose();
    addFlame(new THREE.Vector3(x, h + 0.01, z), 0.09, 0xffc070);
  }
  const drip = new THREE.CylinderGeometry(0.2, 0.24, 0.02, 10);
  b.add(drip, mats.wax, compose(base.x, 0.01, base.z));
  drip.dispose();
}

function chain(b: StaticBatch, mats: Mats, base: THREE.Vector3, rng: Rng): void {
  const link = new THREE.TorusGeometry(0.045, 0.012, 4, 8);
  const len = rng.int(7, 13);
  for (let i = 0; i < len; i++) {
    b.add(link, mats.iron, compose(base.x, WALL_H - 0.05 - i * 0.075, base.z, i % 2 ? Math.PI / 2 : 0));
  }
  const cuff = new THREE.TorusGeometry(0.07, 0.022, 4, 10);
  b.add(cuff, mats.iron, compose(base.x, WALL_H - 0.12 - len * 0.075, base.z, 0, Math.PI / 2.5));
  link.dispose();
  cuff.dispose();
}

function brazier(b: StaticBatch, mats: Mats, base: THREE.Vector3, addFlame: (p: THREE.Vector3, size: number, color: number) => void, color: number): void {
  const bowl = new THREE.CylinderGeometry(0.34, 0.2, 0.22, 10, 1, true);
  const rim = new THREE.TorusGeometry(0.34, 0.03, 4, 12);
  const leg = new THREE.CylinderGeometry(0.025, 0.03, 0.9, 5);
  const coal = new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2);
  b.add(bowl, mats.iron, compose(base.x, 1.0, base.z));
  b.add(rim, mats.iron, compose(base.x, 1.11, base.z, 0, Math.PI / 2));
  b.add(coal, mats.coal, compose(base.x, 1.02, base.z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(leg, mats.iron, compose(base.x + Math.cos(a) * 0.18, 0.45, base.z + Math.sin(a) * 0.18, 0, Math.cos(a) * 0.2, Math.sin(a) * 0.2));
  }
  addFlame(new THREE.Vector3(base.x, 1.05, base.z), 0.55, color);
  addFlame(new THREE.Vector3(base.x + 0.1, 1.05, base.z - 0.06), 0.35, 0xffe0a0);
  [bowl, rim, leg, coal].forEach((g) => g.dispose());
}

function banner(theme: FloorTheme, base: THREE.Vector3, dd: { dx: number; dy: number }): { group: THREE.Group; cloth: THREE.Object3D; dispose(): void } {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(theme.key), side: THREE.DoubleSide, roughness: 1, transparent: true, alphaTest: 0.3 });
  const clothGeo = new THREE.PlaneGeometry(0.85, 1.7, 1, 6).translate(0, -0.85, 0);
  const rodGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6).rotateZ(Math.PI / 2);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x6a5020, metalness: 0.6, roughness: 0.4 });
  const cloth = new THREE.Group();
  cloth.add(new THREE.Mesh(clothGeo, mat));
  group.add(new THREE.Mesh(rodGeo, rodMat), cloth);
  group.position.set(base.x + dd.dx * 0.32, WALL_H - 0.5, base.z + dd.dy * 0.32);
  group.rotation.y = Math.atan2(-dd.dx, -dd.dy);
  return { group, cloth, dispose: () => [clothGeo, rodGeo, mat, rodMat].forEach((x) => x.dispose()) };
}

function mushrooms(group: THREE.Group, disposables: { dispose(): void }[], cells: { x: number; y: number; wall: Dir }[], rng: Rng): void {
  const stem = new THREE.CylinderGeometry(0.02, 0.03, 1, 5);
  const cap = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xbfd8c8, roughness: 0.8 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1a4a4a, emissive: 0x3affd0, emissiveIntensity: 1.1, roughness: 0.5 });
  const count = Math.min(cells.length, 40);
  const stems = new THREE.InstancedMesh(stem, stemMat, count * 3);
  const caps = new THREE.InstancedMesh(cap, capMat, count * 3);
  let k = 0;
  for (const c of cells.slice(0, count)) {
    const dd = DIRS[c.wall];
    for (let i = 0; i < 3; i++) {
      const h = rng.range(0.06, 0.22);
      const x = c.x * CELL + dd.dx * 0.82 + rng.range(-0.4, 0.4);
      const z = c.y * CELL + dd.dy * 0.82 + rng.range(-0.4, 0.4);
      stems.setMatrixAt(k, compose(x, h / 2, z, 0, 0, 0, new THREE.Vector3(1, h, 1)));
      const r = h * rng.range(0.4, 0.7);
      caps.setMatrixAt(k, compose(x, h, z, 0, 0, 0, new THREE.Vector3(r, r * 0.6, r)));
      k++;
    }
  }
  group.add(stems, caps);
  disposables.push(stem, cap, stemMat, capMat, stems, caps);
}

function crystals(group: THREE.Group, disposables: { dispose(): void }[], cells: { x: number; y: number; wall: Dir }[], rng: Rng): void {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a2a9a, emissive: 0xb07aff, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, flatShading: true });
  const count = Math.min(cells.length, 26);
  const inst = new THREE.InstancedMesh(geo, mat, count * 4);
  let k = 0;
  for (const c of cells.slice(0, count)) {
    const dd = DIRS[c.wall];
    for (let i = 0; i < 4; i++) {
      const h = rng.range(0.25, 0.75);
      inst.setMatrixAt(k++, compose(c.x * CELL + dd.dx * 0.78 + rng.range(-0.3, 0.3), h * 0.4, c.y * CELL + dd.dy * 0.78 + rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), new THREE.Vector3(h * 0.22, h, h * 0.22)));
    }
  }
  group.add(inst);
  disposables.push(geo, mat, inst);
}
