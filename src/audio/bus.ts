import { Howl } from 'howler';

export type Sound = 'deal' | 'flip' | 'chip' | 'collect' | 'fold' | 'check' | 'win' | 'tick';

type NoiseFilter = 'lowpass' | 'highpass' | 'bandpass';
type FileSound = { src: string; volume: number; rate?: number; repeats?: number; gapMs?: number };

const FILE_SOUNDS: Partial<Record<Sound, FileSound>> = {
  // 用户提供的外部音效，放在 public/sounds 下，由 Vite 以 /sounds/... 直接提供
  deal: { src: '/sounds/card-shuffle.mp3', volume: 0.9, rate: 1.05 },
  flip: { src: '/sounds/card-flip.mp3', volume: 0.65 },
  chip: { src: '/sounds/chip-place.mp3', volume: 1 },
  collect: { src: '/sounds/chip-place.mp3', volume: 1, rate: 0.92, repeats: 2, gapMs: 90 },
  win: { src: '/sounds/win.mp3', volume: 0.72 },
};

class AudioBus {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private fileFailed = new Set<string>();
  private fileSounds: Partial<Record<Sound, Howl>> = {};

  constructor() {
    if (typeof window !== 'undefined') {
      (Object.entries(FILE_SOUNDS) as [Sound, FileSound][]).forEach(([sound, cfg]) => {
        this.fileSounds[sound] = new Howl({
          src: [cfg.src],
          volume: cfg.volume,
          preload: true,
          html5: true,
          onloaderror: () => this.fileFailed.add(cfg.src),
        });
      });
    }
  }

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
      catch { return null; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) { this.muted = m; }

  play(sound: Sound) {
    if (this.muted) return;
    if (this.playFile(sound)) return;
    this.playSynth(sound);
  }

  private playFile(sound: Sound): boolean {
    if (typeof window === 'undefined') return false;
    const cfg = FILE_SOUNDS[sound];
    const howl = this.fileSounds[sound];
    if (!cfg || !howl || this.fileFailed.has(cfg.src)) return false;

    const repeats = cfg.repeats ?? 1;
    for (let i = 0; i < repeats; i++) {
      window.setTimeout(() => {
        if (this.muted) return;
        try {
          const id = howl.play();
          howl.volume(cfg.volume, id);
          howl.rate(cfg.rate ?? 1, id);
          howl.once('playerror', () => {
            howl.once('unlock', () => {
              if (!this.muted) {
                const retryId = howl.play();
                howl.volume(cfg.volume, retryId);
                howl.rate(cfg.rate ?? 1, retryId);
              }
            });
          }, id);
        } catch {
          this.fileFailed.add(cfg.src);
          this.playSynth(sound);
        }
      }, i * (cfg.gapMs ?? 0));
    }
    return true;
  }

  private playSynth(sound: Sound) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    switch (sound) {
      case 'deal':
        this.cardSlide(ctx, now);
        break;
      case 'flip':
        this.cardFlip(ctx, now);
        break;
      case 'chip':
        this.chipClick(ctx, now);
        break;
      case 'collect':
        this.chipRake(ctx, now);
        break;
      case 'fold':
        this.foldSoft(ctx, now);
        break;
      case 'check':
        this.tableTap(ctx, now);
        break;
      case 'win':
        this.winSting(ctx, now);
        break;
      case 'tick':
        this.tone(ctx, now, 1200, 0.035, 0.025, 'sine');
        break;
    }
  }

  private master(ctx: AudioContext, vol: number, at: number, dur: number) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    gain.connect(ctx.destination);
    return gain;
  }

  private tone(ctx: AudioContext, at: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    const gain = this.master(ctx, vol, at, dur);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(ctx: AudioContext, at: number, dur: number, vol: number, filterType: NoiseFilter, freq: number, q = 0.8) {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, at);
    filter.Q.setValueAtTime(q, at);
    const gain = this.master(ctx, vol, at, dur);
    source.connect(filter);
    filter.connect(gain);
    source.start(at);
    source.stop(at + dur + 0.02);
  }

  private getNoiseBuffer(ctx: AudioContext) {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  private cardSlide(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.12, 0.032, 'bandpass', 1800, 0.9);
    this.tone(ctx, at + 0.018, 720, 0.045, 0.018, 'triangle');
    this.tone(ctx, at + 0.055, 1180, 0.035, 0.012, 'sine');
  }

  private cardFlip(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.08, 0.035, 'highpass', 1800, 0.7);
    this.tone(ctx, at + 0.015, 520, 0.045, 0.018, 'triangle');
    this.tone(ctx, at + 0.05, 960, 0.035, 0.012, 'sine');
  }

  private chipClick(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.055, 0.022, 'highpass', 2400, 1.1);
    [1220, 1680, 2380].forEach((freq, i) => {
      this.tone(ctx, at + i * 0.018, freq, 0.07, 0.018 - i * 0.003, i === 0 ? 'triangle' : 'sine');
    });
  }

  private chipRake(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.34, 0.04, 'bandpass', 1100, 0.7);
    [0, 0.045, 0.085, 0.13, 0.18, 0.235].forEach((offset, i) => {
      this.tone(ctx, at + offset, 950 + i * 170, 0.055, 0.018, 'triangle');
      this.tone(ctx, at + offset + 0.012, 1800 + i * 120, 0.04, 0.01, 'sine');
    });
  }

  private foldSoft(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.11, 0.028, 'lowpass', 900, 0.9);
    this.tone(ctx, at + 0.025, 180, 0.08, 0.018, 'triangle');
  }

  private tableTap(ctx: AudioContext, at: number) {
    this.noise(ctx, at, 0.045, 0.026, 'bandpass', 650, 1.6);
    this.tone(ctx, at, 310, 0.05, 0.016, 'triangle');
  }

  private winSting(ctx: AudioContext, at: number) {
    [523, 659, 784, 1047].forEach((freq, i) => {
      this.tone(ctx, at + i * 0.085, freq, 0.22, 0.028, 'sine');
    });
    this.noise(ctx, at + 0.18, 0.22, 0.024, 'highpass', 2600, 0.8);
    this.tone(ctx, at + 0.34, 1568, 0.28, 0.018, 'triangle');
  }
}

export const audioBus = new AudioBus();
