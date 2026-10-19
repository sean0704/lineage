import { getItem, RARITY_NAMES, type Rarity } from '../data/items';
import { $, h } from './dom';
import { itemIcon } from './icons';

/** 戰利品／事件提示卡片：從右側滑入，數秒後淡出，最多同時顯示 4 張 */
export class Toasts {
  private readonly el: HTMLElement;

  constructor() {
    this.el = h('div', { class: 'toasts', aria: { live: 'polite' } });
    $('stage').append(this.el);
  }

  private push(card: HTMLElement, ms: number): void {
    this.el.append(card);
    while (this.el.children.length > 4) this.el.firstElementChild?.remove();
    window.setTimeout(() => {
      card.classList.add('is-leaving');
      window.setTimeout(() => card.remove(), 400);
    }, ms);
  }

  item(key: string, qty = 1): void {
    const def = getItem(key);
    const rarity: Rarity = def.rarity;
    const card = h('div', { class: `toast toast--${rarity}` },
      h('span', { class: `toast__icon r-border-${rarity}` }, itemIcon(key, 30)),
      h('div', { class: 'toast__body' },
        h('div', { class: `toast__title r-${rarity}`, text: qty > 1 ? `${def.name} ×${qty}` : def.name }),
        h('div', { class: 'toast__sub', text: `${RARITY_NAMES[rarity]}・已放入背包` })),
    );
    this.push(card, rarity === 'legendary' ? 5200 : rarity === 'rare' ? 4200 : 3200);
  }

  gold(amount: number, xp?: number): void {
    const card = h('div', { class: 'toast toast--compact' },
      h('span', { class: 'toast__coin', text: '◉' }),
      h('div', { class: 'toast__body' },
        h('div', { class: 'toast__title c-gold', text: `+${amount.toLocaleString()} 金幣` }),
        xp ? h('div', { class: 'toast__sub', text: `+${xp.toLocaleString()} 經驗值` }) : null),
    );
    this.push(card, 2600);
  }
}
