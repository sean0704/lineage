/**
 * 程序化背景音樂：依場景即時合成，使用前瞻排程（lookahead scheduling）確保節拍穩定。
 * 所有錯誤只會讓音樂靜音，不影響遊戲。
 */
export type MusicKind = 'village' | 'dungeon' | 'combat' | 'boss';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Track {
  bpm: number;
  /** 每一拍呼叫，time 為該拍的音訊時間 */
  beat(beat: number, time: number, spb: number): void;
}

export class Music {
  private bus: GainNode;
  private trackGain: GainNode | null = null;
  private timer = 0;
  private nextBeatTime = 0;
  private beatIndex = 0;
  private current: string | null = null;
  private track: Track | null = null;
  private readonly delayIn: GainNode;

  constructor(private readonly ctx: AudioContext, out: AudioNode, private readonly noise: AudioBuffer) {
    this.bus = ctx.createGain();
    this.bus.connect(out);
    // 迴響感：帶低通的回授延遲
    this.delayIn = ctx.createGain();
    this.delayIn.gain.value = 0.35;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.37;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.delayIn.connect(delay).connect(lp).connect(fb).connect(delay);
    lp.connect(this.bus);
  }

  setVolume(v: number): void {
    // 合成音色本身很輕，乘上增益讓 100% 音量落在約 -20 dBFS，仍低於音效
    this.bus.gain.setTargetAtTime(v * 3, this.ctx.currentTime, 0.1);
  }

  play(kind: MusicKind | null, root = 50): void {
    const key = `${kind}:${root}`;
    if (key === this.current) return;
    this.current = key;
    const t = this.ctx.currentTime;
    if (this.trackGain) {
      const old = this.trackGain;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 1.2);
      window.setTimeout(() => old.disconnect(), 1500);
    }
    window.clearInterval(this.timer);
    this.track = null;
    if (!kind) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 1.5);
    g.connect(this.bus);
    g.connect(this.delayIn);
    this.trackGain = g;
    this.track = this.makeTrack(kind, root, g);
    this.beatIndex = 0;
    this.nextBeatTime = t + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule(): void {
    const track = this.track;
    if (!track) return;
    const spb = 60 / track.bpm;
    while (this.nextBeatTime < this.ctx.currentTime + 0.25) {
      try {
        track.beat(this.beatIndex, this.nextBeatTime, spb);
      } catch {
        /* 單一音符失敗不影響後續 */
      }
      this.nextBeatTime += spb;
      this.beatIndex++;
    }
  }

  // ───── 樂器 ─────
  private pluck(out: AudioNode, freq: number, time: number, dur: number, gain: number, bright = 2400): void {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, time);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(freq * 1.002, time);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright, time);
    f.frequency.exponentialRampToValueAtTime(400, time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(out);
    o.start(time);
    o2.start(time);
    o.stop(time + dur + 0.05);
    o2.stop(time + dur + 0.05);
  }

  private pad(out: AudioNode, freqs: number[], time: number, dur: number, gain: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    f.connect(g).connect(out);
    for (const fr of freqs) {
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(time);
        o.stop(time + dur + 0.05);
      }
    }
  }

  private bell(out: AudioNode, freq: number, time: number, gain: number): void {
    for (const [ratio, g0, d] of [[1, 1, 3.2], [2.76, 0.4, 1.6], [5.4, 0.2, 0.8]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain * g0, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + d);
      o.connect(g).connect(out);
      o.start(time);
      o.stop(time + d + 0.05);
    }
  }

  private drum(out: AudioNode, time: number, kind: 'kick' | 'snare' | 'tom', gain: number): void {
    if (kind === 'snare') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      src.connect(f).connect(g).connect(out);
      src.start(time, Math.random() * 0.5);
      src.stop(time + 0.2);
      return;
    }
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const start = kind === 'kick' ? 110 : 160;
    o.frequency.setValueAtTime(start, time);
    o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 38 : 70, time + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (kind === 'kick' ? 0.4 : 0.3));
    o.connect(g).connect(out);
    o.start(time);
    o.stop(time + 0.45);
  }

  private makeTrack(kind: MusicKind, root: number, out: AudioNode): Track {
    const rnd = () => Math.random();
    switch (kind) {
      case 'village': {
        // D 多利安：Dm – C – Dm – G
        const chords = [[62, 65, 69], [60, 64, 67], [62, 65, 69], [55, 59, 62]];
        const pattern = [0, 1, 2, 3, 2, 1];
        return {
          bpm: 76,
          beat: (b, t, spb) => {
            const bar = Math.floor(b / 4) % chords.length;
            const ch = chords[bar];
            if (b % 4 === 0) {
              this.pad(out, ch.map((n) => midi(n - 12)), t, spb * 4.2, 0.018);
              this.pluck(out, midi(ch[0] - 24), t, spb * 2, 0.06, 900);
            }
            for (let i = 0; i < 2; i++) {
              const step = pattern[((b % 4) * 2 + i) % pattern.length];
              const note = step === 3 ? ch[0] + 12 : ch[step];
              if (rnd() < 0.92) this.pluck(out, midi(note), t + i * spb * 0.5, 0.9, 0.045);
            }
            // 偶爾的旋律裝飾
            if (b % 8 === 6 && rnd() < 0.6) {
              const scale = [74, 76, 77, 79, 81];
              this.pluck(out, midi(scale[Math.floor(rnd() * scale.length)]), t + spb * 0.25, 1.4, 0.035, 3200);
            }
          },
        };
      }
      case 'dungeon': {
        // 低沉持續音＋稀疏的迴響鐘聲（小調五聲音階）
        const penta = [0, 3, 5, 7, 10, 12, 15];
        return {
          bpm: 50,
          beat: (b, t, spb) => {
            if (b % 8 === 0) this.pad(out, [midi(root - 12), midi(root - 5)], t, spb * 8.3, 0.016);
            if (b % 2 === 1 && rnd() < 0.35) {
              const n = root + 12 + penta[Math.floor(rnd() * penta.length)];
              this.bell(out, midi(n), t, 0.03);
            }
          },
        };
      }
      case 'combat':
      case 'boss': {
        const boss = kind === 'boss';
        const riff = boss ? [0, 0, 3, 0, 6, 5, 3, 1] : [0, 0, 7, 0, 3, 0, 5, 3];
        const motif = [12, 15, 14, 12, 10, 12, 7, 8];
        return {
          bpm: boss ? 132 : 118,
          beat: (b, t, spb) => {
            for (let i = 0; i < 2; i++) {
              const n = root - 12 + riff[(b * 2 + i) % riff.length];
              this.pluck(out, midi(n), t + i * spb * 0.5, spb * 0.45, 0.07, 1100);
            }
            if (b % 2 === 0) this.drum(out, t, 'kick', 0.32);
            else this.drum(out, t, 'snare', 0.08);
            if (boss && b % 4 === 3) this.drum(out, t + spb * 0.5, 'tom', 0.22);
            if (b % 8 === 0) this.pad(out, [midi(root), midi(root + 3), midi(root + 7)], t, spb * 8, 0.012);
            if (boss && b >= 16) {
              const n = root + motif[Math.floor(b / 2) % motif.length];
              if (b % 2 === 0) this.pluck(out, midi(n), t, spb * 1.8, 0.04, 2600);
            }
          },
        };
      }
    }
  }
}
