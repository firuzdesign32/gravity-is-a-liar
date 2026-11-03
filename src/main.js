import { World, T, DT, PW, PH } from './world.js';
import { LEVELS } from './levels.js';
import { Renderer, PLAYER_COLORS } from './render.js';
import { settings, saveSettings, resetBindings, progress, saveProgress, keyLabel } from './settings.js';
import { initInput, pollInputs, onGlobal, captureKey, cancelCapture, pushBlink, setTouch, clearPressed } from './input.js';
import { sfx, unlockAudio } from './audio.js';
import { NetHost, NetClient } from './net.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const canvas = $('#game');
const R = new Renderer(canvas);
const IS_TAURI = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

const app = {
  mode: 'solo',            // solo | local | host | client
  n: 1, names: [],
  levelIndex: 0, world: null, playing: false, paused: false,
  useBlink: false, blink: null,
  net: null, myIndex: 0,
  cam: { x: 0, zoom: 1 },
  levelTime: 0, finishTimer: -1, finishOrder: [],
  offscreen: [0, 0, 0, 0],
  run: { deaths: 0, time: 0, wins: [0, 0, 0, 0], levels: 0 },
  history: [],
  snapAcc: 0, evBuf: [],
  slowFrames: 0,
};

// ------------------------------------------------------------ screens
let current = 's-title';
const backStack = [];
function show(id, push = true) {
  if (push && current && current !== id) backStack.push(current);
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  current = id;
  $('#toast').classList.add('hidden');
  if (id === 's-settings') renderSettings();
  if (id === 's-howto') renderHowto();
}
function hideScreens() { $$('.screen').forEach(s => s.classList.add('hidden')); current = null; }
function back() {
  cancelCapture();
  const prev = backStack.pop() || 's-title';
  if (prev === 'game') { hideScreens(); return; }
  show(prev, false);
}
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  unlockAudio(); sfx.click();
  if (b.hasAttribute('data-back')) back();
  const go = b.dataset.go;
  if (go === 'solo') { app.mode = 'solo'; app.n = 1; show('s-control'); }
  if (go === 'local') { app.mode = 'local'; show('s-local'); renderLocal(); }
  if (go === 'online') { show('s-online'); $('#netName').value = settings.name || ''; }
  if (go === 'howto') show('s-howto');
  if (go === 'settings') show('s-settings');
  if (b.dataset.control) chooseControl(b.dataset.control);
});

// ------------------------------------------------------------ control choice + calibration
let afterControl = () => openLevels();
async function chooseControl(kind) {
  if (kind === 'keys') { stopBlink(); app.useBlink = false; afterControl(); return; }
  show('s-calib');
  startCalibration();
}

async function startCalibration() {
  $('#btnCalibGo').classList.add('hidden'); $('#calibTest').classList.add('hidden');
  $('#calibMsg').textContent = 'Starting camera… (first time downloads a small face model)';
  try {
    if (!app.blink) {
      const { BlinkDetector } = await import('./blink.js');
      app.blink = new BlinkDetector();
      app.blink.setSensitivity(settings.blinkSensitivity);
      await app.blink.start($('#calibVideo'));
      $('#camVideo').srcObject = app.blink.stream; $('#camVideo').play().catch(() => {});
    } else if (!app.blink.running) {
      await app.blink.start($('#calibVideo'));
      $('#camVideo').srcObject = app.blink.stream; $('#camVideo').play().catch(() => {});
    } else {
      $('#calibVideo').srcObject = app.blink.stream; $('#calibVideo').play().catch(() => {});
    }
  } catch (err) {
    console.warn(err);
    $('#calibMsg').textContent = '⚠ Camera unavailable or blocked. You can still play with the keyboard, gamepad or touch.';
    app.blink = null;
    return;
  }
  $('#calibMsg').textContent = 'Look at the screen and keep your eyes OPEN for 3 seconds…';
  const ok = await app.blink.calibrate(3000, (p) => { $('#calibProg').style.width = (p * 100) + '%'; });
  if (!ok || !app.blink.face) {
    $('#calibMsg').textContent = '⚠ No face found. Improve lighting, face the camera and press Recalibrate.';
    return;
  }
  $('#calibMsg').textContent = '✔ Calibrated! Test it: blink a few times.';
  let count = 0;
  $('#blinkCount').textContent = '0';
  $('#calibTest').classList.remove('hidden');
  app.blink.onBlink = () => {
    if (current === 's-calib') { count++; $('#blinkCount').textContent = count; sfx.flip(count % 2); }
    else pushBlink(app.mode === 'local' ? Math.min(settings.blinkPlayer, app.n - 1) : 0);
  };
  $('#btnCalibGo').classList.remove('hidden');
}
$('#btnCalibRetry').onclick = () => startCalibration();
$('#btnCalibGo').onclick = () => { app.useBlink = true; afterControl(); };
$('#btnCalibSkip').onclick = () => { stopBlink(); app.useBlink = false; afterControl(); };
function stopBlink() { if (app.blink) { app.blink.stop(); app.blink = null; } app.useBlink = false; }

