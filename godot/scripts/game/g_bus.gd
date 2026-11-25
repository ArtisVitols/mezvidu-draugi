class_name GBus
extends GVehicles
## 🚌 Autobusi (web bus.js): divi autobusi pa vienu apli, kustība — tikai no kopējā pulksteņa (bez tīkla ziņām).
## Maršruts un grafiks — data/bus.json (no web moduļa iekšējiem datiem).

const BUS_PRICE := 2
const BOARD_R := 4.0
const BUS_CODE := 6
const BUS_COUNT := 2
const SEATS := 12
const BUS_ZONES := ["n", "c", "e", "w"]
var BD: Dictionary = {}
var BUS_STOPS: Array = []
var busStopGroups = {}
var busStopShown = -2
var busLock = {}
var busPack: Node3D
var stopPack: Node3D

func initBus() -> void:
	var f = FileAccess.open("res://data/bus.json", FileAccess.READ)
	BD = JSON.parse_string(f.get_as_text())
	BD.X = PackedFloat32Array(BD.X); BD.Z = PackedFloat32Array(BD.Z); BD.H = PackedFloat32Array(BD.H)
	for e in BD.ev:
		if e.kind == "move": e.t = PackedFloat32Array(e.t)
	BUS_STOPS = BD.stops
	buses = []
	var bws = Avatar.asset("bus")
	for k in BUS_COUNT:
		var root = bws.build()
		var o = _veh_dict(root, bws.j.get("meta", {}), "bus")
		o.doors = []
		for n in root.find_children("*", "Node3D", true, false):
			if str(n.get_meta("n", "")) == "door": o.doors.append(n)
		o.doorZ = []
		for d in o.doors: o.doorZ.append(d.position.z)
		root.visible = false
		root.rotation_order = EULER_ORDER_YXZ
		stage.add_child(root)
		buses.append({"k": k, "obj": o, "vis": false, "lastS": null, "clk": null, "st": null, "zone": "", "lx": 0.0, "lz": 0.0, "h": 0.0, "y": null, "speed": null, "door": 0.0})
	busStopShown = -2
	busStopGroups = {}
	stopPack = Avatar.asset("busstops").build()
	for i in BUS_STOPS.size():
		var s: Dictionary = BUS_STOPS[i]
		var z = zoneOfG(float(s.x), float(s.z))
		var o = Terra.zone_offset(z)
		s.zone = z; s.lx = float(s.x) - o.x; s.lz = float(s.z) - o.y
		var g: Node3D = null
		for c in stopPack.get_children(): if str(c.get_meta("n", "")) == "stop:%d" % i: g = c
		if g == null: continue
		stopPack.remove_child(g)
		g.position = Vector3(s.lx, 0, s.lz)
		g.rotation = Vector3(0, float(s.ry), 0)
		if not busStopGroups.has(z):
			var grp = Node3D.new(); grp.name = "Stops_" + z; grp.visible = false; stage.add_child(grp)
			busStopGroups[z] = grp
		busStopGroups[z].add_child(g)

func zoneOfG(x: float, z: float) -> String:
	for id in BUS_ZONES:
		var o = Terra.zone_offset(id)
		if maxf(absf(x - o.x), absf(z - o.y)) <= ZONE_HALF: return id
	return FARM

func busOffset(k: int) -> float: return -k * float(BD.P) * 1000.0 / BUS_COUNT

static func angDiff(a: float, b: float) -> float:
	var d = a - b
	while d > PI: d -= TAU
	while d < -PI: d += TAU
	return d

func pathAt(s: float) -> Dictionary:
	var L: float = BD.len
	s = fmod(fmod(s, L) + L, L)
	var n: int = int(BD.n)
	var f = minf(n - 0.001, s / float(BD.step))
	var i = int(f)
	var u = f - i
	var X: PackedFloat32Array = BD.X
	var Z: PackedFloat32Array = BD.Z
	var H: PackedFloat32Array = BD.H
	var x = X[i] + (X[i + 1] - X[i]) * u
	var z = Z[i] + (Z[i + 1] - Z[i]) * u
	var dh = angDiff(H[i + 1], H[i])
	return {"x": x, "z": z, "h": H[i] + dh * u, "turn": dh / float(BD.step)}

