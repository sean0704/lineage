import * as THREE from 'three';
import { enhanceMaterial } from '../materialFx';
import { glow } from '../textures';

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  flat?: boolean;
}

/**
 * 模型建構工具：每個模型擁有自己的材質實例，
 * 才能各自做受擊閃白、蓄力發光與死亡淡出。
 */
export class Kit {
  readonly materials: THREE.MeshStandardMaterial[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  private readonly matCache = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${o.rough}|${o.metal}|${o.emissive}|${o.emissiveIntensity}|${o.flat}`;
    let m = this.matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: o.rough ?? 0.8,
        metalness: o.metal ?? 0.05,
        emissive: o.emissive ?? 0x000000,
        emissiveIntensity: o.emissiveIntensity ?? 1,
        flatShading: o.flat ?? true,
      });
      enhanceMaterial(m, { rim: true, groundAO: 0.45, mottle: o.emissive ? 0 : 0.16 });
      m.userData.baseEmissive = m.emissive.getHex();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      this.matCache.set(key, m);
      this.materials.push(m);
    }
    return m;
  }

  /** 自發光材質（眼睛、魔法、火焰） */
  glowMat(color: number, intensity = 2.5): THREE.MeshStandardMaterial {
    // 後製泛光會放大自發光，這裡的強度要保守
    return this.mat(color, { emissive: color, emissiveIntensity: intensity * 0.5, rough: 0.4 });
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    this.geometries.push(geo);
    return new THREE.Mesh(geo, mat);
  }

  /** 兩點之間的圓柱（四肢、骨頭、桿子） */
  limb(from: THREE.Vector3, to: THREE.Vector3, r1: number, r2: number, mat: THREE.Material, seg = 6): THREE.Mesh {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const m = this.mesh(new THREE.CylinderGeometry(r2, r1, len, seg), mat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  /** 加法混合的光暈貼片 */
  halo(color: number, size: number, opacity = 0.8): THREE.Sprite {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    s.scale.setScalar(size);
    return s;
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
