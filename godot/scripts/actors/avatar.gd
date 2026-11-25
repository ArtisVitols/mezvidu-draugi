class_name Avatar
extends RefCounted
## Spēlētāja/tēla dzīvnieks (web characters.js buildAnimal + attachRig). Modelis no web/asset/an_<suga>[_<krekls>],
## krāsas no krāsu bāzēm: c = b + (F − b)·kažoks + (S − b)·krekls (lineārā telpā).

const HIP := 0.68
static var _ws := {}        # aktīvu nosaukums → WebScene (parsēts vienreiz)
static var _packs := {}     # 'hats' / 'wear_<suga>' → uzbūvēta pakete (Node3D)

var root: Node3D
var body: Node3D
var spine: Node3D
var head: Node3D
var tail: Node3D
var hat_holder: Node3D
var shadow: Node3D
var mesh_inst: MeshInstance3D
var legs: Array = []    # [{hip, knee, foot}] — 0 labā, 1 kreisā (kā web)
var arms: Array = []    # [{sh, el}]
var species := "lacis"
var bulk := 1.0
var bird := false
var meta: Dictionary = {}
var phase := randf() * 6.0
var t := randf() * 10.0
var pose := {}
var tgt := {}
var hat_id = null
var wear_parts: Array = []
var wear_key = null
var wings = null
var winter := false
var winter_parts: Array = []
var scarf = null
var skis = null
var carry_obj: Node3D
var pushing := false
var ski_pose = null
var pedal = null
var last_pos = null
var last_yaw := 0.0
var name_tag: Label3D
var hip_base := HIP

static func asset(name: String) -> WebScene:
	if not _ws.has(name):
		_ws[name] = WebScene.open("asset/" + name)
	return _ws[name]

static func pack(name: String) -> Node3D:
	if not _packs.has(name):
		var ws := asset(name)
		_packs[name] = ws.build() if ws else Node3D.new()
	return _packs[name]

## prof: {animal, fur, shirt, hat, wear}
static func make(prof: Dictionary) -> Avatar:
	var a := Avatar.new()
	a._build(prof)
	return a

func _build(prof: Dictionary) -> void:
	species = str(prof.get("animal", "lacis"))
	if not Game.C.assets.SPECIES.has(species): species = "lacis"
	var spec: Dictionary = Game.C.assets.SPECIES[species]
	var wear: Dictionary = prof.get("wear", {}) if prof.get("wear") is Dictionary else {}
	var top = wear.get("top")
	var aname := "an_" + species
	if top != null and str(top) != "" and Game.C.assets.TOPS.has(top) and not spec.get("bird", false):
		aname += "_" + str(top)
	else: top = null
	var ws := asset(aname)
	root = ws.build()
	meta = ws.j.get("meta", {}) if ws.j.get("meta") is Dictionary else {}
	bird = spec.get("bird", false)
	bulk = float(spec.get("bulk", 1.0))
	_bind()
	for n in root.find_children("*", "Node3D", true, false): (n as Node3D).rotation_order = EULER_ORDER_XYZ
	# krāsas
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		if mi.name != "shadow" and mi.get_parent() is Skeleton3D:
			mesh_inst = mi
			break
	_recolor(ws, Game.lin(str(prof.get("fur") if prof.get("fur") != null else spec.get("fur", "#8b5a2b"))), Game.lin(str(prof.get("shirt") if prof.get("shirt") != null else "#d23b3b")), top != null)
	pose = {"hip": [0.0, 0.0], "knee": [0.05, 0.05], "sh": [0.0, 0.0], "shZ": [0.0, 0.0], "el": [-0.15, -0.15], "spX": 0.02, "spY": 0.0, "bY": hip_base, "bX": 0.0, "hX": 0.0, "hY": 0.0}
	tgt = pose.duplicate(true)
	set_hat(prof.get("hat"))
	set_wear(wear)

