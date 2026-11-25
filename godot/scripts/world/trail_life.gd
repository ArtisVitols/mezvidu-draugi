class_name TrailLife
extends RefCounted
## 🐸 Piedzīvojumu meža dzīvnieki (web wildlife.js): vardes, pīles, zaķi, stirnas, stārķi, tauriņi — tikai lokāli.

const KINDS := {
	"varde": {"n": 10, "near": 7.0, "far": 42.0, "out": 55.0},
	"pile": {"n": 5, "near": 15.0, "far": 85.0, "out": 105.0},
	"zakis": {"n": 4, "near": 28.0, "far": 85.0, "out": 115.0},
	"stirna": {"n": 3, "near": 38.0, "far": 95.0, "out": 125.0},
	"starkis": {"n": 2, "near": 25.0, "far": 85.0, "out": 115.0},
	"taurenis": {"n": 12, "near": 4.0, "far": 30.0, "out": 42.0},
}
const BUTTERFLY := ["#f2c81a", "#ffffff", "#f07a1a", "#4a8ae8", "#e85aa8", "#ffe07a"]
const WATER_Y := 0.0
var Z
var game
var group: Node3D
var list: Array = []
var spawnT := 0.0
var croakT := 0.0
var cur := 0
var frogs: MultiMesh
var ducks: MultiMesh
var wingsL: MultiMesh
var wingsR: MultiMesh

func _init(zone, g) -> void:
	Z = zone; game = g

func _mm(mesh: Mesh, n: int, parent: Node3D, mat: Material = null, colors := false) -> MultiMesh:
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = colors; mm.mesh = mesh; mm.instance_count = n
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm
	if mat: mi.material_override = mat
	parent.add_child(mi)
	for i in n: mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3(0, -1000, 0)))
	return mm

func build(G: Node3D) -> void:
	group = Node3D.new(); group.name = "Life"; G.add_child(group)
	var pack := Avatar.asset("wildlife").build()
	var mesh_of := func(name: String) -> Mesh:
		for c in pack.get_children():
			if str(c.get_meta("n", "")) == name and c is MeshInstance3D: return (c as MeshInstance3D).mesh
		return null
	var cheap: float = 0.6 if bool(game.Q.get("cheap", false)) else 1.0
	var nk := func(k: String) -> int: return maxi(1, roundi(float(KINDS[k].n) * cheap))
	frogs = _mm(mesh_of.call("varde"), nk.call("varde"), group)
	ducks = _mm(mesh_of.call("pile"), nk.call("pile"), group)
	var wm: Mesh = mesh_of.call("wing")
	var wmat := StandardMaterial3D.new()
	var wsrc: MeshInstance3D = null
	for c in pack.get_children(): if str(c.get_meta("n", "")) == "wing": wsrc = c
	if wm and wm.get_surface_count() > 0:
		var sm = wm.surface_get_material(0)
		if sm is ShaderMaterial: wmat.albedo_texture = (sm as ShaderMaterial).get_shader_parameter("tex")
	wmat.vertex_color_use_as_albedo = true
	wmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	wmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR; wmat.alpha_scissor_threshold = 0.5
	wmat.roughness = 0.8
	var nb: int = nk.call("taurenis")
	wingsL = _mm(wm, nb, group, wmat, true)
	wingsR = _mm(wm, nb, group, wmat, true)
	for i in nb:
		var col := Color(BUTTERFLY[i % BUTTERFLY.size()])
		wingsL.set_instance_color(i, col); wingsR.set_instance_color(i, col)
	var fi := 0
	var di := 0
	var bi := 0
	for kind in KINDS:
		for i in nk.call(kind):
			var a := {"kind": kind, "on": false, "x": 0.0, "z": 0.0, "y": 0.0, "h": 0.0, "st": "idle", "t": randf() * 3.0, "sp": 0.0, "fade": 0.0, "hop": 0.0, "hop0": 1.0, "ph": randf() * 10.0, "av": null, "croak": 0.0}
			if kind == "varde": a.idx = fi; fi += 1
			elif kind == "pile": a.idx = di; di += 1
			elif kind == "taurenis": a.idx = bi; bi += 1
			list.append(a)
	pack.queue_free()

