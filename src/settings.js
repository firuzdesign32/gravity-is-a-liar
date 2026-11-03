// Persistent settings, key bindings and progress (localStorage, always wrapped in try/catch).
const KEY = 'gial-settings-v1';
const PKEY = 'gial-progress-v1';

export const DEFAULT_BINDINGS = [
  { left: ['KeyA'], right: ['KeyD'], flip: ['KeyW', 'Space'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], flip: ['ArrowUp'] },
  { left: ['KeyJ'], right: ['KeyL'], flip: ['KeyI'] },
  { left: ['Numpad4'], right: ['Numpad6'], flip: ['Numpad8'] },
];
export const DEFAULT_GLOBAL = { pause: ['Escape', 'KeyP'], restart: ['KeyR'] };

const DEFAULTS = {
  volume: 0.7,
  shake: true,
  quality: 'auto',      // auto | high | low
  touch: 'auto',        // auto | on | off
  blinkPlayer: 0,       // which player the webcam controls
  blinkSensitivity: 0.75,
  showCam: true,
  name: '',
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }

const stored = load(KEY) || {};
export const settings = { ...DEFAULTS, ...stored };
settings.bindings = stored.bindings && stored.bindings.length === 4 ? stored.bindings : clone(DEFAULT_BINDINGS);
settings.global = stored.global || clone(DEFAULT_GLOBAL);

export function saveSettings() { save(KEY, settings); }
export function resetBindings() {
  settings.bindings = clone(DEFAULT_BINDINGS);
  settings.global = clone(DEFAULT_GLOBAL);
  saveSettings();
}

const prog = load(PKEY) || {};
export const progress = { unlocked: prog.unlocked || 1, best: prog.best || {}, deaths: prog.deaths || {} };
export function saveProgress() { save(PKEY, progress); }

export function keyLabel(code) {
  if (!code) return '—';
  const map = {
    Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Enter: 'Enter',
    Backspace: 'Bksp', Tab: 'Tab', AltLeft: 'L-Alt', AltRight: 'R-Alt',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
