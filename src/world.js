// Pure game simulation: no DOM, no audio. Runs in the browser and in Node (level verifier).
export const T = 32;            // tile size (px)
export const DT = 1 / 120;      // fixed physics step
export const PW = 22, PH = 28;  // player size
const SPEED = 230, ACC_G = 2600, ACC_A = 1700;
const GRAV = 1900, MAXV = 720, FLIP_KICK = 140;
const COYOTE = 0.1;
const SAW_R = 15, BULLET_R = 7, BOSS_R = 42;
const CRUMBLE_DELAY = 0.45, CRUMBLE_RESPAWN = 3.5;
const LASER_WARN = 0.4;

// Tiles: '#' solid, 'X' spike, '%' crumble, 'L'/'l' laser (phase A/B), 'N' no-flip zone,
// 'C' checkpoint (floor), 'c' checkpoint (ceiling), 'E' exit, 'O' boss orb, 'P' spawn
export function isSolidChar(ch) { return ch === '#' || ch === '%'; }


export class World {
  constructor(level, numPlayers = 1, opts = {}) {
    this.level = level;
    this.w = level.grid[0].length;
    this.h = level.grid.length;
    this.grid = level.grid;
    this.opts = opts;
    this.inflate = opts.strict ? 3 : 0;   // verifier makes hazards a bit bigger
    this.t = 0;
    this.events = [];
    this.seed = opts.seed ?? 1337;
    this.rs = this.seed;
    this.crumbles = new Map();            // idx -> {timer, broken, respawn}
    this.finished = false;
    this.winner = -1;
    this.checkpoint = { x: level.spawn.x, y: level.spawn.y, g: level.spawn.g };
    this.cpIndex = -1;
    this.players = [];
    for (let i = 0; i < numPlayers; i++) this.players.push(this.makePlayer(i));
    // liar mode
    this.liar = level.liar ? { next: this.nextLiar(2.5), warn: 0 } : null;
    // chase void
    this.chase = level.chase ? { x: level.spawn.x - level.chase.start * T, delay: level.chase.delay } : null;
    // boss
    if (level.boss) {
      this.boss = { hits: 0, orb: 0, flinch: 0, shot: level.boss.firstShot, rot: 0, dead: false, deadT: 0, bullets: [] };
    }
  }

  makePlayer(i) {
    const sp = this.checkpoint;
    return {
      id: i, x: sp.x + i * 6, y: sp.y, vx: 0, vy: 0, g: sp.g, grounded: false, coyote: 0,
      flipBuf: 0, dead: false, deadT: 0, deaths: 0, finished: false, flips: 0, face: 1,
      squash: 0, lastFlip: -9,
    };
  }

  nextLiar(base = 0) {
    const L = this.level.liar;
    return this.t + base + L.min + this.rng() * (L.max - L.min);
  }

