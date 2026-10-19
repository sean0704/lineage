import * as THREE from 'three';
import type { ModelSpec } from '../../data/monsters';
import { Kit, v3 } from './kit';
import type { Rig } from './rig';

type Spec<K extends ModelSpec['kind']> = Extract<ModelSpec, { kind: K }>;

/** 巨型蜘蛛：夏洛伯、楊果里恩 */
export function buildSpider(spec: Spec<'spider'>, kit = new Kit()): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = 0.5;
  const shell = kit.mat(spec.body, { rough: 0.5, metal: 0.2 });
  const accent = kit.mat(spec.accent, { rough: 0.6 });
  const eye = kit.glowMat(spec.eye, 3);

  const abdomen = kit.mesh(new THREE.IcosahedronGeometry(0.42, 1), shell);
  abdomen.scale.set(1, 0.8, 1.25);
  abdomen.position.set(0, 0.12, -0.5);
  body.add(abdomen);
  // 背上花紋
  for (let i = 0; i < 3; i++) {
    const mark = kit.mesh(new THREE.IcosahedronGeometry(0.09 - i * 0.015, 0), accent);
    mark.position.set(0, 0.42 - i * 0.04, -0.4 - i * 0.18);
    mark.scale.y = 0.4;
    body.add(mark);
  }
  const thorax = kit.mesh(new THREE.IcosahedronGeometry(0.24, 1), shell);
  thorax.scale.set(1, 0.75, 1.1);
  body.add(thorax);
  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.26);
  body.add(head);
  head.add(kit.mesh(new THREE.IcosahedronGeometry(0.15, 1), shell));
  const eyePos: [number, number, number][] = [[-0.05, 0.08, 0.12], [0.05, 0.08, 0.12], [-0.1, 0.05, 0.09], [0.1, 0.05, 0.09], [-0.03, 0.12, 0.1], [0.03, 0.12, 0.1]];
  for (const [x, y, z] of eyePos) {
    const e = kit.mesh(new THREE.IcosahedronGeometry(0.024, 0), eye);
    e.position.set(x, y, z);
    head.add(e);
  }
  const jaw = new THREE.Group();
  head.add(jaw);
  for (const side of [-1, 1]) {
    const fang = kit.mesh(new THREE.ConeGeometry(0.03, 0.16, 4), accent);
    fang.position.set(side * 0.05, -0.08, 0.12);
    fang.rotation.x = Math.PI * 0.85;
    jaw.add(fang);
  }

  const legs: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, 0, 0.12 - i * 0.12);
      const angle = (i - 1.5) * 0.45;
      pivot.rotation.y = side * angle;
      const knee = v3(side * 0.5, 0.35, 0);
      const foot = v3(side * 0.95, -0.5, 0);
      pivot.add(kit.limb(v3(0, 0, 0), knee, 0.04, 0.032, shell));
      pivot.add(kit.limb(knee, foot, 0.032, 0.012, shell));
      const joint = kit.mesh(new THREE.IcosahedronGeometry(0.045, 0), accent);
      joint.position.copy(knee);
      pivot.add(joint);
      pivot.userData.phase = i * 0.8 + (side > 0 ? Math.PI : 0);
      body.add(pivot);
      legs.push(pivot);
    }
  }
  root.scale.setScalar(spec.scale);
  return { kind: 'spider', root, body, parts: { head, jaw }, groups: { legs }, height: 1.0 * spec.scale, kit };
}

