class_name WinterLand
extends Terra
## ❄️ Ziemas zeme (web winter.js WinterZone): reljefs no izgāztā režģa, sadursmes, pacēlājs, brieži, slēpotāji,
## sniegavīru mērķi, sniegputenis.

const N := 340
const SZ := 1000.0
const HS := SZ / 2.0
const CELL := SZ / N
const CHAIRS := 28
const LIFT := {"x": 42.0, "zB": 62.0, "zT": -238.0, "off": 1.6, "v": 13.0}
const SK := [
	{"animal": "zakis", "fur": "#d9d2c5", "shirt": "#2f6fd6"},
	{"animal": "lapsa", "fur": "#e8742a", "shirt": "#f2c12e"},
	{"animal": "kakis", "fur": "#3b3b3b", "shirt": "#d23b3b"},
	{"animal": "suns", "fur": "#c89b5e", "shirt": "#2fa84f"},
]
var g
var d: Dictionary
var heights: PackedFloat32Array
var grid := {}
var obstacles: Array = []
var targets: Array = []
var lift: Dictionary
var cable: PackedFloat32Array
var road_idx: RoadIndex
var deer: Array = []
var skiers: Array = []
var chairs: MultiMeshInstance3D
var snow: GPUParticles3D
var amount := 0.0
var extra: Node3D

func _init(game) -> void:
	g = game
	zone = "n"
	open = Terra.open_sides("n")
	var f := FileAccess.open("res://web/data/winter.json", FileAccess.READ)
	d = JSON.parse_string(f.get_as_text())
	heights = PackedFloat32Array(d.heights)
	for c in d.colliders: _add_collider(float(c[0]), float(c[1]), float(c[2]))
	obstacles = d.obstacles
	targets = d.targets
	lift = d.lift
	cable = PackedFloat32Array(lift.cable)
	var lines := []
	for l in d.roads:
		var pts := []
		for p in l: pts.append({"x": float(p[0]), "z": float(p[1])})
		lines.append(pts)
	road_idx = RoadIndex.new(lines)

func _add_collider(x: float, z: float, r: float) -> void:
	var k := Vector2i(floori(x / 8.0), floori(z / 8.0))
	if not grid.has(k): grid[k] = []
	grid[k].append([x, z, r])

func get_height(x: float, z: float) -> float:
	var fx := (x + HS) / CELL
	var fz := (z + HS) / CELL
	if fx < 0 or fz < 0 or fx >= N or fz >= N: return GROUND_Y
	var n := N + 1
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

func ground_at(x: float, z: float, _y: float = 1e9) -> float: return get_height(x, z)
func road_dist(x: float, z: float) -> float: return float(road_idx.near(x, z).d)

func collide(pos: Vector3, radius: float) -> Vector3:
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
	var h0 := hit
	pos = clamp_square(pos)
	hit = hit or h0
	return pos

# ---------- pacēlājs ----------
func cable_at(s: float) -> float:
	var f := clampf(s, 0.0, float(lift.len)) / 0.5
	var i := mini(cable.size() - 2, int(f))
	return cable[i] + (cable[i + 1] - cable[i]) * (f - i)

func up_point(s: float) -> Vector3:
	return Vector3(LIFT.x - LIFT.off, cable_at(s) - 2.3, LIFT.zB - s)

## krēsla vieta cilpā: [pozīcija, pagrieziens]
func loop(u: float) -> Array:
	var total: float = lift.total
	var L: float = lift.len
	u = fmod(fmod(u, total) + total, total)
	var semi: float = PI * LIFT.off
	if u < L: return [Vector3(LIFT.x - LIFT.off, cable_at(u) - 2.3, LIFT.zB - u), PI]
	u -= L
	if u < semi:
		var a := u / LIFT.off
		return [Vector3(LIFT.x - cos(a) * LIFT.off, float(lift.cT) - 2.3, LIFT.zT - sin(a) * LIFT.off), PI + a]
	u -= semi
	if u < L: return [Vector3(LIFT.x + LIFT.off, cable_at(L - u) - 2.3, LIFT.zT + u), 0.0]
	u -= L
	var a2 := u / LIFT.off
	return [Vector3(LIFT.x + cos(a2) * LIFT.off, float(lift.cB) - 2.3, LIFT.zB + sin(a2) * LIFT.off), a2]

