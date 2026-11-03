// Level definitions built with a tiny builder API (tile coordinates, 18 rows tall).
// Row 0 = ceiling, row 17 = floor. Player on floor -> gravity down, on ceiling -> gravity up.
import { T, PH } from './world.js';

const H = 18;

class B {
  constructor(width) {
    this.w = width;
    this.rows = [];
    for (let y = 0; y < H; y++) this.rows.push(new Array(width).fill(y === 0 || y === H - 1 ? '#' : '.'));
    this.saws = []; this.checkpoints = []; this.signs = [];
    this.spawn = { x: 2 * T + 5, y: (H - 1) * T - PH, g: 1 };
    this.exitPos = null;
  }
  set(x, y, ch) { if (x >= 0 && x < this.w && y >= 0 && y < H) this.rows[y][x] = ch; return this; }
  rect(x, y, w, h, ch = '#') { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch); return this; }
  // remove floor / ceiling (pits)
  gap(x, w, where = 'floor') {
    if (where !== 'ceil') this.rect(x, H - 1, w, 1, '.');
    if (where !== 'floor') this.rect(x, 0, w, 1, '.');
    return this;
  }
  spikes(x, w, where = 'floor') { return this.rect(x, where === 'floor' ? H - 2 : 1, w, 1, 'X'); }
  pillar(x, w, h, where = 'floor') { return where === 'floor' ? this.rect(x, H - 1 - h, w, h) : this.rect(x, 1, w, h); }
  crumble(x, w, where = 'floor') { return this.rect(x, where === 'floor' ? H - 1 : 0, w, 1, '%'); }
  laser(x, w = 1, y0 = 1, y1 = H - 2, alt = false) { return this.rect(x, y0, w, y1 - y0 + 1, alt ? 'l' : 'L'); }
  noflip(x, w, y0 = 1, y1 = H - 2) { return this.rect(x, y0, w, y1 - y0 + 1, 'N'); }
  saw(x, y) { this.saws.push({ x: x * T + T / 2, y: y * T + T / 2 }); return this; }
  msaw(x, y, axis, range, period, phase = 0, minHits) { this.saws.push({ x: x * T + T / 2, y: y * T + T / 2, axis, range, period, phase, minHits }); return this; }
  cp(x, where = 'floor') {
    this.checkpoints.push({ x: x * T + 5, y: where === 'floor' ? (H - 1) * T - PH : T, g: where === 'floor' ? 1 : -1 });
    return this;
  }
  start(x, where = 'floor') { this.spawn = { x: x * T + 5, y: where === 'floor' ? (H - 1) * T - PH : T, g: where === 'floor' ? 1 : -1 }; return this; }
  exit(x, where = 'floor') { this.exitPos = { x: x * T + T / 2, y: where === 'floor' ? (H - 1) * T - 32 : T + 32, where }; return this; }
  sign(x, y, text) { this.signs.push({ x: x * T, y: y * T, text }); return this; }
  build(meta) {
    return {
      ...meta,
      grid: this.rows.map(r => r.join('')),
      saws: this.saws, checkpoints: this.checkpoints, signs: this.signs,
      spawn: this.spawn, exit: this.exitPos || { x: (this.w - 3) * T, y: (H - 1) * T - 32, where: 'floor' },
    };
  }
}

// ------------------------------------------------------------------ levels
function L1() {
  const b = new B(72);
  b.sign(2, 12, 'Move: A / D  or  ← / →');
  b.sign(8, 10, 'Blink — or press W / ↑ / Space — to flip gravity');
  b.pillar(13, 2, 9, 'floor');
  b.sign(17, 6, 'You can only flip while standing on a surface');
  b.spikes(24, 4, 'floor');
  b.pillar(33, 2, 9, 'ceil');
  b.cp(38, 'floor');
  b.sign(38, 9, 'Checkpoint! Spikes = bad');
  b.spikes(43, 4, 'floor');
  b.spikes(52, 4, 'ceil');
  b.pillar(60, 2, 10, 'floor');
  b.exit(68, 'ceil');
  b.sign(62, 8, 'Reach the portal →');
  return b.build({ name: 'First Blink', hint: 'Blink or press Flip to walk on the ceiling.' });
}