function meterLoop() {
  const b = app.blink;
  if (b && b.running) {
    const max = Math.max(0.4, b.baseline * 1.4 || 0.4);
    const pct = (v) => Math.min(100, (v / max) * 100) + '%';
    $('#calibFill').style.width = pct(b.ear); $('#camFill').style.width = pct(b.ear);
    $('#calibThr').style.left = pct(b.threshold); $('#camThr').style.left = pct(b.threshold);
  }
  requestAnimationFrame(meterLoop);
}
meterLoop();

// ------------------------------------------------------------ level select
function openLevels() {
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  $('#levelsTitle').textContent = app.mode === 'solo' ? 'Select Level' : app.mode === 'host' ? 'Choose a level for everyone' : `Select Level — ${app.n} players`;
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'lvl' + (lv.boss ? ' boss' : '');
    const unlocked = i < progress.unlocked;
    b.disabled = !unlocked;
    const best = progress.best[i];
    b.innerHTML = `<b>${unlocked ? (lv.boss ? '👹' : i + 1) : '🔒'}</b><small>${lv.name}</small>${best ? `<small>⏱ ${best.toFixed(1)}s</small>` : ''}`;
    b.onclick = () => { app.run = { deaths: 0, time: 0, wins: [0, 0, 0, 0], levels: 0 }; app.history = []; startLevel(i); };
    grid.appendChild(b);
  });
  show('s-levels');
}

// ------------------------------------------------------------ local multiplayer screen
function renderLocal() {
  $$('#localCount .pick').forEach(b => b.classList.toggle('active', Number(b.dataset.n) === app.n));
  const box = $('#localKeys'); box.innerHTML = '';
  for (let i = 0; i < app.n; i++) {
    const b = settings.bindings[i];
    const d = document.createElement('div');
    d.className = 'pkey'; d.style.borderColor = PLAYER_COLORS[i];
    d.innerHTML = `<b style="color:${PLAYER_COLORS[i]}">Player ${i + 1}</b><br>Move ${kb(b.left)} ${kb(b.right)}<br>Flip ${kb(b.flip)}`;
    box.appendChild(d);
  }
}
const kb = (codes) => codes.filter(Boolean).map(c => `<kbd>${keyLabel(c)}</kbd>`).join(' ') || '<kbd>—</kbd>';
$$('#localCount .pick').forEach(b => b.onclick = () => { app.n = Number(b.dataset.n); renderLocal(); });
$('#btnLocalGo').onclick = () => { app.mode = app.n === 1 ? 'solo' : 'local'; afterControl = () => openLevels(); show('s-control'); };

