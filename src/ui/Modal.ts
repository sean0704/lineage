import { $, h } from './dom';

export interface ModalOptions {
  title: string;
  body: Node;
  actions?: HTMLButtonElement[];
  wide?: boolean;
  /** 是否允許 Esc / 點背景關閉 */
  dismissable?: boolean;
  onClose?: () => void;
}

/** 單一層級的對話框管理器（同時只顯示一個） */
export class Modal {
  private readonly root = $('modal-root');
  private current: { el: HTMLElement; opts: ModalOptions; lastFocus: Element | null } | null = null;

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(opts: ModalOptions): void {
    this.close(true);
    const titleId = `modal-title-${Date.now()}`;
    const closeBtn = opts.dismissable === false ? null : h('button', { class: 'modal__close', type: 'button', aria: { label: '關閉' }, text: '×', on: { click: () => this.close() } });
    const dialog = h('div', { class: `modal${opts.wide ? ' modal--wide' : ''}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } },
      h('div', { class: 'modal__head' }, h('h2', { class: 'modal__title', text: opts.title, attrs: { id: titleId } }), closeBtn),
      h('div', { class: 'modal__body' }, opts.body),
      opts.actions?.length ? h('div', { class: 'modal__foot' }, ...opts.actions) : null,
    );
    const backdrop = h('div', { class: 'modal-backdrop', on: { mousedown: (e) => { if (e.target === backdrop && opts.dismissable !== false) this.close(); } } }, dialog);
    this.root.append(backdrop);
    this.current = { el: backdrop, opts, lastFocus: document.activeElement };
    const focusable = dialog.querySelector<HTMLElement>('.modal__foot .btn, .modal__body button, .modal__body input, .modal__close');
    focusable?.focus();
  }

  /** 以新內容替換目前對話框的主體（保留捲動位置） */
  replaceBody(body: Node): void {
    if (!this.current) return;
    const container = this.current.el.querySelector('.modal__body');
    if (!container) return;
    const scroll = container.scrollTop;
    container.replaceChildren(body);
    container.scrollTop = scroll;
  }

  close(silent = false): void {
    if (!this.current) return;
    const { el, opts, lastFocus } = this.current;
    this.current = null;
    el.remove();
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    if (!silent) opts.onClose?.();
  }

  /** 處理 Esc；回傳是否已處理 */
  handleEscape(): boolean {
    if (!this.current) return false;
    if (this.current.opts.dismissable !== false) this.close();
    return true;
  }
}