/** 地獄犬（可多頭） */
export function buildHound(spec: Spec<'hound'>, kit = new Kit()): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = kit.mat(spec.body, { rough: 0.9 });
  const accent = kit.glowMat(spec.accent, 1.6);
  const eye = kit.glowMat(spec.eye, 3.5);

  const torso = kit.mesh(new THREE.CapsuleGeometry(0.24, 0.6, 3, 8), fur);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.72, -0.1);
  body.add(torso);
  const chest = kit.mesh(new THREE.IcosahedronGeometry(0.3, 1), fur);
  chest.position.set(0, 0.8, 0.25);
  body.add(chest);
  // 背脊火焰鬃毛
  for (let i = 0; i < 6; i++) {
    const spike = kit.mesh(new THREE.ConeGeometry(0.05, 0.22 - i * 0.02, 4), accent);
    spike.position.set(0, 1.02 - i * 0.03, 0.25 - i * 0.14);
    spike.rotation.x = -0.5;
    body.add(spike);
  }

  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.17, 0.3], [0.17, 0.3], [-0.17, -0.42], [0.17, -0.42]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.7, z);
    pivot.add(kit.limb(v3(0, 0, 0), v3(0, -0.36, z > 0 ? 0.06 : -0.08), 0.08, 0.055, fur));
    pivot.add(kit.limb(v3(0, -0.36, z > 0 ? 0.06 : -0.08), v3(0, -0.68, 0.02), 0.05, 0.04, fur));
    const paw = kit.mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), kit.mat(0x120c0c));
    paw.position.set(0, -0.68, 0.06);
    pivot.add(paw);
    pivot.userData.phase = (x > 0 ? 0 : Math.PI) + (z > 0 ? 0 : Math.PI / 2);
    body.add(pivot);
    legs.push(pivot);
  }

  const heads: THREE.Object3D[] = [];
  const offsets = spec.heads === 3 ? [-0.24, 0, 0.24] : [0];
  offsets.forEach((ox, i) => {
    const neck = new THREE.Group();
    neck.position.set(ox * 0.6, 0.92, 0.38);
    neck.rotation.y = -ox * 0.8;
    body.add(neck);
    neck.add(kit.limb(v3(0, 0, 0), v3(ox * 0.3, 0.2, 0.2), 0.1, 0.08, fur));
    const head = new THREE.Group();
    head.position.set(ox * 0.3, 0.22, 0.24);
    neck.add(head);
    const skull = kit.mesh(new THREE.IcosahedronGeometry(0.14, 1), fur);
    skull.scale.set(0.95, 0.9, 1.1);
    head.add(skull);
    const snout = kit.mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), fur);
    snout.position.set(0, -0.02, 0.15);
    head.add(snout);
    const jaw = kit.mesh(new THREE.BoxGeometry(0.11, 0.04, 0.16), fur);
    jaw.position.set(0, -0.08, 0.13);
    head.add(jaw);
    const maw = kit.mesh(new THREE.BoxGeometry(0.09, 0.025, 0.12), accent);
    maw.position.set(0, -0.055, 0.15);
    head.add(maw);
    for (const side of [-1, 1]) {
      const ear = kit.mesh(new THREE.ConeGeometry(0.04, 0.13, 4), fur);
      ear.position.set(side * 0.08, 0.13, -0.02);
      ear.rotation.z = -side * 0.3;
      head.add(ear);
      const e = kit.mesh(new THREE.IcosahedronGeometry(0.022, 0), eye);
      e.position.set(side * 0.06, 0.04, 0.11);
      head.add(e);
    }
    head.userData.jaw = jaw;
    head.userData.phase = i * 1.3;
    heads.push(head);
  });

  const tail = new THREE.Group();
  tail.position.set(0, 0.8, -0.55);
  tail.add(kit.limb(v3(0, 0, 0), v3(0, 0.2, -0.35), 0.05, 0.02, fur));
  const tip = kit.halo(spec.accent, 0.35, 0.7);
  tip.position.set(0, 0.22, -0.38);
  tail.add(tip);
  body.add(tail);

  const light = new THREE.PointLight(spec.accent, 2.5, 4, 2);
  light.position.set(0, 1.0, 0.6);
  root.add(light);

  root.scale.setScalar(spec.scale);
  return { kind: 'hound', root, body, parts: { tail }, groups: { legs, heads }, height: 1.25 * spec.scale, kit, light };
}

