class_name TrailLand
extends Terra
## 🧭 Piedzīvojumu mežs (web trail.js TrailZone): reljefs, tilts, laipa, sadursmes (kraujas, strauts, tunelis, šķēršļi),
## NPC, priekšmeti, šķēršļu stāvoklis, bultas, burbuļi; dzīvnieki — TrailLife.

const KL := 0
const KV := 1
const KE := 2
const KK := 3
const KB := 4
const KF := 5
const KS := 6
const SHORE := 842.0
const BX := 150.0
const SK1 := 0.032
const SK2 := 0.06
var SP1 := PI / 2.0 - SK1 * BX
var SP2 := PI / 2.0 - SK2 * BX

var g
var d: Dictionary
var C: Dictionary
var heights: PackedFloat32Array
var X0 := -400.0
var Z0 := -400.0
var CELL := 3.125
var NX := 256
var NZ := 448
var grid := {}
var lay: Dictionary
var idx: RoadIndex
var stream_idx: RoadIndex
var bridgeA := 0.0
var bridgeB := 0.0
var bridgeDone := false
var lastSide := -1
var lp = null
var obClear: Array = []
var state = null
var npcs: Array = []
var logs: MultiMeshInstance3D
var apples: MultiMeshInstance3D
var fishes: MultiMeshInstance3D
var planks: MultiMeshInstance3D
var rails: Node3D
var arrows: Array = []
var obs: Array = []
var itemGroup: Node3D
var itemObjs: Array = []
var itemsFor = null
var itemPack: Node3D
var life: TrailLife
var wasIn = null
var sect = null
var sectT := 0.0
var built := false

func _init(game) -> void:
	g = game
	zone = "s"
	open = ["n"]
	var f := FileAccess.open("res://web/data/trail.json", FileAccess.READ)
	d = JSON.parse_string(f.get_as_text())
	C = d.C
	heights = PackedFloat32Array(d.heights)
	X0 = d.X0; Z0 = d.Z0; CELL = d.CELL; NX = int(d.NX); NZ = int(d.NZ)
	for c in d.colliders: add_collider(float(c[0]), float(c[1]), float(c[2]))
	lay = d.lay
	idx = RoadIndex.new([lay.line], 8.0, 3)
	var sp := []
	var x := -450.0
	while x <= 450.0:
		sp.append({"x": x, "z": streamZ(x)})
		x += 1.2
	stream_idx = RoadIndex.new([sp], 8.0, 3)
	bridgeA = d.bridgeA; bridgeB = d.bridgeB

func add_collider(x: float, z: float, r: float) -> void:
	var k := Vector2i(floori(x / 8.0), floori(z / 8.0))
	if not grid.has(k): grid[k] = []
	grid[k].append([x, z, r])

# ---------- analītiskās funkcijas (no trail.js) ----------
static func shoreZ(x: float) -> float: return SHORE + sin(x * 0.011) * 14.0 + sin(x * 0.031 + 1.0) * 5.0
func streamZ(x: float) -> float: return 600.0 + 30.0 * sin(SK1 * x + SP1) + 7.0 * sin(SK2 * x + SP2)
func streamDZ(x: float) -> float: return 30.0 * SK1 * cos(SK1 * x + SP1) + 7.0 * SK2 * cos(SK2 * x + SP2)
static func streamHW(x: float) -> float: return 5.0 + 1.8 * sin(0.045 * (x - BX))
func streamDist(x: float, z: float) -> float:
	var v := absf(z - streamZ(x))
	if v > 48.0: return v / sqrt(1.0 + pow(streamDZ(x), 2))
	return minf(v, float(stream_idx.near(x, z).d))
func bogAt(x: float, z: float) -> float:
	var B: Dictionary = C.BOG
	return 1.0 - Game.smoothstep(0.62, 0.95, Vector2((x - float(B.x)) / float(B.rx), (z - float(B.z)) / float(B.rz)).length())
