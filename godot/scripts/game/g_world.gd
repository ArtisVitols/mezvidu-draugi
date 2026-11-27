class_name GWorld
extends GCore
## Meža objekti (sēnes, zvaigznes, dzīvnieki, tirgus, saldējums), efekti, darbības, kartings un sacīkstes (web game.js)

var mushField: Field
var starMeshes: Array = []
var npcs: Array = []
var vendors: Array = []
var ice = {}
var propsPack: Node3D
const KART_LIM := 7.6
const PIT := {"a0": -7.0, "a1": 7.0, "l0": 0.0, "l1": 16.0}

func props() -> Node3D:
	if propsPack == null: propsPack = Avatar.asset("props").build()
	return propsPack

## kopija no 'props' paketes pēc vārda (piem. 'mush:baravika', 'star', 'decor:rukis')
func prop(name: String) -> Node3D:
	for c in props().get_children():
		if str(c.get_meta("n", "")) == name: return c.duplicate()
	return Node3D.new()

func buildForestExtras() -> void:
	# sēnes
	var items = []
	for m in world.d.mushrooms: items.append({"id": int(m.id), "kind": m.type, "x": m.x, "y": m.y, "z": m.z, "ry": float(m.id)})
	mushField = Field.new()
	var holder = Node3D.new(); holder.name = "Mushrooms"; scene.add_child(holder)
	mushField.build(items, func(k): return prop("mush:" + k), holder)
	# zvaigznes
	starMeshes = []
	for s in world.d.stars:
		var st = prop("star")
		st.position = Vector3(s.x, s.y, s.z)
		st.visible = not save.stars.has(int(s.id))
		scene.add_child(st)
		starMeshes.append(st)
	# dzīvnieki
	npcs = []
	for h in world.d.npcHomes:
		var n = Npc.make(h.type)
		n.root.visible = false
		scene.add_child(n.root)
		npcs.append({"home": h, "model": n, "heading": 0.0, "x": float(h.x), "z": float(h.z)})
	buildVendors()

func buildVendors() -> void:
	var market = Avatar.asset("market").build()
	scene.add_child(market)
	var pack = Avatar.asset("vendors").build()
	vendors = []
	for v in Game.C.world.VENDORS:
		var face = atan2(-float(v.x), -float(v.z))
		var src: Node3D = null
		for c in pack.get_children(): if str(c.get_meta("n", "")) == "vendor:" + str(v.id): src = c
		if src:
			pack.remove_child(src)
			var av = Avatar.from_node(src)
			src.position = Vector3(float(v.x) - sin(face) * 0.85, VILLAGE_Y + 0.36, float(v.z) - cos(face) * 0.85)
			src.rotation = Vector3(0, face, 0)
			var tag = Label3D.new(); tag.text = v.name; tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED; tag.font = UI.font
			tag.font_size = 40; tag.pixel_size = 0.005; tag.outline_size = 10; tag.position.y = 2.2; tag.visibility_range_end = 40.0
			src.add_child(tag)
			scene.add_child(src)
			vendors.append({"def": v, "av": av})
		var rx = cos(face)
		var rz = -sin(face)
		for k in [-1.3, 0.0, 1.3]: world.add_collider(float(v.x) + rx * k - sin(face) * 0.3, float(v.z) + rz * k - cos(face) * 0.3, 0.95)
	# saldējuma ratiņi
	var cart = Avatar.asset("icecart").build()
	scene.add_child(cart)
	var isrc: Node3D = null
	for c in pack.get_children(): if str(c.get_meta("n", "")) == "vendor:ice": isrc = c
	var iav: Avatar = null
	if isrc:
		pack.remove_child(isrc); scene.add_child(isrc); iav = Avatar.from_node(isrc)
	var it = Label3D.new(); it.text = "🍦 Saldējums"; it.font = UI.font; it.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	it.font_size = 52; it.pixel_size = 0.005; it.outline_size = 12; it.modulate = Color("#ffd0e0"); it.position.y = 3.6
	cart.add_child(it)
	pack.queue_free()
	ice = {"cart": cart, "av": iav, "pos": Vector3(0, VILLAGE_Y, 10), "th": null}

static func npcPos(h: Dictionary, t: float) -> Dictionary:
	var L = 9.0
	var kk: float = t / L + float(h.p1)
	var seg = floorf(kk)
	var f = kk - seg
	var eased = seg + Game.smoothstep(0.0, 0.55, f)
	var u: float = eased * 0.9 * float(h.sp)
	return {"x": float(h.x) + float(h.R) * (0.6 * sin(u * 1.3 + float(h.p1)) + 0.4 * sin(u * 2.1 + float(h.p2))),
		"z": float(h.z) + float(h.R) * (0.6 * cos(u * 1.1 + float(h.p2)) + 0.4 * cos(u * 1.7 + float(h.p1))), "moving": f < 0.55}

