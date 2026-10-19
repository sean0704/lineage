import * as THREE from 'three';
import type { Effects } from './effects';
import { Kit, v3 } from './models/kit';
import type { View } from './Renderer';
import { flame, glow, grass } from './textures';

/** 奇岩村：夜晚的營火廣場 */
export class VillageView implements View {
  readonly group = new THREE.Group();
  readonly background = 0x0c1220;
  readonly fogDensity = 0.035;
  private readonly kit = new Kit();
  private readonly fireLight: THREE.PointLight;
  private readonly flames: THREE.Sprite[] = [];
  private readonly windows: THREE.MeshStandardMaterial[] = [];
  private emberTimer = 0;
  private readonly disposables: { dispose(): void }[] = [];

  /** 攝影機在村莊中的固定機位 */
  static readonly CAMERA_POS = new THREE.Vector3(0, 1.55, 5.4);
  static readonly CAMERA_TARGET = new THREE.Vector3(0, 1.0, 0);

  constructor(private readonly effects: Effects) {
    const k = this.kit;

    // 地面
    const grassTex = grass();
    grassTex.repeat.set(14, 14);
    const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x8aa080, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), groundMat);
    this.group.add(ground);
    this.disposables.push(groundMat, ground.geometry);
    // 石板廣場
    const plaza = k.mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), k.mat(0x4a4640, { rough: 1 }));
    plaza.position.y = 0.01;
    this.group.add(plaza);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const s = k.mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), k.mat(0x5a5650, { rough: 1 }));
      s.position.set(Math.cos(a) * 3.2, 0.03, Math.sin(a) * 3.2);
      s.rotation.y = -a;
      this.group.add(s);
    }

    // 營火
    const fire = new THREE.Group();
    fire.position.set(0, 0, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const stone = k.mesh(new THREE.DodecahedronGeometry(0.14, 0), k.mat(0x504a44, { rough: 1 }));
      stone.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
      fire.add(stone);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      fire.add(k.limb(v3(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45), v3(-Math.cos(a) * 0.45, 0.05, -Math.sin(a) * 0.45), 0.06, 0.06, k.mat(0x3a2414)));
    }
    const coals = k.mesh(new THREE.CircleGeometry(0.4, 12).rotateX(-Math.PI / 2), k.glowMat(0xff4a10, 1.5));
    coals.position.y = 0.06;
    fire.add(coals);
    const flameTex = flame();
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: i < 2 ? 0xffe0a0 : 0xff8a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      f.position.set((Math.random() - 0.5) * 0.3, 0.45, (Math.random() - 0.5) * 0.3);
      f.userData.seed = Math.random() * 10;
      f.userData.base = 0.6 + Math.random() * 0.3;
      fire.add(f);
      this.flames.push(f);
      this.disposables.push(f.material);
    }
    const halo = k.halo(0xff9a40, 3.5, 0.3);
    halo.position.y = 0.7;
    fire.add(halo);
    this.fireLight = new THREE.PointLight(0xff9a50, 30, 18, 1.6);
    this.fireLight.position.set(0, 1.0, 0);
    fire.add(this.fireLight);
    this.group.add(fire);

    // 房舍
    this.house(-5.2, -4.2, 0.5, 0x6a5a48, 0x5a2a1a);
    this.house(5.5, -5.0, -0.6, 0x5a5048, 0x3a3a4a);
    this.house(-1.2, -9.0, 0.1, 0x6a6050, 0x4a2a1a, 1.3);
    this.house(9.5, 0.5, -1.3, 0x5a4a3a, 0x5a2a1a, 0.9);
    this.house(-9.5, 1.5, 1.4, 0x605848, 0x3a3a4a, 0.9);

    // 商店攤位
    this.stall(3.4, -1.4, -0.7);
    // 告示牌
    const sign = new THREE.Group();
    sign.position.set(-2.9, 0, -1.6);
    sign.rotation.y = 0.6;
    sign.add(k.limb(v3(0, 0, 0), v3(0, 1.3, 0), 0.05, 0.05, k.mat(0x4a3020)));
    const board = k.mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), k.mat(0x6a4a30));
    board.position.y = 1.2;
    sign.add(board);
    this.group.add(sign);

    // 樹
    const treeSpots: [number, number, number][] = [[-7, -7, 1.2], [8, -8, 1.4], [-11, -3, 1], [12, -4, 1.3], [-4, -13, 1.5], [5, -13, 1.2], [-13, -10, 1.4], [14, -11, 1.1], [0, -15, 1.6]];
    for (const [x, z, s] of treeSpots) this.tree(x, z, s);
    // 栅欄
    for (let i = -8; i <= 8; i++) {
      if (Math.abs(i) < 2) continue;
      const post = k.mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), k.mat(0x4a3424));
      post.position.set(i * 0.9, 0.35, 3.2 + Math.abs(i) * 0.12);
      this.group.add(post);
    }

    // 星空與月亮
    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const r = 60;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) + 2;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 10;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.25, map: glow(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.group.add(new THREE.Points(starGeo, starMat));
    this.disposables.push(starGeo, starMat);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xdfe6ff, fog: false, transparent: true, depthWrite: false }));
    moon.scale.setScalar(9);
    moon.position.set(-18, 22, -40);
    this.group.add(moon);
    this.disposables.push(moon.material);

    this.group.add(new THREE.HemisphereLight(0x3a4a7a, 0x10140c, 1.4));
    const moonLight = new THREE.DirectionalLight(0x8aa0d8, 0.6);
    moonLight.position.set(-10, 20, -10);
    this.group.add(moonLight);
  }

  private house(x: number, z: number, rot: number, wall: number, roof: number, s = 1): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.scale.setScalar(s);
    const body = k.mesh(new THREE.BoxGeometry(3, 2.2, 2.6), k.mat(wall, { rough: 1 }));
    body.position.y = 1.1;
    g.add(body);
    // 木樑
    for (const bx of [-1.45, 1.45]) {
      const beam = k.mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), k.mat(0x3a2414));
      beam.position.set(bx, 1.1, 1.32);
      g.add(beam);
    }
    const roofMesh = k.mesh(new THREE.ConeGeometry(2.5, 1.6, 4), k.mat(roof, { rough: 1 }));
    roofMesh.position.y = 3.0;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.scale.set(1.05, 1, 0.95);
    g.add(roofMesh);
    const door = k.mesh(new THREE.BoxGeometry(0.7, 1.3, 0.05), k.mat(0x3a2414));
    door.position.set(-0.6, 0.65, 1.31);
    g.add(door);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb050, emissiveIntensity: 1.6 });
    this.windows.push(winMat);
    this.disposables.push(winMat);
    const win = k.mesh(new THREE.PlaneGeometry(0.6, 0.5), winMat);
    win.position.set(0.6, 1.3, 1.31);
    g.add(win);
    const chimney = k.mesh(new THREE.BoxGeometry(0.35, 1.2, 0.35), k.mat(0x4a4440));
    chimney.position.set(0.8, 3.2, -0.4);
    g.add(chimney);
    this.group.add(g);
  }

  private stall(x: number, z: number, rot: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const table = k.mesh(new THREE.BoxGeometry(1.8, 0.1, 0.8), k.mat(0x6a4a2a));
    table.position.y = 0.9;
    g.add(table);
    for (const [px, pz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]] as const) {
      g.add(k.limb(v3(px, 0, pz), v3(px, 2.0, pz), 0.04, 0.04, k.mat(0x4a3020)));
    }
    const awningMat = k.mat(0x8a2a2a, { rough: 1 });
    awningMat.side = THREE.DoubleSide;
    const awning = k.mesh(new THREE.PlaneGeometry(2.0, 1.1), awningMat);
    awning.position.set(0, 2.05, 0.1);
    awning.rotation.x = -Math.PI / 2 + 0.3;
    g.add(awning);
    const potionColors = [0xe53e3e, 0x4299e1, 0x48bb78, 0xd69e2e, 0x9f7aea];
    potionColors.forEach((c, i) => {
      const bottle = k.mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 6), k.mat(c, { emissive: c, emissiveIntensity: 0.6, rough: 0.2 }));
      bottle.position.set(-0.6 + i * 0.3, 1.04, 0.1);
      g.add(bottle);
    });
    const lantern = k.halo(0xffc070, 0.9, 0.7);
    lantern.position.set(0.8, 1.8, 0.4);
    g.add(lantern);
    const l = new THREE.PointLight(0xffb060, 4, 5, 2);
    l.position.copy(lantern.position);
    g.add(l);
    this.group.add(g);
  }

  private tree(x: number, z: number, s: number): void {
    const k = this.kit;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.add(k.limb(v3(0, 0, 0), v3(0, 1.4, 0), 0.16, 0.1, k.mat(0x3a2a1a)));
    const leaf = k.mat(0x1f3a24, { rough: 1 });
    for (let i = 0; i < 3; i++) {
      const cone = k.mesh(new THREE.ConeGeometry(1.2 - i * 0.3, 1.4, 7), leaf);
      cone.position.y = 1.5 + i * 0.75;
      cone.rotation.y = i;
      g.add(cone);
    }
    this.group.add(g);
  }

  update(dt: number, time: number): void {
    const flicker = Math.sin(time * 2.1) * 2.2 + Math.sin(time * 3.3 + 1) * 1.4;
    this.fireLight.intensity = 30 + flicker;
    for (const f of this.flames) {
      const seed = f.userData.seed as number;
      const base = f.userData.base as number;
      const s = base + Math.sin(time * 7 + seed) * 0.08;
      f.scale.set(s * 0.6, s * 1.2, 1);
      f.position.y = 0.4 + s * 0.35;
    }
    this.windows.forEach((w, i) => (w.emissiveIntensity = 1.5 + Math.sin(time * 0.8 + i * 1.7) * 0.15));
    this.emberTimer += dt;
    if (this.emberTimer > 0.18) {
      this.emberTimer = 0;
      this.effects.burst(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.6, (Math.random() - 0.5) * 0.4), {
        color: 0xff9a40, count: 2, speed: 0.25, lift: 1.1, gravity: 0.15, life: 2.2, size: 0.05, drag: 0.4,
      });
    }
  }

  dispose(): void {
    this.kit.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
