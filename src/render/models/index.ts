import type { ModelSpec } from '../../data/monsters';
import { buildEye, buildGolem, buildHound, buildSpider } from './beasts';
import { buildHumanoid } from './humanoid';
import type { Rig } from './rig';

export function buildMonsterRig(spec: ModelSpec): Rig {
  switch (spec.kind) {
    case 'humanoid':
      return buildHumanoid(spec);
    case 'spider':
      return buildSpider(spec);
    case 'hound':
      return buildHound(spec);
    case 'golem':
      return buildGolem(spec);
    case 'eye':
      return buildEye(spec);
  }
}

export type { Rig } from './rig';
