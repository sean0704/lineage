import * as THREE from 'three';
import type { FloorTheme } from '../data/floors';
import { getMonster } from '../data/monsters';
import { DIRS, idx, TILE, type ChestTier, type DungeonFloor } from '../systems/dungeonGen';
import { buildChest, type ChestModel } from './models/chest';
import { buildDecor, type DecorResult, type FlameSpot } from './decor';
import { Kit } from './models/kit';
import { CELL, MonsterView } from './MonsterView';
import { enhanceMaterial, setRimColor } from './materialFx';
import type { GradeSettings } from './PostFX';
import type { View } from './Renderer';
import { flagstone, flame, glow, roughRock, stoneWall } from './textures';
import { ease, type Tweens } from './Tween';

export const WALL_H = 3;
export const EYE_HEIGHT = 1.45;
const TORCH_LIGHTS = 6;

/** 依主題的漂浮粒子：灰塵、孢子、魔法微光、火星 */
const DUST_LOOK: Record<FloorTheme['key'], { color: number; size: number; opacity: number; rise: number }> = {
  stone: { color: 0xffd8a8, size: 0.03, opacity: 0.45, rise: -0.08 },
  moss: { color: 0x9affc8, size: 0.035, opacity: 0.55, rise: 0.05 },
  arcane: { color: 0xd0a8ff, size: 0.045, opacity: 0.7, rise: 0.12 },
  inferno: { color: 0xff7a2a, size: 0.05, opacity: 0.85, rise: 0.45 },
};
const VIEW_DISTANCE = 11;

interface TorchVisual {
  pos: THREE.Vector3;
  flame: THREE.Sprite;
  halo: THREE.Sprite;
  seed: number;
}

/** 由格子地圖建構的 3D 地監樓層 */
export class DungeonView implements View {
  readonly group = new THREE.Group();
  readonly background: number;
  readonly fogDensity: number;
  readonly grade: Partial<GradeSettings>;
  readonly monsters = new Map<number, MonsterView>();
  readonly chests = new Map<number, ChestModel>();
  private readonly torches: TorchVisual[] = [];
  /** 可分配光源的所有位置：壁掛火把、火盆、蠟燭群 */
  private readonly lightSources: { pos: THREE.Vector3; color: number; strength: number; seed: number }[] = [];
  private flames: FlameSpot[] = [];
  private swaying: DecorResult['swaying'] = [];
  private readonly lightPool: THREE.PointLight[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly decorKit = new Kit();
  private dust!: THREE.Points;
  private dustRise = -0.08;
  private lastLightAssign = -1;

  constructor(private readonly floor: DungeonFloor, private readonly theme: FloorTheme, private readonly camera: THREE.Camera) {
    this.background = theme.fog;
    this.fogDensity = theme.fogDensity;
    this.grade = { shadowTint: theme.shadowTint, highlightTint: theme.highlightTint, bloom: 0.75, vignette: 0.6 };
    setRimColor(theme.shadowTint, 0.38);
    this.buildGeometry();
    this.buildStairs();
    this.buildTorches();
    this.buildDecor();
    this.buildLights();
    this.buildDust();
    for (const m of floor.monsters) if (m.alive) this.addMonster(m.id, m.key, m.x, m.y);
    for (const c of floor.chests) this.addChest(c.id, c.tier, c.x, c.y, c.opened);
  }

  private buildGeometry(): void {
    const d = this.floor;
    const n = d.size;
    const isOpen = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && d.tiles[idx(n, x, y)] !== TILE.wall;

    const wallCells: [number, number][] = [];
    const floorCells: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (isOpen(x, y)) {
          if (d.tiles[idx(n, x, y)] !== TILE.stairsDown) floorCells.push([x, y]);
          continue;
        }
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (isOpen(x + dx, y + dy)) near = true;
        if (near) wallCells.push([x, y]);
      }
    }

