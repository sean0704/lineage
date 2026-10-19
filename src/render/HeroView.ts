import * as THREE from 'three';
import { Kit } from './models/kit';
import { buildWeapon, heroWeaponStyle } from './models/weapons';
import { ease, type Tweens } from './Tween';

const ENCHANT_GLOW = [0, 0, 0, 0x6ab8ff, 0x6ab8ff, 0x6ab8ff, 0x9a6aff, 0x9a6aff, 0xff6a3a, 0xff6a3a, 0xffd23a, 0xffd23a, 0xffd23a];

/**
 * 第一人稱持握的武器與盾牌（掛在攝影機底下）。
 * 只有武器本身擺動，攝影機不疊加任何搖晃。
 */
export class HeroView {
  readonly group = new THREE.Group();
  private weaponPivot = new THREE.Group();
  private shieldPivot = new THREE.Group();
  private kit = new Kit();
  private swing = 0;
  private guard = 0;
  private walkPhase = 0;
  private walking = 0;
  private key = '';

  constructor(camera: THREE.Camera) {
    camera.add(this.group);
    this.weaponPivot.position.set(0.4, -0.42, -0.62);
    this.shieldPivot.position.set(-0.5, -0.5, -0.66);
    this.group.add(this.weaponPivot, this.shieldPivot);
  }

  setEquipment(weaponKey: string | null, enchant: number, hasShield: boolean): void {
    const key = `${weaponKey}|${enchant}|${hasShield}`;
    if (key === this.key) return;
    this.key = key;
    this.weaponPivot.clear();
    this.shieldPivot.clear();
    this.kit.dispose();
    this.kit = new Kit();
    const accent = ENCHANT_GLOW[Math.min(enchant, ENCHANT_GLOW.length - 1)] || undefined;
    const weapon = buildWeapon(heroWeaponStyle(weaponKey), this.kit, accent);
    // 縮小並向外側傾斜，避免大型武器遮住視野
    weapon.rotation.set(-0.55, 0.3, -0.12);
    weapon.scale.setScalar(0.72);
    this.weaponPivot.add(weapon);
    if (hasShield) {
      const shield = this.kit.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 12), this.kit.mat(0x5a4632, { rough: 0.8 }));
      shield.rotation.x = Math.PI / 2;
      shield.rotation.z = 0.2;
      const rim = this.kit.mesh(new THREE.TorusGeometry(0.2, 0.016, 4, 16), this.kit.mat(0x9aa0aa, { metal: 0.8, rough: 0.35 }));
      rim.rotation.y = 0.2;
      this.shieldPivot.add(shield, rim);
    }
    // 第一人稱物件不受迷霧影響、永遠畫在最前
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        (m as THREE.MeshStandardMaterial).fog = false;
      }
      o.renderOrder = 10;
    });
  }

  setWalking(on: boolean): void {
    this.walking = on ? 1 : 0;
  }

  /** 揮砍：回傳在命中瞬間 resolve 的 Promise 與整段完成的 Promise */
  attack(tweens: Tweens, heavy = false): { impact: Promise<void>; done: Promise<void> } {
    let hitResolve!: () => void;
    const impact = new Promise<void>((r) => (hitResolve = r));
    const done = (async () => {
      await tweens.to(heavy ? 200 : 130, (k) => (this.swing = -k * 0.6), { easing: ease.outQuad });
      await tweens.to(110, (k) => (this.swing = -0.6 + k * 1.6), { easing: ease.inQuad });
      hitResolve();
      await tweens.to(260, (k) => (this.swing = 1 - k), { easing: ease.outCubic });
      this.swing = 0;
    })();
    return { impact, done };
  }

  async defend(tweens: Tweens, on: boolean): Promise<void> {
    const from = this.guard;
    await tweens.to(160, (k) => (this.guard = from + ((on ? 1 : 0) - from) * k));
  }

  update(dt: number): void {
    this.walkPhase += dt * (this.walking ? 11 : 1.4);
    const bobAmt = this.walking ? 0.02 : 0.006;
    const bob = Math.sin(this.walkPhase) * bobAmt;
    const s = this.swing;
    this.weaponPivot.position.set(0.4 - s * 0.32 - this.guard * 0.1, -0.42 + Math.abs(bob) + s * 0.08 + this.guard * 0.1, -0.62 - Math.max(0, s) * 0.12);
    this.weaponPivot.rotation.set(s * -0.9 + this.guard * 0.4, s * 0.6, s * 1.2 + this.guard * 0.9);
    this.shieldPivot.position.set(-0.5 + this.guard * 0.3, -0.5 + bob + this.guard * 0.24, -0.66 + this.guard * 0.12);
    this.shieldPivot.rotation.set(0, this.guard * 0.6, 0);
  }
}
