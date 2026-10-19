import * as THREE from 'three';
import { glow, slashArc } from './textures';
import { ease, type Tweens } from './Tween';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  age: number;
  gravity: number;
  drag: number;
}

export interface BurstOptions {
  color: number;
  count?: number;
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  /** 向上偏移的初速 */
  lift?: number;
  spread?: number;
  drag?: number;
}

/** 3D 特效：粒子爆發、刀光、投射物 */
export class Effects {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];

  constructor(private readonly tweens: Tweens) {}

  burst(at: THREE.Vector3, o: BurstOptions): void {
    const count = o.count ?? 24;
    const speed = o.speed ?? 2;
    const spread = o.spread ?? 0.15;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x + (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = at.y + (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const s = speed * (0.4 + Math.random() * 0.6);
      vel[i * 3] = dir.x * s;
      vel[i * 3 + 1] = dir.y * s + (o.lift ?? 0);
      vel[i * 3 + 2] = dir.z * s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: o.color, size: o.size ?? 0.09, map: glow(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.bursts.push({ points, velocities: vel, life: o.life ?? 0.8, age: 0, gravity: o.gravity ?? -2, drag: o.drag ?? 1.5 });
  }

  /** 從上而下環繞的升級光柱 */
  levelUp(at: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      this.burst(at.clone().add(new THREE.Vector3(0, -1.0 + i * 0.25, 0)), { color: 0xffd23a, count: 28, speed: 0.9, lift: 1.6, gravity: 0.4, life: 1.5, size: 0.035, spread: 2.2, drag: 0.6 });
    }
  }

  /** 在指定位置閃過一道刀光 */
  slash(at: THREE.Vector3, facing: THREE.Quaternion, color = 0xcfe6ff, big = false): void {
    const mat = new THREE.MeshBasicMaterial({ map: slashArc(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), mat);
    mesh.position.copy(at);
    mesh.renderOrder = 5;
    mesh.quaternion.copy(facing);
    mesh.rotateZ((Math.random() - 0.5) * 1.2 + (Math.random() < 0.5 ? 0 : Math.PI));
    const s0 = big ? 1.3 : 1;
    this.group.add(mesh);
    void this.tweens.to(260, (k) => {
      mesh.scale.setScalar(s0 * (0.7 + k * 0.6));
      mat.opacity = 1 - k;
    }, { easing: ease.outQuad }).then(() => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
    });
  }

  /** 由 from 飛向 to 的發光球（弓箭、法術、吐息） */
  async projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, size = 0.5, ms = 260): Promise<void> {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(size);
    this.group.add(sprite);
    let lastTrail = 0;
    await this.tweens.to(ms, (k) => {
      sprite.position.lerpVectors(from, to, k);
      sprite.position.y += Math.sin(k * Math.PI) * 0.15;
      if (k - lastTrail > 0.15) {
        lastTrail = k;
        this.burst(sprite.position, { color, count: 4, speed: 0.3, life: 0.35, size: size * 0.25, gravity: 0 });
      }
    }, { easing: ease.inQuad });
    sprite.removeFromParent();
    sprite.material.dispose();
  }

  update(dt: number): void {
    if (!this.bursts.length) return;
    this.bursts = this.bursts.filter((b) => {
      b.age += dt;
      const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const damp = Math.exp(-b.drag * dt);
      for (let i = 0; i < arr.length; i += 3) {
        b.velocities[i] *= damp;
        b.velocities[i + 1] = b.velocities[i + 1] * damp + b.gravity * dt;
        b.velocities[i + 2] *= damp;
        arr[i] += b.velocities[i] * dt;
        arr[i + 1] += b.velocities[i + 1] * dt;
        arr[i + 2] += b.velocities[i + 2] * dt;
      }
      attr.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age >= b.life) {
        b.points.removeFromParent();
        b.points.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  clear(): void {
    for (const b of this.bursts) {
      b.points.removeFromParent();
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
    }
    this.bursts = [];
  }
}
