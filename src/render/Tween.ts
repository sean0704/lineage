export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} satisfies Record<string, Easing>;

interface Active {
  elapsed: number;
  delay: number;
  duration: number;
  easing: Easing;
  onUpdate: (k: number) => void;
  resolve: () => void;
}

/**
 * 集中式補間管理器：由主迴圈以 delta 秒推進，動畫速度與螢幕更新率無關。
 * 每個補間回傳 Promise，方便用 async/await 串接演出。
 */
export class Tweens {
  private active: Active[] = [];
  /** 時間倍率：命中停頓時暫時調低 */
  timeScale = 1;

  /** duration 單位為毫秒 */
  to(duration: number, onUpdate: (k: number) => void, opts: { easing?: Easing; delay?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({
        elapsed: 0,
        delay: opts.delay ?? 0,
        duration: Math.max(1, duration),
        easing: opts.easing ?? ease.outCubic,
        onUpdate,
        resolve,
      });
    });
  }

  wait(ms: number): Promise<void> {
    return this.to(ms, () => {}, { easing: ease.linear });
  }

  update(rawDtMs: number): void {
    if (!this.active.length) return;
    const dtMs = rawDtMs * this.timeScale;
    const done: Active[] = [];
    for (const tw of this.active) {
      let step = dtMs;
      if (tw.delay > 0) {
        tw.delay -= step;
        if (tw.delay > 0) continue;
        step = -tw.delay;
        tw.delay = 0;
      }
      tw.elapsed += step;
      const raw = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.easing(raw));
      if (raw >= 1) done.push(tw);
    }
    if (done.length) {
      this.active = this.active.filter((t) => !done.includes(t));
      done.forEach((t) => t.resolve());
    }
  }

  /** 立即完成所有補間（切換場景時使用） */
  finishAll(): void {
    const list = this.active;
    this.active = [];
    for (const tw of list) {
      tw.onUpdate(tw.easing(1));
      tw.resolve();
    }
  }
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 角度插值（走最短路徑） */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
