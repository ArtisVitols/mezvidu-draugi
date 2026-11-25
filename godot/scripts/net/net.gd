class_name Net
extends RefCounted
## Tīkls: tas pats Wi-Fi (ENet). Saimnieka telefons ir serveris; istabas kodu atrod ar UDP apraidi
## (klients jautā „MZD?<kods>”, saimnieks atbild „MZD!<kods>”), ja neizdodas — var ierakstīt saimnieka IP.
## Saskarne kā web net.js: toHost, broadcast, sendTo, onMessage(m), onHostMessage(from, m), onPeerLeave(id) …
## Ziņas — vārdnīcas (var_to_bytes). Pozīcijas ('pos', 's') iet pa nedrošo kanālu 1, pārējais — drošais kanāls 0.

const PORT := 47031
const DISC_PORT := 47032
const MAX_PLAYERS := 4
const UNRELIABLE := {"pos": true, "s": true}

var is_host := false
var offline := false
var my_id := 0
var code := ""
var host_ip := ""
var peer: ENetMultiplayerPeer
var disc: PacketPeerUDP
var conns := {}          # saimnieks: spēles id → enet peer id
var by_enet := {}        # saimnieks: enet peer id → spēles id
var next_id := 1
var joined := false
var closed := false
var reconnecting := false
var recon_t0 := 0.0
var recon_try_t := 0.0
var disc_t := 0.0
var join_cb: Callable
var join_deadline := 0.0
var join_ip := ""
var busy_until := 0.0

var onMessage: Callable = func(_m): pass
var onHostMessage: Callable = func(_f, _m): pass
var onPeerLeave: Callable = func(_id): pass
var onDisconnect: Callable = func(_why): pass
var onReconnect: Callable = func(): pass
var onStatus: Callable = func(_t): pass

static func random_code() -> String:
	var chars := "ABCDEFGHJKLMNPRSTUVZ23456789"
	var s := ""
	for i in 5: s += chars[randi() % chars.length()]
	return s

func start_offline() -> void:
	is_host = true; offline = true; my_id = 0

## saimnieks: ENet serveris + atbildes uz meklēšanu
func host(c: String) -> int:
	is_host = true; my_id = 0; code = c
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_server(PORT, MAX_PLAYERS - 1, 2)
	if err != OK: return err
	peer.peer_connected.connect(_on_peer_connected)
	peer.peer_disconnected.connect(_on_peer_disconnected)
	disc = PacketPeerUDP.new()
	disc.set_broadcast_enabled(true)
	disc.bind(DISC_PORT)
	return OK

## klients: atrod saimnieku pēc koda (vai pa IP) un pieslēdzas; cb(ok: bool, why: String)
func join(c: String, ip: String, cb: Callable) -> void:
	is_host = false; code = c.to_upper(); join_ip = ip; join_cb = cb
	join_deadline = Time.get_ticks_msec() / 1000.0 + 15.0
	if ip != "":
		_connect(ip)
	else:
		disc = PacketPeerUDP.new()
		disc.set_broadcast_enabled(true)
		disc.bind(0)
		disc_t = 0.0

func _connect(ip: String) -> void:
	host_ip = ip
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_client(ip, PORT, 2)
	if err != OK:
		_join_done(false, "Neizdevās pieslēgties (%d)" % err)
		return
	peer.peer_connected.connect(func(id: int) -> void:
		if id == 1:
			var p := peer.get_peer(1)
			if p: p.set_timeout(32, 15000, 30000)
			_send_raw(1, {"t": "join", "code": code}, 0)
			if reconnecting:
				reconnecting = false
				onStatus.call("✅ Atkal savienots!")
				onReconnect.call()
			else:
				joined = true
				_join_done(true, ""))
	peer.peer_disconnected.connect(func(id: int) -> void:
		if id == 1 and not closed: _lost("savienojums pārtrūka"))

func _join_done(ok: bool, why: String) -> void:
	if join_cb.is_valid():
		var cb := join_cb
		join_cb = Callable()
		cb.call(ok, why)

func _lost(why: String) -> void:
	if not joined or reconnecting or closed: return
	reconnecting = true
	recon_t0 = Time.get_ticks_msec() / 1000.0
	recon_try_t = 0.0
	onStatus.call("🔌 Savienojums pārtrūka — savienojamies no jauna…")
	print("[net] atkārtota savienošanās: ", why)

func _on_peer_connected(eid: int) -> void:
	var p := peer.get_peer(eid)
	if p: p.set_timeout(32, 15000, 30000)
	if conns.size() >= MAX_PLAYERS - 1:
		_send_raw(eid, {"t": "full"}, 0)
		return
	var id := next_id
	next_id += 1
	conns[id] = eid
	by_enet[eid] = id

func _on_peer_disconnected(eid: int) -> void:
	if by_enet.has(eid):
		var id: int = by_enet[eid]
		by_enet.erase(eid)
		conns.erase(id)
		onPeerLeave.call(id)