// ------------------------------------------------------------ online
$('#btnHost').onclick = async () => {
  saveName();
  $('#netMsg').textContent = 'Creating room…';
  try {
    const host = new NetHost();
    await host.open(settings.name || 'Host');
    app.net = host; app.mode = 'host'; app.myIndex = 0;
    host.onChange = () => renderLobby();
    $('#lobbyCode').textContent = host.code;
    $('#netMsg').textContent = '';
    renderLobby();
    show('s-lobby');
  } catch (e) {
    console.warn(e);
    $('#netMsg').textContent = '⚠ Could not create a room. Check your internet connection and try again.';
  }
};
$('#btnJoin').onclick = async () => {
  saveName();
  const code = $('#joinCode').value.trim().toUpperCase();
  if (code.length !== 5) { $('#netMsg').textContent = 'Enter the 5-letter room code.'; return; }
  $('#netMsg').textContent = 'Connecting…';
  try {
    const cl = new NetClient();
    cl.onMsg = onClientMsg;
    await cl.join(code, settings.name || 'Player');
    app.net = cl; app.mode = 'client';
    $('#lobbyCode').textContent = code;
    $('#netMsg').textContent = '';
    show('s-lobby');
    renderLobby();
  } catch (e) {
    console.warn(e);
    $('#netMsg').textContent = '⚠ Could not join. Check the code (rooms close when the host leaves).';
  }
};
function saveName() { settings.name = $('#netName').value.trim().slice(0, 12); saveSettings(); }
function renderLobby(list) {
  if (app.mode === 'host') list = app.net.players();
  list = list || app.lobbyList || [];
  app.lobbyList = list;
  $('#lobbyList').innerHTML = list.map((p, i) => `<li style="border-color:${PLAYER_COLORS[i]}">${escapeHtml(p.name)}${p.slot === 0 ? ' (host)' : ''}</li>`).join('');
  const host = app.mode === 'host';
  $('#btnLobbyStart').classList.toggle('hidden', !host);
  $('#lobbyInfo').textContent = host ? `Share the code with up to 3 friends. ${list.length}/4 players.` : 'Waiting for the host to start…';
  $('#btnLobbyCam').textContent = `👁️ Webcam: ${app.useBlink ? 'On' : 'Off'}`;
}
$('#btnLobbyStart').onclick = () => { app.n = app.net.players().length; openLevels(); };
$('#btnLobbyCam').onclick = () => {
  if (app.useBlink) { stopBlink(); renderLobby(); return; }
  afterControl = () => { show('s-lobby', false); renderLobby(); };
  show('s-calib'); startCalibration();
};
$('#btnLeave').onclick = () => leaveOnline();
function leaveOnline() {
  if (app.net) app.net.close();
  app.net = null; app.mode = 'solo'; app.playing = false; app.world = null;
  $('#hud').classList.add('hidden');
  backStack.length = 0; show('s-title', false);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function onClientMsg(d) {
  if (d.k === 'lobby') { renderLobby(d.players); }
  else if (d.k === 'full') { toast('Room is full or the game already started.'); }
  else if (d.k === 'start') {
    app.myIndex = d.you; app.n = d.n; app.names = d.names;
    startLevel(d.level, { seed: d.seed, fromHost: true });
  } else if (d.k === 's') {
    if (!app.world || app.levelIndex !== d.l) return;
    const w = app.world;
    w.applySnapshot(d.s);
    for (const ev of d.ev || []) handleEvent(ev);
  } else if (d.k === 'done') {
    app.playing = false; showComplete(d.res);
  } else if (d.k === 'final') {
    app.playing = false; showFinal(d.res);
  } else if (d.k === 'lobbyBack') {
    app.playing = false; app.world = null; $('#hud').classList.add('hidden'); show('s-lobby', false);
  } else if (d.k === 'bye') {
    toast('Host left the room.'); leaveOnline();
  }
}

// ------------------------------------------------------------ game
function startLevel(i, opts = {}) {
  if (app.mode === 'client' && !opts.fromHost) return;
  const lv = LEVELS[i];
  app.levelIndex = i;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  if (app.mode === 'host') {
    app.n = app.net.players().length;
    app.net.locked = false;
    const list = app.net.players();
    app.names = list.map(p => p.name);
    app.slotOrder = list.map(p => p.slot);
    app.net.conns.forEach(c => c.conn.send({ k: 'start', level: i, n: app.n, you: app.slotOrder.indexOf(c.slot), names: app.names, seed }));
  } else if (app.mode !== 'client') {
    app.names = Array.from({ length: app.n }, (_, k) => `P${k + 1}`);
  }
  app.world = new World(lv, app.n, { seed });
  app.world.players.forEach(p => { p.rx = p.x; p.ry = p.y; });
  app.cam.x = Math.max(0, app.world.players[0].x - 300); app.cam.zoom = 1;
  app.levelTime = 0; app.finishTimer = -1; app.finishOrder = []; app.offscreen = [0, 0, 0, 0];
  app.playing = true; app.paused = false;
  R.targetHue = 200 + i * 22; R.particles.length = 0;
  clearPressed();
  hideScreens();
  backStack.length = 0;
  $('#hud').classList.remove('hidden');
  $('#hudLevel').textContent = `${lv.boss ? '👹' : i + 1}. ${lv.name}`;
  $('#hudBoss').classList.toggle('hidden', !lv.boss);
  $('#hudCountdown').classList.add('hidden');
  updateTouchVisibility();
  toast(lv.hint, 3000);
}

function handleEvent(ev) {
  const col = ev.id !== undefined ? PLAYER_COLORS[ev.id % 4] : '#fff';
  switch (ev.type) {
    case 'flip': R.burst(ev.x, ev.y, col, 10, 160, 0.4); ev.forced ? sfx.forced() : sfx.flip(ev.g < 0); R.targetHue += 25; break;
    case 'land': if (!R.low) R.burst(ev.x, ev.y, 'rgba(255,255,255,0.6)', 4, 80, 0.25); break;
    case 'death': R.burst(ev.x, ev.y, col, 34, 380, 0.9); R.burst(ev.x, ev.y, '#ff3b6b', 14, 250, 0.6); if (settings.shake) R.shake = 14; sfx.death(); break;
    case 'checkpoint': R.burst(ev.x + PW / 2, ev.y + PH / 2, '#5dff7a', 20, 200, 0.7); sfx.checkpoint(); toast('Checkpoint!', 900); break;
    case 'exit': sfx.portal(); R.flash = 0.6; break;
    case 'liar': sfx.forced(); if (settings.shake) R.shake = 8; break;
    case 'crumble': sfx.crumble(); break;
    case 'bossShot': sfx.bossShot(); break;
    case 'bossHit': sfx.bossHit(); if (settings.shake) R.shake = 20; R.flash = 0.5; toast(`Hit! ${6 - ev.hits} to go`, 1200); break;
    case 'bossDead': sfx.bossDead(); if (settings.shake) R.shake = 30; R.flash = 1;
      if (app.world) { const p = app.world.bossPos(); for (let k = 0; k < 4; k++) R.burst(p.x, p.y, ['#b14bff', '#ff4b8b', '#ffe066', '#fff'][k], 40, 500, 1.4); }
      toast('THE GRAND LIAR IS DEFEATED! The door is open →', 3500); break;
  }
}

let last = performance.now();
let warnBeep = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  resize();
  const w = app.world;
  if (w && app.playing && !app.paused) {
    if (app.mode === 'client') {
      const inp = pollInputs(1, { solo: true })[0];
      app.net.sendInput(inp);
      w.t += dt;
    } else {
      simulate(dt);
    }
    app.levelTime += dt;
    // smooth render positions
    for (const p of w.players) {
      if (p.rx === undefined || Math.abs(p.rx - p.x) > 200 || Math.abs(p.ry - p.y) > 200 || app.mode !== 'client') { p.rx = p.x; p.ry = p.y; }
      else { const k = Math.min(1, dt * 18); p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; }
    }
    updateCamera(dt);
    updateHud();
    if (w.liar && w.liarActive() && w.liar.warn < 0.8 && w.liar.warn > 0) {
      warnBeep -= dt; if (warnBeep <= 0) { sfx.warn(); warnBeep = 0.2; }
    }
  }
  R.update(dt);
  if (w) {
    const t = performance.now() / 1000;
    R.draw(w, app.cam, t, { labels: app.n > 1, names: app.names });
  } else {
    drawAttract(dt);
  }
  // adaptive quality
  if (settings.quality === 'auto' && app.playing) {
    app.slowFrames = dt > 0.024 ? app.slowFrames + 1 : Math.max(0, app.slowFrames - 0.5);
    if (app.slowFrames > 90 && !R.low) { R.low = true; resize(true); }
  }
  requestAnimationFrame(frame);
}