function L2() {
  const b = new B(92);
  b.sign(2, 12, 'Floor, ceiling, floor, ceiling…');
  b.spikes(10, 3, 'floor');
  b.spikes(18, 3, 'ceil');
  b.spikes(26, 4, 'floor');
  b.pillar(33, 2, 10, 'ceil');
  b.spikes(36, 3, 'floor');
  b.pillar(41, 2, 10, 'floor');
  b.cp(46, 'ceil');
  b.spikes(50, 3, 'ceil');
  b.spikes(57, 3, 'floor');
  b.spikes(63, 3, 'ceil');
  b.spikes(69, 3, 'floor');
  b.pillar(75, 2, 9, 'floor');
  b.pillar(80, 2, 9, 'ceil');
  b.exit(88, 'floor');
  return b.build({ name: 'Ceiling Walker', hint: 'Flip early — the flight takes time.' });
}

function L3() {
  const b = new B(104);
  b.sign(2, 12, 'No floor? Walk on the ceiling.');
  b.gap(10, 5, 'floor');
  b.gap(20, 5, 'ceil');
  b.gap(30, 6, 'floor');
  b.cp(40, 'floor');
  b.sign(38, 9, 'Both open? Fly across mid-flip!');
  b.gap(46, 2, 'both');
  b.gap(56, 3, 'both');
  b.cp(64, 'floor');
  b.gap(68, 4, 'floor'); b.spikes(74, 3, 'ceil');
  b.gap(80, 2, 'both');
  b.gap(86, 5, 'ceil');
  b.exit(100, 'floor');
  return b.build({ name: 'Mind the Gap', hint: 'Flip just before a double gap and drift across.' });
}

function L4() {
  const b = new B(100);
  b.sign(2, 12, 'Gravity lies now. Watch for the warning flicker!');
  b.pillar(14, 2, 6, 'floor');
  b.pillar(24, 2, 6, 'ceil');
  b.spikes(32, 2, 'floor');
  b.spikes(40, 2, 'ceil');
  b.cp(46, 'floor');
  b.pillar(52, 2, 7, 'floor');
  b.spikes(60, 2, 'floor');
  b.spikes(66, 2, 'ceil');
  b.cp(72, 'floor');
  b.pillar(78, 2, 7, 'ceil');
  b.spikes(86, 2, 'ceil');
  b.exit(96, 'floor');
  return b.build({ name: 'The Liar Wakes', hint: 'Random flips! Stay near the middle of safe zones.', liar: { min: 3.2, max: 5.5 } });
}

function L5() {
  const b = new B(150);
  b.sign(2, 12, 'Blink storm — keep the rhythm');
  let x = 8;
  for (let i = 0; i < 10; i++) {
    b.spikes(x, 3, 'floor');
    b.spikes(x + 6, 3, 'ceil');
    if (i === 4) b.cp(x + 10, 'floor');
    x += 12;
  }
  b.exit(x + 6, 'floor');
  return b.build({ name: 'Blink Storm', hint: 'About 20 flips in 15 seconds. Breathe.' });
}

function L6() {
  const b = new B(118);
  b.sign(2, 12, 'Saws spin. Saws hurt.');
  b.saw(12, 8); b.saw(13, 9);
  b.spikes(16, 3, 'floor');
  b.msaw(24, 16, 'x', 2.5, 2.2);
  b.msaw(32, 1, 'x', 2.5, 2.2, Math.PI);
  b.cp(38, 'floor');
  b.msaw(44, 8.5, 'y', 6.5, 2.6);
  b.msaw(50, 8.5, 'y', 6.5, 2.6, Math.PI);
  b.spikes(54, 3, 'floor');
  b.msaw(60, 8.5, 'y', 6.5, 2.0, Math.PI / 2);
  b.cp(66, 'ceil');
  b.msaw(72, 1, 'x', 3, 1.8);
  b.spikes(78, 3, 'ceil');
  b.msaw(84, 16, 'x', 3, 1.8, 1);
  b.saw(90, 6); b.saw(90, 11);
  b.msaw(98, 8.5, 'y', 6.5, 1.6);
  b.pillar(104, 2, 9, 'floor');
  b.exit(113, 'floor');
  return b.build({ name: 'Saw Mill', hint: 'Watch the rhythm of the moving saws.' });
}

