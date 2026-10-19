import * as THREE from 'three';
import type { Effects } from './effects';
import { enhanceMaterial, setRimColor } from './materialFx';
import { Kit, v3 } from './models/kit';
import { MonsterView } from './MonsterView';
import type { GradeSettings } from './PostFX';
import type { View } from './Renderer';
import { flagstone, flame, glow, grass } from './textures';

/** 奇岩村：月夜下的營火廣場，遠方是古魯丁地監的石門 */
export class VillageView implements View {
  readonly group = new THREE.Group();
  readonly background = 0x0e1526;
  readonly fogDensity = 0.03;
  readonly environment = 0.08;
  readonly grade: Partial<GradeSettings> = { shadowTint: 0x7a92d0, highlightTint: 0xffd8b0, bloom: 0.6, vignette: 0.5, saturation: 1.05 };
  private readonly kit = new Kit();
  private readonly fireLight: THREE.PointLight;
  private readonly flames: { sprite: THREE.Sprite; base: number; seed: number; scale: number }[] = [];
  private readonly glows: { sprite: THREE.Sprite; base: number; seed: number }[] = [];
  private readonly npcs: MonsterView[] = [];
  private fireflies!: THREE.Points;
  private emberTimer = 0;
  private readonly disposables: { dispose(): void }[] = [];

  /** 攝影機在村莊中的固定機位 */
  static readonly CAMERA_POS = new THREE.Vector3(0, 1.6, 5.6);
  static readonly CAMERA_TARGET = new THREE.Vector3(0, 1.15, 0);

  constructor(private readonly effects: Effects) {
    setRimColor(0x6a86d8, 0.35);
    this.buildGround();
    this.buildCampfire();
    this.fireLight = new THREE.PointLight(0xff9a50, 16, 18, 1.7);
    this.fireLight.position.set(0, 1.0, 0);
    this.group.add(this.fireLight);

    this.house(-5.4, -4.0, 0.55, 0x7a6a58, 0x6a2a1a, 1);
    this.house(5.6, -4.6, -0.6, 0x6a6058, 0x3a3a52, 1);
    this.house(-9.6, 1.2, 1.35, 0x6a6050, 0x3a3a52, 0.9);
    this.house(9.8, 0.4, -1.3, 0x6a5a48, 0x6a2a1a, 0.9);
    this.stall(3.3, -1.3, -0.7);
    this.dungeonGate(0, -11.5);
    this.well(-3.2, -1.4);
    for (const [x, z] of [[-3.9, 1.2], [4.1, 1.0], [-4.6, -2.4], [4.8, -3.0]] as const) this.lamppost(x, z);
    const trees: [number, number, number][] = [[-7.5, -7.5, 1.2], [8, -8.5, 1.4], [-11.5, -3.5, 1], [12, -4.5, 1.3], [-4.5, -14, 1.5], [5.5, -14, 1.2], [-13, -10, 1.4], [14, -11, 1.1], [-8, -13, 1.3], [9, -13, 1.5], [-15, -5, 1.2], [16, -7, 1.3]];
    for (const [x, z, s] of trees) this.tree(x, z, s);
    this.fence();
    this.npc('merchant', 3.5, -2.1);
    this.npc('guard', 1.7, -9.4);
    this.npc('elder', -2.4, -0.4);
    this.sky();

    this.group.add(new THREE.HemisphereLight(0x5068a8, 0x141810, 1.9));
    const moonLight = new THREE.DirectionalLight(0x9ab0e8, 1.1);
    moonLight.position.set(-10, 20, -6);
    this.group.add(moonLight);
  }

