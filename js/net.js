// Tīkls: PeerJS (WebRTC). Saimnieks (host) ir galvenais, pārējie pieslēdzas pie viņa.
// Nekāds serveris nav vajadzīgs - tikai bezmaksas PeerJS savienošanas serviss.
const PREFIX = 'mezvidu-draugi-lv-v1-';
export const MAX_PLAYERS = 4;

export function randomCode() {
  const chars = 'ABCDEFGHJKLMNPRSTUVZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.myId = 0;
    this.conns = new Map(); // host: id -> conn
    this.hostConn = null;
    this.nextId = 1;
    this.onMessage = () => {};      // (msg) visiem pārraidītie ziņojumi
    this.onHostMessage = () => {};  // (fromId, msg) tikai saimniekam
    this.onPeerLeave = () => {};
    this.onDisconnect = () => {};
    this.offline = false;
  }

  // Bez interneta / vienspēlētāja režīms
  startOffline() {
    this.isHost = true; this.offline = true; this.myId = 0;
    return Promise.resolve('VIENS');
  }

  host(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS nav ielādēts')); return; }
      this.isHost = true;
      this.myId = 0;
      const peer = new window.Peer(PREFIX + code, { debug: 1 });
      this.peer = peer;
      let opened = false;
      const t = setTimeout(() => { if (!opened) reject(new Error('Neizdevās savienoties ar serveri')); }, 12000);
      peer.on('open', () => { opened = true; clearTimeout(t); resolve(code); });
      peer.on('error', (err) => {
        console.warn('peer error', err.type, err);
        if (!opened) { clearTimeout(t); reject(err); }
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* */ } });
      peer.on('connection', (conn) => this.acceptConn(conn));
    });
  }

  acceptConn(conn) {
    conn.on('open', () => {
      // viens un tas pats pārlūks nedrīkst pieslēgties divreiz
      for (const [oid, c] of this.conns) {
        if (c.peer === conn.peer) { this.conns.delete(oid); try { c.close(); } catch (e) { /* */ } this.onPeerLeave(oid); }
      }
      if (this.conns.size >= MAX_PLAYERS - 1) {
        conn.send({ t: 'full' });
        setTimeout(() => conn.close(), 500);
        return;
      }
      const id = this.nextId++;
      conn._pid = id;
      this.conns.set(id, conn);
      conn.on('data', (msg) => { if (msg && msg.t) this.onHostMessage(id, msg); });
      conn.on('close', () => { if (this.conns.delete(id)) this.onPeerLeave(id); });
      conn.on('error', () => { if (this.conns.delete(id)) this.onPeerLeave(id); });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS nav ielādēts')); return; }
      this.isHost = false;
      const peer = new window.Peer({ debug: 1 });
      this.peer = peer;
      let done = false;
      const fail = (e) => { if (!done) { done = true; clearTimeout(t); reject(e); } };
      const t = setTimeout(() => fail(new Error('Istaba netika atrasta')), 15000);
      peer.on('error', (err) => {
        console.warn('peer error', err.type, err);
        if (err.type === 'peer-unavailable') fail(new Error('Istaba ar šo kodu netika atrasta'));
        else fail(err);
      });
      peer.on('open', () => {
        if (this.hostConn) return; // 'open' var atkārtoties pēc pārslēgšanās
        const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => { if (!done) { done = true; clearTimeout(t); resolve(); } });
        conn.on('data', (msg) => {
          if (msg && msg.t === 'full') { this.onDisconnect('Istaba ir pilna (max 4 spēlētāji)'); return; }
          if (msg && msg.t) this.onMessage(msg);
        });
        conn.on('close', () => { if (this.hostConn === conn) this.onDisconnect('Saimnieks atvienojās'); });
        conn.on('error', () => this.onDisconnect('Savienojuma kļūda'));
      });
    });
  }

  // klients -> saimniekam (saimnieks apstrādā pats sev)
  toHost(msg) {
    if (this.isHost) this.onHostMessage(0, msg);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  // saimnieks -> visiem (ieskaitot sevi)
  broadcast(msg, skipSelf = false) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
    if (!skipSelf) this.onMessage(msg);
  }

  sendTo(id, msg) {
    if (id === 0) { this.onMessage(msg); return; }
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }

  playerCount() { return this.conns.size + 1; }

  close() {
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.peer = null;
    this.conns.clear();
  }
}
