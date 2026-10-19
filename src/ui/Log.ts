import { $, h } from './dom';

export type LogTone = 'hit' | 'hurt' | 'heal' | 'loot' | 'boss' | 'sys' | 'level' | 'warn' | 'plain';

const MAX_ENTRIES = 120;

export class Log {
  private readonly el = $('log');

  add(text: string, tone: LogTone = 'plain'): void {
    const li = h('li', { class: tone === 'plain' ? '' : `t-${tone}`, text });
    this.el.append(li);
    while (this.el.children.length > MAX_ENTRIES) this.el.firstElementChild?.remove();
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear(): void {
    this.el.replaceChildren();
  }
}
