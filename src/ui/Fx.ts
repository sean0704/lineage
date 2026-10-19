import { $, h } from './dom';

export type FloatKind = 'dmg' | 'crit' | 'hurt' | 'heal' | 'mp' | 'miss' | 'info';

/** DOM 畫面特效：浮動數字、閃光、爪痕、橫幅、淡入淡出 */
export class Fx {
  private readonly stage = $('stage');
  private readonly floats = $('float-layer');
  private readonly banner = $('banner');
  private readonly fade: HTMLElement;
  private bannerTimer = 0;

  constructor() {
    this.fade = h('div', { class: 'fade' });
    this.stage.append(this.fade);
  }

  float(text: string, x: number, y: number, kind: FloatKind = 'dmg'): void {
    const cls = kind === 'dmg' ? 'float' : `float float--${kind}`;
    const el = h('div', { class: cls, text, style: { left: `${x + (Math.random() - 0.5) * 30}px`, top: `${y}px` } });
    this.floats.append(el);
    window.setTimeout(() => el.remove(), 1300);
  }

  /** 在畫面下方中央（玩家自身）顯示數字 */
  floatSelf(text: string, kind: FloatKind): void {
    const r = this.stage.getBoundingClientRect();
    this.float(text, r.width / 2, r.height * 0.72, kind);
  }

  claw(): void {
    const el = h('div', { class: 'claw' });
    for (let i = 0; i < 3; i++) {
      el.append(h('i', { style: { left: `${38 + i * 9}%`, transform: `rotate(${24 + i * 4}deg)` } }));
    }
    this.stage.append(el);
    window.setTimeout(() => el.remove(), 650);
  }

  showBanner(title: string, sub = '', variant: '' | 'boss' | 'level' | 'warn' = '', ms = 2600): void {
    window.clearTimeout(this.bannerTimer);
    this.banner.className = `banner${variant ? ` banner--${variant}` : ''}`;
    this.banner.replaceChildren(h('div', { class: 'banner__title', text: title }), sub ? h('div', { class: 'banner__sub', text: sub }) : '');
    // 強制重新觸發動畫
    void this.banner.offsetWidth;
    this.banner.classList.add('is-show');
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('is-show'), ms);
  }

  async fadeOut(): Promise<void> {
    this.fade.classList.add('is-on');
    await new Promise((r) => window.setTimeout(r, 360));
  }

  async fadeIn(): Promise<void> {
    this.fade.classList.remove('is-on');
    await new Promise((r) => window.setTimeout(r, 360));
  }
}
