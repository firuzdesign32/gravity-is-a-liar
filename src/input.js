// Keyboard, gamepad, touch and blink input, merged per player.
import { settings } from './settings.js';

const down = new Set();
const pressedCodes = new Set();        // pressed since last poll
let capture = null;                    // rebind capture callback
const globalHandlers = [];
const touch = { left: false, right: false, flip: false };
const blinkQueue = [];                 // player ids that blinked
const padPrev = [];

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (capture) {
      e.preventDefault();
      const cb = capture; capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (isGameKey(e.code)) e.preventDefault();
    if (!e.repeat) {
      pressedCodes.add(e.code);
      for (const [action, codes] of Object.entries(settings.global)) {
        if (codes.includes(e.code)) globalHandlers.forEach(h => h(action));
      }
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
}

function isGameKey(code) {
  if (code === 'Space' || code.startsWith('Arrow')) return true;
  return settings.bindings.some(b => Object.values(b).some(c => c.includes(code)));
}

export function onGlobal(fn) { globalHandlers.push(fn); }
export function captureKey(cb) { capture = cb; }
export function cancelCapture() { capture = null; }
export function pushBlink(playerId) { blinkQueue.push(playerId); }
export function setTouch(k, v) { if (v && k === 'flip' && !touch.flip) touch.flipEdge = true; touch[k] = v; }

// gamepad i -> player i ; in solo every pad controls P1
function readPads(n, solo) {
  const out = [];
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  pads.forEach((gp, i) => {
    const pid = solo ? 0 : i;
    if (pid >= n) return;
    const ax = gp.axes[0] || 0;
    const b = (k) => !!(gp.buttons[k] && gp.buttons[k].pressed);
    const flipNow = b(0) || b(1) || b(2) || b(3) || b(4) || b(5) || b(12);
    const prev = padPrev[i] || {};
    const startNow = b(9);
    if (startNow && !prev.start) globalHandlers.forEach(h => h('pause'));
    out.push({ pid, left: ax < -0.35 || b(14), right: ax > 0.35 || b(15), flip: flipNow && !prev.flip });
    padPrev[i] = { flip: flipNow, start: startNow };
  });
  return out;
}

// Returns an array of {left,right,flip,buffer} for players [0..n)
// localSlots: which players are controlled on this device (all for local play, [0] for online client)
export function pollInputs(n, { solo = false, touchPlayer = 0 } = {}) {
  const res = [];
  for (let i = 0; i < n; i++) {
    const binds = [settings.bindings[i]];
    if (solo) binds.push(settings.bindings[1]);  // solo: arrows work too
    let left = false, right = false, flip = false;
    for (const b of binds) {
      if (!b) continue;
      left ||= b.left.some(c => down.has(c));
      right ||= b.right.some(c => down.has(c));
      flip ||= b.flip.some(c => pressedCodes.has(c));
    }
    res.push({ left, right, flip, buffer: 0.15 });
  }
  for (const g of readPads(n, solo)) {
    const r = res[g.pid]; r.left ||= g.left; r.right ||= g.right; r.flip ||= g.flip;
  }
  if (res[touchPlayer]) {
    const r = res[touchPlayer];
    r.left ||= touch.left; r.right ||= touch.right;
    if (touch.flipEdge) { r.flip = true; touch.flipEdge = false; }
  }
  while (blinkQueue.length) {
    const id = blinkQueue.shift();
    if (res[id]) { res[id].flip = true; res[id].buffer = 0.28; }  // blinks get a longer buffer
  }
  pressedCodes.clear();
  return res;
}

export function clearPressed() { pressedCodes.clear(); blinkQueue.length = 0; touch.flipEdge = false; }
