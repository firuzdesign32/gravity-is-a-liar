// Online multiplayer over WebRTC (PeerJS, public broker). Host runs the simulation,
// clients send inputs and render host snapshots. PeerJS is lazy-loaded.
const PREFIX = 'gial-room-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Optional custom broker: ?peer=host:port (e.g. a self-hosted PeerServer). Default: PeerJS cloud.
function peerOpts() {
  try {
    const v = new URLSearchParams(location.search).get('peer');
    if (!v) return {};
    const [host, port] = v.split(':');
    return { host, port: Number(port) || 443, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' };
  } catch { return {}; }
}

async function loadPeer() {
  const m = await import('peerjs');
  return m.Peer || m.default;
}

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

export class NetHost {
  constructor() {
    this.conns = [];               // {conn, slot, name, input}
    this.onChange = null;
    this.code = null;
  }
  async open(name) {
    const Peer = await loadPeer();
    this.name = name;
    for (let tries = 0; tries < 3; tries++) {
      const code = makeCode();
      try {
        await new Promise((res, rej) => {
          this.peer = new Peer(PREFIX + code, peerOpts());
          this.peer.on('open', () => res());
          this.peer.on('error', (e) => rej(e));
        });
        this.code = code;
        break;
      } catch (e) {
        if (this.peer) this.peer.destroy();
        if (tries === 2) throw e;
      }
    }
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('error', () => {});
    return this.code;
  }
  accept(conn) {
    conn.on('open', () => {
      const used = new Set(this.conns.map(c => c.slot));
      let slot = 1; while (used.has(slot)) slot++;
      if (slot > 3 || this.locked) { conn.send({ k: 'full' }); setTimeout(() => conn.close(), 300); return; }
      const c = { conn, slot, name: `P${slot + 1}`, input: { left: false, right: false, flipSeq: 0, lastSeq: 0 } };
      this.conns.push(c);
      conn.on('data', (d) => this.onData(c, d));
      conn.on('close', () => { this.conns = this.conns.filter(x => x !== c); this.broadcastLobby(); this.onChange && this.onChange(); });
      conn.send({ k: 'hello', slot });
      this.broadcastLobby();
      this.onChange && this.onChange();
    });
  }
  onData(c, d) {
    if (d.k === 'in') { c.input.left = !!d.l; c.input.right = !!d.r; c.input.flipSeq = d.f | 0; }
    else if (d.k === 'name') { c.name = String(d.name || '').slice(0, 12) || c.name; this.broadcastLobby(); this.onChange && this.onChange(); }
  }
  players() {
    const list = [{ slot: 0, name: this.name || 'Host' }];
    for (const c of this.conns) list.push({ slot: c.slot, name: c.name });
    return list.sort((a, b) => a.slot - b.slot);
  }
  broadcastLobby() { this.send({ k: 'lobby', players: this.players() }); }
  // input for remote slot
  inputFor(slot) {
    const c = this.conns.find(x => x.slot === slot);
    if (!c) return { left: false, right: false, flip: false };
    const flip = c.input.flipSeq !== c.input.lastSeq;
    c.input.lastSeq = c.input.flipSeq;
    return { left: c.input.left, right: c.input.right, flip, buffer: 0.2 };
  }
  send(msg) { for (const c of this.conns) if (c.conn.open) c.conn.send(msg); }
  close() { try { this.send({ k: 'bye' }); this.peer && this.peer.destroy(); } catch { /* ignore */ } }
}

export class NetClient {
  constructor() { this.onMsg = null; this.slot = -1; this.flipSeq = 0; this.last = ''; this.lastSent = 0; }
  async join(code, name) {
    const Peer = await loadPeer();
    this.peer = await new Promise((res, rej) => {
      const p = new Peer(peerOpts());
      p.on('open', () => res(p));
      p.on('error', rej);
    });
    await new Promise((res, rej) => {
      const conn = this.peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
      const to = setTimeout(() => rej(new Error('Room not found')), 9000);
      this.peer.on('error', (e) => { clearTimeout(to); rej(e); });
      conn.on('open', () => { clearTimeout(to); this.conn = conn; conn.send({ k: 'name', name }); res(); });
      conn.on('data', (d) => { if (d.k === 'hello') this.slot = d.slot; this.onMsg && this.onMsg(d); });
      conn.on('close', () => this.onMsg && this.onMsg({ k: 'bye' }));
    });
  }
  sendInput(inp) {
    if (inp.flip) this.flipSeq++;
    const s = `${inp.left ? 1 : 0}${inp.right ? 1 : 0}${this.flipSeq}`;
    const now = performance.now();
    if (s !== this.last || now - this.lastSent > 150) {
      this.last = s; this.lastSent = now;
      if (this.conn && this.conn.open) this.conn.send({ k: 'in', l: inp.left, r: inp.right, f: this.flipSeq });
    }
  }
  close() { try { this.peer && this.peer.destroy(); } catch { /* ignore */ } }
}