func _recolor(ws: WebScene, fur: Color, shirt: Color, has_top: bool) -> void:
	if mesh_inst == null or ws.j.get("extra") == null: return
	var ex: Dictionary = ws.j.extra
	var m: ArrayMesh = mesh_inst.mesh
	var out := ArrayMesh.new()
	for si in m.get_surface_count():
		var arr := m.surface_get_arrays(si)
		var cols: PackedColorArray = arr[Mesh.ARRAY_COLOR]
		if si == 0 and cols.size() > 0:
			var F := ws.f32(int(ex["c:f:0"])) if ex.has("c:f:0") else PackedFloat32Array()
			var S := ws.f32(int(ex["c:s:0"])) if ex.has("c:s:0") and not has_top else PackedFloat32Array()
			for v in cols.size():
				var b := cols[v]
				var c := b
				if F.size() >= v * 3 + 3:
					c.r += (F[v * 3] - b.r) * fur.r; c.g += (F[v * 3 + 1] - b.g) * fur.g; c.b += (F[v * 3 + 2] - b.b) * fur.b
				if S.size() >= v * 3 + 3:
					c.r += (S[v * 3] - b.r) * shirt.r; c.g += (S[v * 3 + 1] - b.g) * shirt.g; c.b += (S[v * 3 + 2] - b.b) * shirt.b
				cols[v] = c
			arr[Mesh.ARRAY_COLOR] = cols
		var fmt := m.surface_get_format(si)
		var cf := fmt & ((Mesh.ARRAY_FORMAT_CUSTOM_MASK << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_FORMAT_CUSTOM_MASK << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT))
		out.add_surface_from_arrays(m.surface_get_primitive_type(si), arr, [], {}, cf)
		out.surface_set_material(si, m.surface_get_material(si))
	mesh_inst.mesh = out

func _bind() -> void:
	body = root.find_child("body", true, false)
	spine = root.find_child("spine", true, false)
	head = root.find_child("head", true, false)
	tail = root.find_child("tail", true, false)
	hat_holder = root.find_child("hatHolder", true, false)
	shadow = root.find_child("shadow", true, false)
	for s in ["R", "L"]:
		var hip: Node3D = root.find_child("hip" + s, true, false)
		var knee: Node3D = root.find_child("knee" + s, true, false)
		legs.append({"hip": hip, "knee": knee, "foot": knee.find_child("foot", false, false) if knee else null})
		arms.append({"sh": root.find_child("sh" + s, true, false), "el": root.find_child("el" + s, true, false)})

## gatavs modelis (piem., pārdevējs no 'vendors' paketes) ar tiem pašiem kaulu vārdiem
static func from_node(n: Node3D, hip := 0.7) -> Avatar:
	var a := Avatar.new()
	a.root = n
	a.species = "old"
	a._bind()
	a.hip_base = hip
	for x in n.find_children("*", "Node3D", true, false): (x as Node3D).rotation_order = EULER_ORDER_XYZ
	a.pose = {"hip": [0.0, 0.0], "knee": [0.05, 0.05], "sh": [0.0, 0.0], "shZ": [0.0, 0.0], "el": [-0.15, -0.15], "spX": 0.02, "spY": 0.0, "bY": hip, "bX": 0.0, "hX": 0.0, "hY": 0.0}
	a.tgt = a.pose.duplicate(true)
	return a

# ---------- cepure, drēbes ----------
func set_hat(id) -> void:
	hat_id = id
	if hat_holder == null: return
	for c in hat_holder.get_children(): c.queue_free()
	var hid = "ziemas" if winter else id
	if hid == null or str(hid) == "": return
	var p := pack("hats")
	for c in p.get_children():
		if str(c.get_meta("n", "")) == "hat:" + str(hid):
			hat_holder.add_child(c.duplicate())
			return

func set_wear(w: Dictionary) -> void:
	var key := ""
	for k in ["glasses", "neck", "back", "feet"]: key += str(w.get(k, "")) + "|"
	if wear_key == key: return
	wear_key = key
	for o in wear_parts: if is_instance_valid(o): o.queue_free()
	wear_parts = []
	wings = null
	var p := pack("wear_" + species)
	for slot in ["glasses", "neck", "back", "feet"]:
		var id = w.get(slot)
		if id == null or str(id) == "": continue
		if slot == "feet" and bird: continue
		for c in p.get_children():
			var parts := str(c.get_meta("n", "")).split(":")
			if parts.size() < 3 or parts[0] != slot or parts[1] != str(id): continue
			var bone: Node3D = root.find_child(parts[2], true, false) if parts[2] != "" else root
			if bone == null: continue
			var g: Node3D = c.duplicate()
			bone.add_child(g)
			wear_parts.append(g)
			if slot == "neck": g.set_meta("neck", true)
			if slot == "back":
				var wl := g.find_children("*wing*", "Node3D", true, false)
				if wl.size() >= 2: wings = [wl[0], wl[1]]
	apply_wear_vis()

