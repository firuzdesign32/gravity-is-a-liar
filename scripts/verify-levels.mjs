// Headless solver: proves each level can be finished with human-like inputs
// (inputs change at most every 0.1s, hazards inflated by 3px). Usage: node scripts/verify-levels.mjs [levelNumber]
import { World, T, DT } from '../src/world.js';
import { LEVELS } from '../src/levels.js';

const DECISION = 12;          // physics steps per decision (0.1s)
const MAX_TIME = 150;         // seconds
const CAP = Number(process.env.CAP || 1500);

function key(w, absTime) {
  const p = w.players[0];
  let k = `${Math.round(p.x / 4)},${Math.round(p.y / 4)},${Math.round(p.vy / 80)},${Math.round(p.vx / 60)},${p.g},${p.grounded ? 1 : 0}`;
  if (w.crumbles.size) k += '|' + [...w.crumbles.keys()].sort().join('.');
  if (w.boss) k += '|b' + w.boss.hits;
  if (absTime) k += '|t' + Math.round(w.t * 10);
  return k;
}

function period(level) {
  const ps = level.saws.filter(s => s.axis).map(s => s.period);
  if (level.laser) ps.push(level.laser.period);
  return ps;
}

function solve(level, seed) {
  const timeDependent = level.liar || level.chase || level.boss || period(level).length > 0;
  let layer = [{ w: new World(level, 1, { strict: true, seed }), path: [] }];
  const seen = new Set();
  const actions = [];
  for (const dir of [1, 0, -1]) for (const flip of [false, true]) actions.push({ dir, flip });
  const ex = level.exit;
  for (let step = 0; step * DECISION * DT < MAX_TIME; step++) {
    const next = new Map();
    for (const node of layer) {
      const p0 = node.w.players[0];
      for (const a of actions) {
        if (a.flip && !(p0.grounded || p0.coyote > 0)) continue;
        const w = node.w.clone();
        let dead = false;
        for (let i = 0; i < DECISION; i++) {
          w.step([{ left: a.dir < 0, right: a.dir > 0, flip: a.flip && i === 0 }]);
          if (w.players[0].dead) { dead = true; break; }
          if (w.finished) return { time: w.t, flips: w.players[0].flips, path: [...node.path, a] };
        }
        if (dead) continue;
        const k = key(w, timeDependent);
        if (seen.has(k) || next.has(k)) continue;
        next.set(k, { w, path: [...node.path, a] });
      }
    }
    for (const k of next.keys()) seen.add(k);
    let arr = [...next.values()];
    if (!arr.length) return null;
    if (arr.length > CAP) {
      const score = (n) => {
        const p = n.w.players[0];
        if (n.w.boss) {
          const B = n.w.boss, o = level.boss.orbs[B.orb] || ex;
          return B.hits * 100000 - Math.hypot(p.x - o.x, p.y - o.y) + Math.random() * 40;
        }
        return p.x + Math.random() * 40;
      };
      arr.forEach(n => (n.s = score(n)));
      arr.sort((a, b) => b.s - a.s);
      arr = arr.slice(0, CAP);
    }
    layer = arr;
  }
  return null;
}

const only = process.argv[2] ? Number(process.argv[2]) : null;
let ok = true;
LEVELS.forEach((lv, i) => {
  if (only && only !== i + 1) return;
  const seeds = lv.liar ? [1, 2, 3] : [1];
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = solve(lv, seed);
    const ms = Date.now() - t0;
    if (r) console.log(`L${i + 1} ${lv.name.padEnd(18)} seed ${seed}: OK  ${r.time.toFixed(1)}s, ${r.flips} flips  (${ms}ms)`);
    else { ok = false; console.log(`L${i + 1} ${lv.name.padEnd(18)} seed ${seed}: FAILED (${ms}ms)`); }
  }
});
process.exit(ok ? 0 : 1);
