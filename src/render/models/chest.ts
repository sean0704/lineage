import * as THREE from 'three';
import type { ChestTier } from '../../systems/dungeonGen';
import { Kit } from './kit';

const PALETTE: Record<ChestTier, { wood: number; band: number; gem?: number }> = {
  wooden: { wood: 0x6a4426, band: 0x4a4a50 },
  sturdy: { wood: 0x3e2a1c, band: 0x8a909c },
  ornate: { wood: 0x6a1a1a, band: 0xd4a83a, gem: 0x3a9aff },
  legendary: { wood: 0x241a30, band: 0xf0c24a, gem: 0xff3a5a },
};

export interface ChestModel {
  root: THREE.Group;
  lid: THREE.Group;
  kit: Kit;
  glow?: THREE.Sprite;
}

export function buildChest(tier: ChestTier): ChestModel {
  const kit = new Kit();
  const p = PALETTE[tier];
  const wood = kit.mat(p.wood, { rough: 0.85 });
  const band = kit.mat(p.band, { metal: 0.5, rough: 0.4 });
  const root = new THREE.Group();
  const w = 0.8;
  const d = 0.52;
  const h = 0.42;

  const base = kit.mesh(new THREE.BoxGeometry(w, h, d), wood);
  base.position.y = h / 2;
  root.add(base);
  const inner = kit.mesh(new THREE.BoxGeometry(w - 0.06, 0.02, d - 0.06), kit.mat(0x120a06));
  inner.position.y = h - 0.01;
  root.add(inner);

  const lid = new THREE.Group();
  lid.position.set(0, h, -d / 2);
  root.add(lid);
  const top = kit.mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI), wood);
  top.rotation.z = Math.PI / 2;
  top.position.z = d / 2;
  lid.add(top);

  for (const x of [-w * 0.32, w * 0.32]) {
    const strap = kit.mesh(new THREE.BoxGeometry(0.06, h + 0.01, d + 0.02), band);
    strap.position.set(x, h / 2, 0);
    root.add(strap);
    const arc = kit.mesh(new THREE.TorusGeometry(d / 2 + 0.008, 0.022, 4, 10, Math.PI), band);
    arc.rotation.y = Math.PI / 2;
    arc.position.set(x, 0, d / 2);
    lid.add(arc);
  }
  const lock = kit.mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), band);
  lock.position.set(0, h - 0.02, d / 2 + 0.02);
  root.add(lock);
  if (p.gem !== undefined) {
    const gem = kit.mesh(new THREE.OctahedronGeometry(0.05, 0), kit.glowMat(p.gem, 2.5));
    gem.position.set(0, d / 2 + 0.02, d / 2 + 0.03);
    lid.add(gem);
  }
  let glow: THREE.Sprite | undefined;
  if (tier === 'legendary' || tier === 'ornate') {
    glow = kit.halo(tier === 'legendary' ? 0xffc04a : 0x6ab0ff, 1.6, 0.25);
    glow.position.y = 0.4;
    root.add(glow);
  }
  return { root, lid, kit, glow };
}