func _grid(arr: Array, x: float, z: float) -> float:
	var G: Dictionary = d.grid
	var fx := clampf((x - float(G.x0)) / float(G.step), 0.0, float(G.nx) - 1.001)
	var fz := clampf((z - float(G.z0)) / float(G.step), 0.0, float(G.nz) - 1.001)
	var i := int(fx)
	var j := int(fz)
	var u := fx - i
	var v := fz - j
	var n: int = int(G.nx)
	var a := lerpf(float(arr[j * n + i]), float(arr[j * n + i + 1]), u)
	var b := lerpf(float(arr[(j + 1) * n + i]), float(arr[(j + 1) * n + i + 1]), u)
	return lerpf(a, b, v)
func forestAt(x: float, z: float) -> float: return _grid(d.forest, x, z)
func mountAt(x: float, z: float) -> float: return _grid(d.mount, x, z)
func sectAt(x: float, z: float) -> int:
	if z > shoreZ(x) - 58.0: return 7
	if z > streamZ(x): return 6
	var zz := z + _grid(d.sectDz, x, z)
	for i in range(5, 0, -1):
		if zz >= float(Game.C.trail.SECTS[i].z): return i
	return 0
func southOfStream(x: float, z: float) -> bool: return z > streamZ(x)
func tunArch(dd: float) -> float: return float(C.TUN_H) * sqrt(maxf(0.0, 1.0 - pow(dd / float(C.TUN_W), 2)))

# ---------- vaicājumi ----------
func get_height(x: float, z: float) -> float:
	var fx := (x - X0) / CELL
	var fz := (z - Z0) / CELL
	if fx < 0 or fz < 0 or fx >= NX or fz >= NZ: return -6.0 if fz >= NZ else GROUND_Y
	var n := NX + 1
	var ix := int(fx)
	var iz := int(fz)
	var u := fx - ix
	var v := fz - iz
	var H := heights
	var ha := H[iz * n + ix]
	var hb := H[(iz + 1) * n + ix]
	var hc := H[(iz + 1) * n + ix + 1]
	var hd := H[iz * n + ix + 1]
	if u + v <= 1.0: return ha + (hd - ha) * u + (hb - ha) * v
	return hc + (hb - hc) * (1.0 - u) + (hd - hc) * (1.0 - v)

func BZ() -> float: return float(C.BZ)
func bridgeY(z: float) -> float:
	var B: Dictionary = C.BRIDGE
	return lerpf(bridgeA, bridgeB, clampf((z - (BZ() - float(B.hl))) / (2.0 * float(B.hl)), 0.0, 1.0)) + 0.28
func onBridge(x: float, z: float) -> bool:
	var B: Dictionary = C.BRIDGE
	return absf(x - float(B.x)) < float(B.hw) and absf(z - BZ()) < float(B.hl) + 0.4

func ground_at(x: float, z: float, _y: float = 1e9) -> float:
	var h := get_height(x, z)
	if bridgeDone and onBridge(x, z): return maxf(h, bridgeY(z))
	var B = lay.get("bwBox")
	if B != null and x > float(B[0]) and x < float(B[2]) and z > float(B[1]) and z < float(B[3]):
		var n := idx.near(x, z)
		if n.p != null and float(n.p.get("bw", 0)) > 0 and float(n.d) < float(C.BW_HW) + 0.45:
			return maxf(h, float(n.p.h) + float(C.BW_Y) * float(n.p.bw) * (1.0 - Game.smoothstep(float(C.BW_HW), float(C.BW_HW) + 0.45, float(n.d))))
	return h

func road_dist(x: float, z: float) -> float: return maxf(0.0, float(idx.near(x, z).d) - (float(C.TRAIL_HW) - (3.6 - float(C.TRAIL_HW))))
func is_water(x: float, z: float) -> bool: return get_height(x, z) < WATER_Y - 0.2
func ambience(x: float, z: float) -> Dictionary:
	var s := Game.smoothstep(shoreZ(x) - 120.0, shoreZ(x) - 20.0, z)
	return {"birds": 0.5 * (1.0 - s), "wind": 0.12 + 0.4 * s}
func reset_lp() -> void: lp = null