func apply_wear_vis() -> void:
	for o in wear_parts:
		if is_instance_valid(o) and o.has_meta("neck"): o.visible = not winter

# ---------- nešana ----------
func set_carry(obj: Node3D) -> void:
	if carry_obj and is_instance_valid(carry_obj):
		carry_obj.queue_free()
	carry_obj = null
	if obj == null: return
	var bb := _aabb(obj)
	var sz := bb.size
	var k := minf(1.0, 0.55 / maxf(maxf(sz.x, sz.z), maxf(sz.y * 0.6, 0.01)))
	obj.scale *= k
	obj.position = Vector3(0, 0.12 - bb.position.y * k, 0.3 * bulk + sz.z * k * 0.5)
	spine.add_child(obj)
	carry_obj = obj

static func _aabb(n: Node3D) -> AABB:
	var out := AABB()
	var first := true
	for mi in n.find_children("*", "VisualInstance3D", true, false):
		var vi: VisualInstance3D = mi
		var b: AABB = (n.global_transform.affine_inverse() * vi.global_transform) * vi.get_aabb() if n.is_inside_tree() else vi.transform * vi.get_aabb()
		out = b if first else out.merge(b)
		first = false
	return out

# ---------- ziemas drēbes, slēpes ----------
func set_winter(on: bool) -> void:
	if winter == on: return
	winter = on
	if on:
		winter_parts = []
		var knit := _mat(Color(0.75, 0.13, 0.16), 1.0)
		var ring := MeshInstance3D.new()
		var tm := TorusMesh.new(); tm.inner_radius = 0.085 - 0.036; tm.outer_radius = 0.085 + 0.036; tm.rings = 22; tm.ring_segments = 10
		ring.mesh = tm; ring.material_override = knit
		ring.scale = Vector3(bulk * 1.05, 1.15, 0.86 * bulk)
		ring.position = Vector3(0, 0.43, 0.005)
		spine.add_child(ring); winter_parts.append(ring)
		scarf = []
		for xl in [[0.05, 0.22], [-0.035, 0.17]]:
			var p1 := Node3D.new(); p1.position = Vector3(xl[0] * bulk, 0.42, -0.1 * bulk); spine.add_child(p1); winter_parts.append(p1)
			var s1 := MeshInstance3D.new(); var b1 := BoxMesh.new(); b1.size = Vector3(0.075, xl[1], 0.024); s1.mesh = b1; s1.material_override = knit; s1.position.y = -xl[1] / 2.0; p1.add_child(s1)
			var p2 := Node3D.new(); p2.position.y = -xl[1]; p1.add_child(p2)
			var s2 := MeshInstance3D.new(); var b2 := BoxMesh.new(); b2.size = Vector3(0.072, xl[1] * 0.9, 0.022); s2.mesh = b2; s2.material_override = knit; s2.position.y = -xl[1] * 0.45; p2.add_child(s2)
			for i in 4:
				var f := MeshInstance3D.new(); var fb := BoxMesh.new(); fb.size = Vector3(0.008, 0.035, 0.008); f.mesh = fb; f.material_override = knit
				f.position = Vector3(-0.027 + i * 0.018, -xl[1] * 0.9 - 0.016, 0); p2.add_child(f)
			p1.rotation_order = EULER_ORDER_XYZ; p2.rotation_order = EULER_ORDER_XYZ
			scarf.append({"p1": p1, "p2": p2, "a": 0.15, "v": 0.0, "b": 0.0, "bv": 0.0})
		if not bird:
			for a in arms:
				var mit := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.056; sm.height = 0.112; mit.mesh = sm
				mit.material_override = knit; mit.scale = Vector3(1, 1.15, 0.85); mit.position = Vector3(0, -0.215, 0.01)
				var cuff := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.05; cm.bottom_radius = 0.05; cm.height = 0.05; cuff.mesh = cm
				cuff.material_override = knit; cuff.position.y = -0.16
				a.el.add_child(mit); a.el.add_child(cuff); winter_parts.append(mit); winter_parts.append(cuff)
		last_pos = null
	else:
		for o in winter_parts: if is_instance_valid(o): o.queue_free()
		winter_parts = []; scarf = null
	set_hat(hat_id)
	apply_wear_vis()

