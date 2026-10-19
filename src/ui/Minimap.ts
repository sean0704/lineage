import { DIRS, idx, TILE, type DungeonFloor } from '../systems/dungeonGen';
import { canSee, type Position } from '../systems/exploration';

const COLORS = {
  bg: '#07090d',
  floor: '#3a3f4a',
  floorSeen: '#2a2e36',
  wall: '#141820',
  up: '#7fd4ff',
  down: '#6ab8ff',
  chest: '#f6d26b',
  monster: '#f56565',
  boss: '#ff2a2a',
  player: '#f6d26b',
};

/** 以 canvas 繪製已探索的地圖、樓梯、寶箱與視野內的怪物 */
export function drawMinimap(canvas: HTMLCanvasElement, d: DungeonFloor | null, pos: Position | null, opts: { zoom?: number } = {}): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!d || !pos) {
    ctx.fillStyle = '#4a5568';
    ctx.font = `${14 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('奇岩村', canvas.width / 2, canvas.height / 2);
    return;
  }

  // 小地圖以玩家為中心局部顯示；放大模式顯示全圖
  const full = opts.zoom === undefined;
  const span = full ? d.size : opts.zoom!;
  const cell = canvas.width / span;
  const ox = full ? 0 : pos.x - span / 2 + 0.5;
  const oy = full ? 0 : pos.y - span / 2 + 0.5;
  const sx = (x: number) => (x - ox) * cell;
  const sy = (y: number) => (y - oy) * cell;

  for (let y = 0; y < d.size; y++) {
    for (let x = 0; x < d.size; x++) {
      const i = idx(d.size, x, y);
      if (!d.explored[i]) continue;
      const t = d.tiles[i];
      if (t === TILE.wall) {
        const touchesFloor = DIRS.some((dd) => {
          const nx = x + dd.dx;
          const ny = y + dd.dy;
          return nx >= 0 && ny >= 0 && nx < d.size && ny < d.size && d.tiles[idx(d.size, nx, ny)] !== TILE.wall;
        });
        if (!touchesFloor) continue;
        ctx.fillStyle = COLORS.wall;
      } else {
        ctx.fillStyle = COLORS.floor;
      }
      ctx.fillRect(sx(x), sy(y), Math.ceil(cell), Math.ceil(cell));
      if (t === TILE.stairsUp || t === TILE.stairsDown) {
        ctx.fillStyle = t === TILE.stairsUp ? COLORS.up : COLORS.down;
        ctx.font = `bold ${Math.max(8, cell * 0.85)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t === TILE.stairsUp ? '▲' : '▼', sx(x) + cell / 2, sy(y) + cell / 2);
      }
    }
  }

  for (const c of d.chests) {
    if (!d.explored[idx(d.size, c.x, c.y)]) continue;
    ctx.fillStyle = c.opened ? '#6b5a2a' : COLORS.chest;
    const m = cell * 0.22;
    ctx.fillRect(sx(c.x) + m, sy(c.y) + m * 1.4, cell - m * 2, cell - m * 2.4);
  }

  for (const mon of d.monsters) {
    if (!mon.alive || !d.explored[idx(d.size, mon.x, mon.y)]) continue;
    if (!mon.boss && !canSee(d, pos, mon.x, mon.y)) continue;
    ctx.fillStyle = mon.boss ? COLORS.boss : COLORS.monster;
    ctx.beginPath();
    ctx.arc(sx(mon.x) + cell / 2, sy(mon.y) + cell / 2, cell * (mon.boss ? 0.42 : 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  // 玩家箭頭
  const px = sx(pos.x) + cell / 2;
  const py = sy(pos.y) + cell / 2;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate((pos.facing * Math.PI) / 2);
  ctx.fillStyle = COLORS.player;
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 6 * dpr;
  ctx.beginPath();
  const r = Math.max(cell * 0.45, 5 * dpr);
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.75, r * 0.7);
  ctx.lineTo(0, r * 0.35);
  ctx.lineTo(-r * 0.75, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