func collide(pos: Vector3, radius: float = 0.5) -> Vector3:
	hit = false
	var cx := floori(pos.x / 8.0)
	var cz := floori(pos.z / 8.0)
	for a in range(-1, 2):
		for b in range(-1, 2):
			var list = grid.get(Vector2i(cx + a, cz + b))
			if list == null: continue
			for c in list:
				var dx: float = pos.x - float(c[0])
				var dz: float = pos.z - float(c[1])
				var mn: float = float(c[2]) + radius
				var d2 := dx * dx + dz * dz
				if d2 < mn * mn and d2 > 1e-6:
					var dd := sqrt(d2)
					pos.x = float(c[0]) + dx / dd * mn; pos.z = float(c[1]) + dz / dd * mn
					hit = true
	var H := ZONE_HALF
	if pos.x > H:
		pos.x = H; hit = true
	if pos.x < -H:
		pos.x = -H; hit = true
	if pos.z > float(C.SEA_LIMIT):
		pos.z = float(C.SEA_LIMIT); hit = true
	var nl := -H - CROSS_AT - 3.0
	if pos.z < nl:
		pos.z = nl; hit = true
	if lp != null and radius < 0.9:
		var dx: float = pos.x - lp.x
		var dz: float = pos.z - lp.y
		var dd := Vector2(dx, dz).length()
		if dd > 1e-4 and dd < 2.0:
			var h0 := ground_at(lp.x, lp.y)
			var lpx: float = lp.x
			var lpz: float = lp.y
			var ok := func(x: float, z: float) -> bool: return ground_at(x, z) - h0 <= Vector2(x - lpx, z - lpz).length() * 1.1 + 0.02
			if not ok.call(pos.x, pos.z):
				if absf(dx) > 1e-4 and ok.call(pos.x, lpz): pos.z = lpz
				elif absf(dz) > 1e-4 and ok.call(lpx, pos.z): pos.x = lpx
				else:
					pos.x = lpx + dx * 0.1; pos.z = lpz + dz * 0.1
				hit = true
	var sz := streamZ(pos.x)
	var band := streamHW(pos.x) + 3.0
	var sd := streamDist(pos.x, pos.z) if absf(pos.z - sz) < 40.0 else 99.0
	if not bridgeDone and sd < band:
		var np = stream_idx.near(pos.x, pos.z).p
		var npx: float = float(np.x) if np != null else pos.x
		var npz: float = float(np.z) if np != null else sz
		var ddz := streamDZ(npx)
		var nl2 := sqrt(1.0 + ddz * ddz)
		pos.x = npx - ddz / nl2 * lastSide * band; pos.z = npz + 1.0 / nl2 * lastSide * band
		hit = true
	elif sd >= band: lastSide = 1 if pos.z > sz else -1
	var tn := inTunnel(pos.x, pos.z)
	var lim := float(C.TUN_W) - 0.05 - minf(radius, 0.5)
	if not tn.is_empty() and float(tn.d) > lim:
		var k := lim / float(tn.d)
		pos.x = float(tn.p.x) + (pos.x - float(tn.p.x)) * k; pos.z = float(tn.p.z) + (pos.z - float(tn.p.z)) * k
		hit = true
	for o in lay.obst:
		if obClear.size() > int(o.o) and obClear[int(o.o)]: continue
		var dx: float = pos.x - float(o.x)
		var dz: float = pos.z - float(o.z)
		if dx * dx + dz * dz > 2200: continue
		var along := dx * float(o.tx) + dz * float(o.tz)
		var across := dx * float(o.nx) + dz * float(o.nz)
		var w := float(C.OB_HALF) + radius
		if absf(along) < w and across > -float(o.wl) and across < float(o.wr):
			var side: float = (signf((lp.x - float(o.x)) * float(o.tx) + (lp.y - float(o.z)) * float(o.tz))) if lp != null else signf(along)
			if side == 0: side = -1.0
			if side < 0:
				pos.x += float(o.tx) * (-w - along); pos.z += float(o.tz) * (-w - along)
				hit = true
	lp = Vector2(pos.x, pos.z)
	return pos

func inTunnel(x: float, z: float) -> Dictionary:
	var T = lay.get("tunnel")
	if T == null or x < float(T.box[0]) or x > float(T.box[2]) or z < float(T.box[1]) or z > float(T.box[3]): return {}
	var n := idx.near(x, z)
	if n.p != null and int(n.p.i) >= int(T.i0) and int(n.p.i) <= int(T.i1) and float(n.d) < float(C.TUN_W) + 1.0: return {"p": n.p, "d": n.d}
	return {}