func hab(kind: String, x: float, z: float):
	var h: float = Z.get_height(x, z)
	if absf(x) > 300 or z < -280: return null
	match kind:
		"varde":
			if h < WATER_Y - 0.12 or h > WATER_Y + 0.7: return null
			var wet: bool = Z.get_height(x + 2, z) < WATER_Y or Z.get_height(x - 2, z) < WATER_Y or Z.get_height(x, z + 2) < WATER_Y or Z.get_height(x, z - 2) < WATER_Y
			return maxf(h, WATER_Y) if wet else null
		"pile":
			var last_z: float = float(Z.lay.stops[Z.lay.stops.size() - 1].z)
			return WATER_Y if (h < WATER_Y - 0.6 and Z.get_height(x + 2.5, z) < WATER_Y - 0.3 and Z.get_height(x - 2.5, z) < WATER_Y - 0.3 and z < last_z - 60 and not Z.onBridge(x, z)) else null
		"starkis":
			return maxf(h, WATER_Y - 0.25) if (Z.bogAt(x, z) > 0.55 and h > WATER_Y - 0.3 and h < WATER_Y + 0.35) else null
		"taurenis":
			return h if (h > WATER_Y + 0.2 and Z.forestAt(x, z) < 0.55 and z < Z.shoreZ(x) - 40) else null
		_:
			if h < WATER_Y + 0.4 or z > Z.shoreZ(x) - 50 or Z.mountAt(x, z) > (0.3 if kind == "stirna" else 0.5): return null
			var slope: float = Vector2(Z.get_height(x + 1.5, z) - Z.get_height(x - 1.5, z), Z.get_height(x, z + 1.5) - Z.get_height(x, z - 1.5)).length() / 3.0
			if Z.forestAt(x, z) > (0.4 if kind == "stirna" else 0.6) or slope > 0.35 or float(Z.idx.near(x, z).d) < 3.5: return null
			return h

func spawn(a: Dictionary, px: float, pz: float) -> bool:
	var K: Dictionary = KINDS[a.kind]
	for tries in 5:
		var ang := randf() * TAU
		var r: float = K.near + randf() * (K.far - K.near)
		var x := px + sin(ang) * r
		var z := pz + cos(ang) * r
		var y = hab(a.kind, x, z)
		if y == null: continue
		a.on = true; a.x = x; a.z = z; a.y = y; a.h = randf() * TAU; a.st = "idle"; a.t = 0.5 + randf() * 3.0; a.sp = 0.0; a.fade = 0.0; a.hop = 0.0; a.ax = x; a.az = z
		if a.av == null and a.kind in ["zakis", "stirna", "starkis"]:
			a.av = Npc.make(a.kind); a.base = a.av.baseScale; group.add_child(a.av.root)
		if a.av != null: a.av.root.visible = true
		return true
	return false

func despawn(a: Dictionary) -> void:
	a.on = false
	if a.av != null: a.av.root.visible = false
	else: put(a, null)

func update(dt: float, g, t: float) -> void:
	var me: Vector3 = g.me.pos
	spawnT -= dt
	if spawnT <= 0:
		spawnT = 0.35
		var N := list.size()
		var budget := 4
		for k in N:
			if budget <= 0: break
			cur = (cur + 1) % N
			var a: Dictionary = list[cur]
			if not a.on:
				budget -= 1
				spawn(a, me.x, me.z)
	croakT -= dt
	for a in list:
		if not a.on: continue
		var dx: float = a.x - me.x
		var dz: float = a.z - me.z
		var d := Vector2(dx, dz).length()
		if d > float(KINDS[a.kind].out):
			despawn(a); continue
		a.fade = minf(1.0, a.fade + dt * 1.5)
		a.t -= dt
		match a.kind:
			"varde": varde(a, dt, d, dx, dz)
			"pile": pile(a, dt, d, dx, dz, t)
			"zakis": walker(a, dt, d, dx, dz, 8.0, 14.0, 7.5, 1.6, 14.0)
			"stirna": walker(a, dt, d, dx, dz, 14.0, 26.0, 9.0, 1.1, 20.0)
			"starkis": walker(a, dt, d, dx, dz, 6.0, 12.0, 2.2, 0.55, 16.0)
			"taurenis": taurenis(a, dt, d, dx, dz, t)

