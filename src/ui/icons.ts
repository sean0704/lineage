/**
 * 自繪 SVG 道具與裝備圖示（取代系統 emoji，跨平台外觀一致）。
 * 所有 SVG 字串都是程式內的靜態常數，不包含任何使用者輸入。
 */

type Shape =
  | { kind: 'potion'; liquid: string }
  | { kind: 'vial'; liquid: string }
  | { kind: 'wafer' }
  | { kind: 'scroll'; seal: string; mark?: 'sword' | 'shield' }
  | { kind: 'sword'; blade: string; hilt: string; big?: boolean; glow?: string }
  | { kind: 'dagger'; blade: string; hilt: string }
  | { kind: 'axe'; head: string }
  | { kind: 'bow'; wood: string }
  | { kind: 'staff'; orb: string }
  | { kind: 'roundShield'; face: string; rim: string }
  | { kind: 'kiteShield'; face: string; rim: string; emblem: string }
  | { kind: 'cap'; color: string }
  | { kind: 'hat'; color: string }
  | { kind: 'helm'; color: string; horns?: string }
  | { kind: 'cuirass'; color: string; trim: string }
  | { kind: 'robe'; color: string; trim: string }
  | { kind: 'greaves'; color: string; trim: string };

const SHAPES: Record<string, Shape> = {
  redPotion: { kind: 'potion', liquid: '#e53e3e' },
  orangePotion: { kind: 'potion', liquid: '#ed8936' },
  whitePotion: { kind: 'potion', liquid: '#edf2f7' },
  bluePotion: { kind: 'potion', liquid: '#3b82f6' },
  greenPotion: { kind: 'potion', liquid: '#38a169' },
  bravePotion: { kind: 'potion', liquid: '#9f7aea' },
  antidote: { kind: 'vial', liquid: '#10b981' },
  elvenWafer: { kind: 'wafer' },
  teleportHomeScroll: { kind: 'scroll', seal: '#3b82f6' },
  scrollEnchantWeapon: { kind: 'scroll', seal: '#d4a83a', mark: 'sword' },
  scrollEnchantArmor: { kind: 'scroll', seal: '#63b3ed', mark: 'shield' },
  dagger: { kind: 'dagger', blade: '#cbd5e0', hilt: '#6b4a2b' },
  mithrilDagger: { kind: 'dagger', blade: '#bee3f8', hilt: '#4a5568' },
  shortBow: { kind: 'bow', wood: '#8b5a2b' },
  longSword: { kind: 'sword', blade: '#cbd5e0', hilt: '#744210' },
  greatAxe: { kind: 'axe', head: '#a0aec0' },
  wizardStaff: { kind: 'staff', orb: '#63b3ed' },
  twoHandedSword: { kind: 'sword', blade: '#e2e8f0', hilt: '#d4a83a', big: true },
  flameSwordOfDeathKnight: { kind: 'sword', blade: '#ff7a2a', hilt: '#2d1a1a', big: true, glow: '#ff4a10' },
  woodenShield: { kind: 'roundShield', face: '#8b5a2b', rim: '#718096' },
  elvenShield: { kind: 'kiteShield', face: '#2f855a', rim: '#e2e8f0', emblem: '#c6f6d5' },
  shieldOfAntharas: { kind: 'kiteShield', face: '#9b2c2c', rim: '#d4a83a', emblem: '#f6d26b' },
  leatherHelm: { kind: 'cap', color: '#8b5a2b' },
  mageHat: { kind: 'hat', color: '#553c9a' },
  ironHelm: { kind: 'helm', color: '#a0aec0' },
  dragonicHelm: { kind: 'helm', color: '#c53030', horns: '#f6e05e' },
  leatherArmor: { kind: 'cuirass', color: '#8b5a2b', trim: '#5a3a1c' },
  vineArmor: { kind: 'cuirass', color: '#48723a', trim: '#2f4a24' },
  scaleMail: { kind: 'cuirass', color: '#a0aec0', trim: '#4a5568' },
  ancientRobe: { kind: 'robe', color: '#44337a', trim: '#d4a83a' },
  leatherPants: { kind: 'greaves', color: '#8b5a2b', trim: '#5a3a1c' },
  chainmailPants: { kind: 'greaves', color: '#a0aec0', trim: '#4a5568' },
  elvenChainPants: { kind: 'greaves', color: '#c6f6d5', trim: '#2f855a' },
  shadowLeggings: { kind: 'greaves', color: '#2d2440', trim: '#9f7aea' },
};