func cam_block(x: float, y: float, z: float) -> bool:
	var T = lay.get("tunnel")
	if T == null or x < float(T.box[0]) - 4 or x > float(T.box[2]) + 4 or z < float(T.box[1]) - 4 or z > float(T.box[3]) + 4: return false
	var n := idx.near(x, z)
	if n.p == null or int(n.p.i) < int(T.i0) or int(n.p.i) > int(T.i1): return false
	return float(n.d) > float(C.TUN_W) - 0.35 or y > float(n.p.h) + tunArch(float(n.d)) - 0.3

func ceiling_at(x: float, z: float) -> float:
	var t := inTunnel(x, z)
	return float(t.p.h) + tunArch(float(t.d)) - 0.45 if (not t.is_empty() and float(t.d) < float(C.TUN_W)) else INF

func inQuestRange(k: int, x: float, z: float) -> bool:
	if k >= lay.stops.size(): return false
	var s: Dictionary = lay.stops[k]
	return Vector2(x - float(s.clear.x), z - float(s.clear.z)).length() < float(s.range)

# ---------- kustīgās daļas ----------
func build_dynamic() -> void:
	built = true
	var TASKS: Array = Game.C.trail.TASKS
	for k in lay.stops.size():
		var s: Dictionary = lay.stops[k]
		var T: Dictionary = TASKS[k]
		var av := Avatar.make({"animal": T.npc, "fur": T.get("fur"), "shirt": T.get("shirt", "#d23b3b"), "hat": T.get("hat"), "wear": T.get("wear", {}) if T.get("wear") is Dictionary else {}})
		av.root.position = Vector3(s.x, get_height(s.x, s.z), s.z)
		av.root.rotation.y = float(s.face)
		for q in 20: av.animate(0.05, "idle", 0.0)
		av.set_name_tag(T.name, Color("#ffe9a8"))
		av.name_tag.position.y = 2.05
		node.add_child(av.root)
		add_collider(s.x, s.z, 0.55)
		npcs.append({"k": k, "s": s, "av": av, "bubble": null, "bubbleText": "", "t": k * 1.7})
	for n in node.find_children("*", "Node3D", true, false):
		var nm := str(n.get_meta("n", ""))
		match nm:
			"logs": logs = n
			"apples": apples = n
			"fishes": fishes = n
			"planks": planks = n
			"rails": rails = n
			_:
				if nm.begins_with("arrow:"):
					arrows.append({"m": n, "k": int(nm.substr(6)), "y": (n as Node3D).position.y})
				elif nm.begins_with("obRoot:"):
					var i := int(nm.substr(7))
					while obs.size() <= i: obs.append({})
					obs[i].root = n
				elif nm.begins_with("obRest:"):
					var i := int(nm.substr(7))
					while obs.size() <= i: obs.append({})
					obs[i].rest = n
	for i in obs.size():
		obs[i].o = lay.obst[i]
		obs[i].parts = obs[i].root.get_children() if obs[i].get("root") else []
		obs[i].wob = 0.0; obs[i].bubble = null; obs[i].btxt = ""; obs[i].n = -1
	itemGroup = Node3D.new(); itemGroup.name = "Items"; node.add_child(itemGroup)
	itemPack = Avatar.asset("trailitems").build()
	life = TrailLife.new(self, g)
	life.build(node)

func item(kind: String) -> Node3D:
	for c in itemPack.get_children(): if str(c.get_meta("n", "")) == "item:" + kind: return c.duplicate()
	return Node3D.new()

func cloneItem(kind: String, sc := 1.0) -> Node3D:
	var o := item(kind)
	o.scale = Vector3.ONE * sc
	return o

func _set_count(mmi: MultiMeshInstance3D, n: int) -> void:
	if mmi and mmi.multimesh: mmi.multimesh.visible_instance_count = n

