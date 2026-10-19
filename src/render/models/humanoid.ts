import * as THREE from 'three';
import type { HeadStyle, ModelSpec } from '../../data/monsters';
import { Kit, v3 } from './kit';
import type { Rig } from './rig';
import { buildWeapon } from './weapons';

type HumanoidSpec = Extract<ModelSpec, { kind: 'humanoid' }>;

/** 人形怪物：妖魔、骷髏、殭屍、食屍鬼、史巴托、食人妖精、首領 */
export function buildHumanoid(spec: HumanoidSpec, kit = new Kit()): Rig {
  const b = spec.bulk;
  const bony = !!spec.bony;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = kit.mat(spec.skin, { rough: bony ? 0.6 : 0.8 });
  const cloth = kit.mat(spec.cloth, { rough: 0.95 });
  const metal = spec.metal !== undefined ? kit.mat(spec.metal, { metal: 0.8, rough: 0.38 }) : null;
  const dark = kit.mat(0x1a1612, { rough: 0.9 });
  const eye = kit.glowMat(spec.eye, 3);

  const hipY = 0.84;
  const pelvis = new THREE.Group();
  pelvis.position.y = hipY;
  body.add(pelvis);

  // ── 腿 ──
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11 * b, 0, 0);
    pelvis.add(hip);
    const thighR = bony ? 0.032 : 0.075 * b;
    hip.add(kit.limb(v3(0, 0, 0), v3(0, -0.42, 0.02), thighR, thighR * 0.8, bony ? skin : cloth));
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0.02);
    hip.add(knee);
    if (!bony) {
      knee.add(kit.mesh(new THREE.IcosahedronGeometry(thighR * 0.85, 1), cloth));
    }
    const shinR = bony ? 0.028 : 0.058 * b;
    knee.add(kit.limb(v3(0, 0, 0), v3(0, -0.38, -0.02), shinR, shinR * 0.85, metal && !bony ? metal : skin));
    if (bony) {
      const kneeCap = kit.mesh(new THREE.IcosahedronGeometry(0.04, 0), skin);
      knee.add(kneeCap);
    }
    const bootMat = metal ?? dark;
    const foot = kit.mesh(new THREE.BoxGeometry(0.11 * b, 0.07, 0.22), bootMat);
    foot.position.set(0, -0.4, 0.05);
    knee.add(foot);
    if (!bony) {
      const cuff = kit.mesh(new THREE.CylinderGeometry(shinR * 1.25, shinR * 1.1, 0.12, 8), bootMat);
      cuff.position.set(0, -0.32, -0.015);
      knee.add(cuff);
    }
    return hip;
  });

  // ── 軀幹 ──
  const spine = new THREE.Group();
  spine.position.y = hipY;
  spine.rotation.x = spec.hunch ?? 0;
  body.add(spine);

  if (bony) {
    spine.add(kit.limb(v3(0, 0, -0.03), v3(0, 0.55, -0.05), 0.03, 0.025, skin));
    for (let i = 0; i < 4; i++) {
      const rib = kit.mesh(new THREE.TorusGeometry(0.13 - i * 0.012, 0.014, 4, 10, Math.PI * 1.3), skin);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.z = -Math.PI * 0.15;
      rib.position.set(0, 0.25 + i * 0.075, 0.01);
      spine.add(rib);
    }
    const pelvisBone = kit.mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 8, Math.PI), skin);
    pelvisBone.rotation.x = Math.PI / 2;
    pelvisBone.position.y = 0.04;
    spine.add(pelvisBone);
    // 破布
    const rag = kit.mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.22, 7, 1, true), cloth);
    rag.position.y = 0.0;
    (rag.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    spine.add(rag);
  } else {
    // 旋轉曲面軀幹：骨盆 → 細腰 → 寬胸 → 肩頸
    const profile = [
      [0.0, 0.02], [0.15, 0.02], [0.155, 0.1], [0.135, 0.2], [0.165, 0.34], [0.2, 0.46], [0.19, 0.55], [0.12, 0.61], [0.0, 0.63],
    ].map(([r, y]) => new THREE.Vector2(r * b, y));
    const torso = kit.mesh(new THREE.LatheGeometry(profile, 9), cloth);
    torso.scale.z = 0.72;
    spine.add(torso);
    const beltMat = kit.mat(0x2a1a10, { rough: 0.7 });
    const belt = kit.mesh(new THREE.CylinderGeometry(0.16 * b, 0.165 * b, 0.07, 9), beltMat);
    belt.position.y = 0.09;
    belt.scale.z = 0.76;
    spine.add(belt);
    const buckle = kit.mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), kit.mat(0xb8903a, { metal: 0.9, rough: 0.3 }));
    buckle.position.set(0, 0.09, 0.125 * b);
    spine.add(buckle);
    const pouch = kit.mesh(new THREE.BoxGeometry(0.07, 0.08, 0.05), beltMat);
    pouch.position.set(0.13 * b, 0.05, 0.06 * b);
    pouch.rotation.y = 0.5;
    spine.add(pouch);
    // 鋸齒下擺的外衣裙襬
    const skirtGeo = new THREE.CylinderGeometry(0.165 * b, 0.21 * b, 0.26, 12, 1, true);
    const pos = skirtGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) - (i % 2) * 0.06);
    }
    const skirtMat = kit.mat(new THREE.Color(spec.cloth).multiplyScalar(0.8).getHex(), { rough: 1 });
    skirtMat.side = THREE.DoubleSide;
    const skirt = kit.mesh(skirtGeo, skirtMat);
    skirt.position.y = -0.04;
    skirt.scale.z = 0.8;
    spine.add(skirt);
  }
  if (metal) {
    const plate = kit.mesh(new THREE.CylinderGeometry(0.215 * b, 0.17 * b, 0.34, 7, 1, false, -Math.PI / 2, Math.PI), metal);
    plate.position.set(0, 0.42, 0.005);
    plate.scale.z = 0.8;
    spine.add(plate);
    for (const side of [-1, 1]) {
      const pauldron = kit.mesh(new THREE.SphereGeometry(0.1 * b, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), metal);
      pauldron.position.set(side * 0.24 * b, 0.56, 0);
      pauldron.rotation.z = -side * 0.4;
      spine.add(pauldron);
    }
  }
  if (spec.cape !== undefined) {
    const capeMat = kit.mat(spec.cape, { rough: 1 });
    capeMat.side = THREE.DoubleSide;
    const cape = kit.mesh(new THREE.PlaneGeometry(0.5 * b, 1.0, 1, 4), capeMat);
    cape.geometry.translate(0, -0.5, 0);
    const capePivot = new THREE.Group();
    capePivot.position.set(0, 0.58, -0.14 * b);
    capePivot.rotation.x = 0.12;
    capePivot.add(cape);
    spine.add(capePivot);
    root.userData.cape = capePivot;
  }

  // ── 頭 ──
  const neck = new THREE.Group();
  neck.position.y = 0.6;
  spine.add(neck);
  neck.add(kit.limb(v3(0, -0.02, 0), v3(0, 0.08, 0.01), bony ? 0.025 : 0.05 * b, bony ? 0.022 : 0.045 * b, skin));
  const head = new THREE.Group();
  head.position.y = 0.2;
  neck.add(head);
  const jaw = buildHead(spec.head, head, kit, { skin, metal, eye, dark, b, bone: spec.skin });

  // ── 手臂 ──
  const shoulderX = (bony ? 0.17 : 0.25 * b) + 0.01;
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, 0.52, 0);
    spine.add(shoulder);
    const r = bony ? 0.026 : 0.055 * b;
    shoulder.add(kit.limb(v3(0, 0, 0), v3(side * 0.03, -0.32, 0), r, r * 0.85, bony ? skin : spec.metal !== undefined ? cloth : skin));
    if (!bony) shoulder.add(kit.mesh(new THREE.IcosahedronGeometry(r * 1.02, 1), spec.metal !== undefined ? cloth : skin));
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.03, -0.32, 0);
    elbow.rotation.x = -0.7;
    shoulder.add(elbow);
    if (!bony) elbow.add(kit.mesh(new THREE.IcosahedronGeometry(r * 0.9, 1), skin));
    elbow.add(kit.limb(v3(0, 0, 0), v3(0, -0.3, 0), r * 0.85, r * 0.7, skin));
    const hand = new THREE.Group();
    hand.position.y = -0.32;
    elbow.add(hand);
    const fist = kit.mesh(new THREE.IcosahedronGeometry(bony ? 0.035 : 0.055 * b, 1), skin);
    fist.scale.set(0.9, 1.1, 1);
    hand.add(fist);
    return { shoulder, elbow, hand };
  });

  // 右手武器：向前上方
  const weapon = buildWeapon(spec.weapon, kit, spec.aura);
  if (spec.weapon === 'claws') {
    arms[1].hand.add(weapon);
    const left = buildWeapon('claws', kit);
    arms[0].hand.add(left);
    left.rotation.x = Math.PI;
    weapon.rotation.x = Math.PI;
  } else if (spec.weapon === 'bow') {
    arms[0].hand.add(weapon);
    weapon.rotation.set(0.7, Math.PI / 2, 0);
  } else {
    // 抵銷手肘前彎角度，讓武器朝上微向前
    arms[1].hand.add(weapon);
    weapon.rotation.x = 1.05;
    weapon.position.y = -0.02;
  }
  if (spec.shield) {
    const shield = kit.mesh(new THREE.CylinderGeometry(0.22 * b, 0.22 * b, 0.04, 10), metal ?? kit.mat(0x6a4a2a));
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.05, -0.18, 0.08);
    const boss = kit.mesh(new THREE.SphereGeometry(0.06, 6, 4), kit.mat(0xc8a040, { metal: 0.9, rough: 0.3 }));
    boss.position.set(-0.05, -0.18, 0.11);
    arms[0].elbow.add(shield, boss);
  }

  let light: THREE.PointLight | undefined;
  if (spec.aura !== undefined) {
    light = new THREE.PointLight(spec.aura, 2.2, 5, 2);
    light.position.set(0, 0.3, 0.9);
    root.add(light);
    const ringMat = new THREE.MeshBasicMaterial({ color: spec.aura, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = kit.mesh(new THREE.RingGeometry(0.55, 0.75, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    root.add(ring);
    root.userData.auraRing = ring;
  }

  root.scale.setScalar(spec.scale);
  return {
    kind: 'humanoid',
    root,
    body,
    parts: {
      spine, head, jaw: jaw ?? undefined, weapon,
      armL: arms[0].shoulder, armR: arms[1].shoulder, elbowL: arms[0].elbow, elbowR: arms[1].elbow,
      legL: legs[0], legR: legs[1], cape: root.userData.cape,
    },
    groups: {},
    height: 1.85 * spec.scale,
    kit,
    light,
  };
}

interface HeadMats {
  skin: THREE.Material;
  metal: THREE.Material | null;
  eye: THREE.Material;
  dark: THREE.Material;
  b: number;
  bone: number;
}

function eyes(head: THREE.Group, kit: Kit, mat: THREE.Material, y: number, z: number, spread: number, size = 0.025): void {
  for (const side of [-1, 1]) {
    const e = kit.mesh(new THREE.IcosahedronGeometry(size, 0), mat);
    e.position.set(side * spread, y, z);
    head.add(e);
  }
}

/** 回傳下顎（可做開合動畫），沒有則為 null */
function buildHead(style: HeadStyle, head: THREE.Group, kit: Kit, m: HeadMats): THREE.Object3D | null {
  switch (style) {
    case 'goblin': {
      const skull = kit.mesh(new THREE.IcosahedronGeometry(0.14, 1), m.skin);
      skull.scale.set(1.05, 0.9, 1);
      head.add(skull);
      for (const side of [-1, 1]) {
        const ear = kit.mesh(new THREE.ConeGeometry(0.045, 0.2, 4), m.skin);
        ear.position.set(side * 0.15, 0.03, -0.01);
        ear.rotation.z = -side * 1.25;
        head.add(ear);
      }
      const nose = kit.mesh(new THREE.ConeGeometry(0.03, 0.09, 4), m.skin);
      nose.position.set(0, -0.01, 0.15);
      nose.rotation.x = Math.PI / 2.3;
      head.add(nose);
      eyes(head, kit, m.eye, 0.03, 0.115, 0.055, 0.024);
      const jaw = kit.mesh(new THREE.BoxGeometry(0.15, 0.05, 0.1), m.skin);
      jaw.position.set(0, -0.09, 0.06);
      head.add(jaw);
      for (const side of [-1, 1]) {
        const fang = kit.mesh(new THREE.ConeGeometry(0.012, 0.04, 3), kit.mat(0xf0e8d0));
        fang.position.set(side * 0.04, -0.05, 0.11);
        head.add(fang);
      }
      return jaw;
    }
    case 'skull': {
      const skull = kit.mesh(new THREE.IcosahedronGeometry(0.13, 1), m.skin);
      skull.scale.set(0.95, 1, 1.05);
      head.add(skull);
      for (const side of [-1, 1]) {
        const socket = kit.mesh(new THREE.IcosahedronGeometry(0.038, 0), kit.mat(0x050505));
        socket.position.set(side * 0.048, 0.01, 0.105);
        head.add(socket);
      }
      eyes(head, kit, m.eye, 0.01, 0.13, 0.048, 0.014);
      const jaw = kit.mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), m.skin);
      jaw.position.set(0, -0.11, 0.04);
      head.add(jaw);
      const teeth = kit.mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), kit.mat(0xf4ecd8));
      teeth.position.set(0, -0.075, 0.1);
      head.add(teeth);
      return jaw;
    }
    case 'zombie':
    case 'ghoul': {
      const long = style === 'ghoul';
      const skull = kit.mesh(new THREE.IcosahedronGeometry(0.13, 1), m.skin);
      skull.scale.set(0.95, long ? 1.25 : 1.05, 1);
      head.add(skull);
      const brow = kit.mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), m.skin);
      brow.position.set(0, 0.05, 0.1);
      head.add(brow);
      eyes(head, kit, m.eye, 0.02, 0.115, 0.05, long ? 0.02 : 0.024);
      const jaw = kit.mesh(new THREE.BoxGeometry(0.13, 0.06, 0.1), m.skin);
      jaw.position.set(0, long ? -0.15 : -0.1, 0.05);
      jaw.rotation.x = 0.25;
      head.add(jaw);
      const mouth = kit.mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), kit.mat(0x2a0808));
      mouth.position.set(0, long ? -0.11 : -0.07, 0.11);
      head.add(mouth);
      if (!long) {
        for (let i = 0; i < 5; i++) {
          const hair = kit.limb(v3((i - 2) * 0.04, 0.12, -0.02), v3((i - 2) * 0.06, -0.05, -0.14), 0.006, 0.004, kit.mat(0x2a2a20));
          head.add(hair);
        }
      }
      return jaw;
    }
    case 'orc': {
      const skull = kit.mesh(new THREE.IcosahedronGeometry(0.16, 1), m.skin);
      skull.scale.set(1.1, 0.95, 1);
      head.add(skull);
      const brow = kit.mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), m.skin);
      brow.position.set(0, 0.05, 0.11);
      head.add(brow);
      eyes(head, kit, m.eye, 0.01, 0.13, 0.06, 0.022);
      const jaw = kit.mesh(new THREE.BoxGeometry(0.22, 0.09, 0.15), m.skin);
      jaw.position.set(0, -0.1, 0.06);
      head.add(jaw);
      for (const side of [-1, 1]) {
        const tusk = kit.mesh(new THREE.ConeGeometry(0.022, 0.1, 4), kit.mat(0xf0e4c0));
        tusk.position.set(side * 0.07, -0.04, 0.13);
        tusk.rotation.z = side * 0.25;
        head.add(tusk);
      }
      return jaw;
    }
    case 'helm':
    case 'horned': {
      const helmMat = m.metal ?? kit.mat(0x4a4a52, { metal: 0.7, rough: 0.4 });
      const face = kit.mesh(new THREE.IcosahedronGeometry(0.12, 1), m.skin);
      head.add(face);
      const helm = kit.mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.24, 8), helmMat);
      helm.position.y = 0.02;
      head.add(helm);
      const dome = kit.mesh(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), helmMat);
      dome.position.y = 0.14;
      head.add(dome);
      const slit = kit.mesh(new THREE.BoxGeometry(0.17, 0.03, 0.02), kit.mat(0x050505));
      slit.position.set(0, 0.02, 0.14);
      head.add(slit);
      eyes(head, kit, m.eye, 0.02, 0.15, 0.04, 0.016);
      if (style === 'horned') {
        for (const side of [-1, 1]) {
          const horn = new THREE.Group();
          horn.position.set(side * 0.13, 0.1, 0);
          for (let i = 0; i < 4; i++) {
            const seg = kit.mesh(new THREE.ConeGeometry(0.045 - i * 0.009, 0.12, 5), kit.mat(0xd8ccb0, { rough: 0.6 }));
            seg.position.set(side * (0.05 + i * 0.05), 0.04 + i * 0.06 - (i > 2 ? 0.03 : 0), 0);
            seg.rotation.z = -side * (1.1 - i * 0.35);
            horn.add(seg);
          }
          head.add(horn);
        }
      } else {
        const crest = kit.mesh(new THREE.BoxGeometry(0.03, 0.08, 0.26), kit.mat(0x8a1a1a));
        crest.position.y = 0.26;
        head.add(crest);
      }
      return null;
    }
    case 'human': {
      const face = kit.mesh(new THREE.IcosahedronGeometry(0.12, 1), m.skin);
      face.scale.set(0.9, 1.08, 0.95);
      head.add(face);
      const hair = kit.mesh(new THREE.SphereGeometry(0.128, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), kit.mat(0x3a2414, { rough: 1 }));
      hair.position.set(0, 0.02, -0.012);
      hair.rotation.x = -0.25;
      head.add(hair);
      const nose = kit.mesh(new THREE.ConeGeometry(0.022, 0.06, 4), m.skin);
      nose.position.set(0, -0.005, 0.12);
      nose.rotation.x = Math.PI / 2.2;
      head.add(nose);
      for (const side of [-1, 1]) {
        const e = kit.mesh(new THREE.IcosahedronGeometry(0.014, 0), kit.mat(0x1a1410));
        e.position.set(side * 0.04, 0.025, 0.105);
        head.add(e);
      }
      const beard = kit.mesh(new THREE.ConeGeometry(0.07, 0.14, 6), kit.mat(0x4a3424, { rough: 1 }));
      beard.position.set(0, -0.1, 0.06);
      beard.rotation.x = Math.PI + 0.3;
      head.add(beard);
      return null;
    }
    case 'hood': {
      const hoodMat = kit.mat(0x14141c, { rough: 1 });
      const hood = kit.mesh(new THREE.ConeGeometry(0.2, 0.42, 7, 1, true), hoodMat);
      hoodMat.side = THREE.DoubleSide;
      hood.position.y = 0.08;
      head.add(hood);
      const shadow = kit.mesh(new THREE.IcosahedronGeometry(0.12, 1), kit.mat(0x020204));
      shadow.position.set(0, -0.02, 0.02);
      head.add(shadow);
      eyes(head, kit, m.eye, 0.0, 0.12, 0.045, 0.02);
      return null;
    }
  }
}