function L7() {
  const b = new B(118);
  b.sign(2, 12, 'Cracked blocks crumble. Keep moving!');
  b.gap(10, 6, 'floor'); b.crumble(10, 6, 'floor');
  b.gap(20, 6, 'ceil'); b.crumble(20, 6, 'ceil');
  b.spikes(30, 3, 'floor');
  b.cp(36, 'floor');
  b.gap(40, 10, 'floor'); b.crumble(40, 10, 'floor'); b.spikes(44, 3, 'ceil');
  b.gap(54, 8, 'both'); b.crumble(54, 8, 'floor'); b.crumble(54, 8, 'ceil'); b.saw(58, 8);
  b.cp(66, 'ceil');
  b.gap(70, 8, 'ceil'); b.crumble(70, 8, 'ceil'); b.spikes(72, 4, 'floor');
  b.gap(82, 12, 'both'); b.crumble(82, 5, 'floor'); b.crumble(89, 5, 'ceil');
  b.msaw(100, 8.5, 'y', 6.5, 2.4);
  b.exit(113, 'floor');
  return b.build({ name: 'Crumbling Faith', hint: 'Cracked floors break half a second after you touch them.' });
}

function L8() {
  const b = new B(120);
  b.sign(2, 12, 'Purple zones block flipping. Enter on the right side!');
  b.noflip(10, 8); b.pillar(14, 2, 9, 'ceil');
  b.noflip(24, 8); b.pillar(28, 2, 9, 'floor');
  b.cp(36, 'floor');
  b.noflip(40, 10); b.spikes(42, 2, 'floor'); b.spikes(46, 2, 'floor');
  b.spikes(54, 3, 'ceil');
  b.noflip(60, 10); b.saw(64, 14); b.saw(65, 13); b.pillar(68, 2, 8, 'floor');
  b.cp(74, 'ceil');
  b.noflip(78, 6, 1, 8); b.spikes(80, 3, 'ceil');
  b.noflip(88, 10); b.msaw(93, 16, 'x', 3, 2.0); b.spikes(90, 2, 'ceil'); b.spikes(95, 2, 'ceil');
  b.pillar(104, 2, 10, 'ceil');
  b.exit(115, 'floor');
  return b.build({ name: 'No-Blink Zone', hint: 'Plan your side before the purple zone.' });
}

function L9() {
  const b = new B(124);
  b.sign(2, 12, 'Lasers pulse. Wait for the gap.');
  b.laser(12); b.laser(20, 1, 1, 16, true);
  b.spikes(26, 3, 'floor');
  b.laser(32, 1, 1, 8); b.laser(32, 1, 9, 16, true);
  b.cp(38, 'floor');
  b.laser(44); b.laser(47, 1, 1, 16, true); b.laser(50);
  b.spikes(54, 3, 'ceil');
  b.laser(60, 2, 1, 8, true); b.laser(60, 2, 9, 16);
  b.cp(66, 'floor');
  b.laser(72); b.msaw(77, 8.5, 'y', 6.5, 2.4); b.laser(82, 1, 1, 16, true);
  b.spikes(86, 3, 'floor');
  b.laser(92); b.laser(96, 1, 1, 16, true);
  b.gap(100, 3, 'both');
  b.laser(106);
  b.exit(119, 'floor');
  return b.build({ name: 'Laser Grid', hint: 'Red beams kill. They warn you before turning on.', laser: { period: 2.4, on: 1.1 } });
}

function L10() {
  const b = new B(150);
  b.sign(4, 12, 'RUN. The void is coming.');
  b.start(8);
  b.spikes(16, 3, 'floor');
  b.pillar(24, 2, 9, 'ceil');
  b.gap(30, 4, 'floor');
  b.spikes(38, 3, 'ceil');
  b.cp(44, 'floor');
  b.gap(50, 2, 'both');
  b.spikes(56, 3, 'floor');
  b.saw(62, 8); b.saw(62, 9);
  b.spikes(66, 3, 'ceil');
  b.cp(74, 'floor');
  b.pillar(80, 2, 10, 'floor');
  b.gap(86, 5, 'ceil');
  b.spikes(94, 3, 'floor');
  b.msaw(100, 8.5, 'y', 6.5, 2.0);
  b.cp(106, 'ceil');
  b.spikes(110, 3, 'ceil');
  b.gap(116, 3, 'both');
  b.spikes(124, 3, 'floor');
  b.pillar(130, 2, 9, 'ceil');
  b.exit(145, 'floor');
  return b.build({ name: 'The Void Chases', hint: 'Do not stop moving.', chase: { speed: 120, start: 9, delay: 2 } });
}