func updateWorldObjects(dt, t) -> void:
	var ts: float = (t - EPOCH) / 1000.0
	var cx: float = me.pos.x
	var cz: float = me.pos.z
	timers.cull -= dt
	var do_cull: bool = timers.cull <= 0.0
	if do_cull:
		timers.cull = 0.3
		for m in world.d.mushrooms:
			if absf(float(m.x) - cx) < 110.0 and absf(float(m.z) - cz) < 110.0:
				mushField.set_hidden(int(m.id), float(picked.get(str(int(m.id)), 0)) > t)
	for i in starMeshes.size():
		var s: Node3D = starMeshes[i]
		if not s.visible: continue
		s.rotation.y += dt * 2.0
		s.position.y = float(world.d.stars[i].y) + sin(ts * 2.0 + i) * 0.2
	for n in npcs:
		var near: bool = absf(float(n.home.x) - cx) < 85.0 and absf(float(n.home.z) - cz) < 85.0
		n.model.root.visible = near
		if not near: continue
		var p = npcPos(n.home, ts)
		var p2 = npcPos(n.home, ts + 0.15)
		var vx: float = p2.x - p.x
		var vz: float = p2.z - p.z
		var sp = Vector2(vx, vz).length() / 0.15
		if sp > 0.05: n.heading = Game.angle_lerp(n.heading, atan2(vx, vz), 1.0 - exp(-dt * 8.0))
		n.x = p.x; n.z = p.z
		var y = world.get_height(p.x, p.z)
		if n.home.type != "starkis": y = maxf(y, WATER_Y)
		n.model.root.position = Vector3(p.x, y, p.z)
		n.model.root.rotation.y = n.heading
		n.model.animate(dt, sp > 0.05, sp)
	for v in vendors: v.av.animate(dt, "idle", 0.0)
	updateIceCart(dt, ts)
	if not me.inKart:
		for i in world.d.stars.size():
			var s: Dictionary = world.d.stars[i]
			if not starMeshes[i].visible: continue
			if Vector2(float(s.x) - cx, float(s.z) - cz).length() < 1.6 and absf(float(s.y) - 1.3 - me.pos.y) < 2.5: collectStar(s, i)

func collectStar(s: Dictionary, i: int) -> void:
	starMeshes[i].visible = false
	if not save.stars.has(int(s.id)): save.stars.append(int(s.id))
	save.stats.stars = save.stars.size()
	addCoins(10, true)
	sfx("star")
	UI.toast("⭐ Zelta zvaigzne! (%d/15) +10🪙" % save.stars.size(), "good", 3000)
	checkQuests()
	persist()

func collideIce(pos: Vector3, r) -> Vector3:
	if ice.is_empty(): return pos
	var ip: Vector3 = ice.pos
	var d = Vector2(pos.x - ip.x, pos.z - ip.z).length()
	var mn: float = 1.6 + float(r)
	if d < mn and d > 0.001:
		pos.x = ip.x + (pos.x - ip.x) / d * mn
		pos.z = ip.z + (pos.z - ip.z) / d * mn
	return pos

func updateIceCart(dt: float, ts: float) -> void:
	var I = ice
	if I.is_empty(): return
	var path = func(th: float) -> Vector2:
		var r = 10.0 + 1.6 * sin(2.0 * th + 1.0) + 0.6 * sin(5.0 * th)
		return Vector2(cos(th) * r, sin(th) * r)
	if I.th == null:
		I.th = fmod(ts * 0.012, TAU); I.v = 0.0; I.stop = 0.0; I.wave = 0.0; I.next = 14.0 + randf() * 14.0
		if I.av: I.av.pushing = true
	var near = func(x: float, z: float) -> bool: return Vector2(x - I.pos.x, z - I.pos.z).length() < 4.2
	var buyer: bool = zone == FOREST and me.veh == null and me.ride == null and near.call(me.pos.x, me.pos.z)
	for r in remotes.values():
		if not buyer and str(r.zone) == FOREST and near.call(r.pos.x, r.pos.z): buyer = true
	if I.stop > 0: I.stop -= dt
	if I.wave > 0: I.wave -= dt
	var want = 0.0 if (buyer or I.stop > 0) else 1.15
	I.v += (want - I.v) * minf(1.0, dt * (1.5 if want > 0 else 4.0))
	if I.v < 0.02 and want == 0.0: I.v = 0.0
	var a: Vector2 = path.call(I.th)
	var b2: Vector2 = path.call(I.th + 0.01)
	var dl = a.distance_to(b2) / 0.01
	var stp: float = I.v * dt
	I.th += stp / dl
	I.next -= stp
	if I.next <= 0 and not buyer:
		I.stop = 4.0 + randf() * 4.0
		if randf() < 0.65: I.wave = 2.6
		I.next = 16.0 + randf() * 18.0
	var p: Vector2 = path.call(I.th)
	var q: Vector2 = path.call(I.th + 0.02)
	var tv = (q - p).normalized()
	I.pos = Vector3(p.x, VILLAGE_Y, p.y)
	I.cart.position = I.pos
	I.cart.rotation.y = atan2(-tv.y, tv.x)
	var av: Avatar = I.av
	if av == null: return
	av.root.position = Vector3(p.x - tv.x * 2.25, VILLAGE_Y, p.y - tv.y * 2.25)
	var ry = atan2(tv.x, tv.y)
	if I.wave > 0: ry += sin(minf(1.0, (2.6 - I.wave) * 2.0) * PI / 2.0) * 0.5
	av.root.rotation.y = Game.angle_lerp(av.root.rotation.y, ry, 1.0 - exp(-dt * 6.0))
	av.pushing = I.wave <= 0
	av.animate(dt, "wave" if I.wave > 0 else ("walk" if I.v > 0.15 else "idle"), I.v)

