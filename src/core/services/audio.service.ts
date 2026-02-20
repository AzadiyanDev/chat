import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioCtx: AudioContext | null = null;

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
  }

  // ============ Sound Effects ============

  playSendSound() {
    this.playTone(880, 0.08, 'sine', 0.15);
    setTimeout(() => this.playTone(1100, 0.06, 'sine', 0.1), 60);
  }

  playReceiveSound() {
    this.playTone(660, 0.1, 'sine', 0.12);
    setTimeout(() => this.playTone(880, 0.08, 'sine', 0.08), 80);
  }

  playReactionSound() {
    this.playTone(523, 0.06, 'sine', 0.12);
    setTimeout(() => this.playTone(659, 0.06, 'sine', 0.1), 50);
    setTimeout(() => this.playTone(784, 0.06, 'sine', 0.08), 100);
  }

  playPopSound() {
    this.playTone(600, 0.05, 'sine', 0.15);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) {
    try {
      const ctx = this.getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }
}