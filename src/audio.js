/*
 * audio.js - Web Audio effects and a looping level soundtrack (no asset files).
 *
 * The AudioContext can only start after a user gesture, so unlock() is called
 * from the first keypress. Effects are short blips; music uses the audio clock.
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
    if (!this.enabled) Music.stop(true);
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

const Music = {
  // Original 32-step melody in C minor, with a simple bass accompaniment.
  melody: [60, null, 63, 67, 63, null, 58, 55, 60, 63, 67, null, 70, 67, 63, null,
    65, null, 68, 72, 68, null, 63, 60, 67, 65, 63, 62, 58, null, 55, null],
  bass: [36, 36, 41, 43],
  stepSeconds: 0.2,
  step: 0,
  nextTime: 0,
  active: false,
  notes: new Set(),

  update(state) {
    if (state !== 'playing' || !Sfx.enabled || !Sfx.ctx) {
      this.stop(state === 'paused' || (state === 'playing' && !Sfx.enabled));
      return;
    }
    const now = Sfx.ctx.currentTime;
    if (!this.active) { this.active = true; this.nextTime = now; }
    // A backgrounded tab resumes at the current clock, without queued catch-up notes.
    if (this.nextTime < now) this.nextTime = now;
    while (this.nextTime < now + 0.1) {
      const pitch = this.melody[this.step];
      if (pitch !== null) this.note(pitch, this.nextTime, 0.16, 'square', 0.025);
      if (this.step % 4 === 0) {
        this.note(this.bass[Math.floor(this.step / 8)], this.nextTime, 0.32, 'triangle', 0.06);
      }
      this.step = (this.step + 1) % this.melody.length;
      this.nextTime += this.stepSeconds;
    }
  },

  note(pitch, at, duration, type, volume) {
    const osc = Sfx.ctx.createOscillator();
    const gain = Sfx.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(440 * Math.pow(2, (pitch - 69) / 12), at);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(Sfx.ctx.destination);
    const note = { osc, gain };
    this.notes.add(note);
    osc.onended = () => { this.notes.delete(note); osc.disconnect(); gain.disconnect(); };
    osc.start(at);
    osc.stop(at + duration);
  },

  stop(preservePosition = false) {
    for (const { osc, gain } of this.notes) {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    }
    this.notes.clear();
    this.active = false;
    if (!preservePosition) this.step = 0;
  },
};
