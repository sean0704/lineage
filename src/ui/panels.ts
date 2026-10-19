import type { GearItem, PlayerState } from '../core/state';
import { getItem, isEquip, ITEMS, RARITY_NAMES, sellPrice, SLOT_NAMES, SLOTS, type ConsumableDef, type EquipDef, type Slot } from '../data/items';
import { SHOP_STOCK } from '../data/shop';
import { getFloor } from '../data/floors';
import { canEnchant, countOf, enchantSuccessChance } from '../systems/inventory';
import { SKILLS } from '../data/skills';
import { btn, h } from './dom';
import { itemIcon, slotIcon } from './icons';
import type { Modal } from './Modal';

export interface PanelHost {
  readonly player: PlayerState;
  readonly modal: Modal;
  readonly inCombat: boolean;
  readonly inVillage: boolean;
  useItem(key: string): void;
  equip(uid: string): void;
  unequip(slot: Slot): void;
  enchant(uid: string, scrollKey: string): void;
  buy(key: string, qty: number): void;
  sellConsumable(key: string, qty: number): void;
  sellGear(uid: string): void;
}


export function gearStatText(def: EquipDef, enchant = 0): string {
  const parts: string[] = [];
  const isWeapon = def.slot === 'weapon';
  const atk = (def.attack ?? 0) + (isWeapon ? enchant * 2 : 0);
  const dfn = (def.defense ?? 0) + (isWeapon ? 0 : enchant);
  if (atk) parts.push(`攻擊 +${atk}`);
  if (dfn) parts.push(`防禦 +${dfn}`);
  if (def.maxHp) parts.push(`體力上限 +${def.maxHp}`);
  if (def.maxMp) parts.push(`魔力上限 +${def.maxMp}`);
  return parts.join('　') || '—';
}

function gearPower(g: GearItem | null): { atk: number; def: number } {
  if (!g) return { atk: 0, def: 0 };
  const d = getItem(g.key) as EquipDef;
  const isWeapon = d.slot === 'weapon';
  return { atk: (d.attack ?? 0) + (isWeapon ? g.enchant * 2 : 0), def: (d.defense ?? 0) + (isWeapon ? 0 : g.enchant) };
}

function diffNode(g: GearItem, equipped: GearItem | null): HTMLElement {
  const a = gearPower(g);
  const b = gearPower(equipped);
  const parts: HTMLElement[] = [];
  const push = (label: string, d: number) => {
    if (d !== 0) parts.push(h('span', { class: d > 0 ? 'c-good' : 'c-bad', text: `${label}${d > 0 ? '+' : ''}${d} ` }));
  };
  push('攻擊', a.atk - b.atk);
  push('防禦', a.def - b.def);
  if (!parts.length) parts.push(h('span', { class: 'c-dim', text: '與目前裝備相同' }));
  return h('span', {}, '比較：', ...parts);
}

function itemName(key: string, enchant = 0): HTMLElement {
  const def = getItem(key);
  return h('span', { class: `row__name r-${def.rarity}`, text: enchant > 0 ? `+${enchant} ${def.name}` : def.name });
}

// ───────────────── 背包 ─────────────────

export function openInventory(host: PanelHost, tab: 'items' | 'gear' = 'items'): void {
  const render = (t: 'items' | 'gear'): HTMLElement => {
    const tabs = h('div', { class: 'tabs', attrs: { role: 'tablist' } },
      h('button', { class: `tab${t === 'items' ? ' is-active' : ''}`, type: 'button', text: '道具', on: { click: () => host.modal.replaceBody(render('items')) } }),
      h('button', { class: `tab${t === 'gear' ? ' is-active' : ''}`, type: 'button', text: '裝備', on: { click: () => host.modal.replaceBody(render('gear')) } }),
    );
    return h('div', {}, tabs, t === 'items' ? itemsTab(host, () => host.modal.replaceBody(render('items'))) : gearTab(host, () => host.modal.replaceBody(render('gear'))));
  };
  host.modal.open({ title: '冒險者背包', body: render(tab), wide: true });
}

function itemsTab(host: PanelHost, rerender: () => void): HTMLElement {
  const p = host.player;
  const keys = Object.keys(p.consumables).filter((k) => countOf(p, k) > 0);
  if (!keys.length) return h('p', { class: 'empty', text: '背包裡沒有任何道具。' });
  keys.sort((a, b) => Object.keys(ITEMS).indexOf(a) - Object.keys(ITEMS).indexOf(b));
  const list = h('ul', { class: 'list' });
  for (const key of keys) {
    const def = getItem(key) as ConsumableDef;
    const isEnchant = def.effect.type === 'enchant';
    const blocked = host.inCombat && (!def.combat || isEnchant);
    const action = btn(isEnchant ? '施法' : '使用', () => {
      if (isEnchant) openEnchantPicker(host, key, rerender);
      else {
        host.useItem(key);
        if (host.modal.isOpen && !host.inCombat) rerender();
      }
    }, { variant: 'success', disabled: blocked, title: blocked ? '戰鬥中無法使用' : undefined });
    action.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(key)),
      h('div', { class: 'row__main' }, itemName(key), h('span', { class: 'c-dim', text: ` ×${countOf(p, key)}` }), h('div', { class: 'row__meta', text: def.desc })),
      h('div', { class: 'row__actions' }, action),
    ));
  }
  return list;
}

