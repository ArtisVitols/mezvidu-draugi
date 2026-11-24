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
    this.onReconnect = () => {};    // 1.47.2: klients pieslēdzās no jauna (spēle sūta „hello” vēlreiz)
    this.onStatus = () => {};       // (teksts) — paziņojums spēlētājam
    this.offline = false;
    this.lastRx = Date.now();       // klients: kad pēdējo reizi kaut kas pienāca no saimnieka
    this.reconnecting = false;
    this.closed = false;
  }

  // 1.47.2: „sirdspuksti” — abi sūta ik 1,5 s (setInterval darbojas arī fonā, kad spēle samazināta),
  // lai pamanītu „mirušu” savienojumu (telefons samazina spēli → WebRTC kanāls var klusi nomirt)
  startWatch() {
    if (this.watchT) return;
    this.lastTick = Date.now();
    this.watchT = setInterval(() => {
      if (this.closed || this.offline) return;
      const now = Date.now();
      // šī lapa pati bija aizņemta (zemes ielāde, fons) — klusumu šajā laikā neskaitām
      const stalled = now - this.lastTick > 3500;
      this.lastTick = now;
      if (stalled || (this.isBusy && this.isBusy())) { this.lastRx = Math.max(this.lastRx, now - 3000); for (const c of this.conns.values()) c._rx = Math.max(c._rx || 0, now - 3000); }
      if (this.isHost) {
        this.peerCheck();
        for (const [id, c] of this.conns) {
          if (c.open) try { c.send({ t: 'hb' }); } catch (e) { /* */ }
          // klusē > 25 s — savienojums miris; klients pats pieslēgsies no jauna
          if (now - (c._rx || now) > 25000 && now > (c._grace || 0)) { this.conns.delete(id); try { c.close(); } catch (e) { /* */ } this.onPeerLeave(id); }
        }
      } else {
        if (this.hostConn && this.hostConn.open && !this.reconnecting) try { this.hostConn.send({ t: 'hb' }); } catch (e) { /* */ }
        // no saimnieka nekas nav pienācis 15 s (un spēle ir redzama) — savienojamies no jauna
        if (!this.reconnecting && document.visibilityState === 'visible' && now - this.lastRx > 15000 && now > (this.graceUntil || 0)) this.reconnect('klusums ' + Math.round((now - this.lastRx) / 1000) + ' s');
      }
    }, 1500);
    // atgriežoties no fona: ja savienojums ir aizvērts — uzreiz no jauna; ja tikai kluss — dodam 15 s (sargsuns)
    this.visH = () => {
      if (document.visibilityState !== 'visible') return;
      this.lastTick = Date.now();
      this.peerCheck();
      if (!this.isHost && !this.reconnecting && this.joined && (!this.hostConn || !this.hostConn.open)) this.reconnect('atgriezās, savienojums aizvērts');
      else this.lastRx = Math.max(this.lastRx, Date.now() - 3000);
    };
    document.addEventListener('visibilitychange', this.visH);
  }

  // 1.48.0: „būšu aizņemts līdz s sekundēm” (pirms smagas zemes ielādes) — otra puse tik ilgi negaida sirdspukstus
  busyPing(s) {
    const m = { t: 'hb', busy: s };
    try {
      if (this.isHost) { for (const c of this.conns.values()) if (c.open) c.send(m); }
      else if (this.hostConn && this.hostConn.open) this.hostConn.send(m);
    } catch (e) { /* */ }
  }

  // savienojums ar PeerJS serveri pārtrūka (piem. fonā) — pieslēdzamies atpakaļ ar to pašu id (saimnieks paliek atrodams)
  peerCheck() {
    const p = this.peer;
    if (p && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (e) { /* */ }
  }

  bindHostConn(conn) {
    this.hostConn = conn;
    this.lastRx = Date.now();
    conn.on('data', (msg) => {
      if (this.hostConn !== conn) return;
      this.lastRx = Date.now();
      if (msg && msg.t === 'hb') { if (msg.busy) this.graceUntil = Date.now() + msg.busy * 1000; return; }
      if (!msg || !msg.t) return;
      if (msg.t === 'full') { this.onDisconnect('Istaba ir pilna (max 4 spēlētāji)'); return; }
      this.onMessage(msg);
    });
    conn.on('close', () => { if (this.hostConn === conn) this.reconnect('aizvērts'); });
    conn.on('error', () => { if (this.hostConn === conn) this.reconnect('kļūda'); });
  }

  // klients: savienojamies ar to pašu istabu no jauna (līdz ~60 s), tad ziņojam par atvienošanos
  reconnect(why) {
    if (this.isHost || this.closed || this.reconnecting || !this.code || !this.joined) return;
    this.reconnecting = true;
    console.warn('savienojums ar saimnieku pārtrūka (' + why + ') — savienojamies no jauna');
    this.onStatus('🔌 Savienojums ar saimnieku pārtrūka — savienojamies no jauna…');
    const old = this.hostConn; this.hostConn = null;
    try { old && old.close(); } catch (e) { /* */ }
    const t0 = Date.now();
    let tries = 0;
    const attempt = () => {
      if (this.closed) return;
      if (Date.now() - t0 > 60000) { this.reconnecting = false; this.onDisconnect('Saimnieks atvienojās'); return; }
      tries++;
      if (tries > 1 && tries % 3 === 1) this.onStatus('🔌 Gaidām saimnieku…');
      const go = () => {
        let ok = false;
        const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
        const to = setTimeout(() => { if (!ok) { try { conn.close(); } catch (e) { /* */ } setTimeout(attempt, 1500); } }, 8000);
        conn.on('open', () => {
          if (ok || this.closed) return;
          ok = true; clearTimeout(to);
          this.bindHostConn(conn);
          this.reconnecting = false;
          this.onStatus('✅ Atkal savienots!');
          this.onReconnect();
        });
      };
      const p = this.peer;
      if (!p || p.destroyed) { this.newClientPeer(go); return; }
      if (p.disconnected) {
        const once = () => { p.off('open', once); go(); };
        p.on('open', once);
        try { p.reconnect(); } catch (e) { p.off('open', once); this.newClientPeer(go); }
        return;
      }
      go();
    };
    setTimeout(attempt, 600);
  }

  newClientPeer(cb) {
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    const peer = new window.Peer({ debug: 1 });
    this.peer = peer;
    peer.on('open', cb);
    peer.on('error', (err) => console.warn('peer error', err.type));
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
      this.startWatch();
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
      conn._rx = Date.now();
      conn.on('data', (msg) => {
        conn._rx = Date.now();
        if (msg && msg.t === 'hb') { if (msg.busy) conn._grace = Date.now() + msg.busy * 1000; return; }
        if (msg && msg.t) this.onHostMessage(id, msg);
      });
      conn.on('close', () => { if (this.conns.delete(id)) this.onPeerLeave(id); });
      conn.on('error', () => { if (this.conns.delete(id)) this.onPeerLeave(id); });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS nav ielādēts')); return; }
      this.isHost = false;
      this.code = code.toUpperCase();
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
        this.bindHostConn(conn);
        conn.on('open', () => { if (!done) { done = true; clearTimeout(t); this.joined = true; this.startWatch(); resolve(); } });
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

  // saimnieks: atvieno spēlētāju (vecs savienojums, kad tas pats spēlētājs pieslēdzies no jauna)
  dropPeer(id) {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    try { c.close(); } catch (e) { /* */ }
    this.onPeerLeave(id);
  }

  playerCount() { return this.conns.size + 1; }

  close() {
    this.closed = true;
    clearInterval(this.watchT);
    if (this.visH) document.removeEventListener('visibilitychange', this.visH);
    try { this.peer && this.peer.destroy(); } catch (e) { /* */ }
    this.peer = null;
    this.conns.clear();
  }
}