  private std(color: number, rough = 0.9, opts: { metal?: number; mottle?: number } = {}): THREE.MeshStandardMaterial {
    const m = enhanceMaterial(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: opts.metal ?? 0, flatShading: true }), { rim: true, groundAO: 0.35, mottle: opts.mottle ?? 0.16 });
    this.disposables.push(m);
    return m;
  }

  private addGlow(pos: THREE.Vector3, color: number, size: number, opacity: number): void {
    const s = this.kit.halo(color, size, opacity);
    s.position.copy(pos);
    this.group.add(s);
    this.glows.push({ sprite: s, base: opacity, seed: Math.random() * 10 });
  }

  private addFlame(parent: THREE.Object3D, pos: THREE.Vector3, scale: number, color = 0xff8a30): void {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.copy(pos);
    parent.add(sprite);
    this.disposables.push(sprite.material);
    this.flames.push({ sprite, base: pos.y, seed: Math.random() * 10, scale });
  }

  private buildGround(): void {
    const grassTex = grass();
    grassTex.repeat.set(16, 16);
    const groundMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: grassTex, color: 0x8aa080, roughness: 1 }), { rim: false, groundAO: 0, mottle: 0.3, mottleScale: 0.25 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), groundMat);
    this.group.add(ground);
    this.disposables.push(groundMat, ground.geometry);

    // 石板廣場與通往地監的石板路
    const stones = flagstone();
    const plazaMap = stones.map.clone();
    plazaMap.repeat.set(3, 3);
    plazaMap.needsUpdate = true;
    const roughMap = stones.rough!.clone();
    roughMap.repeat.set(3, 3);
    roughMap.needsUpdate = true;
    const plazaMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: plazaMap, roughnessMap: roughMap, bumpMap: stones.bump, bumpScale: 0.6, color: 0x9a948a, roughness: 1 }), { rim: false, groundAO: 0, mottle: 0.2, mottleScale: 0.8 });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40).rotateX(-Math.PI / 2), plazaMat);
    plaza.position.y = 0.012;
    const pathMap = stones.map.clone();
    pathMap.repeat.set(1, 4);
    pathMap.needsUpdate = true;
    const pathMat = enhanceMaterial(new THREE.MeshStandardMaterial({ map: pathMap, color: 0x8a847a, roughness: 1 }), { rim: false, groundAO: 0, mottle: 0.25, mottleScale: 0.8 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 8).rotateX(-Math.PI / 2), pathMat);
    path.position.set(0, 0.01, -7.2);
    this.group.add(plaza, path);
    this.disposables.push(plazaMap, roughMap, pathMap, plazaMat, pathMat, plaza.geometry, path.geometry);

    const curb = this.std(0x5a564e, 1);
    const curbGeo = new THREE.TorusGeometry(3.65, 0.12, 4, 48);
    const ring = this.kit.mesh(curbGeo, curb);
    ring.rotation.x = Math.PI / 2;
    ring.scale.z = 0.6;
    ring.position.y = 0.05;
    this.group.add(ring);
  }

  private buildCampfire(): void {
    const k = this.kit;
    const fire = new THREE.Group();
    const stoneMat = this.std(0x5a544c, 1);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const stone = k.mesh(new THREE.DodecahedronGeometry(0.15, 0), stoneMat);
      stone.position.set(Math.cos(a) * 0.58, 0.08, Math.sin(a) * 0.58);
      stone.rotation.set(a, a * 2, 0);
      fire.add(stone);
    }
    const logMat = this.std(0x3a2414);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      fire.add(k.limb(v3(Math.cos(a) * 0.5, 0.04, Math.sin(a) * 0.5), v3(Math.cos(a) * 0.05, 0.42, Math.sin(a) * 0.05), 0.06, 0.045, logMat));
    }
    const coals = k.mesh(new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), k.glowMat(0xff4a10, 2.4));
    coals.position.y = 0.05;
    fire.add(coals);
    for (let i = 0; i < 6; i++) {
      this.addFlame(fire, new THREE.Vector3((Math.random() - 0.5) * 0.32, 0.5, (Math.random() - 0.5) * 0.32), 0.6 + Math.random() * 0.35, i < 2 ? 0xffe2a8 : 0xff8a30);
    }
    const halo = k.halo(0xff9a40, 3.6, 0.28);
    halo.position.y = 0.75;
    fire.add(halo);
    // 營火旁的木頭長凳
    const benchMat = this.std(0x5a3a22);
    for (const [x, z, r] of [[-1.7, 0.9, 0.5], [1.8, 0.7, -0.45], [0, -1.8, 0]] as const) {
      const bench = k.mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 7), benchMat);
      bench.rotation.set(0, r, Math.PI / 2);
      bench.position.set(x, 0.18, z);
      fire.add(bench);
    }
    this.group.add(fire);
  }

  private house(x: number, z: number, rot: number, wall: number, roof: number, s: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.scale.setScalar(s);
    const plaster = this.std(wall, 1);
    const timber = this.std(0x2e1c10);
    const roofMat = this.std(roof, 1, { mottle: 0.3 });
    const stone = this.std(0x4e4a44, 1);

    const base = k.mesh(new THREE.BoxGeometry(3.1, 0.5, 2.7), stone);
    base.position.y = 0.25;
    const body = k.mesh(new THREE.BoxGeometry(3, 2.0, 2.6), plaster);
    body.position.y = 1.5;
    g.add(base, body);
    // 半木構架：立柱、橫樑、交叉斜撐
    const front = 1.31;
    for (const bx of [-1.48, -0.5, 0.5, 1.48]) {
      const post = k.mesh(new THREE.BoxGeometry(0.12, 2.0, 0.08), timber);
      post.position.set(bx, 1.5, front);
      g.add(post);
    }
    for (const by of [0.55, 1.55, 2.48]) {
      const beam = k.mesh(new THREE.BoxGeometry(3.05, 0.12, 0.08), timber);
      beam.position.set(0, by, front);
      g.add(beam);
    }
    for (const [bx, dir] of [[1.0, 1], [-1.0, -1]] as const) {
      const brace = k.mesh(new THREE.BoxGeometry(0.1, 1.15, 0.06), timber);
      brace.position.set(bx, 2.0, front + 0.01);
      brace.rotation.z = dir * 0.85;
      g.add(brace);
    }
    // 雙斜屋頂
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.8, 0);
    roofShape.lineTo(0, 1.5);
    roofShape.lineTo(1.8, 0);
    roofShape.lineTo(-1.8, 0);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 3.1, bevelEnabled: false });
    roofGeo.translate(0, 0, -1.55);
    const roofMesh = k.mesh(roofGeo, roofMat);
    roofMesh.position.y = 2.5;
    roofMesh.rotation.y = Math.PI / 2;
    roofMesh.scale.set(0.92, 1, 1);
    g.add(roofMesh);
    const ridge = k.mesh(new THREE.BoxGeometry(0.14, 0.14, 3.3), timber);
    ridge.position.set(0, 4.0, 0);
    g.add(ridge);
    // 門、窗與吊燈
    const door = k.mesh(new THREE.BoxGeometry(0.75, 1.35, 0.06), this.std(0x3a2414));
    door.position.set(-0.98, 1.17, front + 0.02);
    g.add(door);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffa848, emissiveIntensity: 2.2 });
    this.disposables.push(winMat);
    for (const wx of [0.25, 1.0]) {
      const win = k.mesh(new THREE.PlaneGeometry(0.5, 0.55), winMat);
      win.position.set(wx, 1.65, front + 0.05);
      g.add(win);
      const mullion = k.mesh(new THREE.BoxGeometry(0.05, 0.6, 0.04), timber);
      mullion.position.set(wx, 1.65, front + 0.07);
      g.add(mullion);
    }
    const chimney = k.mesh(new THREE.BoxGeometry(0.42, 1.5, 0.42), stone);
    chimney.position.set(0.95, 3.6, -0.5);
    g.add(chimney);
    this.group.add(g);
    g.updateMatrixWorld(true);
    for (const wx of [0.25, 1.0]) this.addGlow(new THREE.Vector3(wx, 1.65, front + 0.3).applyMatrix4(g.matrixWorld), 0xffb060, 1.6 * s, 0.35);
    // 門口吊燈
    const lampPos = new THREE.Vector3(-0.35, 2.15, front + 0.25).applyMatrix4(g.matrixWorld);
    const lamp = k.mesh(new THREE.OctahedronGeometry(0.09, 0), k.glowMat(0xffc070, 3));
    lamp.position.copy(lampPos);
    this.group.add(lamp);
    this.addGlow(lampPos, 0xffb060, 1.4, 0.5);
  }

  private stall(x: number, z: number, rot: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const wood = this.std(0x6a4a2a);
    const dark = this.std(0x4a3020);
    const table = k.mesh(new THREE.BoxGeometry(1.9, 0.12, 0.85), wood);
    table.position.y = 0.92;
    const front = k.mesh(new THREE.BoxGeometry(1.9, 0.8, 0.06), dark);
    front.position.set(0, 0.5, 0.42);
    g.add(table, front);
    for (const [px, pz] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]] as const) {
      g.add(k.limb(v3(px, 0, pz), v3(px, 2.05, pz), 0.045, 0.045, dark));
    }
    // 條紋遮雨棚
    for (let i = 0; i < 6; i++) {
      const stripeMat = this.std(i % 2 ? 0xe8dcc0 : 0x9a2a2a, 1, { mottle: 0.1 });
      stripeMat.side = THREE.DoubleSide;
      const stripe = k.mesh(new THREE.PlaneGeometry(0.35, 1.15), stripeMat);
      stripe.position.set(-0.875 + i * 0.35, 2.06, 0.12);
      stripe.rotation.x = -Math.PI / 2 + 0.32;
      g.add(stripe);
    }
    const potionColors = [0xe53e3e, 0x3b82f6, 0x38a169, 0xed8936, 0x9f7aea, 0xe53e3e, 0x3b82f6];
    potionColors.forEach((c, i) => {
      const bottle = k.mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.16, 7), k.mat(c, { emissive: c, emissiveIntensity: 0.9, rough: 0.15 }));
      bottle.position.set(-0.75 + i * 0.25, 1.06, 0.12 + (i % 2) * 0.12);
      g.add(bottle);
    });
    const crate = k.mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), wood);
    crate.position.set(1.25, 0.25, 0.3);
    crate.rotation.y = 0.4;
    g.add(crate);
    this.group.add(g);
    g.updateMatrixWorld(true);
    const lampPos = new THREE.Vector3(0.85, 1.85, 0.42).applyMatrix4(g.matrixWorld);
    const lamp = k.mesh(new THREE.OctahedronGeometry(0.1, 0), k.glowMat(0xffc070, 3));
    lamp.position.copy(lampPos);
    this.group.add(lamp);
    this.addGlow(lampPos, 0xffc070, 1.2, 0.6);
    const l = new THREE.PointLight(0xffb060, 5, 6, 2);
    l.position.copy(lampPos);
    this.group.add(l);
  }

  /** 遠方的地監石門：岩丘、拱門、兩側火盆 */
  private dungeonGate(x: number, z: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const rock = this.std(0x4a4640, 1, { mottle: 0.3 });
    const rockDark = this.std(0x343230, 1, { mottle: 0.3 });
    const rocks: [number, number, number, number][] = [[-3.4, 1.5, 0, 2.4], [3.4, 1.4, 0.2, 2.3], [-1.8, 3.2, -0.6, 2.0], [1.8, 3.1, -0.4, 2.1], [0, 4.2, -1.2, 2.4], [-5.4, 0.9, 0.6, 1.8], [5.6, 0.8, 0.8, 1.7]];
    rocks.forEach(([rx, ry, rz, r], i) => {
      const m = k.mesh(new THREE.DodecahedronGeometry(r, 0), i % 2 ? rock : rockDark);
      m.position.set(rx, ry, rz - 1);
      m.rotation.set(i, i * 2, i * 0.5);
      g.add(m);
    });
    const stone = this.std(0x6a6458, 1);
    for (const side of [-1, 1]) {
      const pillar = k.mesh(new THREE.BoxGeometry(0.6, 3.0, 0.7), stone);
      pillar.position.set(side * 1.3, 1.5, 0.3);
      g.add(pillar);
    }
    const arch = k.mesh(new THREE.TorusGeometry(1.3, 0.3, 6, 14, Math.PI), stone);
    arch.position.set(0, 3.0, 0.3);
    g.add(arch);
    const key = k.mesh(new THREE.BoxGeometry(0.5, 0.6, 0.8), this.std(0x7a7466, 1));
    key.position.set(0, 4.3, 0.3);
    g.add(key);
    const dark = k.mesh(new THREE.PlaneGeometry(2.0, 4.2), new THREE.MeshBasicMaterial({ color: 0x020203 }));
    dark.position.set(0, 2.0, 0.0);
    g.add(dark);
    // 門內深處的微光
    const glowIn = k.halo(0x6a3aff, 2.4, 0.25);
    glowIn.position.set(0, 1.4, -0.2);
    g.add(glowIn);
    this.group.add(g);
    for (const side of [-1, 1]) {
      const bx = x + side * 2.3;
      const bz = z + 1.4;
      const bowl = k.mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.28, 10), this.std(0x2a2a30, 0.5, { metal: 0.6 }));
      bowl.position.set(bx, 1.2, bz);
      const leg = k.limb(v3(bx, 0, bz), v3(bx, 1.1, bz), 0.06, 0.08, this.std(0x2a2a30, 0.5, { metal: 0.6 }));
      this.group.add(bowl, leg);
      for (let i = 0; i < 3; i++) this.addFlame(this.group, new THREE.Vector3(bx + (Math.random() - 0.5) * 0.2, 1.6, bz + (Math.random() - 0.5) * 0.2), 0.55 + Math.random() * 0.2);
      this.addGlow(new THREE.Vector3(bx, 1.7, bz), 0xff8a30, 2.8, 0.35);
      const l = new THREE.PointLight(0xff8a40, 8, 9, 1.8);
      l.position.set(bx, 1.9, bz + 0.4);
      this.group.add(l);
    }
  }

  private well(x: number, z: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stone = this.std(0x5e5a52, 1);
    const ring = k.mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.7, 12, 1, true), stone);
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ring.position.y = 0.35;
    const lip = k.mesh(new THREE.TorusGeometry(0.64, 0.08, 5, 14), stone);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.7;
    const water = k.mesh(new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.05, metalness: 0.2 }));
    water.position.y = 0.45;
    g.add(ring, lip, water);
    const wood = this.std(0x4a3020);
    for (const side of [-1, 1]) g.add(k.limb(v3(side * 0.6, 0.6, 0), v3(side * 0.6, 1.7, 0), 0.05, 0.05, wood));
    const roofMat = this.std(0x5a2a1a, 1);
    for (const side of [-1, 1]) {
      const plank = k.mesh(new THREE.BoxGeometry(1.5, 0.05, 0.6), roofMat);
      plank.position.set(0, 1.85, side * 0.22);
      plank.rotation.x = side * 0.6;
      g.add(plank);
    }
    const bucket = k.mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.18, 8), wood);
    bucket.position.set(0, 1.2, 0);
    g.add(bucket, k.limb(v3(0, 1.3, 0), v3(0, 1.7, 0), 0.006, 0.006, this.std(0xc8b890)));
    this.group.add(g);
  }

  private lamppost(x: number, z: number): void {
    const k = this.kit;
    const iron = this.std(0x2a2a30, 0.5, { metal: 0.6 });
    this.group.add(k.limb(v3(x, 0, z), v3(x, 2.4, z), 0.05, 0.04, iron));
    const arm = k.limb(v3(x, 2.35, z), v3(x + 0.35, 2.35, z), 0.025, 0.025, iron);
    this.group.add(arm);
    const lamp = k.mesh(new THREE.OctahedronGeometry(0.11, 0), k.glowMat(0xffc070, 3));
    lamp.position.set(x + 0.35, 2.15, z);
    this.group.add(lamp);
    this.addGlow(lamp.position, 0xffb060, 1.6, 0.55);
  }

  private tree(x: number, z: number, s: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = x * z;
    g.add(k.limb(v3(0, 0, 0), v3(0, 1.4, 0), 0.17, 0.1, this.std(0x3a2a1a)));
    const leaf = this.std(0x1e3a26, 1, { mottle: 0.3 });
    for (let i = 0; i < 4; i++) {
      const cone = k.mesh(new THREE.ConeGeometry(1.3 - i * 0.28, 1.3, 8), leaf);
      cone.position.y = 1.4 + i * 0.7;
      cone.rotation.y = i;
      g.add(cone);
    }
    this.group.add(g);
  }

  private fence(): void {
    const k = this.kit;
    const wood = this.std(0x4a3424);
    for (let i = -9; i <= 9; i++) {
      if (Math.abs(i) < 2) continue;
      const px = i * 0.95;
      const pz = 3.6 + Math.abs(i) * 0.14;
      const post = k.mesh(new THREE.BoxGeometry(0.09, 0.75, 0.09), wood);
      post.position.set(px, 0.37, pz);
      this.group.add(post);
      if (Math.abs(i) < 9) {
        const nx = (i + Math.sign(i)) * 0.95;
        const nz = 3.6 + (Math.abs(i) + 1) * 0.14;
        this.group.add(k.limb(v3(px, 0.55, pz), v3(nx, 0.55, nz), 0.03, 0.03, wood));
      }
    }
  }

  private npc(kind: 'merchant' | 'guard' | 'elder', x: number, z: number): void {
    const spec = {
      merchant: { kind: 'humanoid' as const, skin: 0xd8a888, cloth: 0x6a3a5a, head: 'human' as const, weapon: 'none' as const, scale: 1, bulk: 1.15, eye: 0x1a1410 },
      guard: { kind: 'humanoid' as const, skin: 0xd0a080, cloth: 0x2a3a6a, metal: 0xa0a8b8, head: 'helm' as const, weapon: 'spear' as const, shield: true, scale: 1.05, bulk: 1.05, eye: 0x88aaff },
      elder: { kind: 'humanoid' as const, skin: 0xd8b098, cloth: 0x3a4a3a, head: 'human' as const, weapon: 'staff' as const, scale: 0.95, bulk: 0.95, eye: 0x1a1410, hunch: 0.2 },
    }[kind];
    const view = new MonsterView(spec, 0, 0);
    view.root.position.set(x, 0, z);
    this.group.add(view.root);
    this.npcs.push(view);
  }

  private sky(): void {
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const r = 70;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) + 2;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 10;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.28, map: glow(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.group.add(new THREE.Points(starGeo, starMat));
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xe8eeff, fog: false, transparent: true, depthWrite: false }));
    moon.scale.setScalar(10);
    moon.position.set(-20, 24, -45);
    this.group.add(moon);
    // 遠山剪影
    const mountainMat = new THREE.MeshBasicMaterial({ color: 0x141c30, fog: false });
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i / 13 - 0.5) * Math.PI * 1.3;
      const r = 48 + Math.random() * 6;
      const m = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 8, 8 + Math.random() * 10, 5), mountainMat);
      m.position.set(Math.sin(a) * r, 2, Math.cos(a) * r);
      this.group.add(m);
      this.disposables.push(m.geometry);
    }
    // 螢火蟲
    const count = 40;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = 0.4 + Math.random() * 2;
      pos[i * 3 + 2] = -Math.random() * 12;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ffMat = new THREE.PointsMaterial({ color: 0xd8ff8a, size: 0.07, map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fireflies = new THREE.Points(ffGeo, ffMat);
    this.group.add(this.fireflies);
    this.disposables.push(starGeo, starMat, moon.material, mountainMat, ffGeo, ffMat);
  }

  update(dt: number, time: number): void {
    const flicker = Math.sin(time * 2.1) * 2.2 + Math.sin(time * 3.3 + 1) * 1.4;
    this.fireLight.intensity = 16 + flicker * 0.6;
    for (const f of this.flames) {
      const s = f.scale * (1 + Math.sin(time * 7 + f.seed) * 0.1);
      f.sprite.scale.set(s * 0.55, s * 1.1, 1);
      f.sprite.position.y = f.base + Math.sin(time * 5 + f.seed) * 0.03;
    }
    for (const g of this.glows) g.sprite.material.opacity = g.base * (0.9 + Math.sin(time * 1.7 + g.seed) * 0.1);
    const camPos = VillageView.CAMERA_POS;
    for (const n of this.npcs) n.update(dt, time, camPos);
    const arr = (this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(time * 0.7 + i) * dt * 0.25;
      arr[i + 1] += Math.cos(time * 0.9 + i * 1.3) * dt * 0.15;
      arr[i + 2] += Math.sin(time * 0.5 + i * 0.7) * dt * 0.2;
    }
    (this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.fireflies.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(time * 2) * 0.3;
    this.emberTimer += dt;
    if (this.emberTimer > 0.16) {
      this.emberTimer = 0;
      this.effects.burst(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7, (Math.random() - 0.5) * 0.4), {
        color: 0xff9a40, count: 2, speed: 0.25, lift: 1.1, gravity: 0.15, life: 2.2, size: 0.045, drag: 0.4,
      });
    }
  }

  dispose(): void {
    for (const n of this.npcs) n.dispose();
    this.kit.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