func busState(now_ms: float) -> Dictionary:
	var P: float = BD.P
	var T = fmod(fmod(now_ms / 1000.0, P) + P, P)
	var ev: Array = BD.ev
	var lo = 0
	var hi = ev.size() - 1
	while lo < hi:
		var mid = (lo + hi) >> 1
		if T < float(ev[mid].t1): hi = mid
		else: lo = mid + 1
	var e: Dictionary = ev[lo]
	if e.kind == "dwell": return {"s": float(BUS_STOPS[int(e.stop)].s), "stop": int(e.stop), "left": float(e.t1) - T, "next": int(e.stop)}
	var t: PackedFloat32Array = e.t
	var tau: float = T - float(e.t0)
	var a = 0
	var b = int(e.N)
	while b - a > 1:
		var c = (a + b) >> 1
		if t[c] <= tau: a = c
		else: b = c
	var u = clampf((tau - t[a]) / maxf(1e-4, t[b] - t[a]), 0.0, 1.0)
	return {"s": (int(e.ia) + a + u) * float(BD.step), "stop": -1, "left": 0.0, "next": int(e.to)}

func busEta(now_ms: float, i: int) -> float:
	var P: float = BD.P
	var T = fmod(fmod(now_ms / 1000.0, P) + P, P)
	for e in BD.ev:
		if e.kind != "dwell" or int(e.stop) != i: continue
		if T >= float(e.t0) and T < float(e.t1) - 2.0: return 0.0
		return float(e.t0) - T if float(e.t0) >= T else float(e.t0) + P - T
	return 1e9

func busEtaAny(i: int) -> float:
	var e = 1e9
	for k in BUS_COUNT: e = minf(e, busEta(now() + busOffset(k), i))
	return e

func myBus() -> Dictionary: return buses[int(me.bus.get("b", 0))] if me.bus != null else {"speed": 0.0}

func nextStopName(st) -> String:
	if st == null: return ""
	var p = BUS_STOPS[int(st.next)] if int(st.next) < BUS_STOPS.size() else null
	return "%s %s" % [p.icon, p.name] if p != null else ""

static func fmtEta(s: float) -> String:
	return ("%d s" % ceili(s)) if s < 60 else ("%d min %d s" % [floori(s / 60.0), ceili(fmod(s, 60.0))])

func updateBus(dt) -> void:
	if buses.is_empty(): return
	for z in busStopGroups:
		var grp: Node3D = busStopGroups[z]
		var here: bool = z == zone and not zoneBusy and terr != null
		if here and (not grp.has_meta("terr") or grp.get_meta("terr") != terr):
			grp.set_meta("terr", terr)
			for c in grp.get_children(): c.position.y = terr.get_height(c.position.x, c.position.z)
		grp.visible = here
	var nw = now()
	for B in buses:
		var want = nw + busOffset(B.k)
		if B.clk == null or absf(want - float(B.clk)) > 3000: B.clk = want
		else: B.clk = float(B.clk) + dt * 1000.0 + (want - float(B.clk) - dt * 1000.0) * minf(1.0, dt * 1.5)
		updateOneBus(B, float(B.clk), dt)
	if me.bus != null: busRider(dt)

func updateOneBus(B: Dictionary, nw: float, dt: float) -> void:
	var st = busState(nw)
	B.st = st
	var p = pathAt(st.s)
	var z = zoneOfG(p.x, p.z)
	B.zone = z
	var o = Terra.zone_offset(z)
	var h: float = p.h
	B.lx = p.x - o.x; B.lz = p.z - o.y; B.h = h
	var ds: float = 0.0 if B.lastS == null else float(st.s) - float(B.lastS)
	if ds < -float(BD.len) / 2.0: ds += float(BD.len)
	var raw = minf(30.0, absf(ds) / maxf(dt, 1e-3))
	B.speed = raw if B.speed == null else float(B.speed) + (raw - float(B.speed)) * (1.0 - exp(-dt * 6.0))
	var speed: float = B.speed
	B.lastS = st.s
	var ob: Dictionary = B.obj
	B.vis = z == zone and terr != null and not zoneBusy
	ob.root.visible = B.vis
	if not B.vis: return
	var T = terr
	var fx = sin(h) * 3.2
	var fz = cos(h) * 3.2
	var hf = T.get_height(B.lx + fx, B.lz + fz)
	var hb = T.get_height(B.lx - fx, B.lz - fz)
	var hc = T.get_height(B.lx, B.lz)
	var yT = maxf(hc, (hf + hb) / 2.0)
	var kk = 1.0 - exp(-dt * 10.0)
	B.y = yT if (B.y == null or absf(float(B.y) - yT) > 3) else float(B.y) + (yT - float(B.y)) * kk
	ob.root.position = Vector3(B.lx, B.y, B.lz)
	ob.root.rotation = Vector3(lerpf(ob.root.rotation.x, -atan2(hf - hb, 6.4), 1.0 - exp(-dt * 6.0)), h, 0)
	var yaw_rate: float = p.turn * speed
	ob.body.rotation.z = lerpf(ob.body.rotation.z, clampf(-yaw_rate * speed * 0.012, -0.05, 0.05), 1.0 - exp(-dt * 3.0))
	for w in ob.wheels: w.rotation.x += speed * dt / 0.5
	var open = 1.0 if (int(st.stop) >= 0 and float(st.left) > 1.2) else 0.0
	B.door = float(B.door) + (open - float(B.door)) * minf(1.0, dt * 4.0)
	if ob.doors.size() >= 2:
		ob.doors[0].position.z = ob.doorZ[0] - B.door * 0.52
		ob.doors[1].position.z = ob.doorZ[1] + B.door * 0.52
	if me.bus == null and me.veh == null and not me.inKart and me.ride == null:
		me.pos = pushOut(me.pos, B.lx, B.lz, h, 1.25 + 0.4, 5.2 + 0.4)