/** 石頭高崙 */
export function buildGolem(spec: Spec<'golem'>, kit = new Kit()): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = kit.mat(spec.body, { rough: 1 });
  const rock2 = kit.mat(spec.accent, { rough: 1 });
  const rune = kit.glowMat(spec.eye, 2.5);

  const chunk = (r: number, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = kit.mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(x * 3, y * 2, z * 5);
    return m;
  };

  const spine = new THREE.Group();
  spine.position.y = 0.75;
  body.add(spine);
  spine.add(chunk(0.38, rock, 0, 0.45, 0, 1.15, 1, 0.8));
  spine.add(chunk(0.26, rock2, 0, 0.1, 0, 1, 0.8, 0.8));
  for (const [x, y] of [[-0.12, 0.5], [0.1, 0.38], [0, 0.6]] as const) {
    const r = kit.mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), rune);
    r.position.set(x, y, 0.31);
    r.rotation.z = x * 4;
    spine.add(r);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.05);
  spine.add(head);
  head.add(chunk(0.17, rock2, 0, 0, 0, 1.1, 0.85, 1));
  const visor = kit.mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), rune);
  visor.position.set(0, 0.0, 0.15);
  head.add(visor);

  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.5, 0.65, 0);
    spine.add(shoulder);
    shoulder.add(chunk(0.17, rock2, 0, 0, 0));
    shoulder.add(chunk(0.13, rock, side * 0.04, -0.28, 0.02));
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.05, -0.45, 0.05);
    elbow.rotation.x = -0.4;
    shoulder.add(elbow);
    elbow.add(chunk(0.12, rock, 0, -0.1, 0));
    elbow.add(chunk(0.2, rock2, 0, -0.35, 0.04, 1.1, 1, 1.1));
    return { shoulder, elbow };
  });
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.2, 0.75, 0);
    body.add(hip);
    hip.add(chunk(0.16, rock, 0, -0.25, 0, 1, 1.3, 1));
    hip.add(chunk(0.17, rock2, 0, -0.62, 0.04, 1.1, 0.8, 1.3));
    return hip;
  });

  root.scale.setScalar(spec.scale);
  return {
    kind: 'golem', root, body,
    parts: { spine, head, armL: arms[0].shoulder, armR: arms[1].shoulder, elbowL: arms[0].elbow, elbowR: arms[1].elbow, legL: legs[0], legR: legs[1] },
    groups: {}, height: 1.85 * spec.scale, kit,
  };
}

/** 漂浮之眼 */
export function buildEye(spec: Spec<'eye'>, kit = new Kit()): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = 1.35;
  const sclera = kit.mat(spec.body, { rough: 0.35, emissive: 0x2a1a1a, emissiveIntensity: 0.6, flat: false });
  const flesh = kit.mat(0x5a2a3a, { rough: 0.7 });
  const iris = kit.glowMat(spec.iris, 2.2);

  const ball = kit.mesh(new THREE.SphereGeometry(0.42, 20, 14), sclera);
  body.add(ball);
  // 血絲
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const vein = kit.limb(v3(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.4), v3(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.22), 0.006, 0.004, kit.mat(0xaa1a2a));
    body.add(vein);
  }
  const irisGroup = new THREE.Group();
  irisGroup.position.z = 0.36;
  body.add(irisGroup);
  const irisDisc = kit.mesh(new THREE.CircleGeometry(0.17, 24), iris);
  irisDisc.position.z = 0.05;
  const pupil = kit.mesh(new THREE.CircleGeometry(0.07, 16), kit.mat(0x000000));
  pupil.position.z = 0.055;
  pupil.scale.y = 1.6;
  irisGroup.add(irisDisc, pupil);
  // 眼皮
  for (const side of [1, -1]) {
    const lid = kit.mesh(new THREE.SphereGeometry(0.445, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), flesh);
    lid.rotation.x = side > 0 ? 0.25 : Math.PI - 0.25;
    body.add(lid);
  }
  const tentacles: THREE.Object3D[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const t = new THREE.Group();
    t.position.set(Math.cos(a) * 0.22, -0.3, Math.sin(a) * 0.22);
    let parent: THREE.Object3D = t;
    for (let s = 0; s < 4; s++) {
      const seg = new THREE.Group();
      seg.position.y = s === 0 ? 0 : -0.16;
      seg.add(kit.limb(v3(0, 0, 0), v3(0, -0.16, 0), 0.035 - s * 0.007, 0.03 - s * 0.007, flesh));
      parent.add(seg);
      parent = seg;
    }
    t.userData.phase = i * 0.9;
    body.add(t);
    tentacles.push(t);
  }
  const halo = kit.halo(spec.iris, 1.4, 0.25);
  body.add(halo);

  root.scale.setScalar(spec.scale);
  return { kind: 'eye', root, body, parts: { iris: irisGroup }, groups: { tentacles }, height: 1.85 * spec.scale, kit };
}
