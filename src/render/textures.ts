import * as THREE from 'three';
import { createRng, type Rng } from '../core/rng';

/**
 * Canvas 程序化材質：石磚牆、石板地、天花板、草地、光暈。
 * 同時輸出 bump map（灰階高度），全部快取共用。
 */

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  /** 粗糙度（白＝粗糙、黑＝光滑潮濕） */
  rough?: THREE.CanvasTexture;
}

const cache = new Map<string, unknown>();

function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 在既有內容上疊加細緻噪點 */
function speckle(ctx: CanvasRenderingContext2D, size: number, rng: Rng, amount: number, alpha: number): void {
  for (let i = 0; i < amount; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng.next()})`;
    const s = rng.range(1, 3);
    ctx.fillRect(rng.int(0, size), rng.int(0, size), s, s);
  }
}

function shade(base: number, delta: number): string {
  const v = Math.max(0, Math.min(255, Math.round(base + delta)));
  return `rgb(${v},${v},${v})`;
}

/** 交錯砌法石磚牆 */
export function stoneWall(): SurfaceTextures {
  return memo('stoneWall', () => {
    const size = 512;
    const rng = createRng(11);
    const [cc, c] = canvas(size);
    const [bc, b] = canvas(size);
    const rows = 6;
    const rowH = size / rows;
    c.fillStyle = '#2a2826';
    c.fillRect(0, 0, size, size);
    b.fillStyle = '#202020';
    b.fillRect(0, 0, size, size);

    for (let r = 0; r < rows; r++) {
      const bricks = 3;
      const bw = size / bricks;
      const offset = (r % 2) * (bw / 2);
      for (let i = -1; i <= bricks; i++) {
        const x = i * bw + offset + rng.range(-6, 6);
        const y = r * rowH;
        const w = bw - 6 + rng.range(-4, 4);
        const h = rowH - 6;
        const tone = rng.range(92, 140);
        const grad = c.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, shade(tone, 18));
        grad.addColorStop(1, shade(tone, -22));
        c.fillStyle = grad;
        roundRect(c, x + 3, y + 3, w, h, 6);
        c.fill();
        // 高度圖：磚面凸起、邊緣圓滑
        const bg = b.createLinearGradient(x, y, x, y + h);
        bg.addColorStop(0, shade(200, rng.range(-20, 10)));
        bg.addColorStop(1, shade(160, rng.range(-20, 10)));
        b.fillStyle = bg;
        roundRect(b, x + 4, y + 4, w - 2, h - 2, 8);
        b.fill();
        // 裂紋
        if (rng.chance(0.35)) {
          c.strokeStyle = 'rgba(20,18,16,0.6)';
          b.strokeStyle = 'rgba(40,40,40,0.9)';
          c.lineWidth = b.lineWidth = 1.5;
          let cx = x + rng.range(10, w - 10);
          let cy = y + 6;
          c.beginPath();
          b.beginPath();
          c.moveTo(cx, cy);
          b.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) {
            cx += rng.range(-12, 12);
            cy += h / 5;
            c.lineTo(cx, cy);
            b.lineTo(cx, cy);
          }
          c.stroke();
          b.stroke();
        }
        // 苔痕/污漬
        if (rng.chance(0.3)) {
          c.fillStyle = `rgba(40,50,30,${rng.range(0.1, 0.25)})`;
          c.beginPath();
          c.ellipse(x + rng.range(0, w), y + h, rng.range(10, 30), rng.range(4, 12), 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    speckle(c, size, rng, 9000, 0.12);
    speckle(b, size, rng, 6000, 0.2);
    return { map: toTexture(cc, true), bump: toTexture(bc, false) };
  });
}

/** 不規則石板地，帶潮濕水窪（粗糙度貼圖） */
export function flagstone(): SurfaceTextures {
  return memo('flagstone', () => {
    const size = 512;
    const rng = createRng(23);
    const [cc, c] = canvas(size);
    const [bc, b] = canvas(size);
    const [rc, r] = canvas(size);
    c.fillStyle = '#16140f';
    c.fillRect(0, 0, size, size);
    b.fillStyle = '#141414';
    b.fillRect(0, 0, size, size);
    r.fillStyle = '#f2f2f2';
    r.fillRect(0, 0, size, size);

    // 以不規則網格切出石板
    const cols = 4;
    const rows = 4;
    const cw = size / cols;
    const ch = size / rows;
    for (let gy = 0; gy < rows; gy++) {
      const shift = (gy % 2) * cw * 0.5;
      for (let gx = -1; gx < cols; gx++) {
        const x = gx * cw + shift + rng.range(-6, 6);
        const y = gy * ch + rng.range(-4, 4);
        const w = cw - rng.range(7, 13);
        const h = ch - rng.range(7, 13);
        const tone = rng.range(78, 124);
        const pts: [number, number][] = [
          [x + rng.range(2, 10), y + rng.range(2, 8)],
          [x + w - rng.range(2, 10), y + rng.range(2, 8)],
          [x + w - rng.range(0, 6), y + h * rng.range(0.4, 0.6)],
          [x + w - rng.range(2, 10), y + h - rng.range(2, 8)],
          [x + rng.range(2, 10), y + h - rng.range(2, 8)],
          [x + rng.range(0, 6), y + h * rng.range(0.4, 0.6)],
        ];
        const path = () => {
          const p = new Path2D();
          p.moveTo(pts[0][0], pts[0][1]);
          for (const [px, py] of pts.slice(1)) p.lineTo(px, py);
          p.closePath();
          return p;
        };
        const g = c.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, shade(tone, 14));
        g.addColorStop(1, shade(tone, -16));
        c.fillStyle = g;
        c.fill(path());
        b.fillStyle = shade(196, rng.range(-26, 12));
        b.fill(path());
        // 石面磨損的亮紋
        c.save();
        c.clip(path());
        for (let i = 0; i < 6; i++) {
          c.strokeStyle = `rgba(255,255,255,${rng.range(0.02, 0.06)})`;
          c.lineWidth = rng.range(4, 14);
          c.beginPath();
          c.moveTo(x + rng.range(0, w), y + rng.range(0, h));
          c.lineTo(x + rng.range(0, w), y + rng.range(0, h));
          c.stroke();
        }
        c.restore();
      }
    }
    // 水窪：顏色更深、表面光滑
    for (let i = 0; i < 7; i++) {
      const px = rng.range(0, size);
      const py = rng.range(0, size);
      const rad = rng.range(24, 70);
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        const rg = r.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rad);
        rg.addColorStop(0, 'rgba(95,95,95,0.85)');
        rg.addColorStop(0.55, 'rgba(150,150,150,0.5)');
        rg.addColorStop(1, 'rgba(242,242,242,0)');
        r.fillStyle = rg;
        r.fillRect(px + ox - rad, py + oy - rad, rad * 2, rad * 2);
        const cg = c.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rad);
        cg.addColorStop(0, 'rgba(0,0,0,0.35)');
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = cg;
        c.fillRect(px + ox - rad, py + oy - rad, rad * 2, rad * 2);
      }
    }
    speckle(c, size, rng, 14000, 0.16);
    speckle(b, size, rng, 9000, 0.25);
    speckle(r, size, rng, 4000, 0.2);
    return { map: toTexture(cc, true), bump: toTexture(bc, false), rough: toTexture(rc, false) };
  });
}

/** 粗糙的岩石天花板 */
export function roughRock(): SurfaceTextures {
  return memo('roughRock', () => {
    const size = 256;
    const rng = createRng(37);
    const [cc, c] = canvas(size);
    const [bc, b] = canvas(size);
    c.fillStyle = '#3a3836';
    c.fillRect(0, 0, size, size);
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
    for (let i = 0; i < 220; i++) {
      const x = rng.int(0, size);
      const y = rng.int(0, size);
      const r = rng.range(6, 26);
      const tone = rng.range(40, 90);
      c.fillStyle = `rgba(${tone},${tone - 4},${tone - 8},0.5)`;
      b.fillStyle = `rgba(${tone * 2},${tone * 2},${tone * 2},0.5)`;
      for (const ctx of [c, b]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    speckle(c, size, rng, 4000, 0.15);
    return { map: toTexture(cc, true), bump: toTexture(bc, false) };
  });
}

/** 村莊草地 */
export function grass(): THREE.CanvasTexture {
  return memo('grass', () => {
    const size = 256;
    const rng = createRng(51);
    const [cc, c] = canvas(size);
    c.fillStyle = '#26361f';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 5000; i++) {
      const g = rng.int(50, 95);
      c.strokeStyle = `rgba(${g - 20},${g + 15},${g - 30},0.55)`;
      const x = rng.int(0, size);
      const y = rng.int(0, size);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + rng.range(-2, 2), y - rng.range(2, 6));
      c.stroke();
    }
    return toTexture(cc, true);
  });
}

/** 柔和的放射光暈（火焰、魔法、粒子用） */
export function glow(): THREE.CanvasTexture {
  return memo('glow', () => {
    const size = 128;
    const [cc, c] = canvas(size);
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** 火焰形狀（底寬頂尖） */
export function flame(): THREE.CanvasTexture {
  return memo('flame', () => {
    const w = 64;
    const h = 128;
    const cc = document.createElement('canvas');
    cc.width = w;
    cc.height = h;
    const c = cc.getContext('2d')!;
    const g = c.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.5);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.25, 'rgba(255,200,80,0.95)');
    g.addColorStop(0.55, 'rgba(255,110,20,0.55)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.bezierCurveTo(w * 0.95, h * 0.45, w * 0.95, h * 0.95, w / 2, h);
    c.bezierCurveTo(w * 0.05, h * 0.95, w * 0.05, h * 0.45, w / 2, 0);
    c.fill();
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** 刀光弧線 */
export function slashArc(): THREE.CanvasTexture {
  return memo('slashArc', () => {
    const size = 256;
    const [cc, c] = canvas(size);
    const cx = size / 2;
    const cy = size / 2;
    // 中間最亮、向兩端漸細的弧形刀光
    for (let i = 0; i < 10; i++) {
      const k = i / 10;
      c.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.55})`;
      c.lineWidth = 9 * (1 - k) + 1;
      c.beginPath();
      c.arc(cx, cy, size * 0.4 - i * 1.6, Math.PI * (1.12 + k * 0.08), Math.PI * (1.88 - k * 0.08));
      c.stroke();
    }
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type DecalKind = 'grime' | 'moss' | 'lava' | 'rune';