func applyState(tr: Dictionary) -> void:
	state = tr
	if not built: return
	var step := int(tr.step)
	var TASKS: Array = Game.C.trail.TASKS
	_set_count(logs, 8 if step > KL else (mini(8, int(tr.c)) if step == KL else 0))
	_set_count(apples, 8 if step > KE else (mini(8, int(tr.c)) if step == KE else 0))
	_set_count(fishes, 10 if step > KK else (mini(10, int(tr.c)) if step == KK else 0))
	bridgeDone = tr.get("bridge", false)
	if planks and planks.multimesh:
		var tot := planks.multimesh.instance_count
		_set_count(planks, tot if bridgeDone else (roundi(float(tr.c) / float(TASKS[KB].need) * tot) if step == KB else 0))
	if rails: rails.visible = bridgeDone
	applyObstacles(tr)
	for a in arrows: a.m.visible = step > int(a.k)
	var T = TASKS[step] if step < TASKS.size() else null
	var key = ("%d:%d" % [step, int(tr.run)]) if (T != null and tr.acc) else null
	if key != itemsFor:
		for o in itemObjs: o.obj.queue_free()
		itemObjs = []
		itemsFor = key
		if key != null:
			for it in lay.stops[step].items:
				var obj := cloneItem(T.item, float(C.ITEM_SCALE.get(T.item, 1.0)))
				var y := maxf(get_height(it.x, it.z), WATER_Y)
				obj.position = Vector3(it.x, y, it.z); obj.rotation.y = float(it.get("ry", 0.0))
				itemGroup.add_child(obj)
				itemObjs.append({"it": it, "obj": obj, "y": y, "bob": T.kind == "pick" or T.item == "abols"})
	for o in itemObjs: o.obj.visible = not (tr.get("taken") is Dictionary and tr.taken.has(str(int(o.it.i))))

func applyObstacles(tr: Dictionary) -> void:
	var OBT: Dictionary = Game.C.trail.OB_TYPES
	var ob_arr: Array = tr.get("ob", []) if tr.get("ob") is Array else []
	obClear = []
	for o in lay.obst:
		var n: int = int(ob_arr[int(o.o)]) if ob_arr.size() > int(o.o) else 0
		obClear.append(n >= int(OBT[o.type].hits))
	for ob in obs:
		if not ob.has("root"): continue
		var T: Dictionary = OBT[ob.o.type]
		var n: int = int(ob_arr[int(ob.o.o)]) if ob_arr.size() > int(ob.o.o) else 0
		var done := n >= int(T.hits)
		ob.root.visible = not done
		if ob.get("rest"): ob.rest.visible = done
		if ob.o.type != "koks":
			var parts: Array = ob.parts
			for i in parts.size():
				parts[i].visible = i < ceili(parts.size() * (1.0 - float(n) / float(T.hits))) or (i == 0 and not done)
		ob.n = n

func obHit(o: int) -> void:
	if o < obs.size(): obs[o].wob = 1.0

func bubbleText(k: int, tr: Dictionary) -> String:
	var TASKS: Array = Game.C.trail.TASKS
	var T: Dictionary = TASKS[k]
	var step := int(tr.step)
	if step >= TASKS.size(): return "🎉 Paldies!" if k == TASKS.size() - 1 else "😊"
	if step < k: return "💤"
	if step > k: return "😊"
	if not tr.acc: return "❗ Palīgā!"
	if T.kind == "boat": return "🚣 Atvediet laivu!"
	return "%s %d/%d" % [T.itemIcon, int(tr.c), int(T.need)]

func _bubble(text: String, bg: Color) -> Label3D:
	var l := Label3D.new()
	l.text = text; l.font = UI.font; l.font_size = 48; l.pixel_size = 0.008
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED; l.outline_size = 22; l.outline_modulate = bg; l.modulate = Color.WHITE
	return l

