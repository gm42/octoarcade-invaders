/*
 * audio.js - Web Audio sound effects (no asset files).
 *
 * The AudioContext can only start after a user gesture, so unlock() is called
 * from the first keypress. Effects are short oscillator blips.
 */

const Sfx = {
  ctx: null,
  enabled: true,

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) this.ctx = new AC();
  },

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  // One oscillator blip with a linear pitch slide and quick decay envelope.
  tone(freq, dur, type = 'square', vol = 0.15, slideTo = null) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.linearRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  },

  shoot() { this.tone(720, 0.12, 'square', 0.10, 420); },
  alienHit() { this.tone(180, 0.16, 'sawtooth', 0.16, 70); },
  playerHit() { this.tone(140, 0.5, 'sawtooth', 0.2, 40); },
  ufo() { this.tone(560, 0.18, 'triangle', 0.14, 880); },
  step(high) { this.tone(high ? 150 : 120, 0.05, 'square', 0.05); },
  level() {
    this.tone(440, 0.1, 'square', 0.14);
    setTimeout(() => this.tone(660, 0.14, 'square', 0.14), 110);
  },
};