  rng() {
    this.rs = (this.rs + 0x6D2B79F5) | 0;
    let t = Math.imul(this.rs ^ (this.rs >>> 15), 1 | this.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  clone() {
    const w = Object.create(World.prototype);
    Object.assign(w, this);
    w.events = [];
    w.players = this.players.map(p => ({ ...p }));
    w.crumbles = new Map([...this.crumbles].map(([k, v]) => [k, { ...v }]));
    w.checkpoint = { ...this.checkpoint };
    if (this.liar) w.liar = { ...this.liar };
    if (this.chase) w.chase = { ...this.chase };
    if (this.boss) w.boss = { ...this.boss, bullets: this.boss.bullets.map(b => ({ ...b })) };
    return w;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  tile(cx, cy) {
    if (cy < 0 || cy >= this.h) return '.';
    if (cx < 0 || cx >= this.w) return '#';
    return this.grid[cy][cx];
  }

  solidAt(cx, cy) {
    const ch = this.tile(cx, cy);
    if (ch === '#') return true;
    if (ch === '%') { const c = this.crumbles.get(cy * this.w + cx); return !(c && c.broken); }
    if (ch === 'D') return !(this.boss && this.boss.dead); // boss door
    return false;
  }

  laserOn(ch) {
    const L = this.level.laser;
    if (!L) return false;
    if (this.boss && L.minHits !== undefined && this.boss.hits < L.minHits) return false;
    if (this.boss && this.boss.dead) return false;
    const ph = ch === 'l' ? L.period / 2 : 0;
    const m = (this.t + ph + (L.offset || 0)) % L.period;
    return m < L.on;
  }
  laserWarn(ch) {
    const L = this.level.laser;
    if (!L) return false;
    const ph = ch === 'l' ? L.period / 2 : 0;
    const m = (this.t + ph + (L.offset || 0)) % L.period;
    return m > L.period - LASER_WARN;
  }

  sawPos(s) {
    if (!s.axis) return { x: s.x, y: s.y };
    const off = Math.sin((this.t / s.period) * Math.PI * 2 + (s.phase || 0)) * s.range * T;
    return s.axis === 'x' ? { x: s.x + off, y: s.y } : { x: s.x, y: s.y + off };
  }
  sawActive(s) {
    if (!this.boss) return true;
    if (this.boss.dead) return false;
    return this.boss.hits >= (s.minHits || 0);
  }

  bossPos() {
    const B = this.level.boss;
    const x = B.x + Math.sin(this.t * B.speed) * B.range * T;
    const y = B.y + Math.sin(this.t * 1.7) * 10;
    return { x, y };
  }

  liarActive() {
    if (!this.liar) return false;
    if (this.boss) return !this.boss.dead && this.boss.hits >= (this.level.liar.minHits || 0);
    return true;
  }

  // inputs: array of {left, right, flip} per player (flip = pressed this step)
  step(inputs) {
    this.events.length = 0;
    const dt = DT;
    this.t += dt;

    // crumbles
    for (const [idx, c] of this.crumbles) {
      if (!c.broken) { c.timer -= dt; if (c.timer <= 0) { c.broken = true; c.respawn = CRUMBLE_RESPAWN; this.emit('crumble', { idx }); } }
      else { c.respawn -= dt; if (c.respawn <= 0) this.crumbles.delete(idx); }
    }

    // liar mode forced flips
    if (this.liar && this.liarActive()) {
      const L = this.liar;
      L.warn = Math.max(0, L.next - this.t);
      if (this.t >= L.next) {
        for (const p of this.players) if (!p.dead && !p.finished) this.flip(p, true);
        this.emit('liar');
        L.next = this.nextLiar();
      }
    } else if (this.liar) { this.liar.next = this.t + 3; this.liar.warn = 9; }

    // chase
    if (this.chase) {
      if (this.chase.delay > 0) this.chase.delay -= dt;
      else this.chase.x += this.level.chase.speed * dt;
    }

    // boss
    if (this.boss) this.stepBoss(dt);

    for (let i = 0; i < this.players.length; i++) this.stepPlayer(this.players[i], inputs[i] || {}, dt);
  }

  stepBoss(dt) {
    const B = this.boss, cfg = this.level.boss;
    if (B.dead) { B.deadT += dt; return; }
    B.flinch = Math.max(0, B.flinch - dt);
    const phase = Math.min(2, Math.floor(B.hits / 2));
    B.shot -= dt;
    if (B.shot <= 0) {
      const n = cfg.ring[phase], sp = cfg.bulletSpeed[phase];
      const bp = this.bossPos();
      B.rot += 0.37;
      for (let k = 0; k < n; k++) {
        const a = B.rot + (k / n) * Math.PI * 2;
        B.bullets.push({ x: bp.x, y: bp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 7 });
      }
      B.shot = cfg.interval[phase];
      this.emit('bossShot');
    }
    for (let k = B.bullets.length - 1; k >= 0; k--) {
      const b = B.bullets[k];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || this.solidAt(Math.floor(b.x / T), Math.floor(b.y / T))) B.bullets.splice(k, 1);
    }
  }

  flip(p, forced = false) {
    p.g = -p.g;
    p.vy = p.g * FLIP_KICK;
    p.grounded = false; p.coyote = 0; p.flipBuf = 0;
    p.flips++; p.lastFlip = this.t; p.squash = 1;
    this.emit('flip', { id: p.id, forced, x: p.x + PW / 2, y: p.y + PH / 2, g: p.g });
  }

  overlapsChar(p, chars, inset = 0) {
    const x0 = Math.floor((p.x + inset) / T), x1 = Math.floor((p.x + PW - 1 - inset) / T);
    const y0 = Math.floor((p.y + inset) / T), y1 = Math.floor((p.y + PH - 1 - inset) / T);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const ch = this.tile(cx, cy);
      if (chars.includes(ch)) return { ch, cx, cy };
    }
    return null;
  }

  kill(p, cause) {
    if (p.dead || p.finished) return;
    p.dead = true; p.deadT = 0.85; p.deaths++;
    this.emit('death', { id: p.id, x: p.x + PW / 2, y: p.y + PH / 2, cause });
  }

  respawn(p) {
    let sp = this.checkpoint;
    const alive = this.players.filter(q => !q.dead && !q.finished);
    if (this.chase && this.chase.x > sp.x - T * 2) {
      if (alive.length) {
        const lead = alive.reduce((a, b) => (b.x > a.x ? b : a));
        sp = { x: lead.x, y: lead.y, g: lead.g };
      } else {
        this.chase.x = sp.x - this.level.chase.start * T; this.chase.delay = this.level.chase.delay;
      }
    }
    p.x = sp.x + (p.id % 2) * 4; p.y = sp.y; p.g = sp.g; p.vx = 0; p.vy = 0; p.dead = false;
    p.grounded = false; p.coyote = 0; p.flipBuf = 0;
    this.emit('respawn', { id: p.id });
  }

  stepPlayer(p, inp, dt) {
    if (p.finished) return;
    if (p.dead) { p.deadT -= dt; if (p.deadT <= 0) this.respawn(p); return; }
    p.squash = Math.max(0, p.squash - dt * 5);

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) p.face = dir;
    const target = dir * SPEED;
    const acc = (p.grounded ? ACC_G : ACC_A) * dt;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc); else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);

    if (inp.flip) p.flipBuf = inp.buffer || 0.15;
    if (p.flipBuf > 0) {
      p.flipBuf -= dt;
      if ((p.grounded || p.coyote > 0) && !this.overlapsChar(p, 'N')) this.flip(p);
    }

    p.vy += p.g * GRAV * dt;
    if (p.vy > MAXV) p.vy = MAXV; if (p.vy < -MAXV) p.vy = -MAXV;

    // horizontal
    p.x += p.vx * dt;
    {
      const y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + PH - 1) / T);
      if (p.vx > 0) {
        const cx = Math.floor((p.x + PW - 1) / T);
        for (let cy = y0; cy <= y1; cy++) if (this.solidAt(cx, cy)) { p.x = cx * T - PW; p.vx = 0; break; }
      } else if (p.vx < 0) {
        const cx = Math.floor(p.x / T);
        for (let cy = y0; cy <= y1; cy++) if (this.solidAt(cx, cy)) { p.x = (cx + 1) * T; p.vx = 0; break; }
      }
    }
    // vertical
    const wasGrounded = p.grounded;
    p.grounded = false;
    p.y += p.vy * dt;
    {
      const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + PW - 1) / T);
      if (p.vy > 0) {
        const cy = Math.floor((p.y + PH - 1) / T);
        for (let cx = x0; cx <= x1; cx++) if (this.solidAt(cx, cy)) {
          p.y = cy * T - PH; if (p.g > 0) { p.grounded = true; this.touchCrumble(x0, x1, cy); } p.vy = 0; break;
        }
      } else if (p.vy < 0) {
        const cy = Math.floor(p.y / T);
        for (let cx = x0; cx <= x1; cx++) if (this.solidAt(cx, cy)) {
          p.y = (cy + 1) * T; if (p.g < 0) { p.grounded = true; this.touchCrumble(x0, x1, cy); } p.vy = 0; break;
        }
      }
    }
    if (p.grounded) { p.coyote = COYOTE; if (!wasGrounded) { p.squash = 0.8; this.emit('land', { id: p.id, x: p.x + PW / 2, y: p.g > 0 ? p.y + PH : p.y, g: p.g }); } }
    else p.coyote -= dt;

    // ---- hazards
    const inf = this.inflate;
    if (p.y > this.h * T + 40 || p.y < -PH - 40) return this.kill(p, 'pit');
    if (this.overlapsChar(p, 'X', 6 - inf)) return this.kill(p, 'spike');
    {
      const hit = this.overlapsChar(p, 'Ll', 4 - inf);
      if (hit && this.laserOn(hit.ch)) return this.kill(p, 'laser');
    }
    const cxp = p.x + PW / 2, cyp = p.y + PH / 2;
    for (const s of this.level.saws) {
      if (!this.sawActive(s)) continue;
      const sp = this.sawPos(s);
      if (circleRect(sp.x, sp.y, SAW_R + inf, p.x + 3, p.y + 3, PW - 6, PH - 6)) return this.kill(p, 'saw');
    }
    if (this.chase && p.x < this.chase.x) return this.kill(p, 'void');
    if (this.boss && !this.boss.dead) {
      const bp = this.bossPos();
      if (circleRect(bp.x, bp.y, BOSS_R + inf - 6, p.x + 3, p.y + 3, PW - 6, PH - 6)) return this.kill(p, 'boss');
      for (const b of this.boss.bullets) if (circleRect(b.x, b.y, BULLET_R + inf - 2, p.x + 3, p.y + 3, PW - 6, PH - 6)) return this.kill(p, 'bullet');
      // orb
      const orb = this.level.boss.orbs[this.boss.orb];
      if (orb && Math.abs(cxp - orb.x) < 26 && Math.abs(cyp - orb.y) < 26) this.hitBoss();
    }

    // ---- pickups
    for (let i = 0; i < this.level.checkpoints.length; i++) {
      const c = this.level.checkpoints[i];
      if (i > this.cpIndex && Math.abs(cxp - c.x - PW / 2) < 24 && Math.abs(cyp - c.y - PH / 2) < 40) {
        this.cpIndex = i; this.checkpoint = { x: c.x, y: c.y, g: c.g };
        this.emit('checkpoint', { id: p.id, x: c.x, y: c.y });
      }
    }
    const ex = this.level.exit;
    const exitOpen = !this.boss || this.boss.dead;
    if (exitOpen && Math.abs(cxp - ex.x) < 26 && Math.abs(cyp - ex.y) < 34) {
      p.finished = true;
      if (!this.finished) { this.finished = true; this.winner = p.id; }
      this.emit('exit', { id: p.id });
    }
  }

  hitBoss() {
    const B = this.boss;
    B.hits++; B.flinch = 0.6;
    B.orb++;
    this.emit('bossHit', { hits: B.hits });
    if (B.hits >= this.level.boss.orbs.length) {
      B.dead = true; B.bullets.length = 0; this.emit('bossDead');
    } else {
      const orbsLeft = this.level.boss.orbs[B.orb];
      // safety: clear bullets near the next orb so it's reachable
      B.bullets = B.bullets.filter(b => Math.hypot(b.x - orbsLeft.x, b.y - orbsLeft.y) > 90);
      // boss checkpoint
      this.checkpoint = { ...this.level.boss.respawn };
    }
  }

  touchCrumble(x0, x1, cy) {
    for (let cx = x0; cx <= x1; cx++) {
      if (this.tile(cx, cy) === '%') {
        const idx = cy * this.w + cx;
        if (!this.crumbles.has(idx)) this.crumbles.set(idx, { timer: CRUMBLE_DELAY, broken: false, respawn: 0 });
      }
    }
  }

  // ----- network snapshot (host -> clients)
  snapshot() {
    const r = (v) => Math.round(v * 10) / 10;
    return {
      t: r(this.t),
      p: this.players.map(p => [r(p.x), r(p.y), p.g, p.dead ? 1 : 0, p.finished ? 1 : 0, p.deaths, p.face, r(p.vx), r(p.squash), p.flips]),
      c: [...this.crumbles].map(([i, c]) => [i, c.broken ? 1 : 0]),
      ch: this.chase ? r(this.chase.x) : null,
      lw: this.liar ? r(this.liar.warn) : null,
      b: this.boss ? [this.boss.hits, this.boss.orb, this.boss.dead ? 1 : 0, r(this.boss.flinch), r(this.boss.deadT), this.boss.bullets.map(b => [r(b.x), r(b.y)])] : null,
      f: this.finished ? 1 : 0, w: this.winner, cp: this.cpIndex,
    };
  }
  applySnapshot(s) {
    this.t = s.t;
    s.p.forEach((a, i) => {
      const p = this.players[i] || (this.players[i] = this.makePlayer(i));
      [p.x, p.y, p.g, p.dead, p.finished, p.deaths, p.face, p.vx, p.squash, p.flips] = a;
      p.dead = !!p.dead; p.finished = !!p.finished;
    });
    this.players.length = s.p.length;
    this.crumbles = new Map(s.c.map(([i, b]) => [i, { broken: !!b, timer: 1, respawn: 1 }]));
    if (this.chase && s.ch !== null) this.chase.x = s.ch;
    if (this.liar && s.lw !== null) this.liar.warn = s.lw;
    if (this.boss && s.b) {
      const [hits, orb, dead, flinch, deadT, bl] = s.b;
      Object.assign(this.boss, { hits, orb, dead: !!dead, flinch, deadT, bullets: bl.map(([x, y]) => ({ x, y })) });
    }
    this.finished = !!s.f; this.winner = s.w; this.cpIndex = s.cp;
  }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw)), ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