func buyIceCream() -> void:
	var price: int = int(Game.D.ICE_CREAM_PRICE)
	if int(save.coins) < price:
		UI.toast("Nepietiek monētu 🪙", "bad")
		return
	addCoins(-price, true)
	me.iceCream = 40.0
	sfx("buy"); sfx("ding", {"vol": 0.5})
	UI.toast("🍦 Mmm! Tagad 40 sekundes skriesi ātrāk!", "good")

# ---------- efekti ----------
func float_tag(text: String, size := 52, color := Color("#fff6c0")) -> Label3D:
	var l = Label3D.new()
	l.text = text; l.font = UI.font; l.font_size = size; l.pixel_size = 0.005
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED; l.outline_size = 12; l.modulate = color
	l.no_depth_test = false
	return l

func spawnFloat(text, pos) -> void:
	var l = float_tag(str(text))
	stage.add_child(l)
	l.global_position = Vector3(pos.x, pos.y + 2.4, pos.z)
	effects.append({"obj": l, "life": 1.4, "t": 0.0})

func updateEffects(dt) -> void:
	for i in range(effects.size() - 1, -1, -1):
		var e: Dictionary = effects[i]
		e.t += dt
		e.obj.position.y += dt * 1.2
		e.obj.modulate.a = 1.0 - e.t / e.life
		e.obj.outline_modulate.a = e.obj.modulate.a
		if e.t >= e.life:
			e.obj.queue_free()
			effects.remove_at(i)

func showEmote(id, text) -> void:
	var av: Avatar = avatar if id == myId else (remotes[id].avatar if remotes.has(id) else null)
	if av == null: return
	if av.root.has_meta("emote"):
		var o = av.root.get_meta("emote")
		if is_instance_valid(o): o.queue_free()
	var l = float_tag(str(text), 46, Color("#222222"))
	l.outline_modulate = Color(1, 1, 1, 0.95); l.outline_size = 22
	l.position.y = 2.85
	av.root.add_child(l)
	av.root.set_meta("emote", l)
	if id == myId: me.waveT = 1.6
	get_tree().create_timer(3.5).timeout.connect(func(): if is_instance_valid(l): l.queue_free())

# ---------- darbības ----------
func refreshAction() -> void:
	var act = findAction()
	currentAction = act
	var b: Button = UI.b["btn-action"]
	if act == null:
		b.visible = false
		return
	b.visible = true
	if b.text != act.label: b.text = act.label

func doAction() -> void:
	if UI.panelOpen(): return
	if currentAction == null: refreshAction()
	var a = currentAction
	if a == null: return
	CrashLog.w("[darbība] %s" % str(a.get("label", "?")))
	a.fn.call()
	timers.action = 0.0

func currentSeed():
	var inv: Dictionary = save.inv
	var sel = selectedSeed
	if sel is String and sel.begins_with("sap:") and int(inv.get(sel.substr(4) + "_sap", 0)) > 0: return sel
	if sel is String and int(inv.get(sel + "_seed", 0)) > 0: return sel
	for k in Game.D.CROPS:
		if int(inv.get(k + "_seed", 0)) > 0: return k
	for k in Game.D.TREES:
		if int(inv.get(k + "_sap", 0)) > 0: return "sap:" + k
	return null