static func pushOut(pos: Vector3, cx: float, cz: float, h: float, hw: float, hl: float) -> Vector3:
	var c = cos(h)
	var s = sin(h)
	var dx = pos.x - cx
	var dz = pos.z - cz
	var lx = dx * c - dz * s
	var lz = dx * s + dz * c
	if absf(lx) >= hw or absf(lz) >= hl: return pos
	var nx = lx
	var nz = lz
	if hw - absf(lx) < hl - absf(lz): nx = signf(lx if lx != 0 else 1.0) * hw
	else: nz = signf(lz if lz != 0 else 1.0) * hl
	pos.x = cx + nx * c + nz * s
	pos.z = cz - nx * s + nz * c
	return pos

func busActions(consider, d2) -> void:
	if buses.is_empty() or me.bus != null: return
	var p: Vector3 = me.pos
	for B in buses:
		var st = B.st
		var c = cos(float(B.h))
		var sn = sin(float(B.h))
		var dx: float = p.x - float(B.lx)
		var dz: float = p.z - float(B.lz)
		var lx = dx * c - dz * sn
		var lz = dx * sn + dz * c
		var edge = Vector2(maxf(0.0, absf(lx) - 1.25), maxf(0.0, absf(lz) - 5.2)).length() if B.vis else 99.0
		if busLock.get(B.k, false):
			if edge > BOARD_R + 0.5: busLock[B.k] = false
			else: continue
		if B.vis and st != null and int(st.stop) >= 0 and float(st.left) > 1.5:
			var bk: int = B.k
			consider.call(edge * 0.5, BOARD_R * 0.5, "🚌 Iekāpt autobusā (%d🪙)" % BUS_PRICE, func(): boardBus(bk))
	for s in BUS_STOPS:
		if s.zone != zone: continue
		var eta = busEtaAny(int(s.i))
		if eta > 0:
			var si: int = s.i
			var nm: String = s.name
			consider.call(d2.call(s.lx, s.lz) + 1.0, 4.5, "🚏 %s: autobuss pēc %s" % [s.name, fmtEta(eta)], func(): UI.toast("🚏 %s — autobuss atbrauks pēc %s. Brauciens %d🪙. Maršruts: ❄️ Ziema · 🏡 Sēta · 🏁 Trase · 🛒 Tirgus (2 autobusi)." % [nm, fmtEta(busEtaAny(si)), BUS_PRICE]))

func busTaken(k: int) -> Dictionary:
	var t = {}
	for r in remotes.values():
		if int(r.vehCode) == BUS_CODE and floori(int(r.rideSeat) / float(SEATS)) == k: t[int(r.rideSeat) % SEATS] = true
	return t

func boardBus(k := 0) -> void:
	var B: Dictionary = buses[k]
	if not B.vis or B.st == null or int(B.st.stop) < 0:
		UI.toast("Autobusā var iekāpt tikai pieturā 🚏"); return
	if int(save.coins) < BUS_PRICE:
		UI.toast("Nepietiek monētu — brauciens maksā %d🪙" % BUS_PRICE, "bad"); return
	var taken = busTaken(k)
	var seat = -1
	for i in B.obj.seats.size():
		if not taken.has(i):
			seat = i; break
	if seat < 0:
		UI.toast("🚌 Autobuss ir pilns!", "bad"); return
	if fishing != null: stopFishing()
	if me.carry != null: stowCarry()
	addCoins(-BUS_PRICE, true)
	me.bus = {"seat": seat, "b": k, "net": k * SEATS + seat}
	avatar.root.get_parent().remove_child(avatar.root)
	B.obj.seats[seat].add_child(avatar.root)
	avatar.root.position = Vector3.ZERO; avatar.root.rotation = Vector3.ZERO
	if avatar.shadow: avatar.shadow.visible = false
	me.state = "sit"
	UI.show_id("btn-jump", false)
	sfx("coin", {"vol": 0.6}); sfx("st_stone", {"vol": 0.6, "delay": 0.15})
	busStopShown = int(B.st.stop)
	var q: Dictionary = BUS_STOPS[(int(B.st.stop) + 1) % BUS_STOPS.size()]
	voice("b_in%d" % int(q.si))
	UI.toast("🐱 Kaķis Kārlis: „Laipni lūdzam! %d🪙, paldies! Nākamā pietura — %s %s.” Izkāpt var tikai pieturā 🚏" % [BUS_PRICE, q.icon, q.name], "good", 5000)

