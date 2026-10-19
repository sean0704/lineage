import * as THREE from 'three';
import { createRng, type Rng } from '../core/rng';

/**
 * Canvas 程序化材質：石磚牆、石板地、天花板、草地、光暈。
 * 同時輸出 bump map（灰階高度），全部快取共用。
 */

export interface SurfaceTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
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

/** 不規則石板地 */
export function flagstone(): SurfaceTextures {
  return memo('flagstone', () => {
    const size = 512;
    const rng = createRng(23);
    const [cc, c] = canvas(size);
    const [bc, b] = canvas(size);
    c.fillStyle = '#1e1c1a';
    c.fillRect(0, 0, size, size);
    b.fillStyle = '#1a1a1a';
    b.fillRect(0, 0, size, size);
    const grid = 4;
    const cell = size / grid;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        if ((gx + gy) % 3 === 2 && gx < grid - 1 && rng.chance(0.5)) continue;
        const x = gx * cell + rng.range(2, 6);
        const y = gy * cell + rng.range(2, 6);
        const w = cell - rng.range(6, 12);
        const h = cell - rng.range(6, 12);
        const tone = rng.range(80, 120);
        c.fillStyle = shade(tone, 0);
        roundRect(c, x, y, w, h, 10);
        c.fill();
        const g = c.createRadialGradient(x + w / 2, y + h / 2, 5, x + w / 2, y + h / 2, w * 0.7);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        c.fillStyle = g;
        roundRect(c, x, y, w, h, 10);
        c.fill();
        b.fillStyle = shade(190, rng.range(-25, 15));
        roundRect(b, x + 2, y + 2, w - 4, h - 4, 12);
        b.fill();
      }
    }
    speckle(c, size, rng, 12000, 0.14);
    speckle(b, size, rng, 8000, 0.25);
    return { map: toTexture(cc, true), bump: toTexture(bc, false) };
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
    c.shadowColor = 'rgba(255,255,255,0.9)';
    c.shadowBlur = 18;
    for (let i = 0; i < 14; i++) {
      const k = i / 14;
      c.strokeStyle = `rgba(255,255,255,${1 - k * 0.7})`;
      c.lineWidth = 22 * (1 - k) + 2;
      c.beginPath();
      c.arc(cx, cy, size * 0.38 - i * 1.4, Math.PI * 1.05, Math.PI * 1.95);
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