# ---------- kustīgās daļas ----------
func build_dynamic() -> void:
	extra = Node3D.new(); extra.name = "WinterDyn"
	node.add_child(extra)
	# krēsli
	var chair := Avatar.asset("chair").build()
	var parts := []
	Field._collect(chair, Transform3D.IDENTITY, parts, true)
	if parts.size():
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = parts[0][0]; mm.instance_count = CHAIRS
		chairs = MultiMeshInstance3D.new(); chairs.multimesh = mm
		extra.add_child(chairs)
	# brieži
	for h in d.deer:
		var m := Npc.make("briedis")
		extra.add_child(m.root)
		deer.append({"id": deer.size(), "model": m, "home": h, "x": float(h.x), "z": float(h.z), "heading": 0.0})
	# slēpotāji
	for i in d.skiers.size():
		var s: Dictionary = d.skiers[i]
		var av := Avatar.make(SK[i % SK.size()])
		av.set_winter(true); av.set_skis(true)
		var ch := chair.duplicate(); ch.position = Vector3(0, 0.25, -0.02); ch.visible = false
		av.root.add_child(ch)
		av.root.rotation_order = EULER_ORDER_YXZ
		extra.add_child(av.root)
		skiers.append({"av": av, "chair": ch, "px": PackedFloat32Array(s.px), "pz": PackedFloat32Array(s.pz), "pt": PackedFloat32Array(s.pt),
			"tDown": float(s.tDown), "tLift": float(s.tLift), "cycle": float(s.cycle), "off": float(s.off), "heading": PI, "idx": 0})
	# mērķi (sniegavīri)
	for n in node.find_children("*", "Node3D", true, false):
		var nm := str(n.get_meta("n", ""))
		if nm.begins_with("target:"):
			var i := int(nm.substr(7))
			if i < targets.size(): targets[i].obj = n; targets[i].wob = 0.0
	# sniegputenis (GPU daļiņas ap kameru)
	snow = GPUParticles3D.new()
	snow.amount = 2600
	snow.lifetime = 6.0
	snow.visibility_aabb = AABB(Vector3(-40, -20, -40), Vector3(80, 50, 80))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(35, 2, 35)
	pm.direction = Vector3(0.15, -1, 0.05); pm.spread = 12.0
	pm.initial_velocity_min = 1.6; pm.initial_velocity_max = 2.6
	pm.gravity = Vector3(0, -0.6, 0)
	pm.turbulence_enabled = true; pm.turbulence_noise_strength = 0.6
	pm.scale_min = 0.5; pm.scale_max = 1.2
	snow.process_material = pm
	var qm := QuadMesh.new(); qm.size = Vector2(0.07, 0.07)
	var sm := StandardMaterial3D.new(); sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; sm.albedo_color = Color(1, 1, 1, 0.9)
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; sm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	qm.material = sm
	snow.draw_pass_1 = qm
	snow.local_coords = false
	g.stage.add_child(snow)

static func snow_amount(ms: float) -> float:
	var t := ms / 1000.0
	return Game.smoothstep(0.15, 0.55, 0.5 + 0.5 * sin(t / 95.0)) * (0.65 + 0.35 * sin(t / 21.0))

static func ski_slope(h: Callable, x: float, z: float, heading: float) -> Dictionary:
	var fx := sin(heading)
	var fz := cos(heading)
	var rx := cos(heading)
	var rz := -sin(heading)
	var L := 0.9
	var Wd := 0.4
	return {"pitch": atan2(float(h.call(x + fx * L, z + fz * L)) - float(h.call(x - fx * L, z - fz * L)), 2.0 * L),
		"roll": atan2(float(h.call(x + rx * Wd, z + rz * Wd)) - float(h.call(x - rx * Wd, z - rz * Wd)), 2.0 * Wd)}