function simulate(dt) {
  const w = app.world;
  app.acc = (app.acc || 0) + dt;
  let inputs;
  if (app.mode === 'host') {
    const local = pollInputs(1, { solo: true })[0];
    inputs = app.slotOrder.map((slot, idx) => idx === 0 ? local : app.net.inputFor(slot));
  } else {
    inputs = pollInputs(app.n, { solo: app.mode === 'solo' });
  }
  // flips pressed on a frame with no physics step are carried over
  (app.pf || []).forEach((b, i) => { if (b && inputs[i]) { inputs[i].flip = true; inputs[i].buffer = Math.max(inputs[i].buffer || 0.15, b); } });
  let first = true;
  while (app.acc >= DT) {
    app.acc -= DT;
    w.step(first ? inputs : inputs.map(i => ({ ...i, flip: false })));
    first = false;
    for (const ev of w.events) {
      handleEvent(ev);
      if (ev.type === 'exit') app.finishOrder.push({ id: ev.id, time: app.levelTime });
      if (app.mode === 'host' && ev.type !== 'land') app.evBuf.push(ev);
    }
  }
  app.pf = first ? inputs.map(i => (i.flip ? i.buffer || 0.15 : 0)) : [];

  // pull far-behind players to the leader (multiplayer)
  if (app.n > 1) {
    const scale = (canvas.height / (w.h * T)) * app.cam.zoom;
    const viewW = canvas.width / scale;
    const alive = w.players.filter(p => !p.dead && !p.finished);
    const lead = alive.length ? alive.reduce((a, b) => (b.x > a.x ? b : a)) : null;
    w.players.forEach((p, i) => {
      if (p.dead || p.finished || !lead || p === lead) { app.offscreen[i] = 0; return; }
      const off = p.x < app.cam.x - 10 || p.x > app.cam.x + viewW + 10;
      app.offscreen[i] = off ? app.offscreen[i] + dt : 0;
      if (app.offscreen[i] > 1.5) {
        p.x = lead.x; p.y = lead.y; p.g = lead.g; p.vx = 0; p.vy = 0; app.offscreen[i] = 0;
        R.burst(p.x + PW / 2, p.y + PH / 2, PLAYER_COLORS[i], 16, 200, 0.5);
      }
    });
  }

  // finishing
  if (w.finished && app.finishTimer < 0) app.finishTimer = app.n > 1 ? 5 : 0.9;
  if (app.finishTimer >= 0) {
    app.finishTimer -= dt;
    const remaining = w.players.filter(p => !p.finished).length;
    if (app.n > 1) {
      $('#hudCountdown').classList.remove('hidden');
      $('#hudCountdown').textContent = `${app.names[w.winner]} reached the portal! ${Math.ceil(Math.max(0, app.finishTimer))}…`;
    }
    if (app.finishTimer <= 0 || remaining === 0) finishLevel();
  }

  if (app.mode === 'host') {
    app.snapAcc += dt;
    if (app.snapAcc >= 0.05) {
      app.snapAcc = 0;
      app.net.send({ k: 's', l: app.levelIndex, s: w.snapshot(), ev: app.evBuf.splice(0) });
    }
  }
}