func leaveBus(force = false) -> void:
	if me.bus == null: return
	var B = myBus()
	if not force and (B.st == null or int(B.st.stop) < 0):
		UI.toast("Izkāpt var tikai pieturā 🚏 — nākamā: %s" % nextStopName(B.st)); return
	busLock[int(me.bus.get("b", 0))] = true
	me.bus = null
	avatar.root.get_parent().remove_child(avatar.root)
	stage.add_child(avatar.root)
	if avatar.shadow: avatar.shadow.visible = true
	var o: Node3D = B.obj.root
	var p = o.global_transform * Vector3(-2.6, 0, 4.2)
	me.pos = Vector3(p.x, 0, p.z)
	me.pos = terr.collide(me.pos, 0.4)
	me.pos.y = terr.ground_at(me.pos.x, me.pos.z) + 0.2
	me.heading = float(B.h) - PI / 2.0
	avatar.root.position = me.pos
	avatar.root.rotation = Vector3(0, me.heading, 0)
	me.state = "idle"
	UI.show_id("btn-exit-kart", false)
	UI.show_id("btn-jump", true)
	sfx("beep")
	if B.st != null and int(B.st.stop) >= 0:
		var s: Dictionary = BUS_STOPS[int(B.st.stop)]
		UI.toast("🚏 %s %s" % [s.icon, s.name], "good")

func busRider(dt: float) -> void:
	var B = myBus()
	if B.zone != zone:
		if not zoneBusy: teleport(B.zone, Vector2(B.lx, B.lz), B.h)
		return
	if not B.vis: return
	for r in remotes.values():
		if int(r.vehCode) == BUS_CODE and int(r.rideSeat) == int(me.bus.net) and int(r.id) < myId:
			var taken = busTaken(B.k)
			var free = -1
			for i in B.obj.seats.size():
				if not taken.has(i) and i != int(me.bus.seat):
					free = i; break
			if free < 0:
				leaveBus(true); UI.toast("🚌 Autobusā vairs nav vietas"); return
			me.bus.seat = free; me.bus.net = int(B.k) * SEATS + free
	var seat: Node3D = B.obj.seats[int(me.bus.seat)]
	if avatar.root.get_parent() != seat:
		avatar.root.get_parent().remove_child(avatar.root)
		seat.add_child(avatar.root)
		avatar.root.position = Vector3.ZERO; avatar.root.rotation = Vector3.ZERO
	me.pos = seat.global_position
	me.heading = B.h
	me.vy = 0.0; me.onGround = true; me.state = "sit"
	avatar.animate(dt, "sit", 0.0)
	var at_stop: bool = int(B.st.stop) >= 0 and float(B.st.left) > 1.0
	UI.show_id("btn-exit-kart", at_stop)
	if int(B.st.stop) >= 0 and busStopShown != int(B.st.stop):
		busStopShown = int(B.st.stop)
		var s: Dictionary = BUS_STOPS[int(B.st.stop)]
		UI.toast("🚏 Pietura: %s %s — vari izkāpt (🚶 Izkāpt)" % [s.icon, s.name], "good", 4000)
		voice("b_at%d" % int(s.si), {"delay": 0.5})
		sfx("beep")
	if int(B.st.stop) < 0 and busStopShown != -1:
		busStopShown = -1
		UI.toast("🚌 Nākamā pietura: %s" % nextStopName(B.st), "", 2500)
		var p = BUS_STOPS[int(B.st.next)] if int(B.st.next) < BUS_STOPS.size() else null
		if p != null: voice("b_next%d" % int(p.si), {"delay": 1.2})

func busRemote(r, here, dt) -> bool:
	if int(r.vehCode) != BUS_CODE: return false
	var n = int(r.rideSeat)
	var bi = floori(n / float(SEATS))
	var B = buses[bi] if bi < buses.size() else (buses[0] if buses.size() else null)
	if not here or B == null or not B.vis:
		r.avatar.root.visible = false
		return true
	var seat: Node3D = B.obj.seats[n % SEATS] if (n % SEATS) < B.obj.seats.size() else B.obj.seats[0]
	if r.avatar.root.get_parent() != seat:
		r.avatar.root.get_parent().remove_child(r.avatar.root)
		seat.add_child(r.avatar.root)
		r.avatar.root.position = Vector3.ZERO; r.avatar.root.rotation = Vector3.ZERO
	if r.avatar.shadow: r.avatar.shadow.visible = false
	r.avatar.root.visible = true
	r.avatar.animate(dt, "sit", 0.0)
	return true
