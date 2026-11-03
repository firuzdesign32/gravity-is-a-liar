// Tiny Web Audio synth: no audio files to download.
import { settings } from './settings.js';

let ctx = null, master = null;

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.connect(ctx.destination);
    } catch { return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, delay = 0 }) {
  if (!ctx || settings.volume <= 0) return;
  master.gain.value = settings.volume;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur = 0.25, vol = 0.3, lp = 1200) {
  if (!ctx || settings.volume <= 0) return;
  master.gain.value = settings.volume;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start();
}

export const sfx = {
  flip: (up) => tone({ type: 'triangle', f0: up ? 300 : 700, f1: up ? 900 : 250, dur: 0.16, vol: 0.18 }),
  forced: () => { tone({ type: 'sawtooth', f0: 200, f1: 1200, dur: 0.25, vol: 0.12 }); },
  land: () => tone({ type: 'sine', f0: 140, f1: 60, dur: 0.08, vol: 0.12 }),
  death: () => { noise(0.35, 0.35, 900); tone({ type: 'square', f0: 220, f1: 40, dur: 0.3, vol: 0.12 }); },
  checkpoint: () => { tone({ f0: 660, dur: 0.1, vol: 0.15 }); tone({ f0: 990, dur: 0.15, vol: 0.15, delay: 0.08 }); },
  portal: () => [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.15, delay: i * 0.08 })),
  warn: () => tone({ type: 'square', f0: 880, dur: 0.05, vol: 0.06 }),
  crumble: () => noise(0.15, 0.15, 500),
  bossShot: () => tone({ type: 'sawtooth', f0: 120, f1: 60, dur: 0.2, vol: 0.1 }),
  bossHit: () => { noise(0.4, 0.3, 2000); tone({ type: 'square', f0: 90, f1: 30, dur: 0.5, vol: 0.2 }); },
  bossDead: () => { noise(1.2, 0.4, 1500); [392, 523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.15, delay: 0.3 + i * 0.12 })); },
  click: () => tone({ type: 'sine', f0: 600, dur: 0.05, vol: 0.08 }),
};