function finishLevel() {
  const w = app.world;
  app.playing = false;
  const deaths = w.players.reduce((a, p) => a + p.deaths, 0);
  const time = app.levelTime;
  if (w.winner >= 0) app.run.wins[w.winner]++;
  app.run.deaths += deaths; app.run.time += time; app.run.levels++;
  const i = app.levelIndex;
  if (app.mode !== 'client') {
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, i + 2));
    if (!progress.best[i] || time < progress.best[i]) progress.best[i] = time;
    saveProgress();
  }
  const res = {
    level: i, name: LEVELS[i].name, time, deaths, winner: w.winner,
    players: w.players.map((p, k) => ({ name: app.names[k], deaths: p.deaths, flips: p.flips, finished: p.finished, rank: app.finishOrder.findIndex(f => f.id === k) })),
    run: app.run, last: i === LEVELS.length - 1,
  };
  if (res.last) {
    if (app.mode === 'host') app.net.send({ k: 'final', res });
    setTimeout(() => showFinal(res), 600);
  } else {
    if (app.mode === 'host') app.net.send({ k: 'done', res });
    showComplete(res);
  }
}

function showComplete(res) {
  $('#hudCountdown').classList.add('hidden');
  $('#completeTitle').textContent = `${LEVELS[res.level].boss ? '👹' : res.level + 1}. ${res.name} — Complete!`;
  let html = `<div><span>Time</span><span class="hl">${res.time.toFixed(2)}s</span></div><div><span>Deaths</span><span>${res.deaths}</span></div>`;
  if (res.players.length > 1) {
    const sorted = [...res.players].map((p, k) => ({ ...p, k })).sort((a, b) => (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank));
    html += sorted.map((p, idx) => `<div><span style="color:${PLAYER_COLORS[p.k]}">${p.rank === 0 ? '👑 ' : ''}${escapeHtml(p.name)}</span><span>${p.finished ? '#' + (idx + 1) : 'DNF'} · ☠ ${p.deaths}</span></div>`).join('');
  } else {
    html += `<div><span>Flips</span><span>${res.players[0].flips}</span></div>`;
    const best = progress.best[res.level];
    if (best) html += `<div><span>Best</span><span>${best.toFixed(2)}s</span></div>`;
  }
  $('#completeStats').innerHTML = html;
  const client = app.mode === 'client';
  ['#btnRetry', '#btnCompLevels', '#btnNext'].forEach(s => $(s).classList.toggle('hidden', client));
  $('#completeWait').classList.toggle('hidden', !client);
  show('s-complete', false);
}