let uid = 0;

function body(s: Shape, id: string): string {
  const grad = (name: string, top: string, bottom: string) =>
    `<linearGradient id="${id}${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
  const shine = '<ellipse cx="12" cy="17" rx="2" ry="3.5" fill="#fff" opacity=".45"/>';
  switch (s.kind) {
    case 'potion':
      return `<defs>${grad('l', s.liquid, shadeHex(s.liquid, -0.45))}</defs>
        <rect x="13" y="4" width="6" height="4" rx="1" fill="#a0784a"/>
        <path d="M13.5 8h5v4.2a9 9 0 1 1-5 0z" fill="#e8f0ff" fill-opacity=".25" stroke="#e8f0ff" stroke-opacity=".7" stroke-width="1.2"/>
        <path d="M8 20a8 8 0 0 0 16 0c0-1-.2-2-.5-3H8.5c-.3 1-.5 2-.5 3z" fill="url(#${id}l)"/>
        ${shine}`;
    case 'vial':
      return `<defs>${grad('l', s.liquid, shadeHex(s.liquid, -0.45))}</defs>
        <rect x="13" y="3" width="6" height="3.5" rx="1" fill="#a0784a"/>
        <rect x="11.5" y="6.5" width="9" height="21" rx="4.5" fill="#e8f0ff" fill-opacity=".2" stroke="#e8f0ff" stroke-opacity=".7" stroke-width="1.2"/>
        <rect x="12.5" y="13" width="7" height="13.5" rx="3.5" fill="url(#${id}l)"/>
        <rect x="13.5" y="9" width="1.6" height="12" rx=".8" fill="#fff" opacity=".45"/>`;
    case 'wafer':
      return `<defs>${grad('w', '#f6d38b', '#b7791f')}</defs>
        <circle cx="16" cy="16" r="11" fill="url(#${id}w)" stroke="#7b4a12" stroke-width="1.2"/>
        <g fill="#7b4a12">${[[11, 12], [19, 11], [15, 17], [21, 19], [11, 20], [17, 23]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3"/>`).join('')}</g>`;
    case 'scroll': {
      const mark = s.mark === 'sword'
        ? '<path d="M16 9l1.2 1.2v8.3h-2.4v-8.3z M13 18.5h6v1.4h-6z M15.3 20h1.4v2.4h-1.4z" fill="#7b4a12"/>'
        : s.mark === 'shield'
          ? '<path d="M16 9.5l5 1.8v3.8c0 3.2-2.2 5.6-5 6.8-2.8-1.2-5-3.6-5-6.8v-3.8z" fill="none" stroke="#7b4a12" stroke-width="1.6"/>'
          : '<path d="M11 11h10M11 14h10M11 17h7" stroke="#9c7a4a" stroke-width="1.2"/>';
      return `<defs>${grad('p', '#fbefd5', '#d9b77c')}</defs>
        <rect x="7" y="6" width="18" height="20" rx="2" fill="url(#${id}p)"/>
        <rect x="5" y="4" width="22" height="4.5" rx="2.2" fill="#c9a36a" stroke="#8a6534"/>
        <rect x="5" y="23.5" width="22" height="4.5" rx="2.2" fill="#c9a36a" stroke="#8a6534"/>
        ${mark}
        <circle cx="22" cy="25.5" r="3.2" fill="${s.seal}" stroke="#1a202c" stroke-opacity=".4"/>`;
    }
    case 'sword': {
      const w = s.big ? 3.4 : 2.6;
      const glow = s.glow ? `<path d="M16 2l${w} ${w}v15h-${w * 2}v-15z" fill="${s.glow}" opacity=".45" filter="url(#${id}b)"/>` : '';
      return `<defs>${grad('s', '#ffffff', s.blade)}${s.glow ? `<filter id="${id}b"><feGaussianBlur stdDeviation="1.6"/></filter>` : ''}</defs>
        ${glow}
        <path d="M16 2l${w} ${w}v15h-${w * 2}v-15z" fill="url(#${id}s)" stroke="#2d3748" stroke-width=".8"/>
        <path d="M16 4v15" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>
        <rect x="${s.big ? 8 : 10}" y="20" width="${s.big ? 16 : 12}" height="2.6" rx="1.2" fill="#d4a83a" stroke="#744210" stroke-width=".6"/>
        <rect x="14.8" y="22.6" width="2.4" height="5.4" fill="${s.hilt}"/>
        <circle cx="16" cy="29" r="1.8" fill="#d4a83a"/>`;
    }
    case 'dagger':
      return `<defs>${grad('s', '#ffffff', s.blade)}</defs>
        <path d="M16 6l2.2 2.4v10h-4.4v-10z" fill="url(#${id}s)" stroke="#2d3748" stroke-width=".8"/>
        <rect x="11.5" y="18.4" width="9" height="2.2" rx="1" fill="#a0aec0"/>
        <rect x="14.9" y="20.6" width="2.2" height="5.4" fill="${s.hilt}"/>
        <circle cx="16" cy="27" r="1.6" fill="#a0aec0"/>`;
    case 'axe':
      return `<defs>${grad('a', '#edf2f7', s.head)}</defs>
        <rect x="15" y="4" width="2.4" height="25" rx="1.1" fill="#7b4a22"/>
        <path d="M17 6c6 0 9 3 9 8s-3 8-9 8z" fill="url(#${id}a)" stroke="#2d3748" stroke-width=".8"/>
        <path d="M15 8c-4 0-6 2.5-6 6s2 6 6 6z" fill="url(#${id}a)" stroke="#2d3748" stroke-width=".8"/>`;
    case 'bow':
      return `<path d="M10 3c10 4 10 22 0 26" fill="none" stroke="${s.wood}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M10 3v26" stroke="#e2e8f0" stroke-width=".8"/>
        <path d="M6 16h18" stroke="#a0aec0" stroke-width="1.2"/><path d="M24 16l-3-2v4z" fill="#a0aec0"/>`;
    case 'staff':
      return `<defs><radialGradient id="${id}o"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="${s.orb}"/><stop offset="1" stop-color="${shadeHex(s.orb, -0.5)}"/></radialGradient></defs>
        <path d="M16 11l-3 18" stroke="#7b4a22" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="16.5" cy="7.5" r="5" fill="${s.orb}" opacity=".35"/>
        <circle cx="16.5" cy="7.5" r="3.6" fill="url(#${id}o)"/>`;
    case 'roundShield':
      return `<defs>${grad('f', shadeHex(s.face, 0.2), shadeHex(s.face, -0.35))}</defs>
        <circle cx="16" cy="16" r="12" fill="url(#${id}f)" stroke="${s.rim}" stroke-width="2.4"/>
        <path d="M8 12h16M7 18h18" stroke="#000" stroke-opacity=".25"/>
        <circle cx="16" cy="16" r="3" fill="${s.rim}"/>`;
    case 'kiteShield':
      return `<defs>${grad('f', shadeHex(s.face, 0.25), shadeHex(s.face, -0.35))}</defs>
        <path d="M16 3l10 3.5v8c0 6.5-4.5 11.5-10 14-5.5-2.5-10-7.5-10-14v-8z" fill="url(#${id}f)" stroke="${s.rim}" stroke-width="2"/>
        <path d="M16 8l1.6 4.4h4.6l-3.7 2.8 1.4 4.5-3.9-2.8-3.9 2.8 1.4-4.5-3.7-2.8h4.6z" fill="${s.emblem}"/>`;
    case 'cap':
      return `<defs>${grad('c', shadeHex(s.color, 0.2), shadeHex(s.color, -0.35))}</defs>
        <path d="M5 20c0-8 5-13 11-13s11 5 11 13z" fill="url(#${id}c)" stroke="#3a2412" stroke-width="1"/>
        <rect x="4" y="19" width="24" height="4" rx="2" fill="${shadeHex(s.color, -0.3)}"/>
        <path d="M16 7v12" stroke="#3a2412" stroke-opacity=".5"/>`;
    case 'hat':
      return `<defs>${grad('h', shadeHex(s.color, 0.3), shadeHex(s.color, -0.3))}</defs>
        <path d="M17 3c-2 6-6 12-8 18h14c-1-6-1-11 3-15z" fill="url(#${id}h)"/>
        <ellipse cx="16" cy="22" rx="13" ry="3.5" fill="${shadeHex(s.color, -0.2)}"/>
        <path d="M10 19.5h12" stroke="#d4a83a" stroke-width="1.6"/>`;
    case 'helm':
      return `<defs>${grad('h', shadeHex(s.color, 0.35), shadeHex(s.color, -0.4))}</defs>
        ${s.horns ? `<path d="M7 13C3 11 2 6 4 3c1 4 3 6 6 7zM25 13c4-2 5-7 3-10-1 4-3 6-6 7z" fill="${s.horns}"/>` : ''}
        <path d="M6 18c0-8 4.5-12 10-12s10 4 10 12v8H6z" fill="url(#${id}h)" stroke="#1a202c" stroke-width="1"/>
        <rect x="9" y="15" width="14" height="2.6" rx="1" fill="#1a202c"/>
        <path d="M16 18v8" stroke="#1a202c" stroke-width="1.6"/>`;
    case 'cuirass':
      return `<defs>${grad('c', shadeHex(s.color, 0.3), shadeHex(s.color, -0.35))}</defs>
        <path d="M9 5l4 2h6l4-2 5 4-2 6-2-1v13H8V14l-2 1-2-6z" fill="url(#${id}c)" stroke="${s.trim}" stroke-width="1.2"/>
        <path d="M13 7c0 3 1.5 4 3 4s3-1 3-4" fill="none" stroke="${s.trim}" stroke-width="1.2"/>
        <path d="M10 18h12M10 22h12" stroke="${s.trim}" stroke-opacity=".7"/>`;
    case 'robe':
      return `<defs>${grad('r', shadeHex(s.color, 0.3), shadeHex(s.color, -0.35))}</defs>
        <path d="M11 4h10l3 4-1 3 4 17H5l4-17-1-3z" fill="url(#${id}r)"/>
        <path d="M16 6v22" stroke="${s.trim}" stroke-width="1.4"/>
        <path d="M5 28h22" stroke="${s.trim}" stroke-width="2"/>`;
    case 'greaves':
      return `<defs>${grad('g', shadeHex(s.color, 0.3), shadeHex(s.color, -0.35))}</defs>
        <path d="M8 4h16l-1 10-2 14h-4l-1-12-1 12h-4L9 14z" fill="url(#${id}g)" stroke="${s.trim}" stroke-width="1.2"/>
        <path d="M8.5 7h15" stroke="${s.trim}" stroke-width="2"/>`;
  }
}

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const template = document.createElement('template');

/** 取得道具圖示（SVG 元素）；未知的 key 回傳通用寶珠 */
export function itemIcon(key: string, size = 28): SVGSVGElement {
  const id = `ic${uid++}`;
  const shape = SHAPES[key] ?? ({ kind: 'potion', liquid: '#a0aec0' } as Shape);
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="icon">${body(shape, id)}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}

const SLOT_SILHOUETTE: Record<string, Shape> = {
  weapon: { kind: 'sword', blade: '#4a5568', hilt: '#2d3748' },
  shield: { kind: 'roundShield', face: '#4a5568', rim: '#2d3748' },
  helm: { kind: 'helm', color: '#4a5568' },
  armor: { kind: 'cuirass', color: '#4a5568', trim: '#2d3748' },
  legs: { kind: 'greaves', color: '#4a5568', trim: '#2d3748' },
};

/** 裝備欄位的灰色剪影（未裝備時使用） */
export function slotIcon(slot: string, size = 28): SVGSVGElement {
  const id = `ic${uid++}`;
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="icon icon--empty">${body(SLOT_SILHOUETTE[slot], id)}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}
