import { $, btn, h } from './dom';

export type TipId = 'village' | 'move' | 'combat' | 'charge' | 'lowhp' | 'loot' | 'boss' | 'enchant';

const KEY = 'lineage3d.tips';

const TIPS: Record<TipId, { title: string; text: string }> = {
  village: { title: '奇岩村', text: '在「商店」補充藥水與裝備，在「旅館」花一點金幣恢復體力魔力。準備好就按「進入地監」。' },
  move: { title: '移動方式', text: 'W 前進、S 後退、A／D 轉向、Q／E 平移（手機用左下方向鍵）。撞上寶箱會打開它，撞上樓梯可以換層。' },
  combat: { title: '回合制戰鬥', text: '攻擊、施展技能（消耗魔力）或防禦（減傷並回復魔力）。注意：在戰鬥中喝藥水也會消耗一回合。' },
  charge: { title: '⚠ 怪物正在蓄力', text: '下一回合會是重擊！按「防禦」（F）大幅減傷，或用「衝擊之暈」（X）把它打斷。' },
  lowhp: { title: '體力偏低', text: '按 1 喝紅色藥水，或施展「初級治癒術」（Z）。打不贏時可以「逃跑」（R）。' },
  loot: { title: '取得裝備', text: '按 I 打開背包，在「裝備」分頁可以比較並換上更好的裝備。' },
  boss: { title: '首領', text: '首領守著下樓的樓梯，而且無法逃跑。生命低於一半會狂暴，建議帶足藥水再挑戰。' },
  enchant: { title: '施法卷軸', text: '強化武器或防具。超過安定值（武器 +6、防具 +4）後失敗會讓裝備蒸發，請斟酌！' },
};

/** 一次性的新手提示卡，看過的提示會記錄在瀏覽器裡 */
export class Tips {
  private seen: Set<string>;
  private readonly el: HTMLElement;
  private current: TipId | null = null;

  constructor() {
    this.seen = new Set(this.load());
    this.el = h('div', { class: 'tip', hidden: true, attrs: { role: 'status' } });
    $('stage').append(this.el);
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      /* 無法儲存時本次仍可運作 */
    }
  }

  show(id: TipId): void {
    if (this.seen.has(id) || this.current === id) return;
    this.seen.add(id);
    this.persist();
    this.current = id;
    const tip = TIPS[id];
    const close = btn('知道了', () => this.dismiss(), { variant: 'gold' });
    close.classList.add('btn--sm');
    this.el.replaceChildren(
      h('div', { class: 'tip__body' }, h('div', { class: 'tip__title', text: tip.title }), h('div', { class: 'tip__text', text: tip.text })),
      close,
    );
    this.el.hidden = false;
    this.el.classList.remove('is-leaving');
  }

  /** 若目前顯示的是指定提示（或未指定），將其關閉 */
  dismiss(id?: TipId): void {
    if (!this.current || (id && id !== this.current)) return;
    this.current = null;
    this.el.classList.add('is-leaving');
    window.setTimeout(() => {
      if (!this.current) this.el.hidden = true;
    }, 300);
  }

  reset(): void {
    this.seen.clear();
    this.persist();
  }
}
