import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createInitialPlayer } from '../src/core/state';
import { addItem, buy, enchantGear, enchantSuccessChance, equip, sellGear, unequip, useConsumable } from '../src/systems/inventory';
import { getStats } from '../src/systems/progression';
import { ITEMS } from '../src/data/items';

describe('inventory', () => {
  it('消耗品堆疊、裝備為獨立實例', () => {
    const p = createInitialPlayer();
    addItem(p, 'redPotion', 3);
    expect(p.consumables.redPotion).toBe(8);
    addItem(p, 'longSword', 2);
    expect(p.bag.filter((g) => g.key === 'longSword')).toHaveLength(2);
    expect(new Set(p.bag.map((g) => g.uid)).size).toBe(p.bag.length);
  });

  it('裝備替換會把舊裝備放回背包，攻擊力隨之改變', () => {
    const p = createInitialPlayer();
    const atk = getStats(p).attack;
    const sword = addItem(p, 'longSword')!;
    expect(equip(p, sword.uid).ok).toBe(true);
    expect(getStats(p).attack).toBe(atk - 3 + 8);
    expect(p.bag.some((g) => g.key === 'dagger')).toBe(true);
    unequip(p, 'weapon');
    expect(p.equipped.weapon).toBeNull();
  });

  it('卸下加血裝備時體力會被夾回上限', () => {
    const p = createInitialPlayer();
    const shield = addItem(p, 'shieldOfAntharas')!;
    equip(p, shield.uid);
    p.hp = getStats(p).maxHp;
    unequip(p, 'shield');
    expect(p.hp).toBe(getStats(p).maxHp);
  });

  it('滿血時不能喝紅水，戰鬥外不能用翡翠藥水', () => {
    const p = createInitialPlayer();
    expect(useConsumable(p, 'redPotion', { inCombat: false }).ok).toBe(false);
    p.hp -= 50;
    expect(useConsumable(p, 'redPotion', { inCombat: false }).ok).toBe(true);
    addItem(p, 'antidote');
    expect(useConsumable(p, 'antidote', { inCombat: false }).ok).toBe(false);
  });

  it('戰鬥中不能使用傳送卷軸', () => {
    const p = createInitialPlayer();
    expect(useConsumable(p, 'teleportHomeScroll', { inCombat: true }).ok).toBe(false);
    const r = useConsumable(p, 'teleportHomeScroll', { inCombat: false });
    expect(r.ok && r.teleport).toBe(true);
  });

  it('衝裝：安定值內必成功，超過後可能蒸發；武器卷軸不能衝防具', () => {
    expect(enchantSuccessChance(0, 'weapon')).toBe(1);
    expect(enchantSuccessChance(5, 'weapon')).toBe(1);
    expect(enchantSuccessChance(6, 'weapon')).toBeLessThan(1);
    expect(enchantSuccessChance(4, 'armor')).toBeLessThan(1);

    const p = createInitialPlayer();
    addItem(p, 'scrollEnchantWeapon', 30);
    const weapon = p.equipped.weapon!;
    const armor = p.equipped.armor!;
    expect(enchantGear(p, armor.uid, 'scrollEnchantWeapon', createRng(1)).outcome).toBe('invalid');
    const rng = createRng(3);
    for (let i = 0; i < 6; i++) expect(enchantGear(p, weapon.uid, 'scrollEnchantWeapon', rng).outcome).toBe('success');
    expect(weapon.enchant).toBe(6);
    let evaporated = false;
    for (let i = 0; i < 20 && !evaporated; i++) {
      evaporated = enchantGear(p, weapon.uid, 'scrollEnchantWeapon', rng).outcome === 'evaporated';
    }
    expect(evaporated).toBe(true);
    expect(p.equipped.weapon).toBeNull();
  });

  it('買賣：金幣不足無法購買；只能賣背包中的裝備', () => {
    const p = createInitialPlayer();
    p.gold = 10;
    expect(buy(p, 'redPotion').ok).toBe(false);
    p.gold = 1000;
    expect(buy(p, 'redPotion', 2).ok).toBe(true);
    expect(p.gold).toBe(1000 - ITEMS.redPotion.price * 2);
    expect(sellGear(p, p.equipped.weapon!.uid).ok).toBe(false);
    const g = addItem(p, 'longSword')!;
    expect(sellGear(p, g.uid).ok).toBe(true);
  });
});