func put(a: Dictionary, m) -> void:
	var mms: Array = [frogs] if a.kind == "varde" else ([ducks] if a.kind == "pile" else [wingsL, wingsR])
	if m == null:
		for mm in mms: mm.set_instance_transform(a.idx, Transform3D(Basis().scaled(Vector3.ZERO), Vector3(0, -1000, 0)))
		return
	mms[0].set_instance_transform(a.idx, m)

func away(a: Dictionary, dx: float, dz: float, jit := 0.6) -> void: a.h = atan2(dx, dz) + (randf() - 0.5) * jit

func varde(a: Dictionary, dt: float, d: float, dx: float, dz: float) -> void:
	if a.hop > 0:
		a.hop = maxf(0.0, a.hop - dt / 0.38)
		var f: float = a.hop0 * dt / 0.38
		a.x += sin(a.h) * f; a.z += cos(a.h) * f
		if a.hop == 0:
			var h: float = Z.get_height(a.x, a.z)
			if h < WATER_Y - 0.15:
				game.sfx("plop", {"at": Vector2(a.x, a.z), "vol": 0.6}); despawn(a); return
			a.y = maxf(h, WATER_Y)
	elif d < 3.2 or a.t <= 0:
		if d < 3.2:
			away(a, dx, dz); a.hop0 = 1.4 + randf() * 0.6
		else:
			a.h += (randf() - 0.5) * 2.4; a.hop0 = 0.5 + randf() * 0.6
			if hab("varde", a.x + sin(a.h) * a.hop0, a.z + cos(a.h) * a.hop0) == null: a.h += PI
		a.hop = 1.0; a.t = 1.5 + randf() * 4.0
	if a.hop == 0 and d < 25 and croakT <= 0 and randf() < dt * 0.08:
		croakT = 1.4; game.sfx("frog", {"at": Vector2(a.x, a.z), "vol": 0.55}); a.croak = 0.5
	a.croak = maxf(0.0, a.croak - dt)
	var arc := sin((1.0 - a.hop) * PI) if a.hop > 0 else 0.0
	var s: float = 1.35 * a.fade
	var sy := 1.15 if a.hop > 0 else 1.0 + sin(a.croak * 30.0) * 0.06
	put(a, Transform3D(Basis(Vector3.UP, a.h).scaled(Vector3(s, s * sy, s)), Vector3(a.x, a.y + arc * 0.35 * a.hop0, a.z)))

func pile(a: Dictionary, dt: float, d: float, dx: float, dz: float, t: float) -> void:
	if d < 7:
		away(a, dx, dz, 0.3); a.sp = 2.2
	else:
		a.sp += (0.5 - a.sp) * dt
		if a.t <= 0:
			a.h += (randf() - 0.5) * 1.6; a.t = 2.0 + randf() * 4.0
	if Z.get_height(a.x + sin(a.h) * 1.4, a.z + cos(a.h) * 1.4) > WATER_Y - 0.4: a.h += dt * 3.5
	else:
		a.x += sin(a.h) * a.sp * dt; a.z += cos(a.h) * a.sp * dt
	if d < 22 and randf() < dt * 0.05: game.sfx("quack", {"vol": 0.9 * (1.0 - d / 22.0)})
	var s: float = 1.1 * a.fade
	var b := Basis.from_euler(Vector3(sin(t * 2.0 + a.ph) * 0.05, a.h, 0), EULER_ORDER_XYZ).scaled(Vector3(s, s, s))
	put(a, Transform3D(b, Vector3(a.x, WATER_Y - 0.06 + sin(t * 1.7 + a.ph) * 0.02, a.z)))