func findAction():
	if me.inKart or me.veh != null or me.ride != null or me.bus != null: return null
	if me.carry != null: return carryAction()
	if zone != FOREST: return findZoneAction()
	var p: Vector3 = me.pos
	var t = now()
	var bd = [1e9]
	var holder = [null]
	var consider = func(d: float, mx: float, label: String, fn: Callable) -> void:
		if d < mx and d < bd[0]:
			bd[0] = d
			holder[0] = {"label": label, "fn": fn}
	var d2 = func(x: float, z: float) -> float: return Vector2(x - p.x, z - p.z).length()
	var forced = findActivityActions(consider, d2)
	if forced != null: return forced
	for m in world.d.mushrooms:
		if absf(float(m.x) - p.x) > 3.0 or absf(float(m.z) - p.z) > 3.0: continue
		if float(picked.get(str(int(m.id)), 0)) > t: continue
		var mm: Dictionary = m
		consider.call(d2.call(m.x, m.z), 1.8, "🍄 Lasīt: %s" % Game.D.MUSHROOMS[m.type].name, func(): pickMushroom(mm))
	for v in vendors:
		var vid: String = v.def.id
		consider.call(d2.call(v.def.x, v.def.z), 3.4, "💬 %s" % v.def.name, func(): openShop(vid))
	if not ice.is_empty():
		consider.call(d2.call(ice.pos.x, ice.pos.z), 3.6, "🍦 Saldējums (%d🪙)" % int(Game.D.ICE_CREAM_PRICE), func(): buyIceCream())
	for n in npcs:
		if not n.model.root.visible: continue
		var d: float = d2.call(n.x, n.z)
		if d > 2.8: continue
		if float(npcCooldown.get(n.home.id, 0)) > t: continue
		var nn: Dictionary = n
		consider.call(d, 2.8, "🤗 Paglaudīt: %s" % Game.D.NPC_TYPES[n.home.type].name, func(): petNpc(nn))
	vehicleActions(consider, d2)
	busActions(consider, d2)
	return holder[0]

func pickMushroom(m: Dictionary) -> void:
	picked[str(int(m.id))] = now() + 5000.0
	mushField.set_hidden(int(m.id), true)
	me.petT = 0.5
	net.toHost({"t": "pick", "id": int(m.id)})

func petNpc(n: Dictionary) -> void:
	npcCooldown[n.home.id] = now() + 20000.0
	me.petT = 1.2
	me.heading = atan2(n.x - me.pos.x, n.z - me.pos.z)
	spawnFloat("❤️", Vector3(n.x, world.get_height(n.x, n.z), n.z))
	sfx("pet")
	stat("petted")
	var msgs = {"stirna": "Stirna priecīgi pamāja ar ausīm", "zakis": "Zaķis sarāva degunu", "ezis": "Ezītis nošņaukājās — uzmanīgi, adatas!", "mezacuka": "Mežacūka apmierināti ņurdēja", "vavere": "Vāverīte paslēpa riekstu", "starkis": "Stārķis noklabināja knābi"}
	UI.toast("❤️ %s" % msgs.get(n.home.type, ""))

# ---------- kartings ----------
func makeKart(color) -> Dictionary:
	var id = "sarkana"
	for kc in Game.D.KART_COLORS: if kc.color == color: id = kc.id
	var root = Avatar.asset("kart_" + id).build()
	var wheels = []
	var seat: Node3D = null
	var petn: Node3D = null
	for n in root.find_children("*", "Node3D", true, false):
		var nm = str(n.get_meta("n", ""))
		if nm == "wheel": wheels.append(n)
		elif nm == "seat": seat = n
		elif nm == "pet": petn = n
	return {"root": root, "seat": seat, "wheels": wheels, "pet": petn, "color": color}

func setKartColor3D(kart, color) -> void:
	var nk = makeKart(color)
	var kids = kart.seat.get_children()
	for c in kids:
		kart.seat.remove_child(c); nk.seat.add_child(c)
	var par: Node = kart.root.get_parent()
	var xf: Transform3D = kart.root.transform
	kart.root.queue_free()
	if par: par.add_child(nk.root)
	nk.root.transform = xf
	kart.root = nk.root; kart.seat = nk.seat; kart.wheels = nk.wheels; kart.pet = nk.pet

func enterKart(spot) -> void:
	if me.inKart: return
	if me.veh != null: exitVehicle()
	if me.ride != null: leaveRide()
	var kart = makeKart(kartColorHex(save.kartColor))
	var s: Dictionary = spot if spot != null else raceW.d.kartSpot
	me.pos = Vector3(float(s.x), raceW.get_height(float(s.x), float(s.z)), float(s.z))
	me.kart = {"obj": kart, "speed": 0.0, "heading": float(s.heading), "hint": -1, "boost": 0.0, "padCd": 0.0, "steer": 0.0, "y": null, "wall": false, "bumpCd": 0.0}
	me.inKart = true
	stage.add_child(kart.root)
	avatar.root.get_parent().remove_child(avatar.root)
	kart.seat.add_child(avatar.root)
	avatar.root.position = Vector3.ZERO; avatar.root.rotation = Vector3.ZERO
	if avatar.shadow: avatar.shadow.visible = false
	me.state = "sit"
	cam.yaw = float(s.heading) + PI
	UI.show_id("btn-exit-kart", true)
	UI.show_id("btn-jump", false)
	UI.toast("🏎️ Kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre. Dzeltenās bultas dod turbo!", "", 4500)

