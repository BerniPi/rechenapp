// Kurze Töne per WebAudio – keine Audiodateien nötig.
const Ton = {
  ctx: null,
  an: true, // false = alle Töne stumm

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },

  note(freq, start, dauer, typ = 'sine', laut = 0.25, bisFreq = null) {
    if (!this.an || !this.init()) return;
    const c = this.ctx;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = typ;
    o.frequency.setValueAtTime(freq, t);
    if (bisFreq) o.frequency.exponentialRampToValueAtTime(bisFreq, t + dauer);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(laut, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dauer + 0.05);
  },

  richtig() { this.note(880, 0, 0.12, 'triangle', 0.3); this.note(1320, 0.08, 0.2, 'triangle', 0.3); },
  falsch() { this.note(220, 0, 0.28, 'square', 0.12, 150); },
  klick() { this.note(660, 0, 0.05, 'triangle', 0.15); },
  flap() { this.note(500, 0, 0.09, 'triangle', 0.15, 800); },
  crash() { this.note(300, 0, 0.4, 'sawtooth', 0.15, 60); },
  punkt() { this.note(1046, 0, 0.08, 'triangle', 0.2); },
  stern(i) { this.note(660 * Math.pow(1.122, i * 2), 0, 0.25, 'triangle', 0.25); },
  jubel() {
    [523, 659, 784, 1046].forEach((f, i) => this.note(f, i * 0.1, 0.25, 'triangle', 0.25));
  },
};