function showFinal(res) {
  const r = res.run;
  let html = `<div><span>Levels cleared this run</span><span class="hl">${r.levels}</span></div>
    <div><span>Total time</span><span>${r.time.toFixed(1)}s</span></div><div><span>Total deaths</span><span>${r.deaths}</span></div>`;
  if (res.players.length > 1) html += res.players.map((p, k) => `<div><span style="color:${PLAYER_COLORS[k]}">${escapeHtml(p.name)}</span><span>👑 ${r.wins[k]} wins</span></div>`).join('');
  $('#finalStats').innerHTML = html;
  $('#hud').classList.add('hidden');
  show('s-final', false);
}

$('#btnNext').onclick = () => startLevel(Math.min(LEVELS.length - 1, app.levelIndex + 1));
$('#btnRetry').onclick = () => startLevel(app.levelIndex);
$('#btnCompLevels').onclick = () => { app.world = null; $('#hud').classList.add('hidden'); openLevels(); };
$('#btnFinalHome').onclick = () => {
  app.world = null;
  if (app.mode === 'host') { app.net.send({ k: 'lobbyBack' }); show('s-lobby', false); renderLobby(); return; }
  if (app.mode === 'client') { show('s-lobby', false); return; }
  backStack.length = 0; show('s-title', false);
};

// pause
function pause() {
  if (!app.playing || app.paused) return;
  app.paused = app.mode === 'solo' || app.mode === 'local';
  app.menuOpen = true;
  $('#btnRestart').classList.toggle('hidden', app.mode === 'client');
  $('#btnPauseLevels').classList.toggle('hidden', app.mode === 'client');
  show('s-pause', false);
}
function resume() { app.paused = false; app.menuOpen = false; hideScreens(); clearPressed(); }
onGlobal((action) => {
  if (action === 'pause') {
    if (current === 's-pause') resume();
    else if (app.playing && !current) pause();
    else if (current === 's-settings' && backStack[backStack.length - 1] === 's-pause') back();
  }
  if (action === 'restart' && app.playing && !current && app.mode !== 'client') startLevel(app.levelIndex);
});
$('#btnPause').onclick = () => pause();
$('#btnResume').onclick = () => resume();
$('#btnRestart').onclick = () => startLevel(app.levelIndex);
$('#btnPauseSettings').onclick = () => show('s-settings');
$('#btnPauseLevels').onclick = () => {
  app.playing = false; app.world = null; $('#hud').classList.add('hidden');
  if (app.mode === 'host') app.net.send({ k: 'lobbyBack' });
  openLevels();
};
$('#btnQuit').onclick = () => {
  app.playing = false; app.world = null; $('#hud').classList.add('hidden');
  if (app.net) { leaveOnline(); return; }
  backStack.length = 0; show('s-title', false);
};

// ------------------------------------------------------------ camera + hud
function updateCamera(dt) {
  const w = app.world;
  const H = w.h * T;
  const baseScale = canvas.height / H;
  let ps = w.players.filter(p => !p.dead && !p.finished);
  if (app.mode === 'client' && app.n > 1) {
    const me = w.players[app.myIndex];
    if (me && !me.dead && !me.finished) ps = [me, ...ps.filter(p => p !== me)];
  }
  if (!ps.length) ps = w.players;
  const minX = Math.min(...ps.map(p => p.rx)), maxX = Math.max(...ps.map(p => p.rx + PW));
  const spread = maxX - minX;
  const fullW = canvas.width / baseScale;
  let zoom = Math.min(1, Math.max(0.6, fullW / (spread + 360)));
  if (app.n === 1) zoom = 1;
  if (w.level.boss) zoom = Math.min(1, fullW / (w.w * T));   // boss arena: show everything
  app.cam.zoom += (zoom - app.cam.zoom) * Math.min(1, dt * 3);
  const viewW = canvas.width / (baseScale * app.cam.zoom);
  const lead = app.n === 1 ? (ps[0].face || 1) * 60 : 0;
  let target = (minX + maxX) / 2 - viewW / 2 + lead;
  const worldW = w.w * T;
  if (viewW >= worldW) target = (worldW - viewW) / 2;
  else target = Math.max(0, Math.min(worldW - viewW, target));
  app.cam.x += (target - app.cam.x) * Math.min(1, dt * 6);
}

