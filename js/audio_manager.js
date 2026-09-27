/**
 * AudioManager / GameAudio - Procedural Web Audio API Sound Effects
 * Creates crisp, zero-dependency 8/16-bit RPG audio effects.
 */
const GameAudio = {
    ctx: null,
    muted: false,
    masterVolume: 0.3,

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    },

    setMuted(mute) {
        this.muted = !!mute;
    },

    playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.2) {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(gainVal * this.masterVolume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    },

    playAttack() {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.12);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.3 * this.masterVolume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();
        } catch (e) {}
    },

    playHit() {
        if (this.muted) return;
        try {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.4 * this.masterVolume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        } catch (e) {}
    },

    playPotion() {
        if (this.muted) return;
        [440, 554, 659, 880].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.12, 0.15), i * 60);
        });
    },

    playChestOpen() {
        if (this.muted) return;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'triangle', 0.22, 0.2), i * 90);
        });
    },

    playLevelUp() {
        if (this.muted) return;
        [440, 554, 659, 880, 1108, 1318].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'square', 0.18, 0.12), i * 70);
        });
    },

    playBossAlert() {
        if (this.muted) return;
        this.playTone(85, 'sawtooth', 0.6, 0.35);
        setTimeout(() => this.playTone(75, 'sawtooth', 0.8, 0.4), 250);
    },

    playFootstep() {
        if (this.muted) return;
        this.playTone(90 + Math.random() * 20, 'sine', 0.05, 0.08);
    }
};

window.GameAudio = GameAudio;
window.AudioManager = GameAudio;