function gearTab(host: PanelHost, rerender: () => void): HTMLElement {
  const p = host.player;
  const wrap = h('div');
  if (host.inCombat) wrap.append(h('p', { class: 'row__meta c-warn', text: '⚠ 戰鬥中無法更換裝備。' }));
  wrap.append(h('h3', { class: 'section-title', text: '目前裝備' }));
  const doll = h('div', { class: 'paperdoll' });
  for (const slot of SLOTS) {
    const g = p.equipped[slot];
    const def = g ? (getItem(g.key) as EquipDef) : null;
    const off = btn('卸下', () => { host.unequip(slot); rerender(); }, { variant: 'neutral', disabled: !g || host.inCombat });
    off.classList.add('btn--sm');
    doll.append(h('div', { class: 'row' },
      h('span', { class: `row__icon${def ? ` r-border-${def.rarity}` : ''}` }, g ? itemIcon(g.key) : slotIcon(slot)),
      h('div', { class: 'row__main' },
        g ? itemName(g.key, g.enchant) : h('span', { class: 'row__name c-dim', text: '（未裝備）' }),
        h('div', { class: 'row__meta', text: `${SLOT_NAMES[slot]}${def ? `　${gearStatText(def, g!.enchant)}` : ''}` })),
      g ? h('div', { class: 'row__actions' }, off) : null,
    ));
  }
  wrap.append(doll);

  wrap.append(h('h3', { class: 'section-title', text: `背包中的裝備（${p.bag.length}）` }));
  if (!p.bag.length) {
    wrap.append(h('p', { class: 'empty', text: '沒有多餘的裝備。擊敗怪物或開啟寶箱來取得吧。' }));
    return wrap;
  }
  const sorted = [...p.bag].sort((a, b) => {
    const da = getItem(a.key) as EquipDef;
    const db = getItem(b.key) as EquipDef;
    return SLOTS.indexOf(da.slot) - SLOTS.indexOf(db.slot) || gearPower(b).atk + gearPower(b).def - (gearPower(a).atk + gearPower(a).def);
  });
  const list = h('ul', { class: 'list' });
  for (const g of sorted) {
    const def = getItem(g.key) as EquipDef;
    const on = btn('裝備', () => { host.equip(g.uid); rerender(); }, { variant: 'primary', disabled: host.inCombat });
    on.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(g.key)),
      h('div', { class: 'row__main' }, itemName(g.key, g.enchant),
        h('div', { class: 'row__meta', text: `${SLOT_NAMES[def.slot]}・${RARITY_NAMES[def.rarity]}　${gearStatText(def, g.enchant)}` }),
        h('div', { class: 'row__meta' }, diffNode(g, p.equipped[def.slot]))),
      h('div', { class: 'row__actions' }, on),
    ));
  }
  wrap.append(list);
  return wrap;
}

// ───────────────── 衝裝 ─────────────────

export function openEnchantPicker(host: PanelHost, scrollKey: string, back?: () => void): void {
  const p = host.player;
  const scroll = getItem(scrollKey);
  const all: GearItem[] = [...SLOTS.map((s) => p.equipped[s]).filter((g): g is GearItem => !!g), ...p.bag];
  const eligible = all.filter((g) => canEnchant(g, scrollKey));
  const list = h('ul', { class: 'list' });
  if (!eligible.length) list.append(h('li', { class: 'empty', text: '沒有可以施法的裝備。' }));
  for (const g of eligible) {
    const def = getItem(g.key) as EquipDef;
    const chance = enchantSuccessChance(g.enchant, def.slot === 'weapon' ? 'weapon' : 'armor');
    const equipped = Object.values(p.equipped).some((e) => e?.uid === g.uid);
    const risky = chance < 1;
    const b = btn(risky ? `施法（${Math.round(chance * 100)}%）` : '施法', () => {
      host.enchant(g.uid, scrollKey);
      if (countOf(p, scrollKey) > 0) openEnchantPicker(host, scrollKey, back);
      else host.modal.close();
    }, { variant: risky ? 'danger' : 'gold', disabled: host.inCombat });
    b.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(g.key)),
      h('div', { class: 'row__main' }, itemName(g.key, g.enchant), equipped ? h('span', { class: 'c-dim', text: '（裝備中）' }) : null,
        h('div', { class: `row__meta${risky ? ' c-bad' : ''}`, text: risky ? `已超過安定值！失敗時裝備會蒸發消失。成功率 ${Math.round(chance * 100)}%` : '安定值內，必定成功。' })),
      h('div', { class: 'row__actions' }, b),
    ));
  }
  const actions = back ? [btn('返回背包', () => openInventory(host, 'items'), { variant: 'neutral' })] : [];
  host.modal.open({
    title: `${scroll.name}（剩餘 ${countOf(p, scrollKey)}）`,
    body: h('div', {}, h('p', { class: 'row__meta', text: '選擇要施法的裝備。武器每 +1 攻擊 +2；防具每 +1 防禦 +1。' }), list),
    actions,
  });
}

