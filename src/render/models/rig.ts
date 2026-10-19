import type * as THREE from 'three';
import type { ModelSpec } from '../../data/monsters';
import type { Kit } from './kit';

export type PartName =
  | 'spine' | 'head' | 'jaw' | 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'legL' | 'legR' | 'weapon' | 'cape'
  | 'tail' | 'iris' | 'tentacles' | 'legs' | 'heads' | 'aura';

/** 程序化模型的骨架：root 擺放在格子上，body 做動畫位移 */
export interface Rig {
  kind: ModelSpec['kind'];
  root: THREE.Group;
  body: THREE.Group;
  parts: Partial<Record<PartName, THREE.Object3D>>;
  /** 多個同類部位（蜘蛛腳、觸手、多頭） */
  groups: Partial<Record<'legs' | 'tentacles' | 'heads', THREE.Object3D[]>>;
  /** 頭頂高度（世界單位，已含縮放） */
  height: number;
  kit: Kit;
  light?: THREE.PointLight;
}
