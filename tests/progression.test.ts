import { describe, expect, it } from 'vitest';
import { createInitialPlayer } from '../src/core/state';
import { applyDeathPenalty, gainXp, getStats, knownSkills, MAX_LEVEL, xpToNext } from '../src/systems/progression';

describe('progression', () => {
  it('經驗曲線單調遞增', () => {
    for (let l = 1; l < MAX_LEVEL - 1; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it('一次獲得大量經驗可連續升級並補滿體力魔力，解鎖技能', () => {
    const p = createInitialPlayer();
    p.hp = 1;
    const ups = gainXp(p, xpToNext(1) + xpToNext(2) + xpToNext(3) + 1);
    expect(ups.map((u) => u.level)).toEqual([2, 3, 4]);
    expect(p.hp).toBe(getStats(p).maxHp);
    expect(ups[2].newSkills.map((s) => s.id)).toContain('shockStun');
    expect(knownSkills(p).length).toBe(2);
  });

  it('死亡懲罰扣經驗與金幣但不降級，並於村莊滿血復活', () => {
    const p = createInitialPlayer();
    gainXp(p, xpToNext(1) + 30);
    p.gold = 1000;
    p.hp = 0;
    const lvl = p.level;
    const pen = applyDeathPenalty(p);
    expect(p.level).toBe(lvl);
    expect(pen.goldLost).toBe(100);
    expect(p.xp).toBeGreaterThanOrEqual(0);
    expect(p.hp).toBe(getStats(p).maxHp);
    expect(p.stats.deaths).toBe(1);
  });
});
