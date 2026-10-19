/**
 * 程序化 Web Audio 音效：零外部檔案。
 * 所有聲音經過 master gain；第一次使用者互動時才建立/恢復 AudioContext。
 * 任何錯誤都只會讓聲音消失，絕不中斷遊戲。
 */
import { Music, type MusicKind } from './Music';

const SETTINGS_KEY = 'lineage3d.audio';

type Wave = OscillatorType;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private ambient: { stop(): void } | null = null;
  private ambientKind: string | null = null;
  private pendingAmbient: ['village' | 'dungeon' | null, number] | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: Music | null = null;
  private pendingMusic: [MusicKind | null, number] | null = null;
  muted = false;
  volume = 0.7;
  musicVolume = 0.55;

  constructor() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { muted?: boolean; volume?: number; musicVolume?: number };
        this.muted = !!s.muted;
        if (typeof s.volume === 'number') this.volume = Math.max(0, Math.min(1, s.volume));
        if (typeof s.musicVolume === 'number') this.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
      }
    } catch {
      /* 偏好設定讀取失敗時使用預設值 */
    }
  }

  /** 必須在使用者手勢中呼叫（瀏覽器自動播放政策） */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.ambientBus = this.ctx.createGain();
        this.ambientBus.gain.value = 0.5;
        this.ambientBus.connect(this.master);
        this.applyVolume();
        const len = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.music = new Music(this.ctx, this.master, this.noiseBuffer);
        this.music.setVolume(this.musicVolume);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.pendingMusic) {
        const [kind, root] = this.pendingMusic;
        this.pendingMusic = null;
        this.setMusic(kind, root);
      }
      if (this.pendingAmbient) {
        const [kind, pitch] = this.pendingAmbient;
        this.pendingAmbient = null;
        this.setAmbient(kind, pitch);
      }
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
    this.persist();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.persist();
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.music?.setVolume(this.musicVolume);
    this.persist();
  }

  /** 切換背景音樂（root 為主音的 MIDI 音高） */
  setMusic(kind: MusicKind | null, root = 50): void {
    if (!this.music || !this.ready()) {
      this.pendingMusic = [kind, root];
      return;
    }
    try {
      this.music.play(kind, root);
    } catch {
      /* 音樂失敗時保持安靜 */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: this.muted, volume: this.volume, musicVolume: this.musicVolume }));
    } catch {
      /* 無法儲存偏好時忽略 */
    }
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.6, this.ctx.currentTime, 0.05);
  }

  private ready(): AudioContext | null {
    return this.ctx && this.sfxBus && this.ctx.state !== 'closed' ? this.ctx : null;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; slideTo?: number; delay?: number; attack?: number } = {}): void {
    const ctx = this.ready();
    if (!ctx || !this.sfxBus) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, opts: { filter?: BiquadFilterType; freq?: number; freqTo?: number; q?: number; gain?: number; delay?: number } = {}): void {
    const ctx = this.ready();
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ───── 音效 ─────
  swing(): void {
    this.noise(0.16, { freq: 2400, freqTo: 500, q: 2, gain: 0.35 });
  }
  hit(crit = false): void {
    this.tone(crit ? 220 : 160, 0.16, { type: 'triangle', slideTo: 45, gain: 0.5 });
    this.noise(0.08, { filter: 'lowpass', freq: 1800, gain: 0.35 });
    if (crit) this.tone(1320, 0.18, { type: 'square', gain: 0.06, delay: 0.02 });
  }
  miss(): void {
    this.noise(0.22, { freq: 900, freqTo: 3000, q: 3, gain: 0.18 });
  }
  hurt(heavy = false): void {
    this.tone(heavy ? 90 : 120, heavy ? 0.35 : 0.2, { type: 'sawtooth', slideTo: 40, gain: 0.28 });
    this.noise(0.15, { filter: 'lowpass', freq: 600, gain: 0.4 });
  }
  block(): void {
    this.tone(1800, 0.25, { type: 'triangle', slideTo: 1500, gain: 0.15 });
    this.tone(2700, 0.2, { type: 'sine', gain: 0.08 });
  }
  footstep(): void {
    this.noise(0.07, { filter: 'lowpass', freq: 380 + Math.random() * 120, gain: 0.25 });
  }
  bump(): void {
    this.tone(70, 0.12, { type: 'sine', gain: 0.3 });
  }
  potion(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { type: 'sine', gain: 0.12, delay: i * 0.055 }));
    this.noise(0.25, { freq: 3000, q: 6, gain: 0.05 });
  }
  magic(): void {
    [392, 523, 784].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.1, delay: i * 0.05, attack: 0.05 }));
    this.noise(0.5, { freq: 4000, freqTo: 1500, q: 4, gain: 0.06 });
  }
  chest(): void {
    this.tone(180, 0.12, { type: 'square', gain: 0.08 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', gain: 0.14, delay: 0.12 + i * 0.08 }));
  }
  coin(): void {
    this.tone(988, 0.08, { type: 'square', gain: 0.06 });
    this.tone(1319, 0.18, { type: 'square', gain: 0.06, delay: 0.07 });
  }
  levelUp(): void {
    [440, 554, 659, 880, 1109, 1319].forEach((f, i) => this.tone(f, 0.22, { type: 'square', gain: 0.07, delay: i * 0.075 }));
    this.tone(1760, 0.6, { type: 'triangle', gain: 0.08, delay: 0.5 });
  }
  bossAlert(): void {
    this.tone(82, 0.9, { type: 'sawtooth', gain: 0.25, slideTo: 70 });
    this.tone(87, 0.9, { type: 'sawtooth', gain: 0.2, delay: 0.3, slideTo: 60 });
    this.noise(1.2, { filter: 'lowpass', freq: 200, gain: 0.3 });
  }
  charge(): void {
    this.tone(110, 0.7, { type: 'sawtooth', slideTo: 330, gain: 0.12, attack: 0.3 });
  }
  monsterDie(): void {
    this.tone(200, 0.5, { type: 'sawtooth', slideTo: 40, gain: 0.18 });
    this.noise(0.4, { filter: 'lowpass', freq: 800, freqTo: 100, gain: 0.25 });
  }
  stairs(): void {
    for (let i = 0; i < 5; i++) this.noise(0.08, { filter: 'lowpass', freq: 420 - i * 40, gain: 0.22, delay: i * 0.13 });
  }
  enchantSuccess(): void {
    [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.1, delay: i * 0.06 }));
  }
  enchantFail(): void {
    this.noise(0.6, { freq: 3000, freqTo: 200, q: 1, gain: 0.3 });
    this.tone(300, 0.6, { type: 'sawtooth', slideTo: 60, gain: 0.15 });
  }
  death(): void {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.14, delay: i * 0.28 }));
  }
  victory(): void {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.3, { type: 'square', gain: 0.07, delay: i * 0.14 }));
  }
  click(): void {
    this.tone(660, 0.04, { type: 'square', gain: 0.03 });
  }
  error(): void {
    this.tone(160, 0.15, { type: 'square', gain: 0.06 });
  }

  /** 環境音：地監為低頻嗡鳴＋滴水，村莊為營火劈啪 */
  setAmbient(kind: 'village' | 'dungeon' | null, pitch = 55): void {
    const key = `${kind}:${pitch}`;
    if (this.ambientKind === key) return;
    const ctx = this.ready();
    if (!ctx) {
      // AudioContext 尚未解鎖：記下來，解鎖後再播放
      this.pendingAmbient = [kind, pitch];
      return;
    }
    this.ambientKind = key;
    this.ambient?.stop();
    this.ambient = null;
    if (!this.ambientBus || !kind || !this.noiseBuffer) return;
    const bus = this.ambientBus;
    const nodes: AudioScheduledSourceNode[] = [];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(bus);
    let timer = 0;

    if (kind === 'dungeon') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      lp.connect(out);
      for (const detune of [0, 7, -5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = pitch;
        o.detune.value = detune * 10;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        o.connect(g).connect(lp);
        o.start();
        nodes.push(o);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();
      nodes.push(lfo);
      const drip = () => {
        if (this.ambientKind !== key) return;
        if (!this.muted) this.tone(1400 + Math.random() * 900, 0.12, { type: 'sine', slideTo: 600, gain: 0.04 });
        timer = window.setTimeout(drip, 2500 + Math.random() * 6000);
      };
      timer = window.setTimeout(drip, 2000);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      src.connect(bp).connect(g).connect(out);
      src.start();
      nodes.push(src);
      const crackle = () => {
        if (this.ambientKind !== key) return;
        if (!this.muted) this.noise(0.03, { freq: 2000 + Math.random() * 3000, q: 2, gain: 0.08 + Math.random() * 0.08 });
        timer = window.setTimeout(crackle, 80 + Math.random() * 500);
      };
      crackle();
    }

    this.ambient = {
      stop: () => {
        window.clearTimeout(timer);
        try {
          const t = ctx.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(out.gain.value, t);
          out.gain.linearRampToValueAtTime(0, t + 0.8);
          nodes.forEach((n) => n.stop(t + 0.9));
        } catch {
          /* 節點已停止 */
        }
      },
    };
  }
}

export const audio = new AudioEngine();