function L11() {
  const b = new B(130);
  b.sign(2, 12, 'Liar mode + saws. Good luck.');
  b.msaw(14, 8.5, 'y', 6.5, 2.4);
  b.spikes(20, 2, 'floor');
  b.msaw(28, 16, 'x', 2.5, 2.0);
  b.msaw(28, 1, 'x', 2.5, 2.0, Math.PI);
  b.cp(36, 'floor');
  b.saw(42, 8); b.saw(42, 9);
  b.spikes(48, 2, 'ceil');
  b.msaw(56, 8.5, 'y', 6.5, 1.8);
  b.pillar(62, 2, 7, 'floor');
  b.cp(68, 'floor');
  b.msaw(76, 16, 'x', 3, 1.8);
  b.spikes(84, 2, 'floor');
  b.msaw(90, 8.5, 'y', 6.5, 2.0, Math.PI);
  b.cp(96, 'ceil');
  b.pillar(102, 2, 7, 'ceil');
  b.msaw(110, 1, 'x', 3, 1.8);
  b.spikes(116, 2, 'floor');
  b.exit(126, 'floor');
  return b.build({ name: "Liar's Saws", hint: 'Random flips while saws patrol.', liar: { min: 3.0, max: 5.0 } });
}

function L12() {
  const b = new B(130);
  // Starts in a very narrow tunnel (rows 6..11 open), widens to rows 5..12, then full height.
  b.rect(0, 1, 44, 5); b.rect(0, 12, 44, 5);
  b.spawn = { x: 2 * T + 5, y: 12 * T - PH, g: 1 };
  b.sign(2, 9, 'The walls close in… short flights!');
  b.rect(8, 11, 2, 1, 'X'); b.rect(13, 6, 2, 1, 'X'); b.rect(18, 11, 2, 1, 'X'); b.rect(22, 6, 2, 1, 'X');
  b.rect(26, 11, 2, 1, 'X'); b.rect(29, 6, 2, 1, 'X'); b.rect(32, 11, 2, 1, 'X');
  b.msaw(38, 8.5, 'y', 1.6, 1.4);
  b.rect(44, 1, 40, 4); b.rect(44, 13, 40, 4);
  b.cp(46, 'floor'); b.checkpoints[0].y = 13 * T - PH;
  b.rect(50, 12, 2, 1, 'X'); b.rect(54, 5, 2, 1, 'X'); b.rect(58, 12, 2, 1, 'X'); b.rect(61, 5, 2, 1, 'X');
  b.rect(64, 12, 2, 1, 'X'); b.saw(69, 8); b.rect(72, 5, 2, 1, 'X'); b.rect(76, 12, 2, 1, 'X');
  b.msaw(80, 8.5, 'y', 2.4, 1.5);
  b.cp(88, 'floor');
  b.gap(92, 3, 'both');
  b.spikes(100, 3, 'ceil');
  b.spikes(106, 3, 'floor');
  b.gap(112, 2, 'both');
  b.exit(125, 'floor');
  return b.build({ name: "Needle's Eye", hint: 'Short flights, fast reactions.' });
}

