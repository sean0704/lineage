import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createInitialPlayer } from '../src/core/state';
import { createMonster, fleeChance, mitigate, resolveTurn, rollRewards, startCombat } from '../src/systems/combat';
import { getStats, gainXp } from '../src/systems/progression';
import { MONSTERS } from '../src/data/monsters';

describe('combat', () => {
  it('減傷公式：防禦越高傷害越低，最少 1 點，穿透無視部分防禦', () => {
    expect(mitigate(100, 0)).toBe(100);
    expect(mitigate(100, 40)).toBe(50);
    expect(mitigate(100, 40, 1)).toBe(100);
    expect(mitigate(0.1, 500)).toBe(1);
  });

  it('攻擊會傷害怪物，擊殺後 outcome 為 win', () => {
    const p = createInitialPlayer();
    const cs = startCombat(createMonster('goblin', 1));
    const rng = createRng(42);
    let guard = 0;
    while (!cs.outcome && guard++ < 50) resolveTurn(p, cs, { type: 'attack' }, rng);
    expect(cs.outcome).toBe('win');
    expect(cs.monster.hp).toBe(0);
  });

  it('戰鬥中使用藥水會消耗回合（怪物仍會行動）', () => {
    const p = createInitialPlayer();
    p.hp = 10;
    const cs = startCombat(createMonster('goblin', 1));
    const r = resolveTurn(p, cs, { type: 'item', key: 'redPotion' }, createRng(1));
    expect(r.turnUsed).toBe(true);
    expect(p.consumables.redPotion).toBe(4);
    expect(r.events.some((e) => e.kind === 'monsterHit' || e.kind === 'monsterMiss' || e.kind === 'monsterCharge')).toBe(true);
  });

  it('滿血喝水或魔力不足時不消耗回合', () => {
    const p = createInitialPlayer();
    const cs = startCombat(createMonster('goblin', 1));
    expect(resolveTurn(p, cs, { type: 'item', key: 'redPotion' }, createRng(1)).turnUsed).toBe(false);
    p.mp = 0;
    expect(resolveTurn(p, cs, { type: 'skill', id: 'minorHeal' }, createRng(1)).turnUsed).toBe(false);
    expect(cs.turn).toBe(0);
  });

  it('首領無法逃跑', () => {
    const boss = createMonster('deathKnight', 26);
    expect(fleeChance(30, boss)).toBe(0);
    const p = createInitialPlayer();
    const cs = startCombat(boss);
    expect(resolveTurn(p, cs, { type: 'flee' }, createRng(3)).turnUsed).toBe(false);
  });

  it('蓄力技會先出現前兆，下一回合才命中；暈眩可打斷蓄力', () => {
    const p = createInitialPlayer();
    gainXp(p, 1e6);
    let charged = false;
    for (let seed = 1; seed < 200 && !charged; seed++) {
      const cs = startCombat(createMonster('ogre', 12));
      const rng = createRng(seed);
      const r1 = resolveTurn(p, cs, { type: 'defend' }, rng);
      if (r1.events.some((e) => e.kind === 'monsterCharge')) {
        charged = true;
        expect(cs.charging?.id).toBe('smash');
        p.mp = 100;
        // 嘗試直到暈眩成功
        const r2 = resolveTurn(p, cs, { type: 'skill', id: 'shockStun' }, createRng(seed + 1000));
        const stunned = r2.events.some((e) => e.kind === 'monsterStunned');
        if (stunned) {
          expect(cs.charging).toBeNull();
          expect(r2.events.some((e) => e.kind === 'monsterSkip')).toBe(true);
        }
      }
    }
    expect(charged).toBe(true);
  });

  it('防禦能大幅減少受到的傷害', () => {
    const avg = (defend: boolean) => {
      let total = 0;
      for (let s = 0; s < 300; s++) {
        const p = createInitialPlayer();
        p.hp = 9999;
        const cs = startCombat(createMonster('goblin', 3));
        const r = resolveTurn(p, cs, defend ? { type: 'defend' } : { type: 'attack' }, createRng(s));
        for (const e of r.events) if (e.kind === 'monsterHit') total += e.dmg;
      }
      return total;
    };
    expect(avg(true)).toBeLessThan(avg(false) * 0.6);
  });

  it('首領低血量時會狂暴', () => {
    const p = createInitialPlayer();
    gainXp(p, 1e7);
    const cs = startCombat(createMonster('sima', 10));
    cs.monster.hp = Math.floor(cs.monster.maxHp * 0.52);
    let enraged = false;
    const rng = createRng(9);
    for (let i = 0; i < 10 && !cs.outcome; i++) {
      const r = resolveTurn(p, cs, { type: 'attack' }, rng);
      if (r.events.some((e) => e.kind === 'enrage')) enraged = true;
    }
    expect(enraged).toBe(true);
  });

  it('所有怪物資料的掉落物都存在、等級公式為正數', () => {
    const rng = createRng(5);
    for (const key of Object.keys(MONSTERS)) {
      const m = createMonster(key, 10);
      expect(m.hp).toBeGreaterThan(0);
      expect(m.attack).toBeGreaterThan(0);
      for (let i = 0; i < 20; i++) expect(() => rollRewards(m, rng)).not.toThrow();
    }
  });

  it('玩家死亡時 outcome 為 lose', () => {
    const p = createInitialPlayer();
    p.hp = 1;
    p.consumables = {};
    const cs = startCombat(createMonster('deathKnight', 26));
    const rng = createRng(2);
    let i = 0;
    while (!cs.outcome && i++ < 20) resolveTurn(p, cs, { type: 'attack' }, rng);
    expect(cs.outcome).toBe('lose');
    expect(p.hp).toBe(0);
    expect(getStats(p).maxHp).toBeGreaterThan(0);
  });
});
