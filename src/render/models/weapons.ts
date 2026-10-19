import * as THREE from 'three';
import type { WeaponStyle } from '../../data/monsters';
import { Kit, v3 } from './kit';

export type HeroWeaponStyle = WeaponStyle | 'dagger' | 'greatAxe' | 'bigSword';

const STEEL = 0xb8c0cc;
const DARK_STEEL = 0x5a606c;
const WOOD = 0x6a4428;
const LEATHER = 0x3a2416;
const GOLD = 0xd4a83a;

/**
 * 建立武器：握把在原點、武器尖端朝 +Y。
 * accent 用於附魔/稀有度發光色。
 */
export function buildWeapon(style: HeroWeaponStyle, kit: Kit, accent?: number): THREE.Group {
  const g = new THREE.Group();
  const steel = kit.mat(STEEL, { metal: 0.9, rough: 0.28 });
  const dark = kit.mat(DARK_STEEL, { metal: 0.8, rough: 0.4 });
  const wood = kit.mat(WOOD, { rough: 0.85 });
  const leather = kit.mat(LEATHER, { rough: 0.9 });
  const gold = kit.mat(GOLD, { metal: 0.9, rough: 0.3 });

  const blade = (len: number, width: number, mat: THREE.Material) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, len * 0.85);
    shape.lineTo(0, len);
    shape.lineTo(-width / 2, len * 0.85);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
    geo.translate(0, 0, -0.006);
    return kit.mesh(geo, mat);
  };
  const hilt = (gripLen: number, guardW: number, guardMat: THREE.Material) => {
    const grip = kit.mesh(new THREE.CylinderGeometry(0.018, 0.02, gripLen, 6), leather);
    grip.position.y = 0;
    const guard = kit.mesh(new THREE.BoxGeometry(guardW, 0.03, 0.045), guardMat);
    guard.position.y = gripLen / 2;
    const pommel = kit.mesh(new THREE.IcosahedronGeometry(0.028, 0), guardMat);
    pommel.position.y = -gripLen / 2 - 0.02;
    g.add(grip, guard, pommel);
    return gripLen / 2 + 0.015;
  };

  switch (style) {
    case 'sword':
    case 'bigSword': {
      const big = style === 'bigSword';
      const top = hilt(big ? 0.24 : 0.16, big ? 0.26 : 0.18, big ? gold : dark);
      const b = blade(big ? 1.05 : 0.72, big ? 0.09 : 0.065, steel);
      b.position.y = top;
      g.add(b);
      break;
    }
    case 'dagger': {
      const top = hilt(0.11, 0.1, dark);
      const b = blade(0.3, 0.05, steel);
      b.position.y = top;
      g.add(b);
      break;
    }
    case 'flameSword': {
      const top = hilt(0.22, 0.3, kit.mat(0x2a1a1a, { metal: 0.6 }));
      const fire = kit.glowMat(0xff4a12, 3);
      const b = blade(1.1, 0.1, fire);
      b.position.y = top;
      g.add(b);
      for (let i = 0; i < 3; i++) {
        const h = kit.halo(0xff6a22, 0.5 - i * 0.08, 0.55);
        h.position.y = top + 0.3 + i * 0.3;
        g.add(h);
      }
      break;
    }
    case 'club': {
      const club = kit.mesh(new THREE.CylinderGeometry(0.08, 0.03, 0.75, 7), wood);
      club.position.y = 0.3;
      g.add(club);
      for (let i = 0; i < 5; i++) {
        const spike = kit.mesh(new THREE.ConeGeometry(0.02, 0.08, 4), dark);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.075, 0.5 + (i % 2) * 0.1, Math.sin(a) * 0.075);
        spike.rotation.z = -Math.cos(a) * Math.PI / 2;
        spike.rotation.x = Math.sin(a) * Math.PI / 2;
        g.add(spike);
      }
      break;
    }
    case 'axe':
    case 'greatAxe': {
      const big = style === 'greatAxe';
      const len = big ? 1.0 : 0.65;
      g.add(kit.limb(v3(0, -0.15, 0), v3(0, len, 0), 0.022, 0.02, wood));
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.12);
      shape.quadraticCurveTo(0.3, -0.18, 0.32, 0);
      shape.quadraticCurveTo(0.3, 0.18, 0, 0.12);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
      geo.translate(0, 0, -0.01);
      const head = kit.mesh(geo, steel);
      head.position.y = len - 0.12;
      head.scale.setScalar(big ? 1.3 : 1);
      g.add(head);
      if (big) {
        const back = head.clone();
        back.rotation.y = Math.PI;
        g.add(back);
      }
      break;
    }
    case 'spear': {
      g.add(kit.limb(v3(0, -0.6, 0), v3(0, 1.0, 0), 0.02, 0.018, wood));
      const tip = kit.mesh(new THREE.ConeGeometry(0.045, 0.24, 4), steel);
      tip.position.y = 1.12;
      g.add(tip);
      break;
    }
    case 'staff': {
      g.add(kit.limb(v3(0, -0.6, 0), v3(0, 0.9, 0), 0.025, 0.02, wood));
      const orb = kit.mesh(new THREE.IcosahedronGeometry(0.07, 1), kit.glowMat(accent ?? 0x6ab8ff, 3));
      orb.position.y = 0.98;
      const h = kit.halo(accent ?? 0x6ab8ff, 0.45, 0.7);
      h.position.y = 0.98;
      g.add(orb, h);
      break;
    }
    case 'scythe': {
      g.add(kit.limb(v3(0, -0.7, 0), v3(0, 1.0, 0), 0.022, 0.02, kit.mat(0x1a1a1a)));
      const curve = kit.mesh(new THREE.TorusGeometry(0.32, 0.025, 4, 12, Math.PI * 0.7), kit.glowMat(accent ?? 0x5aff7a, 1.2));
      curve.position.set(-0.3, 0.98, 0);
      curve.rotation.z = 0.2;
      g.add(curve);
      break;
    }
    case 'bow': {
      const arc = kit.mesh(new THREE.TorusGeometry(0.42, 0.018, 4, 14, Math.PI * 0.9), wood);
      arc.rotation.z = Math.PI / 2 + Math.PI * 0.05;
      arc.position.x = -0.12;
      const str = kit.limb(v3(0.0, -0.4, 0), v3(0.0, 0.4, 0), 0.003, 0.003, kit.mat(0xddd8c8));
      g.add(arc, str);
      break;
    }
    case 'claws': {
      for (let i = -1; i <= 1; i++) {
        const c = kit.mesh(new THREE.ConeGeometry(0.014, 0.14, 4), kit.mat(0x2a2620, { rough: 0.5 }));
        c.position.set(i * 0.03, 0.08, 0.02);
        c.rotation.x = 0.3;
        g.add(c);
      }
      break;
    }
  }

  if (accent && style !== 'staff' && style !== 'flameSword' && style !== 'scythe') {
    const h = kit.halo(accent, 0.6, 0.35);
    h.position.y = 0.45;
    g.add(h);
  }
  return g;
}

/** 依玩家裝備的武器 key 決定第一人稱武器造型 */
export function heroWeaponStyle(itemKey: string | null): HeroWeaponStyle {
  switch (itemKey) {
    case 'dagger':
    case 'mithrilDagger':
      return 'dagger';
    case 'greatAxe':
      return 'greatAxe';
    case 'twoHandedSword':
      return 'bigSword';
    case 'wizardStaff':
      return 'staff';
    case 'shortBow':
      return 'bow';
    case 'flameSwordOfDeathKnight':
      return 'flameSword';
    case null:
      return 'claws';
    default:
      return 'sword';
  }
}