let hudKey = '';
function updateHud() {
  const w = app.world;
  const deaths = w.players.reduce((a, p) => a + p.deaths, 0);
  $('#hudTime').textContent = app.levelTime.toFixed(1) + 's';
  $('#hudDeaths').textContent = '☠ ' + deaths;
  if (app.n > 1) {
    const k = w.players.map(p => `${p.deaths}${p.finished}`).join();
    if (k !== hudKey) {
      hudKey = k;
      $('#hudPlayers').innerHTML = w.players.map((p, i) => `<span style="border-color:${PLAYER_COLORS[i]}">${escapeHtml(app.names[i] || 'P' + (i + 1))}${app.mode === 'client' && i === app.myIndex ? ' (you)' : ''} ${p.finished ? '✔' : '☠' + p.deaths}</span>`).join('');
    }
  } else $('#hudPlayers').innerHTML = '';
  if (w.boss) $('#hudBossFill').style.width = (100 * (1 - w.boss.hits / w.level.boss.orbs.length)) + '%';
  $('#camBox').classList.toggle('hidden', !(app.useBlink && app.blink && settings.showCam));
}

// ------------------------------------------------------------ attract mode (title background)
let attract = null;
function drawAttract(dt) {
  if (!attract) { attract = new World(LEVELS[0], 1); attract.players[0].dead = true; attract.players[0].deadT = 1e9; }
  attract.t += dt;
  app.cam.x = (app.cam.x + dt * 40) % (attract.w * T - canvas.width / (canvas.height / (attract.h * T)));
  app.cam.zoom = 1;
  R.draw(attract, app.cam, performance.now() / 1000);
}

// ------------------------------------------------------------ resize / quality
let lastSize = '';
function resize(force) {
  const low = settings.quality === 'low' || (settings.quality === 'auto' && R.low);
  if (settings.quality === 'high') R.low = false; else if (settings.quality === 'low') R.low = true;
  const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 2);
  const w = Math.floor(window.innerWidth * dpr), h = Math.floor(window.innerHeight * dpr);
  const key = `${w}x${h}`;
  if (key === lastSize && !force) return;
  lastSize = key;
  canvas.width = w; canvas.height = h;
  $('#rotate').classList.toggle('hidden', !(window.innerHeight > window.innerWidth && isTouch()));
}
function isTouch() { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }
function updateTouchVisibility() {
  const on = settings.touch === 'on' || (settings.touch === 'auto' && isTouch());
  $('#touch').classList.toggle('hidden', !on || !app.playing);
}

// touch buttons
$$('#touch button').forEach(b => {
  const k = b.dataset.t;
  const set = (v) => (e) => { e.preventDefault(); unlockAudio(); setTouch(k, v); b.classList.toggle('on', v); };
  b.addEventListener('pointerdown', set(true));
  b.addEventListener('pointerup', set(false));
  b.addEventListener('pointercancel', set(false));
  b.addEventListener('pointerleave', set(false));
});