func exitKart() -> void:
	if not me.inKart: return
	if myRace != null:
		net.toHost({"t": "raceLeave"}); myRace = null
	var h: float = me.kart.heading
	me.kart.obj.seat.remove_child(avatar.root)
	me.kart.obj.root.queue_free()
	stage.add_child(avatar.root)
	if avatar.shadow: avatar.shadow.visible = true
	me.pos.x += cos(h) * 2.0; me.pos.z -= sin(h) * 2.0
	me.pos = terr.collide(me.pos, 0.4)
	me.pos.y = terr.get_height(me.pos.x, me.pos.z) + 0.5
	me.inKart = false; me.kart = null; me.state = "idle"; me.progress = 0.0
	UI.show_id("btn-exit-kart", false)
	UI.show_id("btn-race", false)
	UI.show_id("btn-jump", true)
	UI.show_id("race-hud", false)

func raceToL(x: float, z: float) -> Dictionary:
	var F: Dictionary = raceW.d.raceF
	var o: Array = F.o
	var t: Array = F.t
	var n: Dictionary = F.n
	var dx = x - float(o[0])
	var dz = z - float(o[2])
	return {"l": dx * float(n.x) + dz * float(n.z), "a": dx * float(t[0]) + dz * float(t[2])}

func raceToW(l: float, a: float) -> Vector2:
	var F: Dictionary = raceW.d.raceF
	var o: Array = F.o
	var t: Array = F.t
	var n: Dictionary = F.n
	return Vector2(float(o[0]) + float(n.x) * l + float(t[0]) * a, float(o[2]) + float(n.z) * l + float(t[2]) * a)

## racetrack.js kartClamp: true, ja karts atbīdīts atpakaļ
func kartClamp(hint: int) -> bool:
	var W = raceW
	var pos: Vector3 = me.pos
	var info = W.nearest_track_idx(pos.x, pos.z, hint)
	if float(info.dist) <= KART_LIM: return false
	var q = raceToL(pos.x, pos.z)
	var pa0: float = PIT.a0 + 0.9
	var pa1: float = PIT.a1 - 0.9
	var pl1: float = PIT.l1 - 0.9
	if q.a > pa0 and q.a < pa1 and q.l > 0 and q.l < pl1: return false
	var p = W.track_pts[int(info.idx)]
	var cx: float = float(p.x) + (pos.x - float(p.x)) / float(info.dist) * KART_LIM
	var cz: float = float(p.z) + (pos.z - float(p.z)) / float(info.dist) * KART_LIM
	var bx = cx
	var bz = cz
	if q.l > 0 and q.l < PIT.l1 + 6 and q.a > PIT.a0 - 6 and q.a < PIT.a1 + 6:
		var w = raceToW(minf(pl1, maxf(0.0, q.l)), minf(pa1, maxf(pa0, q.a)))
		if Vector2(w.x - pos.x, w.y - pos.z).length() < Vector2(cx - pos.x, cz - pos.z).length():
			bx = w.x; bz = w.y
	me.pos.x = bx; me.pos.z = bz
	return true