// ───────────────── 商店 ─────────────────

export function openShop(host: PanelHost, tab: 'buy' | 'sell' = 'buy'): void {
  const render = (t: 'buy' | 'sell'): HTMLElement => {
    const rerender = () => host.modal.replaceBody(render(t));
    const tabs = h('div', { class: 'tabs' },
      h('button', { class: `tab${t === 'buy' ? ' is-active' : ''}`, type: 'button', text: '購買', on: { click: () => host.modal.replaceBody(render('buy')) } }),
      h('button', { class: `tab${t === 'sell' ? ' is-active' : ''}`, type: 'button', text: '販賣', on: { click: () => host.modal.replaceBody(render('sell')) } }),
      h('span', { class: 'gold', style: { marginLeft: 'auto', alignSelf: 'center' }, text: host.player.gold.toLocaleString() }),
    );
    return h('div', {}, tabs, t === 'buy' ? shopBuy(host, rerender) : shopSell(host, rerender));
  };
  host.modal.open({ title: '奇岩村雜貨商', body: render(tab), wide: true });
}

function shopBuy(host: PanelHost, rerender: () => void): HTMLElement {
  const p = host.player;
  const list = h('ul', { class: 'list' });
  for (const { item, minFloor } of SHOP_STOCK) {
    const def = getItem(item);
    const locked = minFloor > p.deepestFloor;
    const meta = isEquip(def) ? `${SLOT_NAMES[def.slot]}　${gearStatText(def)}` : def.desc;
    const actions = h('div', { class: 'row__actions' });
    if (locked) {
      actions.append(h('span', { class: 'row__meta', text: `抵達 ${minFloor}F 後進貨` }));
    } else {
      const qtys = isEquip(def) ? [1] : [1, 5];
      for (const q of qtys) {
        const b = btn(q === 1 ? '購買' : `×${q}`, () => { host.buy(item, q); rerender(); }, { variant: 'success', disabled: p.gold < def.price * q });
        b.classList.add('btn--sm');
        actions.append(b);
      }
    }
    const owned = isEquip(def) ? p.bag.filter((g) => g.key === item).length + SLOTS.filter((s) => p.equipped[s]?.key === item).length : countOf(p, item);
    list.append(h('li', { class: 'row', style: locked ? { opacity: '0.5' } : undefined },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(item)),
      h('div', { class: 'row__main' }, itemName(item), h('span', { class: 'c-gold', text: `　${def.price.toLocaleString()} 金幣` }),
        owned ? h('span', { class: 'c-dim', text: `（持有 ${owned}）` }) : null,
        h('div', { class: 'row__meta', text: meta })),
      actions,
    ));
  }
  return list;
}

function shopSell(host: PanelHost, rerender: () => void): HTMLElement {
  const p = host.player;
  const list = h('ul', { class: 'list' });
  for (const key of Object.keys(p.consumables)) {
    const n = countOf(p, key);
    if (n <= 0) continue;
    const def = getItem(key) as ConsumableDef;
    const price = sellPrice(def);
    const one = btn('賣出', () => { host.sellConsumable(key, 1); rerender(); }, { variant: 'neutral' });
    const all = btn(`全部 ×${n}`, () => { host.sellConsumable(key, n); rerender(); }, { variant: 'neutral' });
    one.classList.add('btn--sm');
    all.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(key)),
      h('div', { class: 'row__main' }, itemName(key), h('span', { class: 'c-dim', text: ` ×${n}` }), h('div', { class: 'row__meta c-gold', text: `售價 ${price} 金幣` })),
      h('div', { class: 'row__actions' }, one, n > 1 ? all : null),
    ));
  }
  for (const g of p.bag) {
    const def = getItem(g.key) as EquipDef;
    const b = btn('賣出', () => { host.sellGear(g.uid); rerender(); }, { variant: 'neutral' });
    b.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: `row__icon r-border-${def.rarity}` }, itemIcon(g.key)),
      h('div', { class: 'row__main' }, itemName(g.key, g.enchant), h('div', { class: 'row__meta' }, `${gearStatText(def, g.enchant)}　`, h('span', { class: 'c-gold', text: `售價 ${sellPrice(def, g.enchant).toLocaleString()} 金幣` }))),
      h('div', { class: 'row__actions' }, b),
    ));
  }
  if (!list.children.length) return h('p', { class: 'empty', text: '沒有可以販賣的物品（身上的裝備需先卸下）。' });
  return list;
}

