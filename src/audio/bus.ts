/** 简单音效管理（一期用 WebAudio 合成）—— 二期换 Howler 加载真实音频 */
type Sound = 'deal' | 'chip' | 'fold' | 'check' | 'win' | 'tick';

class AudioBus {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
      catch { return null; }
    }
    return this.ctx;
  }

  setMuted(m: boolean) { this.muted = m; }

  play(sound: Sound) {
    if (this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const profiles: Record<Sound, { freq: number; type: OscillatorType; dur: number; vol: number }> = {
      deal:  { freq: 800,  type: 'square',   dur: 0.05, vol: 0.04 },
      chip:  { freq: 600,  type: 'triangle', dur: 0.08, vol: 0.06 },
      fold:  { freq: 200,  type: 'sawtooth', dur: 0.1,  vol: 0.04 },
      check: { freq: 400,  type: 'sine',     dur: 0.06, vol: 0.04 },
      win:   { freq: 880,  type: 'sine',     dur: 0.4,  vol: 0.08 },
      tick:  { freq: 1200, type: 'sine',     dur: 0.04, vol: 0.03 },
    };
    const p = profiles[sound];
    osc.type = p.type;
    osc.frequency.value = p.freq;
    gain.gain.setValueAtTime(p.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
    osc.start(now);
    osc.stop(now + p.dur);
  }
}

export const audioBus = new AudioBus();