func update(dt: float, game) -> void:
	if not built: build_dynamic(); applyState(state if state != null else game.trail)
	var t := Time.get_ticks_msec() / 1000.0
	for a in arrows:
		if a.m.visible: a.m.position.y = float(a.y) + sin(t * 2.0 + a.k) * 0.12
	var me: Vector3 = game.me.pos
	var TASKS: Array = Game.C.trail.TASKS
	var qt = game.trail
	if qt != null and qt.acc and int(qt.step) < TASKS.size():
		var in_r := inQuestRange(int(qt.step), me.x, me.z)
		var T: Dictionary = TASKS[int(qt.step)]
		if wasIn == true and not in_r: UI.toast("⚠️ Tu aizej no %s uzdevuma vietas! Ja visi aizies prom, uzdevums neizdosies." % T.icon, "bad", 4500)
		elif wasIn == false and in_r: UI.toast("%s Atpakaļ pie uzdevuma" % T.icon, "good")
		wasIn = in_r
	else: wasIn = null
	sectT -= dt
	if sectT <= 0:
		sectT = 0.5
		var si := sectAt(me.x, me.z)
		if sect != null and si != sect and si > 0:
			var S: Dictionary = Game.C.trail.SECTS[si]
			UI.toast("%s %s" % [S.icon, S.name], "good", 2500)
		sect = si
	var OBT: Dictionary = Game.C.trail.OB_TYPES
	for ob in obs:
		if not ob.has("root"): continue
		var T: Dictionary = OBT[ob.o.type]
		var dd := Vector2(float(ob.o.x) - me.x, float(ob.o.z) - me.z).length()
		if ob.wob > 0:
			ob.wob = maxf(0.0, ob.wob - dt * 2.5)
			ob.root.rotation.z = sin(t * 40.0) * 0.035 * ob.wob
			ob.root.position.y = float(ob.o.h) + absf(sin(t * 30.0)) * 0.05 * ob.wob
		var txt := "" if (not ob.root.visible or dd > 32) else "%s %s: %d/%d" % [T.tool, T.name, maxi(0, int(ob.n)), int(T.hits)]
		if txt != ob.btxt:
			if ob.bubble != null and is_instance_valid(ob.bubble): ob.bubble.queue_free()
			ob.bubble = null
			if txt != "":
				ob.bubble = _bubble(txt, Color(120 / 255.0, 70 / 255.0, 20 / 255.0, 0.85))
				ob.bubble.position = Vector3(ob.o.x, float(ob.o.h) + (3.6 if ob.o.type == "akmens" else 2.8), ob.o.z)
				node.add_child(ob.bubble)
			ob.btxt = txt
	if life: life.update(dt, game, t)
	for o in itemObjs:
		if o.bob and o.obj.visible and absf(float(o.it.x) - me.x) < 60 and absf(float(o.it.z) - me.z) < 60:
			o.obj.position.y = float(o.y) + 0.12 + sin(t * 2.2 + int(o.it.i)) * 0.08
			o.obj.rotation.y += dt * 0.8
	var tr: Dictionary = state if state != null else {"step": 0, "acc": false, "c": 0}
	for n in npcs:
		var dd := Vector2(float(n.s.x) - me.x, float(n.s.z) - me.z).length()
		var near := dd < 70.0
		n.av.root.visible = dd < 360.0
		if not near:
			if n.bubble != null: n.bubble.visible = false
			continue
		var fresh: bool = int(tr.step) == int(n.k) and not tr.acc
		n.t += dt
		var wave: bool = fresh and dd < 12 and fmod(n.t, 4.0) < 1.6
		n.av.animate(dt, "wave" if wave else "idle", 0.0)
		if dd < 9:
			var want := atan2(me.x - float(n.s.x), me.z - float(n.s.z)) - float(n.s.face)
			n.av.head.rotation.y = clampf(atan2(sin(want), cos(want)), -0.9, 0.9)
		var txt := bubbleText(int(n.k), tr)
		if txt != n.bubbleText:
			if n.bubble != null and is_instance_valid(n.bubble): n.bubble.queue_free()
			n.bubble = null
			if txt != "":
				n.bubble = _bubble(txt, Color(214 / 255.0, 120 / 255.0, 20 / 255.0, 0.9) if (int(n.k) == int(tr.step) and int(tr.step) < TASKS.size()) else Color(0, 0, 0, 0.45))
				n.bubble.position.y = 2.55
				n.av.root.add_child(n.bubble)
			n.bubbleText = txt
		if n.bubble != null:
			n.bubble.visible = dd < 45
			n.bubble.position.y = 2.55 + sin(t * 2.0 + int(n.k)) * 0.05