// ───────────────── 其他 ─────────────────

export function teleportBody(deepest: number, onPick: (floor: number) => void): HTMLElement {
  const list = h('ul', { class: 'list' });
  for (let f = 1; f <= deepest; f++) {
    const def = getFloor(f);
    const b = btn(`前往 ${f}F`, () => onPick(f), { variant: f === deepest ? 'gold' : 'primary' });
    b.classList.add('btn--sm');
    list.append(h('li', { class: 'row' },
      h('span', { class: 'row__icon', text: def.boss ? '👑' : '🕯️' }),
      h('div', { class: 'row__main' }, h('span', { class: 'row__name', text: `古魯丁地監 地下 ${f} 層` }),
        h('div', { class: 'row__meta', text: `${def.theme.name}・怪物等級 ${def.levelRange[0]}–${def.levelRange[1]}${def.boss ? '・首領樓層' : ''}` })),
      h('div', { class: 'row__actions' }, b),
    ));
  }
  return h('div', {}, h('p', { class: 'row__meta', text: '村莊的傳送師可以把你送到曾經抵達過的樓層入口。' }), list);
}

export function helpBody(): HTMLElement {
  const rows: [string, string][] = [
    ['W / ↑', '前進'], ['S / ↓', '後退'], ['A / ←', '左轉'], ['D / →', '右轉'], ['Q / E', '左右平移'],
    ['Enter / 空白鍵', '確認（樓梯）／戰鬥中攻擊'], ['1 – 8', '快捷道具'], ['Z X C V B', '戰鬥技能'], ['F', '防禦'], ['R', '逃跑'],
    ['I', '背包與裝備'], ['M', '地圖'], ['Esc', '選單／關閉視窗'],
  ];
  const grid = h('div', { class: 'help-grid' });
  for (const [k, v] of rows) grid.append(h('kbd', { text: k }), h('span', { text: v }));
  const skills = h('ul', { class: 'list' });
  for (const s of SKILLS) {
    skills.append(h('li', { class: 'row' }, h('span', { class: 'row__icon', text: '✦' }),
      h('div', { class: 'row__main' }, h('span', { class: 'row__name', text: s.name }), h('span', { class: 'c-dim', text: `　Lv.${s.level} 習得・MP ${s.mp}` }), h('div', { class: 'row__meta', text: s.desc }))));
  }
  return h('div', {},
    h('h3', { class: 'section-title', text: '操作' }), grid,
    h('h3', { class: 'section-title', text: '冒險要訣' }),
    h('ul', { class: 'row__meta', style: { paddingLeft: '1.1rem', lineHeight: '1.8' } },
      h('li', { text: '撞上怪物或被怪物追上就會進入回合制戰鬥；在戰鬥中喝水也會消耗一回合。' }),
      h('li', { text: '怪物蓄力時（畫面出現 ⚠ 警告）請「防禦」或用「衝擊之暈」打斷，硬吃會非常痛。' }),
      h('li', { text: '3F、5F 的首領守著下樓梯，7F 最深處是死亡騎士。首領戰無法逃跑。' }),
      h('li', { text: '倒下不會刪檔：你會在村莊復活，但損失部分經驗值與金幣。' }),
      h('li', { text: '施法卷軸能強化裝備，超過安定值（武器 +6、防具 +4）後失敗會讓裝備蒸發！' }),
    ),
    h('h3', { class: 'section-title', text: '騎士技能' }), skills,
  );
}

export function statsBody(p: PlayerState): HTMLElement {
  const dl = h('dl', { class: 'kv' });
  const add = (k: string, v: string) => dl.append(h('dt', { text: k }), h('dd', { text: v }));
  add('等級', `Lv.${p.level}`);
  add('最深抵達', `地下 ${p.deepestFloor} 層`);
  add('擊敗怪物', `${p.stats.kills}`);
  add('擊敗首領', `${p.stats.bossKills}`);
  add('開啟寶箱', `${p.stats.chests}`);
  add('倒下次數', `${p.stats.deaths}`);
  add('行走步數', `${p.stats.steps}`);
  add('死亡騎士', p.victory ? '已討伐 ✦' : '未討伐');
  return dl;
}
