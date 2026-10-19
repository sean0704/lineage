import * as THREE from 'three';
import type { ModelSpec } from '../data/monsters';
import { buildMonsterRig, type Rig } from './models';
import { ease, lerp, lerpAngle, type Tweens } from './Tween';

export const CELL = 2;

export type AttackStyle = 'melee' | 'ranged' | 'magic';

/**
 * 單一怪物的 3D 表現：待機動畫、移動、攻擊、受擊、蓄力、死亡。
 * 所有時間軸動畫透過 Tweens 推進。
 */
export class MonsterView {
  readonly rig: Rig;
  private readonly phase = Math.random() * 10;
  private walk = 0;
  private lunge = 0;
  private windup = 0;
  private charging = false;
  private dying = false;
  private flash = 0;
  private tinted = false;
  private yaw = 0;
  private readonly baseEmissive: { m: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[];
  private readonly baseLight: number;

  constructor(spec: ModelSpec, x: number, y: number) {
    this.rig = buildMonsterRig(spec);
    this.rig.root.position.set(x * CELL, 0, y * CELL);
    this.baseEmissive = this.rig.kit.materials.map((m) => ({ m, color: m.emissive.clone(), intensity: m.emissiveIntensity }));
    this.baseLight = this.rig.light?.intensity ?? 0;
  }

  get root(): THREE.Group {
    return this.rig.root;
  }

  /** 頭頂上方的世界座標（傷害數字錨點） */
  anchor(): THREE.Vector3 {
    return this.rig.root.position.clone().add(new THREE.Vector3(0, Math.min(2.55, this.rig.height + 0.15), 0));
  }

  center(): THREE.Vector3 {
    return this.rig.root.position.clone().add(new THREE.Vector3(0, Math.min(1.6, this.rig.height * 0.55), 0));
  }

  async moveTo(x: number, y: number, tweens: Tweens, ms = 240): Promise<void> {
    const from = this.rig.root.position.clone();
    const to = new THREE.Vector3(x * CELL, 0, y * CELL);
    this.walk = 1;
    await tweens.to(ms, (k) => this.rig.root.position.lerpVectors(from, to, k), { easing: ease.inOutQuad });
    this.walk = 0;
  }

  setCharging(on: boolean): void {
    this.charging = on;
    if (!on) this.restoreEmissive();
  }

  async attack(tweens: Tweens, style: AttackStyle, onImpact: () => void): Promise<void> {
    this.setCharging(false);
    const reach = style === 'melee' ? 0.85 : 0.1;
    await tweens.to(style === 'melee' ? 240 : 300, (k) => (this.windup = k), { easing: ease.outQuad });
    await tweens.to(110, (k) => {
      this.windup = 1 - k;
      this.lunge = k * reach;
    }, { easing: ease.inQuad });
    onImpact();
    await tweens.to(320, (k) => (this.lunge = (1 - k) * reach), { easing: ease.outCubic });
    this.windup = 0;
    this.lunge = 0;
  }

  hit(tweens: Tweens, strong: boolean): Promise<void> {
    this.flash = 1;
    const push = strong ? 0.35 : 0.18;
    return tweens.to(260, (k) => {
      this.flash = 1 - k;
      this.lunge = -push * Math.sin(k * Math.PI);
    }, { easing: ease.linear });
  }

  async die(tweens: Tweens): Promise<void> {
    this.dying = true;
    this.charging = false;
    const mats: THREE.Material[] = [];
    this.rig.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !mats.includes(m)) mats.push(m);
    });
    mats.forEach((m) => {
      m.transparent = true;
      m.needsUpdate = true;
    });
    const body = this.rig.body;
    const startY = body.position.y;
    const light = this.rig.light;
    await tweens.to(750, (k) => {
      if (this.rig.kind === 'humanoid' || this.rig.kind === 'golem') body.rotation.x = -k * 1.3;
      else body.rotation.z = k * 0.6;
      body.position.y = startY - k * (this.rig.kind === 'eye' ? 1.2 : 0.3);
      const opacity = 1 - ease.inQuad(k);
      mats.forEach((m) => ((m as THREE.MeshStandardMaterial).opacity = opacity));
      if (light) light.intensity = this.baseLight * (1 - k);
    }, { easing: ease.outQuad });
  }

  private restoreEmissive(): void {
    for (const b of this.baseEmissive) {
      b.m.emissive.copy(b.color);
      b.m.emissiveIntensity = b.intensity;
    }
    if (this.rig.light) this.rig.light.intensity = this.baseLight;
  }

  update(dt: number, t: number, camera: THREE.Vector3): void {
    if (this.dying) return;
    const r = this.rig;
    const time = t + this.phase;

    // 面向攝影機（平滑轉身）
    const target = Math.atan2(camera.x - r.root.position.x, camera.z - r.root.position.z);
    this.yaw = lerpAngle(this.yaw, target, Math.min(1, dt * 6));
    r.root.rotation.y = this.yaw;

    // 衝刺位移（沿面向方向）
    r.body.position.z = this.lunge;

    switch (r.kind) {
      case 'humanoid':
      case 'golem':
        this.animateBiped(time);
        break;
      case 'spider': {
        r.body.position.y = 0.5 + Math.sin(time * 3) * 0.02 + this.windup * 0.25;
        r.body.rotation.x = -this.windup * 0.4;
        r.groups.legs?.forEach((leg) => {
          const ph = leg.userData.phase as number;
          leg.rotation.z = Math.sin(time * (this.walk ? 14 : 3) + ph) * (this.walk ? 0.2 : 0.05);
          leg.rotation.x = Math.cos(time * (this.walk ? 14 : 3) + ph) * (this.walk ? 0.15 : 0.03);
        });
        if (r.parts.jaw) r.parts.jaw.rotation.x = Math.sin(time * 8) * 0.08 + this.windup * 0.3;
        break;
      }
      case 'hound': {
        r.body.position.y = Math.sin(time * 4) * 0.015 - this.windup * 0.12;
        r.body.rotation.x = this.windup * 0.15;
        r.groups.legs?.forEach((leg) => {
          const ph = leg.userData.phase as number;
          leg.rotation.x = Math.sin(time * (this.walk ? 14 : 0) + ph) * 0.4;
        });
        r.groups.heads?.forEach((h) => {
          const ph = h.userData.phase as number;
          h.rotation.x = Math.sin(time * 2 + ph) * 0.1 - this.windup * 0.3;
          h.rotation.y = Math.sin(time * 1.3 + ph) * 0.15;
          const jaw = h.userData.jaw as THREE.Object3D;
          jaw.rotation.x = 0.1 + Math.max(0, Math.sin(time * 3 + ph)) * 0.2 + this.windup * 0.4;
        });
        if (r.parts.tail) r.parts.tail.rotation.y = Math.sin(time * 6) * 0.4;
        break;
      }
      case 'eye': {
        r.body.position.y = 1.35 + Math.sin(time * 1.6) * 0.08;
        const pulse = 1 + Math.sin(time * 2.4) * 0.08 + this.windup * 0.5;
        if (r.parts.iris) r.parts.iris.scale.setScalar(pulse);
        r.groups.tentacles?.forEach((tn) => {
          const ph = tn.userData.phase as number;
          let seg: THREE.Object3D | undefined = tn.children.find((c) => c.type === 'Group');
          let depth = 0;
          while (seg) {
            seg.rotation.x = Math.sin(time * 2 + ph + depth * 0.7) * 0.25;
            seg.rotation.z = Math.cos(time * 1.7 + ph + depth * 0.6) * 0.2;
            seg = seg.children.find((c) => c.type === 'Group');
            depth++;
          }
        });
        break;
      }
    }

    const cape = r.parts.cape;
    if (cape) cape.rotation.x = 0.12 + Math.sin(time * 1.8) * 0.06 + this.lunge * 0.4;
    const ring = r.root.userData.auraRing as THREE.Mesh | undefined;
    if (ring) {
      ring.rotation.z += dt * 0.8;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(time * 3) * 0.1;
    }

    // 受擊閃白 / 蓄力發紅
    if (this.flash > 0 || this.charging) {
      this.tinted = true;
      const pulse = this.charging ? 0.5 + 0.5 * Math.sin(time * 10) : 0;
      for (const b of this.baseEmissive) {
        if (this.flash > 0) {
          b.m.emissive.setRGB(1, 0.85, 0.75);
          b.m.emissiveIntensity = this.flash * 0.55;
        } else {
          b.m.emissive.setRGB(1, 0.15, 0.05);
          b.m.emissiveIntensity = b.intensity * 0.5 + pulse * 0.6;
        }
      }
      if (this.rig.light) this.rig.light.intensity = this.baseLight + pulse * 4;
    } else if (this.tinted) {
      this.tinted = false;
      this.restoreEmissive();
    }
  }

  private animateBiped(time: number): void {
    const p = this.rig.parts;
    const golem = this.rig.kind === 'golem';
    const breathe = Math.sin(time * (golem ? 1.2 : 2.2));
    this.rig.body.position.y = breathe * 0.012;
    if (p.spine) p.spine.rotation.x = (p.spine.userData.base ??= p.spine.rotation.x) + breathe * 0.025 - this.windup * 0.25 + this.lunge * 0.3;
    if (p.head) {
      p.head.rotation.y = Math.sin(time * 0.7) * 0.25;
      p.head.rotation.x = Math.sin(time * 1.1) * 0.05;
    }
    if (p.jaw) p.jaw.rotation.x = Math.max(0, Math.sin(time * 1.5)) * 0.15 + this.windup * 0.3;
    // 右手揮擊：蓄力時高舉，出手時下劈
    if (p.armR) p.armR.rotation.x = lerp(Math.sin(time * 1.6) * 0.06, -2.6, this.windup) + this.lunge * 2.2;
    if (p.armL) p.armL.rotation.x = Math.sin(time * 1.6 + 1) * 0.06 - this.windup * 0.4;
    if (p.armR) p.armR.rotation.z = -0.15;
    if (p.armL) p.armL.rotation.z = 0.15;
    const stride = this.walk ? Math.sin(time * 12) * 0.5 : 0;
    if (p.legL) p.legL.rotation.x = stride;
    if (p.legR) p.legR.rotation.x = -stride;
  }

  dispose(): void {
    this.rig.root.removeFromParent();
    this.rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | undefined;
      m?.dispose();
    });
  }
}