func set_skis(on: bool) -> void:
	if (skis != null) == on: return
	if on:
		var g := Node3D.new()
		var sm := _mat(Color(0.65, 0.025, 0.025), 0.35)
		for s in [-1, 1]:
			var sk := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(0.085, 0.025, 1.6); sk.mesh = bm; sk.material_override = sm
			sk.position = Vector3(s * 0.1 * bulk, 0.015, 0.12); sk.set_meta("side", s); g.add_child(sk)
		root.add_child(g)
		var poles := []
		for a in arms:
			var p := Node3D.new(); p.position = Vector3(0, -0.21, 0.02); p.rotation.x = 0.45
			var pm := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.011; cm.bottom_radius = 0.011; cm.height = 1.0; pm.mesh = cm
			pm.material_override = _mat(Color(0.02, 0.025, 0.03), 0.4); pm.position.y = -0.5; p.add_child(pm)
			a.el.add_child(p); poles.append(p)
		skis = {"g": g, "poles": poles}
	else:
		skis.g.queue_free()
		for p in skis.poles: p.queue_free()
		skis = null

static func _mat(c: Color, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c.linear_to_srgb()
	m.roughness = rough
	return m

# ---------- animācija (characters.js attachRig.animate) ----------
func animate(dt: float, state: String, speed: float = 0.0) -> void:
	t += dt
	var T := tgt
	var k := 1.0 - exp(-dt * 10.0)
	T.spY = 0.0; T.hX = 0.0; T.bX = 0.0; T.shZ = [-0.07, 0.07]
	if state == "walk" or state == "run":
		var run := state == "run"
		phase += dt * (10.5 if run else 7.0)
		var amp := 0.7 if run else 0.42
		T.hip = [0.0, 0.0]; T.knee = [0.0, 0.0]; T.sh = [0.0, 0.0]; T.el = [0.0, 0.0]
		for i in 2:
			var ph := phase + i * PI
			var s := sin(ph)
			var c := cos(ph)
			T.hip[i] = -s * amp
			T.knee[i] = maxf(0.0, c) * amp * (1.9 if run else 1.3) + 0.08
			T.sh[1 - i] = -s * amp * 0.75
			T.el[1 - i] = -1.25 if run else -0.3 - maxf(0.0, -s) * 0.25
		T.bY = hip_base - absf(sin(phase)) * (0.05 if run else 0.025) - (0.04 if run else 0.0)
		T.spX = 0.22 if run else 0.06
		T.spY = sin(phase) * 0.07
		T.hX = -T.spX * 0.6
		k = 1.0 - exp(-dt * 22.0)
	elif state == "jump":
		T.hip = [-0.7, 0.15]; T.knee = [1.0, 0.35]; T.sh = [-0.6, 0.35]; T.shZ = [-0.35, 0.35]; T.el = [-0.7, -0.5]
		T.bY = hip_base; T.spX = 0.1
	elif state == "swim":
		phase += dt * 4.0
		var s := sin(phase)
		T.hip = [s * 0.4, -s * 0.4]; T.knee = [0.3, 0.3]
		T.sh = [-2.4 + s * 0.6, -2.4 - s * 0.6]; T.el = [-0.3, -0.3]
		T.bX = 1.25; T.bY = hip_base - 0.55; T.spX = -0.1; T.hX = -0.9
	elif state == "sit":
		T.hip = [-1.45, -1.45]; T.knee = [1.35, 1.35]; T.sh = [-0.9, -0.9]; T.shZ = [-0.15, 0.15]; T.el = [-0.55, -0.55]
		T.bY = hip_base - 0.42; T.spX = 0.05
		k = 1.0 - exp(-dt * 20.0)
	elif state == "pet":
		phase += dt * 6.0
		T.hip = [-0.5, -0.2]; T.knee = [0.9, 0.5]; T.bY = hip_base - 0.12; T.spX = 0.45
		T.sh = [-0.2, -1.0 + sin(phase) * 0.15]; T.el = [-0.2, -0.3]; T.hX = 0.2
	elif state == "wave":
		phase += dt * 9.0
		T.hip = [0.0, 0.0]; T.knee = [0.05, 0.05]; T.bY = hip_base; T.spX = 0.0
		T.sh = [0.0, -0.4]; T.shZ = [-0.07, 2.4 + sin(phase) * 0.25]; T.el = [-0.15, 0.0]; T.hY = 0.15
	elif state == "ski":
		var P = ski_pose if ski_pose != null else {"down": 0.0, "v": 0.0, "brake": 0.0, "air": false, "push": false}
		var s := sin(t * 3.0) * 0.04
		var tuck := minf(1.0, float(P.v) / 22.0)
		var knee := 0.8 + tuck * 0.55 + float(P.brake) * 0.15
		T.hip = [-0.55 - tuck * 0.35 + s, -0.55 - tuck * 0.35 - s]; T.knee = [knee, knee]
		T.bY = hip_base - 0.1 - tuck * 0.1; T.spX = 0.38 + tuck * 0.3 - float(P.down) * 0.45
		T.sh = [-0.55 - tuck * 0.3, -0.55 - tuck * 0.3]; T.shZ = [-0.28 + tuck * 0.15, 0.28 - tuck * 0.15]; T.el = [-0.55 - tuck * 0.5, -0.55 - tuck * 0.5]
		T.hX = -0.3 - tuck * 0.2 + float(P.down) * 0.4
		if P.push:
			var ph := sin(t * 6.0)
			T.sh = [-0.9 + ph * 0.7, -0.9 + ph * 0.7]; T.spX += 0.15
		if P.air:
			T.shZ = [-0.75, 0.75]; T.sh = [-0.3, -0.3]; T.knee = [1.1, 1.1]
		if skis:
			for m in skis.g.get_children():
				var sd: float = float(m.get_meta("side"))
				m.rotation.y = lerpf(m.rotation.y, -sd * float(P.brake) * 0.28, 1.0 - exp(-dt * 10.0))
				m.position.x = sd * (0.1 + float(P.brake) * 0.08) * bulk
		k = 1.0 - exp(-dt * 12.0)
	elif state == "lift":
		T.hip = [-1.45, -1.45]; T.knee = [1.35, 1.35]; T.sh = [-0.4, -0.4]; T.shZ = [-0.2, 0.2]; T.el = [-0.9, -0.9]
		T.bY = hip_base - 0.42; T.spX = 0.0; T.hY = sin(t * 0.4) * 0.3
		k = 1.0 - exp(-dt * 20.0)
	elif state == "throw":
		T.hip = [-0.25, 0.2]; T.knee = [0.35, 0.1]; T.bY = hip_base - 0.04; T.spX = 0.18; T.spY = -0.35
		T.sh = [-0.3, -2.6]; T.shZ = [-0.3, 0.2]; T.el = [-0.3, -0.25]
		k = 1.0 - exp(-dt * 30.0)
	elif state == "bike":
		phase += dt * minf(14.0, speed * 1.5)
		T.hip = [0.0, 0.0]; T.knee = [0.0, 0.0]
		for i in 2:
			var ph := phase + i * PI
			T.hip[i] = -1.05 + sin(ph) * 0.42
			T.knee[i] = 1.25 + cos(ph) * 0.42
		T.sh = [-1.2, -1.2]; T.shZ = [0.12, -0.12]; T.el = [-0.3, -0.3]
		T.bY = hip_base - 0.16; T.spX = 0.28; T.hX = -0.2
		k = 1.0 - exp(-dt * 25.0)
	elif state == "fish":
		T.hip = [0.0, 0.0]; T.knee = [0.08, 0.08]; T.bY = hip_base; T.spX = 0.06
		T.sh = [-0.85, -0.85]; T.shZ = [0.32, -0.32]; T.el = [-0.55, -0.55]
		T.hY = sin(t * 0.5) * 0.1
	else:
		T.hip = [0.0, 0.0]; T.knee = [0.05, 0.05]; T.sh = [0.03, 0.03]; T.el = [-0.18, -0.18]
		T.bY = hip_base + sin(t * 1.8) * 0.004; T.spX = 0.02 + sin(t * 1.8) * 0.01
		T.hY = sin(t * 0.35) * 0.35 * maxf(0.0, sin(t * 0.13))
	if carry_obj and state != "sit" and state != "bike":
		T.sh = [-1.0, -1.0]; T.shZ = [0.34, -0.34]; T.el = [-0.85, -0.85]
	if pushing and (state == "walk" or state == "idle"):
		T.sh = [-1.15, -1.15]; T.shZ = [0.2, -0.2]; T.el = [-0.25, -0.25]; T.spX += 0.12; T.spY *= 0.4
	if wings:
		var f := sin(t * (9.0 if state == "run" or state == "jump" else 2.2)) * 0.35
		wings[0].rotation.y = 0.35 + f; wings[1].rotation.y = -0.35 - f
	for i in 2:
		pose.hip[i] = lerpf(pose.hip[i], T.hip[i], k); pose.knee[i] = lerpf(pose.knee[i], T.knee[i], k)
		pose.sh[i] = lerpf(pose.sh[i], T.sh[i], k); pose.shZ[i] = lerpf(pose.shZ[i], T.shZ[i], k); pose.el[i] = lerpf(pose.el[i], T.el[i], k)
		if legs[i].hip: legs[i].hip.rotation.x = pose.hip[i]
		if legs[i].knee: legs[i].knee.rotation.x = pose.knee[i]
		if arms[i].sh:
			arms[i].sh.rotation.x = pose.sh[i]
			arms[i].sh.rotation.z = pose.shZ[i]
		if arms[i].el: arms[i].el.rotation.x = pose.el[i]
	for key in ["spX", "spY", "bY", "bX", "hX", "hY"]: pose[key] = lerpf(pose[key], T[key], k)
	body.position.y = pose.bY
	body.rotation.x = pose.bX
	spine.rotation.x = pose.spX
	spine.rotation.y = pose.spY
	head.rotation.x = pose.hX
	head.rotation.y = pose.hY - pose.spY * 0.8
	if tail: tail.rotation.y = sin(t * (1.5 if state == "idle" else 4.0)) * 0.25
	if state == "bike" and pedal != null: pedal_ik()
	if scarf != null: anim_scarf(dt)

func pedal_ik() -> void:
	var Pd = pedal
	var hy := body.position.y
	var L1 := 0.3
	var L2 := Vector2(0.35, 0.05).length()
	var dl := atan2(0.05, 0.35)
	for i in 2:
		var s := -1.0 if i == 0 else 1.0
		var a: float = float(Pd.a)
		var vy: float = float(Pd.cy) + s * float(Pd.r) * cos(a) + 0.035 - hy
		var vz: float = float(Pd.cz) + s * float(Pd.r) * sin(a)
		var D := minf(L1 + L2 - 0.004, maxf(0.08, Vector2(vy, vz).length()))
		var av := atan2(-vz, -vy)
		var al := acos(clampf((L1 * L1 + D * D - L2 * L2) / (2.0 * L1 * D), -1.0, 1.0))
		var be := PI - acos(clampf((L1 * L1 + L2 * L2 - D * D) / (2.0 * L1 * L2), -1.0, 1.0))
		var hip := av - al
		var knee := be + dl
		legs[i].hip.rotation.x = hip; legs[i].knee.rotation.x = knee
		pose.hip[i] = hip; pose.knee[i] = knee

func anim_scarf(dt: float) -> void:
	if not root.is_inside_tree(): return
	var p := root.global_position
	var yaw := root.rotation.y
	var sp := 0.0
	var turn := 0.0
	var up := 0.0
	if last_pos != null and dt > 0.0:
		sp = minf(30.0, Vector2(p.x - last_pos.x, p.z - last_pos.z).length() / dt)
		up = (p.y - last_pos.y) / dt
		var dy := yaw - last_yaw
		dy = atan2(sin(dy), cos(dy))
		turn = dy / dt
	last_pos = p; last_yaw = yaw
	var st := minf(dt, 0.05)
	for i in scarf.size():
		var s: Dictionary = scarf[i]
		var tg := 0.12 + minf(1.45, sp * 0.085) + clampf(-up * 0.05, -0.4, 0.5)
		var flut := sin(t * (13.0 + i * 3) + i) * minf(0.35, sp * 0.02) if sp > 2.0 else 0.0
		s.v += ((tg + flut) - s.a) * 60.0 * st - s.v * 7.0 * st
		s.a += s.v * st
		var side := clampf(-turn * 0.12, -0.6, 0.6)
		s.bv += (side - s.b) * 40.0 * st - s.bv * 6.0 * st
		s.b += s.bv * st
		s.p1.rotation = Vector3(s.a, 0, s.b)
		s.p2.rotation = Vector3(s.a * 0.6 + flut * 0.8, 0, s.b * 0.5)

func set_name_tag(text: String, color: Color = Color("#d8ffc8")) -> void:
	if name_tag == null:
		name_tag = Label3D.new()
		name_tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		name_tag.font_size = 48
		name_tag.pixel_size = 0.005
		name_tag.outline_size = 12
		name_tag.no_depth_test = false
		name_tag.position.y = 2.1
		name_tag.visibility_range_end = 60.0
		root.add_child(name_tag)
	name_tag.text = text
	name_tag.modulate = color