// ------------------------------------------------------------ settings UI
function renderSettings() {
  $('#setVolume').value = settings.volume;
  $('#setShake').checked = settings.shake;
  $('#setQuality').value = settings.quality;
  $('#setTouch').value = settings.touch;
  $('#setBlinkPlayer').value = settings.blinkPlayer;
  $('#setSens').value = settings.blinkSensitivity; $('#sensVal').textContent = settings.blinkSensitivity.toFixed(2);
  $('#setShowCam').checked = settings.showCam;
  renderBindTable();
}
function renderBindTable() {
  const t = $('#bindTable');
  const acts = [['left', 'Left'], ['right', 'Right'], ['flip', 'Flip']];
  let html = '<tr><th></th>' + [0, 1, 2, 3].map(i => `<th style="color:${PLAYER_COLORS[i]}">P${i + 1}</th>`).join('') + '</tr>';
  for (const [a, label] of acts) {
    for (let slot = 0; slot < 2; slot++) {
      html += `<tr><th>${slot === 0 ? label : ''}</th>` + [0, 1, 2, 3].map(i =>
        `<td><button class="bind" data-p="${i}" data-a="${a}" data-s="${slot}">${keyLabel(settings.bindings[i][a][slot])}</button></td>`).join('') + '</tr>';
    }
  }
  for (const [a, label] of [['pause', 'Pause'], ['restart', 'Restart']]) {
    html += `<tr><th>${label}</th>` + [0, 1].map(s => `<td><button class="bind" data-g="${a}" data-s="${s}">${keyLabel(settings.global[a][s])}</button></td>`).join('') + '<td></td><td></td></tr>';
  }
  t.innerHTML = html;
  t.querySelectorAll('.bind').forEach(b => b.onclick = () => {
    t.querySelectorAll('.bind').forEach(x => x.classList.remove('wait'));
    b.classList.add('wait'); b.textContent = 'press…';
    captureKey((code) => {
      const s = Number(b.dataset.s);
      const list = b.dataset.g ? settings.global[b.dataset.g] : settings.bindings[b.dataset.p][b.dataset.a];
      if (code) {
        // remove conflicts
        settings.bindings.forEach(bb => Object.values(bb).forEach(arr => { const k = arr.indexOf(code); if (k >= 0) arr[k] = null; }));
        Object.values(settings.global).forEach(arr => { const k = arr.indexOf(code); if (k >= 0) arr[k] = null; });
      }
      list[s] = code;
      for (const arr of [...settings.bindings.flatMap(x => Object.values(x)), ...Object.values(settings.global)]) {
        for (let k = arr.length - 1; k >= 0; k--) if (arr[k] === null && k > 0) arr.splice(k, 1);
      }
      cleanBindings();
      saveSettings(); renderBindTable();
    });
  });
}
function cleanBindings() {
  // keep arrays compact: [primary, secondary?] with no nulls except primary placeholder
  const fix = (arr) => { const v = arr.filter(Boolean); arr.length = 0; arr.push(...v); };
  settings.bindings.forEach(b => Object.values(b).forEach(fix));
  Object.values(settings.global).forEach(fix);
}
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + t.dataset.tab));
});
$('#btnResetKeys').onclick = () => { resetBindings(); renderBindTable(); toast('Controls reset'); };
$('#btnResetProgress').onclick = () => { if (confirm('Reset all level progress?')) { progress.unlocked = 1; progress.best = {}; saveProgress(); toast('Progress reset'); } };
$('#setVolume').oninput = (e) => { settings.volume = Number(e.target.value); saveSettings(); };
$('#setShake').onchange = (e) => { settings.shake = e.target.checked; saveSettings(); };
$('#setQuality').onchange = (e) => { settings.quality = e.target.value; R.low = settings.quality === 'low'; saveSettings(); resize(true); };
$('#setTouch').onchange = (e) => { settings.touch = e.target.value; saveSettings(); updateTouchVisibility(); };
$('#setBlinkPlayer').onchange = (e) => { settings.blinkPlayer = Number(e.target.value); saveSettings(); };
$('#setSens').oninput = (e) => {
  settings.blinkSensitivity = Number(e.target.value); $('#sensVal').textContent = settings.blinkSensitivity.toFixed(2);
  if (app.blink) app.blink.setSensitivity(settings.blinkSensitivity); saveSettings();
};
$('#setShowCam').onchange = (e) => { settings.showCam = e.target.checked; saveSettings(); };

function renderHowto() {
  const g = settings.global;
  $('#howtoKeys').innerHTML = settings.bindings.map((b, i) =>
    `<p><b style="color:${PLAYER_COLORS[i]}">P${i + 1}</b> move ${kb(b.left)} ${kb(b.right)} · flip ${kb(b.flip)}</p>`).join('') +
    `<p>Solo: P1 and P2 keys both work. Pause ${kb(g.pause)} · Restart ${kb(g.restart)}</p>`;
}

// ------------------------------------------------------------ PWA install + boot
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#btnInstall').classList.remove('hidden'); });
$('#btnInstall').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt = null; $('#btnInstall').classList.add('hidden'); };
if (IS_TAURI) $('#lnkWin').classList.add('hidden');
if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_TAURI && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
window.addEventListener('resize', () => { resize(); updateTouchVisibility(); });

initInput();
resize(true);
show('s-title', false);
requestAnimationFrame(frame);

// debug/testing hook
window.__gial = { app, LEVELS, startLevel };