/** 地面貼花：髒污、苔蘚、熔岩裂縫、魔法符文（透明背景） */
export function decalTexture(kind: DecalKind): THREE.CanvasTexture {
  return memo(`decal:${kind}`, () => {
    const size = 256;
    const rng = createRng(kind.length * 97 + 5);
    const [cc, c] = canvas(size);
    const mid = size / 2;
    if (kind === 'grime' || kind === 'moss') {
      const base = kind === 'grime' ? [12, 10, 8] : [40, 70, 30];
      for (let i = 0; i < 26; i++) {
        const x = mid + rng.range(-70, 70);
        const y = mid + rng.range(-70, 70);
        const r = rng.range(14, 56);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const a = kind === 'grime' ? rng.range(0.12, 0.3) : rng.range(0.25, 0.5);
        g.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},${a})`);
        g.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},0)`);
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      if (kind === 'moss') {
        for (let i = 0; i < 900; i++) {
          const a = rng.range(0, Math.PI * 2);
          const r = Math.pow(rng.next(), 0.7) * 95;
          c.fillStyle = `rgba(${rng.int(50, 90)},${rng.int(100, 150)},${rng.int(40, 70)},${rng.range(0.3, 0.8)})`;
          c.fillRect(mid + Math.cos(a) * r, mid + Math.sin(a) * r, rng.range(1, 3), rng.range(1, 3));
        }
      }
    } else if (kind === 'lava') {
      c.lineCap = 'round';
      c.shadowColor = 'rgba(255,120,30,1)';
      c.shadowBlur = 10;
      const crack = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
        c.strokeStyle = `rgba(255,${rng.int(110, 190)},40,0.95)`;
        c.lineWidth = w;
        c.beginPath();
        c.moveTo(x, y);
        for (let i = 0; i < len; i++) {
          a += rng.range(-0.6, 0.6);
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          c.lineTo(x, y);
          if (depth < 2 && rng.chance(0.12)) crack(x, y, a + rng.range(-1.2, 1.2), Math.floor(len / 2), w * 0.6, depth + 1);
        }
        c.stroke();
      };
      for (let i = 0; i < 3; i++) crack(mid, mid, rng.range(0, Math.PI * 2), 10, 3.5, 0);
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.shadowColor = 'rgba(255,255,255,1)';
      c.shadowBlur = 6;
      c.lineWidth = 3;
      for (const r of [110, 92]) {
        c.beginPath();
        c.arc(mid, mid, r, 0, Math.PI * 2);
        c.stroke();
      }
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const b = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
        c.moveTo(mid + Math.cos(a) * 92, mid + Math.sin(a) * 92);
        c.lineTo(mid + Math.cos(b) * 92, mid + Math.sin(b) * 92);
      }
      c.stroke();
      c.font = 'bold 18px serif';
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.fillText(glyphs[i], mid + Math.cos(a) * 101, mid + Math.sin(a) * 101);
      }
    }
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** 角落蜘蛛網 */
export function webTexture(): THREE.CanvasTexture {
  return memo('web', () => {
    const size = 256;
    const rng = createRng(77);
    const [cc, c] = canvas(size);
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 1.2;
    const spokes = 9;
    const angles = Array.from({ length: spokes }, (_, i) => (i / (spokes - 1)) * (Math.PI / 2) + rng.range(-0.04, 0.04));
    for (const a of angles) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * size * 1.1, Math.sin(a) * size * 1.1);
      c.stroke();
    }
    for (let r = 18; r < size; r += rng.range(14, 24)) {
      c.beginPath();
      angles.forEach((a, i) => {
        const rr = r + rng.range(-3, 3);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) c.moveTo(x, y);
        else c.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.93, Math.sin(a - 0.1) * rr * 0.93, x, y);
      });
      c.stroke();
    }
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