func walker(a: Dictionary, dt: float, d: float, dx: float, dz: float, flee: float, alert: float, run: float, walk: float, roam: float) -> void:
	if d < flee and a.st != "flee":
		a.st = "flee"; a.t = 2.2 + randf(); away(a, dx, dz)
	if a.st == "flee":
		a.sp = run
		if a.t <= 0:
			a.st = "idle"; a.t = 2.0 + randf() * 3.0
	elif d < alert:
		a.st = "alert"; a.sp = 0.0
		var want := atan2(-dx, -dz)
		a.h += atan2(sin(want - a.h), cos(want - a.h)) * minf(1.0, dt * 3.0)
	elif a.t <= 0:
		if a.st == "walk":
			a.st = "idle"; a.t = 2.0 + randf() * 5.0; a.sp = 0.0
		else:
			a.st = "walk"; a.t = 1.0 + randf() * 2.5; a.h += (randf() - 0.5) * 2.2; a.sp = walk
			if Vector2(a.x - a.ax, a.z - a.az).length() > roam: a.h = atan2(a.ax - a.x, a.az - a.z)
	elif a.st == "alert": a.st = "idle"
	if a.sp > 0:
		var nx: float = a.x + sin(a.h) * a.sp * dt
		var nz: float = a.z + cos(a.h) * a.sp * dt
		var ok: bool
		if a.kind == "starkis": ok = Z.bogAt(nx, nz) > 0.4 and Z.get_height(nx, nz) > WATER_Y - 0.35
		else: ok = Z.get_height(nx, nz) > WATER_Y + 0.25 and absf(Z.get_height(nx, nz) - Z.get_height(a.x, a.z)) < a.sp * dt * 0.7 + 0.02 and absf(nx) < 305
		if ok:
			a.x = nx; a.z = nz
		else: a.h += (1.0 if randf() < 0.5 else -1.0) * (0.8 + randf())
		a.y = maxf(Z.get_height(a.x, a.z), WATER_Y - 0.25 if a.kind == "starkis" else -9.0)
	var av: Npc = a.av
	av.root.position = Vector3(a.x, a.y, a.z)
	av.root.rotation.y = a.h
	av.root.scale = Vector3.ONE * a.base * a.fade
	if d < 70:
		av.animate(dt, a.sp > 0.05, a.sp)
		if a.sp == 0 and a.st == "idle" and a.kind != "starkis" and av.body: av.body.rotation.x = maxf(0.0, sin(a.t * 1.3 + a.ph)) * 0.12

func taurenis(a: Dictionary, dt: float, d: float, dx: float, dz: float, t: float) -> void:
	if a.t <= 0:
		a.t = 1.0 + randf() * 2.5; a.tx = a.ax + (randf() - 0.5) * 10.0; a.tz = a.az + (randf() - 0.5) * 10.0
	if d < 2.5:
		a.tx = a.x + dx * 2.0; a.tz = a.z + dz * 2.0
	var want := atan2(float(a.get("tx", a.x)) - a.x, float(a.get("tz", a.z)) - a.z)
	a.h += atan2(sin(want - a.h), cos(want - a.h)) * minf(1.0, dt * 2.5) + sin(t * 3.0 + a.ph) * dt * 1.5
	a.x += sin(a.h) * 1.6 * dt; a.z += cos(a.h) * 1.6 * dt
	var gy := maxf(Z.get_height(a.x, a.z), WATER_Y)
	a.y += (gy + 0.9 + sin(t * 1.3 + a.ph) * 0.5 - a.y) * minf(1.0, dt * 2.0)
	var flap := sin(t * 22.0 + a.ph) * 1.1
	var s: float = 1.8 * a.fade
	var p := Vector3(a.x, a.y + absf(sin(t * 11.0 + a.ph)) * 0.04, a.z)
	wingsR.set_instance_transform(a.idx, Transform3D(Basis.from_euler(Vector3(0, a.h, 0.2 + flap), EULER_ORDER_YXZ).scaled(Vector3(s, s, s)), p))
	wingsL.set_instance_transform(a.idx, Transform3D(Basis.from_euler(Vector3(0, a.h, -0.2 - flap), EULER_ORDER_YXZ) * Basis().scaled(Vector3(-s, s, s)), p))
