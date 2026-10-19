import { describe, expect, it } from 'vitest';
import { duel, simulateRun } from './sim';

describe('數值平衡（自動對戰模擬）', () => {
  it('1F 普通怪不會秒殺新手，且新手能穩定獲勝', () => {
    for (const key of ['goblin', 'goblinArcher', 'skeleton']) {
      const r = duel(key, 1, 1, 300);
      expect(r.winRate).toBeGreaterThan(0.97);
      expect(r.avgTurns).toBeGreaterThanOrEqual(2);
    }
  });

  it('同級一般怪戰鬥長度落在 3~10 回合（菁英怪 12 回合內），即使只穿新手裝', () => {
    const cases: [string, number, number][] = [['goblinFighter', 5, 10], ['ghoul', 9, 10], ['ogre', 12, 10], ['cerberus', 15, 10], ['ogreKing', 21, 12]];
    for (const [key, lv, maxTurns] of cases) {
      const r = duel(key, lv, lv, 200);
      expect(r.avgTurns, key).toBeGreaterThanOrEqual(3);
      expect(r.avgTurns, key).toBeLessThanOrEqual(maxTurns);
      expect(r.winRate, key).toBeGreaterThan(0.85);
    }
  });

  it('合理策略可在有限死亡次數內通關，通關等級落在 Lv22~32', () => {
    const runs = Array.from({ length: 12 }, (_, i) => simulateRun((i + 1) * 7919));
    const cleared = runs.filter((r) => r.cleared);
    expect(cleared.length).toBeGreaterThanOrEqual(11);
    const avgDeaths = runs.reduce((s, r) => s + r.deaths, 0) / runs.length;
    expect(avgDeaths).toBeLessThan(4);
    for (const r of cleared) {
      expect(r.finalLevel).toBeGreaterThanOrEqual(22);
      expect(r.finalLevel).toBeLessThanOrEqual(32);
      expect(r.avgTurnsPerFight).toBeLessThan(9);
      // 死亡騎士戰不應拖到 60 回合以上
      for (const b of r.bossFights.filter((f) => f.won)) expect(b.turns).toBeLessThan(60);
    }
  });

  it('首領若在等級不足時挑戰應該很難取勝', () => {
    const r = duel('deathKnight', 26, 14, 100);
    expect(r.winRate).toBeLessThan(0.05);
  });
});