func updateKart(dt, mv) -> void:
	var k: Dictionary = me.kart
	var W = raceW
	var info = W.nearest_track_idx(me.pos.x, me.pos.z, k.hint)
	k.hint = int(info.idx)
	var edge = clampf((float(info.dist) - (TRACK_WIDTH / 2.0 + 1.0)) / 4.0, 0.0, 1.0)
	var ground = W.get_height(me.pos.x, me.pos.z)
	var in_water = ground < WATER_Y - 0.4
	var frozen: bool = myRace != null and race.phase == "run" and now() < float(race.startAt)
	k.boost = maxf(0.0, k.boost - dt)
	k.padCd = maxf(0.0, k.padCd - dt)
	var mx = 22.0 - 10.0 * edge * edge * (3.0 - 2.0 * edge)
	if in_water: mx = 5.0
	if k.boost > 0: mx = 31.0
	if me.iceCream > 0: mx *= 1.1
	k.steer = lerpf(k.steer, mv.x, 1.0 - exp(-dt * 10.0))
	if frozen: k.speed = 0.0
	else:
		var thr: float = mv.y
		k.thr = thr
		if thr > 0.1: k.speed += (30.0 if k.boost > 0 else 15.0) * thr * dt * (1.0 if k.speed < mx else 0.0)
		elif thr < -0.1: k.speed -= (26.0 if k.speed > 0.5 else 9.0) * -thr * dt
		else: k.speed *= exp(-1.4 * dt)
		if k.boost > 0 and k.speed < mx: k.speed += 25.0 * dt
		if k.speed > mx: k.speed = lerpf(k.speed, mx, 1.0 - exp(-dt * 2.0))
		k.speed = clampf(k.speed, -7.0, 34.0)
		var turn = 2.4 * clampf(k.speed / 5.0, -1.0, 1.0) * (1.0 - minf(0.35, absf(k.speed) / 90.0))
		k.heading -= k.steer * turn * dt
	me.pos.x += sin(k.heading) * k.speed * dt
	me.pos.z += cos(k.heading) * k.speed * dt
	me.pos = W.collide(me.pos, 1.0)
	if W.hit: k.speed *= exp(-dt * 4.0)
	if kartClamp(k.hint):
		var a = W.track_pts[k.hint]
		var b2 = W.track_pts[(k.hint + 1) % W.track_pts.size()]
		var td = atan2(float(b2.x) - float(a.x), float(b2.z) - float(a.z))
		var al = absf(cos(k.heading - td))
		if not k.wall:
			if absf(k.speed) > 6.0 and k.bumpCd <= 0:
				sfx("hit", {"vol": 0.4 + 0.5 * (1.0 - al)}); k.bumpCd = 0.6
			k.speed *= 0.55 + 0.45 * al
		else: k.speed *= exp(-dt * 0.8)
		var dir = td if cos(k.heading - td) >= 0 else td + PI
		k.heading = Game.angle_lerp(k.heading, dir, 1.0 - exp(-dt * 3.0))
		k.wall = true
	else: k.wall = false
	k.bumpCd = maxf(0.0, k.bumpCd - dt)
	for p in W.d.get("boostPads", []):
		if k.padCd <= 0 and Vector2(float(p.x) - me.pos.x, float(p.z) - me.pos.z).length() < 2.4:
			k.boost = 1.6; k.padCd = 1.0; sfx("boost")
	var fx = sin(k.heading)
	var fz = cos(k.heading)
	var hf = W.get_height(me.pos.x + fx, me.pos.z + fz)
	var hb = W.get_height(me.pos.x - fx, me.pos.z - fz)
	var gy = WATER_Y - 0.3 if in_water else maxf(W.get_height(me.pos.x, me.pos.z), (hf + hb) / 2.0)
	if k.y == null or absf(float(k.y) - gy) > 2.0: k.y = gy
	else: k.y = maxf(gy - 0.02, lerpf(float(k.y), gy, 1.0 - exp(-dt * 18.0)))
	me.pos.y = float(k.y)
	var kr: Node3D = k.obj.root
	kr.position = me.pos
	kr.rotation_order = EULER_ORDER_YXZ
	var ke = 1.0 - exp(-dt * 10.0)
	kr.rotation = Vector3(lerpf(kr.rotation.x, -atan2(hf - hb, 2.0), ke), k.heading, lerpf(kr.rotation.z, k.steer * minf(1.0, k.speed / 20.0) * 0.08, ke))
	for w in k.obj.wheels: w.rotation.x += k.speed * dt / 0.32
	me.state = "sit"
	avatar.animate(dt, "sit", 0.0)
	avatar.head.rotation.y = -k.steer * 0.3

# ---------- sacīkstes ----------
func onRace(rc) -> void:
	if rc == null: return
	var r: Dictionary = (rc as Dictionary).duplicate(true)
	var prev: Dictionary = race if race != null else {"phase": "none"}
	race = r
	var mine: bool = r.has("racers") and r.racers.has(myId)
	if (r.phase == "lobby" or r.phase == "run") and mine and (myRace == null or myRace.id != r.id):
		myRace = {"id": r.id, "placed": false, "prevIdx": 0, "progress": 0, "finished": false, "lapsDone": 0, "lapStart": 0.0, "lastCount": null, "time": 0.0}
	if myRace != null and myRace.id == r.id and not mine and r.phase != "done": myRace = null
	if r.phase == "lobby" and prev.phase != "lobby":
		var s = maxi(0, roundi((float(r.startAt) - now()) / 1000.0))
		UI.toast(("🏁 Gaidām pārējos braucējus… Starts pēc %d s" if mine else "🏁 Kartinga sacīkstes sāksies pēc %d s! Ej uz trasi un sēdies kartā!") % s, "good", 4000)
		sfx("beep")
	if r.phase == "done" and prev.phase != "done":
		var was_in: bool = myRace != null and myRace.id == r.id
		if was_in:
			stat("races")
			if r.final.size() > 0 and r.final[0].get("id") == myId:
				stat("wins"); addCoins(25, true)
			showResults(r.final)
			myRace = null