func _send_raw(eid: int, m: Dictionary, ch: int) -> void:
	if peer == null or peer.get_connection_status() != MultiplayerPeer.CONNECTION_CONNECTED: return
	peer.set_target_peer(eid)
	peer.transfer_channel = ch
	peer.transfer_mode = MultiplayerPeer.TRANSFER_MODE_UNRELIABLE if ch == 1 else MultiplayerPeer.TRANSFER_MODE_RELIABLE
	peer.put_packet(var_to_bytes(m))

func _ch(m: Dictionary) -> int: return 1 if UNRELIABLE.has(str(m.get("t", ""))) else 0

# ---------- spēles ziņas ----------
func toHost(m: Dictionary) -> void:
	if is_host: onHostMessage.call(0, m)
	elif joined and not reconnecting: _send_raw(1, m, _ch(m))

func broadcast(m: Dictionary, skip_self := false) -> void:
	if peer and is_host:
		var ch := _ch(m)
		for id in conns: _send_raw(conns[id], m, ch)
	if not skip_self: onMessage.call(m)

func sendTo(id: int, m: Dictionary) -> void:
	if id == 0:
		onMessage.call(m)
		return
	if conns.has(id): _send_raw(conns[id], m, _ch(m))

func dropPeer(id: int) -> void:
	if not conns.has(id): return
	var eid: int = conns[id]
	conns.erase(id); by_enet.erase(eid)
	peer.disconnect_peer(eid)
	onPeerLeave.call(id)

func playerCount() -> int: return conns.size() + 1

## ielāde var aizņemt laiku — ENet gaida līdz 30 s, tāpēc nekas nav jādara (saskarne kā web)
func busyPing(_s: float) -> void: pass

func close() -> void:
	closed = true
	if peer: peer.close()
	if disc: disc.close()
	peer = null
	conns.clear()

## kur sūtīt meklēšanu: vispārējā apraide, katra tīkla /24 apraide (daži maršrutētāji 255.255.255.255 nelaiž) un šī ierīce
var _targets: Array = []
func _disc_targets() -> Array:
	if _targets.is_empty():
		_targets = ["255.255.255.255", "127.0.0.1"]
		for a in IP.get_local_addresses():
			var parts := str(a).split(".")
			if parts.size() == 4 and not a.begins_with("127.") and not a.begins_with("169.254."):
				var bc := "%s.%s.%s.255" % [parts[0], parts[1], parts[2]]
				if not _targets.has(bc): _targets.append(bc)
	return _targets

## katru kadru (arī ielādes laikā)
func poll(dt: float) -> void:
	if closed: return
	var now := Time.get_ticks_msec() / 1000.0
	# meklēšana / atbildes
	if disc:
		if is_host:
			while disc.get_available_packet_count() > 0:
				var txt := disc.get_packet().get_string_from_utf8()
				var ip := disc.get_packet_ip()
				var port := disc.get_packet_port()
				if txt == "MZD?" + code:
					disc.set_dest_address(ip, port)
					disc.put_packet(("MZD!" + code).to_utf8_buffer())
		elif not joined and join_cb.is_valid():
			disc_t -= dt
			if disc_t <= 0.0:
				disc_t = 0.6
				for dst in _disc_targets():
					disc.set_dest_address(dst, DISC_PORT)
					disc.put_packet(("MZD?" + code).to_utf8_buffer())
			while disc.get_available_packet_count() > 0:
				var txt := disc.get_packet().get_string_from_utf8()
				var ip := disc.get_packet_ip()
				if txt == "MZD!" + code and peer == null:
					_connect(ip)
			if now > join_deadline: _join_done(false, "Istaba ar šo kodu netika atrasta tajā pašā Wi-Fi")
	if peer == null: return
	peer.poll()
	while peer and peer.get_available_packet_count() > 0:
		var from_e := peer.get_packet_peer()
		var raw := peer.get_packet()
		var m = bytes_to_var(raw)
		if not (m is Dictionary): continue
		if is_host:
			if not by_enet.has(from_e): continue
			if m.get("t") == "join": continue
			onHostMessage.call(by_enet[from_e], m)
		else:
			if m.get("t") == "full":
				onDisconnect.call("Istaba ir pilna (max 4 spēlētāji)")
				close()
				return
			onMessage.call(m)
	# atkārtota savienošanās (līdz 60 s)
	if reconnecting and not is_host:
		if now - recon_t0 > 60.0:
			reconnecting = false
			onDisconnect.call("Saimnieks atvienojās")
			return
		recon_try_t -= dt
		if recon_try_t <= 0.0 and (peer == null or peer.get_connection_status() != MultiplayerPeer.CONNECTION_CONNECTED):
			recon_try_t = 4.0
			if peer: peer.close()
			peer = null
			_connect(host_ip)