const BANNER_COLORS: Record<string, [string, string]> = {
  stone: ['#6a1818', '#d4a83a'],
  moss: ['#1e3a24', '#c8b070'],
  arcane: ['#2a1848', '#b8a0ff'],
  inferno: ['#2a0c08', '#ff8a3a'],
};

/** 破舊的紋章旗幟（燕尾下擺、透明破洞） */
export function bannerTexture(themeKey: string): THREE.CanvasTexture {
  return memo(`banner:${themeKey}`, () => {
    const w = 128;
    const h = 256;
    const rng = createRng(themeKey.length * 31);
    const cc = document.createElement('canvas');
    cc.width = w;
    cc.height = h;
    const c = cc.getContext('2d')!;
    const [cloth, trim] = BANNER_COLORS[themeKey] ?? BANNER_COLORS.stone;
    c.fillStyle = cloth;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h * 0.86);
    c.lineTo(w / 2, h * 0.72);
    c.lineTo(0, h * 0.86);
    c.closePath();
    c.fill();
    // 布料直紋陰影
    for (let x = 0; x < w; x += 6) {
      c.fillStyle = `rgba(0,0,0,${0.06 + 0.06 * Math.sin(x * 0.3)})`;
      c.fillRect(x, 0, 3, h);
    }
    c.strokeStyle = trim;
    c.lineWidth = 5;
    c.strokeRect(10, 8, w - 20, h * 0.62);
    // 紋章：盾與交叉的劍
    c.fillStyle = trim;
    c.beginPath();
    c.moveTo(w / 2, 50);
    c.lineTo(w / 2 + 30, 62);
    c.lineTo(w / 2 + 26, 110);
    c.quadraticCurveTo(w / 2, 140, w / 2, 140);
    c.quadraticCurveTo(w / 2, 140, w / 2 - 26, 110);
    c.lineTo(w / 2 - 30, 62);
    c.closePath();
    c.fill();
    c.fillStyle = cloth;
    c.beginPath();
    c.moveTo(w / 2, 62);
    c.lineTo(w / 2 + 6, 120);
    c.lineTo(w / 2 - 6, 120);
    c.closePath();
    c.fill();
    c.fillRect(w / 2 - 16, 78, 32, 5);
    // 破洞與髒污
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(rng.range(10, w - 10), rng.range(120, h * 0.8), rng.range(3, 9), 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    speckle(c, w, rng, 1500, 0.15);
    const t = new THREE.CanvasTexture(cc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
