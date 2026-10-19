export type SkillEffect =
  | { type: 'strike'; power: number; accuracy: number }
  | { type: 'stun'; power: number; chance: number; bossChance: number }
  | { type: 'heal'; base: number; perLevel: number }
  | { type: 'guard'; turns: number; reduction: number }
  | { type: 'barrier'; turns: number; chance: number };

export interface SkillDef {
  id: string;
  name: string;
  level: number;
  mp: number;
  desc: string;
  effect: SkillEffect;
}

/** 騎士技能，依等級解鎖 */
export const SKILLS: SkillDef[] = [
  { id: 'minorHeal', name: '初級治癒術', level: 1, mp: 6, desc: '以神聖之力恢復體力（20 + 等級×4）。', effect: { type: 'heal', base: 20, perLevel: 4 } },
  { id: 'shockStun', name: '衝擊之暈', level: 4, mp: 8, desc: '以劍柄重擊，造成 60% 傷害並有機率使敵人暈眩 1 回合（首領較難）。', effect: { type: 'stun', power: 0.6, chance: 0.75, bossChance: 0.3 } },
  { id: 'powerStrike', name: '破壞之擊', level: 8, mp: 10, desc: '集中全力的一擊，造成 190% 傷害且命中率提升。', effect: { type: 'strike', power: 1.9, accuracy: 0.15 } },
  { id: 'reductionArmor', name: '增幅防禦', level: 12, mp: 14, desc: '5 回合內受到的傷害降低 40%。', effect: { type: 'guard', turns: 5, reduction: 0.4 } },
  { id: 'counterBarrier', name: '反擊屏障', level: 16, mp: 18, desc: '4 回合內受到攻擊時有 45% 機率完全格擋並反擊。', effect: { type: 'barrier', turns: 4, chance: 0.45 } },
];

export function getSkill(id: string): SkillDef {
  const s = SKILLS.find((sk) => sk.id === id);
  if (!s) throw new Error(`Unknown skill: ${id}`);
  return s;
}
