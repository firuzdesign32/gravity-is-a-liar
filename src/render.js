// Canvas renderer: cached static tile layer + dynamic hazards, players, particles.
import { T, PW, PH } from './world.js';

export const PLAYER_COLORS = ['#3ef2ff', '#ff4fd8', '#ffd23e', '#5dff7a'];

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.cache = null; this.cacheLevel = null;
    this.particles = [];
    this.trails = [[], [], [], []];
    this.shake = 0; this.flash = 0;
    this.hue = 200; this.targetHue = 200;
    this.low = false;
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
  }

  buildCache(world) {
    const lv = world.level;
    const w = world.w * T, h = world.h * T;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const ch = lv.grid[y][x];
      if (ch === '#') this.drawBlock(g, x, y, world);
      else if (ch === 'X') this.drawSpike(g, x, y, world);
      else if (ch === 'N') { g.fillStyle = 'rgba(160,80,255,0.16)'; g.fillRect(x * T, y * T, T, T); }
    }
    // no-flip icons
    g.fillStyle = 'rgba(200,140,255,0.5)'; g.font = 'bold 14px system-ui, sans-serif'; g.textAlign = 'center';
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      if (lv.grid[y][x] === 'N' && (x + y) % 5 === 0) g.fillText('⊘', x * T + T / 2, y * T + T / 2 + 5);
    }
    this.cache = cv; this.cacheLevel = lv;
  }

  drawBlock(g, x, y, world) {
    const px = x * T, py = y * T;
    g.fillStyle = '#141a33'; g.fillRect(px, py, T, T);
    g.strokeStyle = '#2b3a78'; g.lineWidth = 2;
    const solid = (cx, cy) => world.tile(cx, cy) === '#';
    g.beginPath();
    if (!solid(x, y - 1)) { g.moveTo(px, py + 1); g.lineTo(px + T, py + 1); }
    if (!solid(x, y + 1)) { g.moveTo(px, py + T - 1); g.lineTo(px + T, py + T - 1); }
    if (!solid(x - 1, y)) { g.moveTo(px + 1, py); g.lineTo(px + 1, py + T); }
    if (!solid(x + 1, y)) { g.moveTo(px + T - 1, py); g.lineTo(px + T - 1, py + T); }
    g.stroke();
    if ((x * 7 + y * 13) % 9 === 0) { g.fillStyle = '#1c2550'; g.fillRect(px + 8, py + 8, 6, 6); }
  }

  drawSpike(g, x, y, world) {
    const px = x * T, py = y * T;
    // point away from neighbouring solid
    let dir = 'up';
    if (world.solidAt(x, y + 1)) dir = 'up';
    else if (world.solidAt(x, y - 1)) dir = 'down';
    else if (world.solidAt(x - 1, y)) dir = 'right';
    else if (world.solidAt(x + 1, y)) dir = 'left';
    g.fillStyle = '#ff3b6b'; g.strokeStyle = '#ffb3c6'; g.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      if (dir === 'up') { g.moveTo(px + k * 16, py + T); g.lineTo(px + k * 16 + 8, py + 6); g.lineTo(px + k * 16 + 16, py + T); }
      if (dir === 'down') { g.moveTo(px + k * 16, py); g.lineTo(px + k * 16 + 8, py + T - 6); g.lineTo(px + k * 16 + 16, py); }
      if (dir === 'right') { g.moveTo(px, py + k * 16); g.lineTo(px + T - 6, py + k * 16 + 8); g.lineTo(px, py + k * 16 + 16); }
      if (dir === 'left') { g.moveTo(px + T, py + k * 16); g.lineTo(px + 6, py + k * 16 + 8); g.lineTo(px + T, py + k * 16 + 16); }
      g.closePath(); g.fill(); g.stroke();
    }
  }

  burst(x, y, color, n = 18, speed = 260, life = 0.7) {
    if (this.low) n = Math.ceil(n / 2.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 2 + Math.random() * 3 });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.hue += (this.targetHue - this.hue) * Math.min(1, dt * 3);
  }

  // cam: {x, zoom}; returns nothing
  draw(world, cam, now, opts = {}) {
    const g = this.g, W = this.c.width, H = this.c.height;
    if (this.cacheLevel !== world.level) this.buildCache(world);
    const scale = (H / (world.h * T)) * cam.zoom;
    const viewW = W / scale, viewH = H / scale;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const camX = cam.x, camY = (world.h * T - viewH) / 2;

    // background
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, `hsl(${this.hue},55%,9%)`); grd.addColorStop(1, `hsl(${this.hue + 40},60%,5%)`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = `hsla(${this.hue + 60},80%,80%,0.5)`;
    for (const s of this.stars) {
      const x = ((s.x * W - camX * scale * s.z * 0.3) % W + W) % W;
      g.fillRect(x, s.y * H, 1.5 * s.z * (scale > 1 ? 2 : 1), 1.5 * s.z * (scale > 1 ? 2 : 1));
    }

    g.save();
    g.setTransform(scale, 0, 0, scale, (-camX + sx) * scale, (-camY + sy) * scale);
    const x0 = Math.max(0, Math.floor(camX / T) - 1), x1 = Math.min(world.w, Math.ceil((camX + viewW) / T) + 1);

    // static layer (only the visible slice)
    const sxp = x0 * T, swp = (x1 - x0) * T;
    if (swp > 0) g.drawImage(this.cache, sxp, 0, swp, world.h * T, sxp, 0, swp, world.h * T);

    const lv = world.level;
    const t = world.t;

    // dynamic tiles
    for (let y = 0; y < world.h; y++) for (let x = x0; x < x1; x++) {
      const ch = lv.grid[y][x];
      if (ch === '%') {
        const c = world.crumbles.get(y * world.w + x);
        if (c && c.broken) { g.strokeStyle = 'rgba(255,170,80,0.25)'; g.strokeRect(x * T + 4, y * T + 4, T - 8, T - 8); continue; }
        const j = c ? (Math.random() - 0.5) * 3 : 0;
        g.fillStyle = c ? '#a8642a' : '#7a4a22'; g.fillRect(x * T + j, y * T, T, T);
        g.strokeStyle = '#ffb066'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x * T + 6 + j, y * T + 4); g.lineTo(x * T + 14 + j, y * T + 16); g.lineTo(x * T + 10 + j, y * T + 28);
        g.moveTo(x * T + 22 + j, y * T + 6); g.lineTo(x * T + 18 + j, y * T + 18); g.stroke();
      } else if (ch === 'L' || ch === 'l') {
        const on = world.laserOn(ch), warn = !on && world.laserWarn(ch);
        if (on) {
          g.fillStyle = 'rgba(255,40,60,0.35)'; g.fillRect(x * T + 4, y * T, T - 8, T);
          g.fillStyle = '#ff7080'; g.fillRect(x * T + 12, y * T, 8, T);
          g.fillStyle = '#fff'; g.fillRect(x * T + 15, y * T, 2, T);
        } else if (warn) {
          if (Math.floor(now * 20) % 2) { g.fillStyle = 'rgba(255,80,90,0.5)'; g.fillRect(x * T + 15, y * T, 2, T); }
        } else { g.fillStyle = 'rgba(255,80,90,0.12)'; g.fillRect(x * T + 15, y * T, 2, T); }
      } else if (ch === 'D') {
        if (!(world.boss && world.boss.dead)) {
          g.fillStyle = '#3a1450'; g.fillRect(x * T, y * T, T, T);
          g.fillStyle = '#c050ff'; g.fillRect(x * T + 13, y * T, 6, T);
        }
      }
    }

    // signs
    g.textAlign = 'left'; g.font = '600 15px system-ui, sans-serif';
    for (const s of lv.signs) {
      if (s.x > camX + viewW || s.x + 500 < camX) continue;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      const w = g.measureText(s.text).width;
      g.fillRect(s.x - 6, s.y - 18, w + 12, 26);
      g.fillStyle = '#cfe3ff'; g.fillText(s.text, s.x, s.y);
    }

    // checkpoints
    lv.checkpoints.forEach((c, i) => {
      const got = i <= world.cpIndex;
      const fx = c.x + PW / 2, base = c.g > 0 ? c.y + PH : c.y, dir = c.g > 0 ? -1 : 1;
      g.strokeStyle = got ? '#5dff7a' : '#8892b0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(fx, base); g.lineTo(fx, base + dir * 40); g.stroke();
      g.fillStyle = got ? '#5dff7a' : '#8892b0';
      const wave = Math.sin(now * 6 + i) * 3;
      g.beginPath(); g.moveTo(fx, base + dir * 40); g.lineTo(fx + 20, base + dir * 34 + wave); g.lineTo(fx, base + dir * 28); g.fill();
    });

    // exit portal
    const ex = lv.exit, open = !world.boss || world.boss.dead;
    if (open) {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = `hsla(${(now * 120 + k * 60) % 360},100%,65%,${0.9 - k * 0.25})`; g.lineWidth = 4;
        g.beginPath(); g.ellipse(ex.x, ex.y, 14 + k * 5 + Math.sin(now * 4 + k) * 2, 28 + k * 4, 0, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(ex.x, ex.y, 12, 26, 0, 0, Math.PI * 2); g.fill();
    }

    // saws
    for (const s of lv.saws) {
      if (!world.sawActive(s)) continue;
      const p = world.sawPos(s);
      if (p.x < camX - 40 || p.x > camX + viewW + 40) continue;
      this.drawSaw(g, p.x, p.y, t);
    }

    // boss
    if (world.boss) this.drawBoss(g, world, now);

    // void chase
    if (world.chase) {
      const cx = world.chase.x;
      if (cx > camX - 50) {
        g.fillStyle = '#05000a'; g.fillRect(camX - 50, 0, cx - camX + 50, world.h * T);
        g.fillStyle = '#8a2be2';
        for (let y = 0; y < world.h * T; y += 16) {
          const jag = Math.sin(y * 0.15 + now * 8) * 8 + Math.sin(y * 0.05 - now * 3) * 6;
          g.fillRect(cx - 4 + jag, y, 8, 16);
        }
      }
    }

    // particles (behind players)
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    // players
    world.players.forEach((p, i) => this.drawPlayer(g, p, i, now, opts));

    g.restore();

    // liar warning flicker
    if (world.liar && world.liarActive() && world.liar.warn < 0.8 && world.liar.warn > 0) {
      if (Math.floor(now * 16) % 2) { g.fillStyle = 'rgba(255,40,120,0.12)'; g.fillRect(0, 0, W, H); }
      g.strokeStyle = 'rgba(255,60,140,0.8)'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
    }
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash * 0.4})`; g.fillRect(0, 0, W, H); }
  }

  drawSaw(g, x, y, t) {
    g.save(); g.translate(x, y); g.rotate(t * 10);
    g.fillStyle = '#c9d2e8';
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = k % 2 ? 12 : 17;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#5a6380'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  drawBoss(g, world, now) {
    const B = world.boss, cfg = world.level.boss;
    // orbs
    cfg.orbs.forEach((o, i) => {
      if (i < B.orb) return;
      const active = i === B.orb && !B.dead;
      const r = active ? 12 + Math.sin(now * 6) * 2 : 7;
      g.fillStyle = active ? '#ffe066' : 'rgba(255,224,102,0.25)';
      g.beginPath(); g.arc(o.x, o.y, r, 0, Math.PI * 2); g.fill();
      if (active) { g.strokeStyle = 'rgba(255,224,102,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(o.x, o.y, r + 8 + Math.sin(now * 6) * 3, 0, Math.PI * 2); g.stroke(); }
    });
    for (const b of B.bullets) {
      g.fillStyle = 'rgba(255,60,140,0.35)'; g.beginPath(); g.arc(b.x, b.y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff7ac0'; g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI * 2); g.fill();
    }
    if (B.dead && B.deadT > 1.5) return;
    const p = world.bossPos();
    g.save(); g.translate(p.x + (B.flinch > 0 ? (Math.random() - 0.5) * 10 : 0), p.y);
    if (B.dead) { g.globalAlpha = Math.max(0, 1 - B.deadT / 1.5); g.scale(1 + B.deadT, 1 + B.deadT); }
    const phase = Math.min(2, Math.floor(B.hits / 2));
    const col = ['#b14bff', '#ff4b8b', '#ff3b3b'][phase];
    // tentacles
    g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + now * 0.6;
      g.beginPath(); g.moveTo(Math.cos(a) * 36, Math.sin(a) * 36);
      g.quadraticCurveTo(Math.cos(a + 0.3) * 56, Math.sin(a + 0.3) * 56, Math.cos(a + Math.sin(now * 3 + k) * 0.4) * 66, Math.sin(a + Math.sin(now * 3 + k) * 0.4) * 66);
      g.stroke();
    }
    g.fillStyle = '#1a0828'; g.beginPath(); g.arc(0, 0, 42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    // eye
    g.fillStyle = '#f5f0ff'; g.beginPath(); g.ellipse(0, 0, 30, B.flinch > 0 ? 6 : 22, 0, 0, Math.PI * 2); g.fill();
    const tgt = world.players.find(q => !q.dead) || world.players[0];
    const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    g.fillStyle = col; g.beginPath(); g.arc(Math.cos(ang) * 12, Math.sin(ang) * 8, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(Math.cos(ang) * 13, Math.sin(ang) * 9, 5, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  drawPlayer(g, p, i, now, opts) {
    const col = PLAYER_COLORS[i % 4];
    const rx = p.rx ?? p.x, ry = p.ry ?? p.y;
    const trail = this.trails[i];
    if (!p.dead && !p.finished) {
      trail.push({ x: rx, y: ry }); if (trail.length > (this.low ? 4 : 8)) trail.shift();
    } else trail.length = 0;
    if (p.dead || p.finished) return;
    trail.forEach((tp, k) => {
      g.globalAlpha = (k / trail.length) * 0.25; g.fillStyle = col;
      g.fillRect(tp.x + 3, tp.y + 3, PW - 6, PH - 6);
    });
    g.globalAlpha = 1;
    const sq = p.squash || 0;
    const sw = PW * (1 + sq * 0.25), sh = PH * (1 - sq * 0.2);
    const cx = rx + PW / 2, footY = p.g > 0 ? ry + PH : ry;
    g.save(); g.translate(cx, footY); if (p.g < 0) g.scale(1, -1);
    g.fillStyle = col;
    roundRect(g, -sw / 2, -sh, sw, sh, 6); g.fill();
    // eyes
    const blink = (Math.floor(now * 1.3 + i) % 4 === 0 && (now * 1.3 + i) % 1 < 0.12);
    g.fillStyle = '#0b0f20';
    const ex = (p.face || 1) * 3;
    if (blink) { g.fillRect(-6 + ex, -sh + 9, 5, 2); g.fillRect(2 + ex, -sh + 9, 5, 2); }
    else { g.fillRect(-6 + ex, -sh + 6, 4, 6); g.fillRect(2 + ex, -sh + 6, 4, 6); }
    g.restore();
    if (opts.labels) {
      g.fillStyle = col; g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(opts.names?.[i] || `P${i + 1}`, cx, p.g > 0 ? ry - 8 : ry + PH + 18);
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