func update(dt: float, game) -> void:
	if extra == null: build_dynamic()
	var t: float = game.now() / 1000.0
	if chairs:
		for i in CHAIRS:
			var lp := loop(i * float(lift.total) / CHAIRS + fmod(t, 100000.0) * LIFT.v)
			chairs.multimesh.set_instance_transform(i, Transform3D(Basis(Vector3.UP, lp[1]), lp[0]))
	for dd in deer:
		var h: Dictionary = dd.home
		var kk: float = fmod(t, 1e6) / 11.0 + float(h.p1)
		var seg := floorf(kk)
		var f := kk - seg
		var u: float = (seg + Game.smoothstep(0.0, 0.5, f)) * 0.8 * float(h.sp)
		var x: float = float(h.x) + float(h.R) * (0.6 * sin(u * 1.3 + float(h.p1)) + 0.4 * sin(u * 2.1 + float(h.p2)))
		var z: float = float(h.z) + float(h.R) * (0.6 * cos(u * 1.1 + float(h.p2)) + 0.4 * cos(u * 1.7 + float(h.p1)))
		var sp := Vector2(x - dd.x, z - dd.z).length() / maxf(dt, 1e-3)
		if sp > 0.05: dd.heading = Game.angle_lerp(dd.heading, atan2(x - dd.x, z - dd.z), 1.0 - exp(-dt * 6.0))
		dd.x = x; dd.z = z
		var near: bool = absf(x - game.me.pos.x) < 120 and absf(z - game.me.pos.z) < 120
		dd.model.root.visible = near
		if not near: continue
		dd.model.root.position = Vector3(x, get_height(x, z), z)
		dd.model.root.rotation.y = dd.heading
		dd.model.animate(dt, sp > 0.05, minf(sp, 3.0))
	update_skiers(dt, t, game)
	for tg in targets:
		if tg.get("obj") != null and float(tg.get("wob", 0.0)) > 0:
			tg.wob = maxf(0.0, float(tg.wob) - dt)
			tg.obj.rotation.z = sin(tg.wob * 25.0) * tg.wob * 0.5
	amount = snow_amount(game.now())
	if snow:
		snow.global_position = game.camera.global_position + Vector3(0, 12, 0)
		snow.emitting = amount > 0.02
		snow.amount_ratio = clampf(amount * game.qualitySnow(), 0.05, 1.0)
	game.winterFog(amount)

func update_skiers(dt: float, t: float, game) -> void:
	var mp: Vector3 = game.me.pos
	for s in skiers:
		var av: Avatar = s.av
		var R := av.root
		var u := fmod(t + float(s.off), float(s.cycle))
		var x := 0.0
		var z := 0.0
		var y := 0.0
		var heading := PI
		var speed := 0.0
		var state := "ski"
		var on_lift := false
		var pt: PackedFloat32Array = s.pt
		var px: PackedFloat32Array = s.px
		var pz: PackedFloat32Array = s.pz
		if u < float(s.tDown):
			var i: int = int(s.idx) if pt[int(s.idx)] <= u else 0
			while i < pt.size() - 2 and pt[i + 1] < u: i += 1
			s.idx = i
			var f := (u - pt[i]) / maxf(1e-3, pt[i + 1] - pt[i])
			x = lerpf(px[i], px[i + 1], f); z = lerpf(pz[i], pz[i + 1], f)
			var dx := px[i + 1] - px[i]
			var dz := pz[i + 1] - pz[i]
			heading = atan2(dx, dz)
			speed = Vector2(dx, dz).length() / maxf(1e-3, pt[i + 1] - pt[i])
			y = get_height(x, z)
		else:
			u -= float(s.tDown)
			if u < 3.0:
				x = LIFT.x - 1; z = LIFT.zB; y = get_height(x, z); heading = PI
			else:
				u -= 3.0
				if u < float(s.tLift):
					var p := up_point(u * LIFT.v)
					x = p.x; z = p.z; y = p.y - 0.27; heading = PI; state = "lift"; on_lift = true
				else:
					x = px[0]; z = pz[0]; y = get_height(x, z); heading = atan2(px[3] - px[0], pz[3] - pz[0])
					s.idx = 0
		var near: bool = absf(x - mp.x) < 170 and absf(z - mp.z) < 170
		R.visible = near
		if not near: continue
		var dh: float = heading - float(s.heading)
		dh = atan2(sin(dh), cos(dh))
		var omega := dh / maxf(dt, 1e-3)
		s.heading = float(s.heading) + dh * (1.0 - exp(-dt * 10.0))
		R.position = Vector3(x, y, z)
		R.rotation.y = s.heading
		s.chair.visible = on_lift
		if state == "ski":
			var sl := ski_slope(func(a, b): return get_height(a, b), x, z, s.heading)
			var lean := clampf(-atan(speed * omega / 9.8) * 0.55, -0.42, 0.42)
			var k := 1.0 - exp(-dt * 8.0)
			R.rotation.x = lerpf(R.rotation.x, -sl.pitch, k)
			R.rotation.z = lerpf(R.rotation.z, sl.roll * 0.7 + lean, k)
			av.ski_pose = {"down": R.rotation.x, "v": speed, "brake": 0.0, "air": false, "push": speed < 3.5}
		else:
			R.rotation.x = 0.0; R.rotation.z = 0.0; av.ski_pose = null
		if av.shadow: av.shadow.visible = not on_lift
		av.animate(dt, state, speed)

func dispose() -> void:
	if snow and is_instance_valid(snow): snow.queue_free()
	super.dispose()