func showResults(final: Array) -> void:
	UI.showPanel("🏁 Sacīkšu rezultāti", func(b: Control) -> void:
		var medals = ["🥇", "🥈", "🥉", "4."]
		for i in final.size():
			var r: Dictionary = final[i]
			b.add_child(UI.itemRow(medals[i] if i < medals.size() else "%d." % (i + 1), str(r.name), UI.fmt_time(float(r.time)) if r.get("time") != null else "nefinišēja", [], r.get("id") == myId))
		if final.size() > 0 and final[0].get("id") == myId: b.add_child(UI.p("🎉 Tu uzvarēji! +25🪙"))
		if save.get("bestLap") != null: b.add_child(UI.p("⏱️ Tavs labākais aplis: %s" % UI.fmt_time(float(save.bestLap)))))
	sfx("win")

func gridSlot(k: int) -> Dictionary:
	var back = 6 + floori(k / 2.0) * 5
	var i = (TRACK_N - back) % TRACK_N
	var p = raceW.track_pts[i]
	var t: Array = raceW.d.trackTan[i]
	var side = -2.6 if k % 2 else 2.6
	return {"x": float(p.x) - float(t[2]) * side, "z": float(p.z) + float(t[0]) * side, "heading": atan2(float(t[0]), float(t[2])), "idx": i}

func updateRace(dt, t) -> void:
	var r: Dictionary = race
	var mr = myRace
	var W = raceW
	var rb: Button = UI.b["btn-race"]
	if me.inKart and mr == null and zone == RACE:
		var s0 = W.track_pts[0]
		var near = Vector2(me.pos.x - float(s0.x), me.pos.z - float(s0.z)).length() < 70.0
		if near and (r.phase == "none" or r.phase == "done"):
			rb.text = "🏁 Sākt sacīkstes"; rb.visible = true
		elif near and r.phase == "lobby":
			rb.text = "🏁 Pievienoties (%d)" % maxi(0, ceili((float(r.startAt) - 4000.0 - t) / 1000.0)); rb.visible = true
		else: rb.visible = false
	else: rb.visible = false
	if r.phase == "lobby" and me.inKart and zone == RACE and not r.get("racers", []).has(myId) and r.get("racers", []).size() < 4 and autoRace != r.id:
		autoRace = r.id
		net.toHost({"t": "raceReq"})
		UI.toast("🏁 Tu arī piedalies sacīkstēs! Gaidi startu…", "good", 3000)
	updateBots(dt, t)
	if mr == null or mr.id != r.id:
		UI.show_id("race-hud", false); UI.show_id("countdown", false)
		me.progress = 0.0
		return
	if r.phase == "lobby":
		UI.show_id("race-hud", true)
		UI.set_text("race-hud", "🏁 Gaidām braucējus… %d s (%d/4)" % [maxi(0, ceili((float(r.startAt) - 4000.0 - t) / 1000.0)), r.racers.size()])
		return
	if r.phase != "run": return
	if not mr.placed:
		var slot = maxi(0, r.racers.find(myId))
		var g = gridSlot(slot)
		if UI.panelOpen(): UI.closePanel()
		if zone != RACE:
			net.toHost({"t": "raceLeave"}); myRace = null
			return
		if not me.inKart: enterKart(g)
		me.pos = Vector3(g.x, W.get_height(g.x, g.z), g.z)
		me.kart.heading = g.heading
		me.kart.speed = 0.0
		me.kart.hint = g.idx
		cam.yaw = g.heading + PI
		mr.placed = true
		mr.prevIdx = g.idx
		mr.progress = g.idx - TRACK_N
		mr.lapStart = float(r.startAt)
	var cd: Label = UI.b.countdown
	if t < float(r.startAt):
		var n = ceili((float(r.startAt) - t) / 1000.0)
		cd.visible = true; cd.text = str(n)
		if mr.lastCount != n:
			mr.lastCount = n; sfx("beep")
			if n <= 3: voice("r_%d" % n)
	elif t < float(r.startAt) + 1000.0:
		cd.visible = true; cd.text = "AIZIET!"
		if mr.lastCount != 0:
			mr.lastCount = 0; sfx("go"); voice("r_go")
	else: cd.visible = false
	var laps_total: int = int(Game.D.RACE_LAPS)
	if t >= float(r.startAt) and not mr.finished and me.inKart:
		var ni: int = me.kart.hint
		var d: int = ni - int(mr.prevIdx)
		if d < -TRACK_N / 2: d += TRACK_N
		if d > TRACK_N / 2: d -= TRACK_N
		if absi(d) <= 15: mr.progress = int(mr.progress) + d
		mr.prevIdx = ni
		var laps = floori(float(mr.progress) / TRACK_N)
		if laps > int(mr.lapsDone) and laps >= 1:
			var lap_time: float = t - float(mr.lapStart)
			mr.lapStart = t
			mr.lapsDone = laps
			if save.get("bestLap") == null or lap_time < float(save.bestLap):
				save.bestLap = lap_time
				if laps < laps_total: UI.toast("⏱️ Jauns labākais aplis: %s!" % UI.fmt_time(lap_time), "good")
			if laps < laps_total:
				sfx("beep")
				UI.toast("🔔 Pēdējais aplis!" if laps == laps_total - 1 else "Aplis %d/%d" % [laps + 1, laps_total])
		if int(mr.progress) >= laps_total * TRACK_N:
			mr.finished = true
			mr.time = t - float(r.startAt)
			net.toHost({"t": "raceFinish", "time": mr.time})
			sfx("win")
			UI.toast("🏁 Finišs! Laiks: %s" % UI.fmt_time(mr.time), "good", 4000)
	var my_prog: float = (laps_total + 1 - float(mr.time) / 1e7) if mr.finished else float(mr.progress) / TRACK_N
	me.progress = my_prog
	var rank = 1
	var total = 1
	for id in r.racers:
		if id == myId: continue
		var rr = remotes.get(id)
		if rr == null: continue
		total += 1
		if float(rr.progress) > my_prog: rank += 1
	for bi in int(r.get("bots", 0)):
		total += 1
		if botProgress(bi, r.racers.size() + bi, t) > my_prog: rank += 1
	UI.show_id("race-hud", true)
	var lap = mini(laps_total, maxi(1, floori(float(mr.progress) / TRACK_N) + 1))
	UI.set_text("race-hud", ("🏁 Finišējis! %s · Vieta %d/%d" % [UI.fmt_time(mr.time), rank, total]) if mr.finished else ("Aplis %d/%d · Vieta %d/%d · ⏱️ %s" % [lap, laps_total, rank, total, UI.fmt_time(maxf(0.0, t - float(r.startAt)))]))