function L13() {
  const b = new B(150);
  b.sign(4, 12, 'Everything is falling apart. Including you.');
  b.start(8);
  b.gap(14, 8, 'floor'); b.crumble(14, 8, 'floor');
  b.spikes(26, 3, 'ceil');
  b.gap(32, 10, 'both'); b.crumble(32, 4, 'floor'); b.crumble(38, 4, 'ceil');
  b.cp(46, 'floor');
  b.gap(52, 12, 'floor'); b.crumble(52, 12, 'floor'); b.saw(57, 14); b.spikes(60, 3, 'ceil');
  b.pillar(68, 2, 9, 'floor');
  b.gap(72, 10, 'ceil'); b.crumble(72, 10, 'ceil');
  b.cp(86, 'floor');
  b.gap(92, 14, 'both'); b.crumble(92, 4, 'floor'); b.crumble(97, 4, 'ceil'); b.crumble(102, 4, 'floor');
  b.msaw(110, 8.5, 'y', 6.5, 2.0);
  b.gap(116, 10, 'floor'); b.crumble(116, 10, 'floor'); b.spikes(120, 3, 'ceil');
  b.spikes(130, 3, 'floor');
  b.exit(145, 'floor');
  return b.build({ name: 'Collapse', hint: 'Crumbling floors and the void. Never stop.', chase: { speed: 115, start: 9, delay: 2.5 } });
}

function L14() {
  const b = new B(170);
  b.sign(4, 12, 'The Gauntlet. Everything you learned.');
  b.start(8);
  b.laser(16); b.spikes(20, 3, 'floor');
  b.msaw(28, 8.5, 'y', 6.5, 2.2);
  b.gap(34, 6, 'floor'); b.crumble(34, 6, 'floor');
  b.cp(44, 'floor');
  b.noflip(48, 8); b.pillar(52, 2, 9, 'ceil');
  b.laser(60, 1, 1, 16, true); b.spikes(64, 3, 'ceil');
  b.gap(70, 3, 'both');
  b.cp(78, 'floor');
  b.msaw(84, 16, 'x', 3, 1.8); b.msaw(84, 1, 'x', 3, 1.8, Math.PI);
  b.laser(92);
  b.gap(96, 8, 'ceil'); b.crumble(96, 8, 'ceil'); b.spikes(98, 3, 'floor');
  b.cp(108, 'floor');
  b.saw(114, 8); b.saw(114, 9);
  b.laser(120, 1, 1, 16, true);
  b.noflip(124, 6); b.spikes(126, 2, 'ceil');
  b.gap(134, 2, 'both');
  b.msaw(142, 8.5, 'y', 6.5, 1.8);
  b.spikes(148, 3, 'floor');
  b.laser(154);
  b.exit(165, 'floor');
  return b.build({
    name: 'The Gauntlet', hint: 'Lasers, saws, crumbles and the void.',
    laser: { period: 2.6, on: 1.0 }, chase: { speed: 95, start: 10, delay: 3 },
  });
}

function L15() {
  // Boss arena: 46 wide. Boss floats in the middle, orbs alternate floor / ceiling.
  const b = new B(52);
  b.start(3);
  b.sign(2, 12, 'THE GRAND LIAR');
  b.sign(2, 10, 'Touch the glowing orbs to hurt it');
  // arena side walls with door at right
  b.rect(48, 1, 1, 16, 'D');
  b.spikes(14, 2, 'floor'); b.spikes(34, 2, 'ceil');
  b.laser(24, 1, 1, 5); b.laser(24, 1, 12, 16, true);
  b.msaw(10, 8.5, 'y', 6.5, 2.4, 0, 2); b.msaw(38, 8.5, 'y', 6.5, 2.4, Math.PI, 2);
  b.exit(50, 'floor');
  const orbs = [
    [40, 'floor'], [8, 'ceil'], [44, 'ceil'], [6, 'floor'], [30, 'floor'], [18, 'ceil'],
  ].map(([x, w]) => ({ x: x * T + T / 2, y: w === 'floor' ? 16 * T + 8 : 2 * T - 8 }));
  return b.build({
    name: 'The Grand Liar', hint: 'Final boss. 6 orbs. 3 phases.', boss: {
      x: 24 * T + T / 2, y: 8.5 * T, range: 14, speed: 0.45,
      orbs, respawn: { x: 3 * T + 5, y: 17 * T - PH, g: 1 },
      firstShot: 2.5, interval: [2.8, 2.4, 2.1], ring: [7, 9, 10], bulletSpeed: [120, 140, 155],
    },
    laser: { period: 3, on: 1.2, minHits: 2 },
    liar: { min: 4.0, max: 6.0, minHits: 4 },
  });
}

export const LEVELS = [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11, L12, L13, L14, L15].map(f => f());