    const wallTex = stoneWall();
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    // 側面的 V 座標依高度拉伸，讓磚塊保持正比例
    const uv = wallGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let face = 0; face < 6; face++) {
      if (face === 2 || face === 3) continue;
      for (let v = 0; v < 4; v++) uv.setY(face * 4 + v, uv.getY(face * 4 + v) * (WALL_H / CELL));
    }
    const wallMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: wallTex.map, bumpMap: wallTex.bump, bumpScale: 0.9, color: this.theme.wallTint, roughness: 0.92 }), { rim: false, groundAO: 0.5, mottle: 0.22, mottleScale: 0.9 });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
    const m4 = new THREE.Matrix4();
    wallCells.forEach(([x, y], i) => walls.setMatrixAt(i, m4.makeTranslation(x * CELL, WALL_H / 2, y * CELL)));
    this.group.add(walls);

    const floorTex = flagstone();
    const floorGeo = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
    const floorMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: floorTex.map, bumpMap: floorTex.bump, bumpScale: 0.8, roughnessMap: floorTex.rough, color: this.theme.floorTint, roughness: 1 }), { rim: false, groundAO: 0, mottle: 0.25, mottleScale: 0.7 });
    const floors = new THREE.InstancedMesh(floorGeo, floorMat, floorCells.length);
    floorCells.forEach(([x, y], i) => floors.setMatrixAt(i, m4.makeTranslation(x * CELL, 0, y * CELL)));
    this.group.add(floors);

    const ceilTex = roughRock();
    const ceilGeo = new THREE.PlaneGeometry(CELL, CELL).rotateX(Math.PI / 2);
    const ceilMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: ceilTex.map, bumpMap: ceilTex.bump, bumpScale: 2, color: new THREE.Color(this.theme.wallTint).multiplyScalar(0.6), roughness: 1 }), { rim: false, groundAO: 0, mottle: 0.2, mottleScale: 0.8 });
    const ceilCells = floorCells.filter(([x, y]) => !(x === d.up.x && y === d.up.y));
    if (d.down) ceilCells.push([d.down.x, d.down.y]);
    const ceils = new THREE.InstancedMesh(ceilGeo, ceilMat, ceilCells.length);
    ceilCells.forEach(([x, y], i) => ceils.setMatrixAt(i, m4.makeTranslation(x * CELL, WALL_H, y * CELL)));
    this.group.add(ceils);

    // 牆腳的深色踢腳線，增加立體感
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.theme.wallTint).multiplyScalar(0.35), roughness: 1 });
    const trimGeo = new THREE.BoxGeometry(CELL + 0.02, 0.18, CELL + 0.02);
    const trims = new THREE.InstancedMesh(trimGeo, trimMat, wallCells.length);
    wallCells.forEach(([x, y], i) => trims.setMatrixAt(i, m4.makeTranslation(x * CELL, 0.09, y * CELL).scale(new THREE.Vector3(1.04, 1, 1.04))));
    this.group.add(trims);

    this.disposables.push(wallGeo, wallMat, floorGeo, floorMat, ceilGeo, ceilMat, trimGeo, trimMat, walls, floors, ceils, trims);
  }

  private buildStairs(): void {
    const k = this.decorKit;
    const stone = k.mat(new THREE.Color(this.theme.wallTint).multiplyScalar(0.55).getHex(), { rough: 0.95 });
    const d = this.floor;

    if (d.down) {
      const g = new THREE.Group();
      g.position.set(d.down.x * CELL, 0, d.down.y * CELL);
      // 石砌井口
      for (let i = 0; i < 4; i++) {
        const rim = k.mesh(new THREE.BoxGeometry(CELL, 0.22, 0.18), stone);
        rim.position.y = 0.11;
        const a = (i * Math.PI) / 2;
        rim.position.x = Math.sin(a) * (CELL / 2 - 0.09);
        rim.position.z = Math.cos(a) * (CELL / 2 - 0.09);
        rim.rotation.y = a;
        g.add(rim);
      }
      // 向下延伸的階梯
      for (let s = 0; s < 6; s++) {
        const step = k.mesh(new THREE.BoxGeometry(CELL - 0.4, 0.25, 0.32), stone);
        step.position.set(0, -0.15 - s * 0.32, 0.7 - s * 0.3);
        g.add(step);
      }
      const pit = k.mesh(new THREE.BoxGeometry(CELL - 0.36, 2.4, CELL - 0.36), k.mat(0x000000));
      pit.position.y = -1.3;
      (pit.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
      g.add(pit);
      const rune = k.halo(0x6ab8ff, 2.2, 0.35);
      rune.position.y = 0.2;
      g.add(rune);
      this.group.add(g);
    }

    const up = new THREE.Group();
    up.position.set(d.up.x * CELL, 0, d.up.y * CELL);
    for (let s = 0; s < 8; s++) {
      const step = k.mesh(new THREE.BoxGeometry(CELL - 0.3, (s + 1) * 0.36, 0.25), stone);
      step.position.set(0, ((s + 1) * 0.36) / 2, 0.85 - s * 0.24);
      up.add(step);
    }
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, map: glow(), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = k.mesh(new THREE.CylinderGeometry(0.7, 1.0, WALL_H, 12, 1, true), shaftMat);
    shaft.position.y = WALL_H / 2;
    up.add(shaft);
    const sky = k.halo(0xffe8c0, 2.2, 0.22);
    sky.position.y = WALL_H - 0.1;
    up.add(sky);
    this.group.add(up);
  }

  private buildTorches(): void {
    const k = this.decorKit;
    const iron = k.mat(0x2a2a2e, { metal: 0.8, rough: 0.5 });
    const wood = k.mat(0x3a2414, { rough: 0.9 });
    const flameTex = flame();
    for (const t of this.floor.torches) {
      const dir = DIRS[t.dir];
      const g = new THREE.Group();
      g.position.set(t.x * CELL + dir.dx * (CELL / 2 - 0.08), 1.75, t.y * CELL + dir.dy * (CELL / 2 - 0.08));
      g.rotation.y = Math.atan2(-dir.dx, -dir.dy);
      const plate = k.mesh(new THREE.BoxGeometry(0.12, 0.2, 0.03), iron);
      const arm = k.mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), iron);
      arm.position.set(0, -0.04, 0.1);
      const stick = k.mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.32, 6), wood);
      stick.position.set(0, 0.05, 0.2);
      stick.rotation.x = 0.35;
      const cup = k.mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.08, 6), iron);
      cup.position.set(0, 0.2, 0.25);
      g.add(plate, arm, stick, cup);
      const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: this.theme.torch, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flameSprite.scale.set(0.22, 0.42, 1);
      flameSprite.position.set(0, 0.42, 0.26);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: this.theme.torch, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.4);
      halo.position.copy(flameSprite.position);
      g.add(flameSprite, halo);
      this.group.add(g);
      this.disposables.push(flameSprite.material, halo.material);
      const world = new THREE.Vector3();
      g.updateMatrixWorld(true);
      flameSprite.getWorldPosition(world);
      const seed = Math.random() * 10;
      this.torches.push({ pos: world, flame: flameSprite, halo, seed });
      this.lightSources.push({ pos: world, color: this.theme.torch, strength: 1, seed });
    }
  }

  private buildDecor(): void {
    const decor = buildDecor(this.floor, this.theme);
    this.group.add(decor.group);
    this.disposables.push(...decor.disposables);
    this.flames = decor.flames;
    this.swaying = decor.swaying;
    for (const spot of decor.lightSpots) this.lightSources.push({ pos: spot.pos, color: spot.color, strength: spot.strength, seed: Math.random() * 10 });
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(this.theme.ambient, 0x0c0906, 2.2);
    this.group.add(hemi);
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight(this.theme.torch, 0, 9, 1.6);
      this.group.add(l);
      this.lightPool.push(l);
    }
  }

  private buildDust(): void {
    const count = 140;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.random() * WALL_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const look = DUST_LOOK[this.theme.key];
    this.dustRise = look.rise;
    const mat = new THREE.PointsMaterial({ color: look.color, size: look.size, map: glow(), transparent: true, opacity: look.opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(geo, mat);
    this.group.add(this.dust);
    this.disposables.push(geo, mat);
  }

  addMonster(id: number, key: string, x: number, y: number): MonsterView {
    const view = new MonsterView(getMonster(key).model, x, y);
    this.group.add(view.root);
    this.monsters.set(id, view);
    return view;
  }

  removeMonster(id: number): void {
    const view = this.monsters.get(id);
    if (!view) return;
    // 保留光源（亮度歸零）：場景光源數量改變會觸發所有材質重新編譯而卡頓
    const light = view.rig.light;
    if (light) {
      light.intensity = 0;
      const world = new THREE.Vector3();
      light.getWorldPosition(world);
      this.group.add(light);
      light.position.copy(world);
    }
    view.dispose();
    this.monsters.delete(id);
  }

  private addChest(id: number, tier: ChestTier, x: number, y: number, opened: boolean): void {
    const model = buildChest(tier);
    model.root.position.set(x * CELL, 0, y * CELL);
    // 背靠最近的牆
    const wall = DIRS.findIndex((dd) => this.floor.tiles[idx(this.floor.size, x + dd.dx, y + dd.dy)] === TILE.wall);
    if (wall >= 0) {
      const dd = DIRS[wall];
      model.root.rotation.y = Math.atan2(-dd.dx, -dd.dy);
      model.root.position.x += dd.dx * 0.35;
      model.root.position.z += dd.dy * 0.35;
    }
    if (opened) model.lid.rotation.x = -1.9;
    this.group.add(model.root);
    this.chests.set(id, model);
  }

  async openChest(id: number, tweens: Tweens): Promise<THREE.Vector3> {
    const model = this.chests.get(id);
    if (!model) return new THREE.Vector3();
    await tweens.to(450, (k) => (model.lid.rotation.x = -1.9 * k), { easing: ease.outBack });
    if (model.glow) model.glow.material.opacity = 0.05;
    return model.root.position.clone().add(new THREE.Vector3(0, 0.6, 0));
  }

  /** 把光源池分配給離攝影機最近的光源（火把、火盆、蠟燭） */
  private assignLights(camPos: THREE.Vector3): void {
    const sorted = [...this.lightSources].sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    this.lightPool.forEach((l, i) => {
      const t = sorted[i];
      if (t) {
        l.position.copy(t.pos);
        l.color.setHex(t.color);
        l.userData.src = t;
      } else {
        l.intensity = 0;
        l.userData.src = null;
      }
    });
  }

  update(dt: number, time: number): void {
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);

    // 每 0.25 秒或移動時重新分配火把光源
    if (time - this.lastLightAssign > 0.25) {
      this.lastLightAssign = time;
      this.assignLights(camPos);
    }
    for (const l of this.lightPool) {
      const t = l.userData.src as { strength: number; seed: number } | null;
      if (!t) continue;
      // 柔和的正弦呼吸，避免高頻閃爍造成視覺疲勞
      const flicker = Math.sin(time * 2.3 + t.seed) * 0.6 + Math.sin(time * 3.7 + t.seed * 2) * 0.35;
      l.intensity = (11 + flicker) * t.strength;
    }
    for (const f of this.flames) {
      const k = 1 + Math.sin(time * 7 + f.seed) * 0.08 + Math.sin(time * 11.3 + f.seed) * 0.05;
      f.sprite.scale.set(f.base.x * (2 - k), f.base.y * k, 1);
      f.halo.material.opacity = 0.26 + (k - 1) * 0.8;
    }
    for (const s of this.swaying) s.obj.rotation.x = Math.sin(time * 0.9 + s.seed) * 0.04;
    for (const t of this.torches) {
      const f = Math.sin(time * 6 + t.seed) * 0.05 + Math.sin(time * 9.3 + t.seed) * 0.03;
      t.flame.scale.set(0.22 + f, 0.42 + f * 2, 1);
      t.halo.material.opacity = 0.32 + f;
    }

    for (const view of this.monsters.values()) {
      const dist = view.root.position.distanceTo(camPos);
      view.root.visible = dist < VIEW_DISTANCE * CELL * 0.6;
      if (view.root.visible) view.update(dt, time, camPos);
    }

    // 灰塵跟著玩家飄浮
    this.dust.position.set(camPos.x, 0, camPos.z);
    const arr = (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += dt * this.dustRise;
      arr[i] += Math.sin(time + i) * dt * 0.05;
      if (arr[i + 1] < 0) arr[i + 1] = WALL_H;
      if (arr[i + 1] > WALL_H) arr[i + 1] = 0;
    }
    (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    for (const m of this.monsters.values()) m.dispose();
    this.monsters.clear();
    for (const c of this.chests.values()) c.kit.dispose();
    this.chests.clear();
    this.decorKit.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

export function cellToWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL, EYE_HEIGHT, y * CELL);
}