func botDistance(b: int, grid_slot: int, t: float) -> float:
	var L: float = float(raceW.d.trackLen)
	var back = (6 + floori(grid_slot / 2.0) * 5) * L / TRACK_N
	var el = maxf(0.0, (t - float(race.startAt)) / 1000.0)
	var total: float = Game.D.RACE_LAPS * L + back
	return minf(total, el * float(BOTS[b].speed)) - back

func botProgress(b: int, grid_slot: int, t: float) -> float:
	var d = botDistance(b, grid_slot, t)
	var fin = botTime(b, grid_slot)
	if t - float(race.startAt) >= fin: return Game.D.RACE_LAPS + 1 - fin / 1e7
	return d / float(raceW.d.trackLen)

func updateBots(dt: float, t: float) -> void:
	if not raceOn: return
	var r: Dictionary = race
	var active: int = int(r.get("bots", 0)) if r.phase == "run" else 0
	while bots.size() < BOTS.size(): bots.append(null)
	for b in BOTS.size():
		var bot = bots[b]
		if b >= active:
			if bot != null: bot.kart.root.visible = false
			continue
		if bot == null:
			var kart = makeKart(BOTS[b].kart)
			var av = Avatar.make(BOTS[b])
			kart.seat.add_child(av.root)
			if av.shadow: av.shadow.visible = false
			av.set_name_tag(BOTS[b].name, Color("#e0e0e0"))
			land_node.add_child(kart.root)
			bot = {"kart": kart, "av": av}
			bots[b] = bot
		bot.kart.root.visible = true
		var slot: int = r.racers.size() + b
		var W = raceW
		var dist = botDistance(b, slot, t)
		var L: float = float(W.d.trackLen)
		var f = fmod(fmod(dist, L) + L, L) / L * TRACK_N
		var i0 = int(f) % TRACK_N
		var i1 = (i0 + 1) % TRACK_N
		var fr = f - floorf(f)
		var p0 = W.track_pts[i0]
		var p1 = W.track_pts[i1]
		var tg: Array = W.d.trackTan[i0]
		var lane = (-2.6 if slot % 2 else 2.6) * (1.0 if t < float(r.startAt) + 3000.0 else 0.6) + sin(t / 1500.0 + b) * 0.8
		var x = lerpf(float(p0.x), float(p1.x), fr) - float(tg[2]) * lane
		var z = lerpf(float(p0.z), float(p1.z), fr) + float(tg[0]) * lane
		bot.kart.root.position = Vector3(x, TRACK_Y, z)
		bot.kart.root.rotation.y = atan2(float(tg[0]), float(tg[2]))
		var moving = t > float(r.startAt)
		for w in bot.kart.wheels: w.rotation.x += (float(BOTS[b].speed) if moving else 0.0) * dt / 0.32
		bot.av.animate(dt, "sit", 0.0)

# tukšas (vēlākie slāņi)
func carryAction(): return null
func findActivityActions(_c, _d): return null
func openShop(_id) -> void: pass
