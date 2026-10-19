type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  disabled?: boolean;
  hidden?: boolean;
  aria?: Record<string, string>;
  data?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  attrs?: Record<string, string>;
}

/** 安全的 DOM 建構器：文字一律走 textContent，不拼接 HTML 字串 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.type) el.setAttribute('type', props.type);
  if (props.disabled) (el as HTMLButtonElement).disabled = true;
  if (props.hidden) el.hidden = true;
  if (props.aria) for (const [k, v] of Object.entries(props.aria)) el.setAttribute(`aria-${k}`, v);
  if (props.data) for (const [k, v] of Object.entries(props.data)) el.dataset[k] = v;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.style) Object.assign(el.style, props.style);
  if (props.on) {
    for (const [ev, fn] of Object.entries(props.on)) el.addEventListener(ev, fn as EventListener);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

export function btn(label: string | Node, onClick: () => void, opts: { variant?: string; key?: string; disabled?: boolean; title?: string; small?: string } = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: `btn${opts.variant ? ` btn--${opts.variant}` : ''}`,
      type: 'button',
      disabled: opts.disabled,
      title: opts.title,
      on: { click: (e) => { e.stopPropagation(); if (e.detail > 0) (e.currentTarget as HTMLElement).blur(); onClick(); } },
    },
    label,
    opts.small ? h('small', { text: opts.small }) : null,
    opts.key ? h('kbd', { text: opts.key }) : null,
  );
}
