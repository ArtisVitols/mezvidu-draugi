class_name WebScene
extends RefCounted
## Ielādē no web versijas izgāztu three.js objektu koku (tools/export/dump.js: <vārds>.json + <vārds>.bin)
## un uzbūvē Godot mezglus. three.js trijstūri ir pretēji (CCW) — šeit apgriežam; UV v apgriežam (flipY faktūrām).
## Materiāli: Mats.from_web(apraksts, faktūras) — visi caur dažiem šeideriem (Mats).

var j: Dictionary
var bin: PackedByteArray
var texs := {}          # indekss → Texture2D
var meshes := {}        # "geo:mat" → ArrayMesh
var mats := {}          # indekss → Material
var nodes: Array = []   # izveidotie mezgli pēc indeksa
var base := "res://web/"

static func open(name: String) -> WebScene:
	var w := WebScene.new()
	var f := FileAccess.open(w.base + name + ".json", FileAccess.READ)
	if f == null:
		push_error("WebScene: nav " + name)
		return null
	w.j = JSON.parse_string(f.get_as_text())
	w.bin = FileAccess.get_file_as_bytes(w.base + name + ".bin")
	return w

func buf(i: int) -> PackedByteArray:
	var b: Array = j.bufs[i]
	return bin.slice(int(b[0]), int(b[0]) + int(b[1]))

func f32(i: int) -> PackedFloat32Array: return buf(i).to_float32_array()

func ints(i: int, kind: String) -> PackedInt32Array:
	var b := buf(i)
	var out := PackedInt32Array()
	match kind:
		"u16":
			var n := b.size() / 2
			out.resize(n)
			for k in n: out[k] = b.decode_u16(k * 2)
		"u32", "i32":
			out = b.to_int32_array()
		"u8":
			out.resize(b.size())
			for k in b.size(): out[k] = b[k]
		_:
			var fl := b.to_float32_array()
			out.resize(fl.size())
			for k in fl.size(): out[k] = int(fl[k])
	return out

func attr_f(a: Dictionary) -> PackedFloat32Array:
	var k: String = a.k
	if k == "f32": return f32(int(a.b))
	var iv := ints(int(a.b), k)
	var out := PackedFloat32Array()
	out.resize(iv.size())
	var sc := 1.0
	if a.get("norm", false): sc = 1.0 / (65535.0 if k == "u16" else 255.0 if k == "u8" else 1.0)
	for q in iv.size(): out[q] = iv[q] * sc
	return out

func tex(i: int) -> Texture2D:
	if i < 0: return null
	if texs.has(i): return texs[i]
	var d: Dictionary = j.texs[i]
	var t: Texture2D = null
	if d.has("png"):
		var img := Image.new()
		img.load_png_from_buffer(buf(int(d.png)))
		img.generate_mipmaps()
		t = ImageTexture.create_from_image(img)
	elif d.has("src"):
		var p: String = "res://assets" + str(d.src).trim_prefix("/assets")
		if ResourceLoader.exists(p): t = load(p)
	texs[i] = t
	return t

func mat(i: int, hint: String = "") -> Material:
	var key := "%d%s" % [i, hint]
	if mats.has(key): return mats[key]
	var m := Mats.from_web(j.mats[i], self, hint)
	mats[key] = m
	return m

# ģeometrija + materiāls → ArrayMesh (virsmas pa grupām, ja materiālu saraksts)
func mesh(gi: int, mref) -> ArrayMesh:
	var key := "%d:%s" % [gi, str(mref)]
	if meshes.has(key): return meshes[key]
	var g: Dictionary = j.geos[gi]
	var A: Dictionary = g.a
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	var P := attr_f(A.position)
	var nv := P.size() / 3
	var V := PackedVector3Array(); V.resize(nv)
	for k in nv: V[k] = Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2])
	arr[Mesh.ARRAY_VERTEX] = V
	if A.has("normal"):
		var N := attr_f(A.normal)
		var NV := PackedVector3Array(); NV.resize(nv)
		for k in nv: NV[k] = Vector3(N[k * 3], N[k * 3 + 1], N[k * 3 + 2])
		arr[Mesh.ARRAY_NORMAL] = NV
	if A.has("uv"):
		var U := attr_f(A.uv)
		var UV := PackedVector2Array(); UV.resize(nv)
		for k in nv: UV[k] = Vector2(U[k * 2], 1.0 - U[k * 2 + 1])
		arr[Mesh.ARRAY_TEX_UV] = UV
	if A.has("color"):
		var C := attr_f(A.color)
		var n: int = int(A.color.n)
		var CV := PackedColorArray(); CV.resize(nv)
		var cn := C.size() / n
		for k in nv:
			var q := mini(k, cn - 1) * n
			CV[k] = Color(C[q], C[q + 1] if n > 1 else C[q], C[q + 2] if n > 2 else C[q], C[q + 3] if n == 4 else 1.0)
		arr[Mesh.ARRAY_COLOR] = CV
	var flags := 0
	# CUSTOM0: splat (zeme) vai pbr+sway (rotaļlietu materiāls) vai rm (apvienotie)
	var c0 := PackedFloat32Array()
	if A.has("splat"):
		c0 = attr_f(A.splat)
	elif A.has("pbr"):
		var pb := attr_f(A.pbr)
		var sw := attr_f(A.sway) if A.has("sway") else PackedFloat32Array()
		c0.resize(nv * 4)
		for k in nv:
			c0[k * 4] = pb[k * 3]; c0[k * 4 + 1] = pb[k * 3 + 1]; c0[k * 4 + 2] = pb[k * 3 + 2]
			c0[k * 4 + 3] = sw[k] if sw.size() > k else 0.0
	elif A.has("rm"):
		var rm := attr_f(A.rm)
		var rn: int = int(A.rm.n)
		c0.resize(nv * 4)
		for k in nv:
			c0[k * 4] = rm[k * rn]; c0[k * 4 + 1] = rm[k * rn + 1] if rn > 1 else 0.0; c0[k * 4 + 2] = 0.0; c0[k * 4 + 3] = 0.0
	if c0.size() == nv * 4:
		arr[Mesh.ARRAY_CUSTOM0] = c0
		flags |= Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
	# CUSTOM1: koku sugas (aSpecies) u.c. skalāri
	for extra in ["aSpecies", "aOff"]:
		if A.has(extra) and int(A[extra].c) == nv:
			var e := attr_f(A[extra])
			var en: int = int(A[extra].n)
			var c1 := PackedFloat32Array(); c1.resize(nv * 4)
			for k in nv:
				for q in mini(en, 4): c1[k * 4 + q] = e[k * en + q]
			arr[Mesh.ARRAY_CUSTOM1] = c1
			flags |= Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT
			break
	if A.has("skinIndex"):
		arr[Mesh.ARRAY_BONES] = ints(int(A.skinIndex.b), A.skinIndex.k)
		arr[Mesh.ARRAY_WEIGHTS] = attr_f(A.skinWeight)
	var hint := "splat" if A.has("splat") else "toy" if A.has("pbr") else "rm" if A.has("rm") else ""
	var I := PackedInt32Array()
	if g.has("i"):
		I = ints(int(g.i), g.ik)
	else:
		I.resize(nv)
		for k in nv: I[k] = k
	# CCW → CW
	for t in range(0, I.size() - 2, 3):
		var x := I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x
	var am := ArrayMesh.new()
	var groups = g.get("gr")
	var mlist: Array = mref if mref is Array else [mref]
	if groups is Array and mref is Array:
		for gr in groups:
			var s0: int = int(gr[0]); var cnt: int = int(gr[1]); var mi: int = int(gr[2])
			var a2 := arr.duplicate()
			a2[Mesh.ARRAY_INDEX] = I.slice(s0, s0 + cnt)
			am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a2, [], {}, flags)
			am.surface_set_material(am.get_surface_count() - 1, mat(int(mlist[mini(mi, mlist.size() - 1)]), hint))
	else:
		arr[Mesh.ARRAY_INDEX] = I
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
		am.surface_set_material(0, mat(int(mlist[0]), hint))
	meshes[key] = am
	return am

static func xf(tr: Array) -> Transform3D:
	var q := Quaternion(float(tr[3]), float(tr[4]), float(tr[5]), float(tr[6]))
	var b := Basis(q).scaled(Vector3(float(tr[7]), float(tr[8]), float(tr[9])))
	return Transform3D(b, Vector3(float(tr[0]), float(tr[1]), float(tr[2])))

static func m4(e: PackedFloat32Array, o: int) -> Transform3D:
	# three.js Matrix4.elements — kolonnu secībā
	return Transform3D(Basis(Vector3(e[o], e[o + 1], e[o + 2]), Vector3(e[o + 4], e[o + 5], e[o + 6]), Vector3(e[o + 8], e[o + 9], e[o + 10])), Vector3(e[o + 12], e[o + 13], e[o + 14]))

## Uzbūvē visu koku. skip(node_dict) → true izlaiž mezglu ar bērniem.
func build(skip: Callable = Callable()) -> Node3D:
	nodes.resize(j.nodes.size())
	var root: Node3D = null
	for i in j.nodes.size():
		var d: Dictionary = j.nodes[i]
		var p: int = int(d.p)
		if p >= 0 and nodes[p] == null:
			nodes[i] = null
			continue
		if (skip.is_valid() and skip.call(d)) or is_impostor(d):
			nodes[i] = null
			continue
		var n := _make(d)
		nodes[i] = n
		if p >= 0: (nodes[p] as Node).add_child(n)
		else: root = n
	# kauli
	for i in j.nodes.size():
		var d: Dictionary = j.nodes[i]
		if d.has("skin") and nodes[i] != null: _skin(i, d)
	return root

# web tālie koki (InstancedBufferGeometry ar aOff) — Godot pusē savi
func is_impostor(d: Dictionary) -> bool:
	if not d.has("g"): return false
	var A: Dictionary = j.geos[int(d.g)].a
	return A.has("aOff")

func _make(d: Dictionary) -> Node3D:
	var n: Node3D
	var t: String = d.t
	if d.has("inst"):
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		var ic: Dictionary = d.inst
		mm.use_colors = ic.has("col")
		mm.mesh = mesh(int(d.g), d.m)
		mm.instance_count = int(ic.n)
		var M := f32(int(ic.mat))
		var C := f32(int(ic.col)) if ic.has("col") else PackedFloat32Array()
		for k in mm.instance_count:
			mm.set_instance_transform(k, m4(M, k * 16))
			if mm.use_colors: mm.set_instance_color(k, Color(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		n = mmi
	elif d.has("g") and (t == "Mesh" or t == "SkinnedMesh"):
		var mi := MeshInstance3D.new()
		mi.mesh = mesh(int(d.g), d.m)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if d.get("cs", false) else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		n = mi
	elif t == "Sprite":
		n = _sprite(d)
	else:
		n = Node3D.new()
	n.name = (str(d.n) if str(d.n) != "" else t).validate_node_name()
	n.transform = xf(d.tr)
	n.visible = d.get("v", true)
	if d.has("ud"): n.set_meta("ud", d.ud)
	if d.has("lay") and n is VisualInstance3D:
		# three.js 1. slānis = sīkumi (atspulgs tos neredz) → Godot 2. bits
		var lm: int = int(d.lay)
		(n as VisualInstance3D).layers = (1 if lm & 1 else 0) | (2 if lm & 2 else 0)
	return n

func _sprite(d: Dictionary) -> Node3D:
	var s := Sprite3D.new()
	var md: Dictionary = j.mats[int(d.m)] if d.m is float or d.m is int else {}
	var tx := tex(int(md.get("map", -1)))
	s.texture = tx
	s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	s.shaded = false
	s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISABLED
	s.transparent = true
	s.modulate.a = float(md.get("op", 1.0))
	s.no_depth_test = not md.get("dt", true)
	if tx: s.pixel_size = 1.0 / float(tx.get_height())
	return s

func _skin(i: int, d: Dictionary) -> void:
	var mi: MeshInstance3D = nodes[i]
	var sk: Dictionary = d.skin
	var bones: Array = sk.bones
	var root_i: int = int(bones[0])
	var root: Node3D = nodes[root_i]
	var skel := Skeleton3D.new()
	skel.name = "Skel"
	root.add_child(skel)
	var inv := f32(int(sk.inv))
	var skin := Skin.new()
	var bi := {}
	for k in bones.size():
		var ni: int = int(bones[k])
		var bn: Node3D = nodes[ni] if ni >= 0 else null
		skel.add_bone("b%d_%s" % [k, bn.name if bn else "x"])
		bi[ni] = k
		var par: int = int(j.nodes[ni].p) if ni >= 0 else -1
		if k > 0 and bi.has(par): skel.set_bone_parent(k, bi[par])
		skel.set_bone_rest(k, Transform3D.IDENTITY if k == 0 else (bn.transform if bn else Transform3D.IDENTITY))
		skin.add_bind(k, m4(inv, k * 16))
	skel.reset_bone_poses()
	mi.get_parent().remove_child(mi)
	skel.add_child(mi)
	mi.transform = Transform3D.IDENTITY
	mi.skin = skin
	mi.skeleton = NodePath("..")
	var drv := BoneSync.new()
	drv.name = "BoneSync"
	drv.skel = skel
	for k in bones.size():
		var ni: int = int(bones[k])
		drv.groups.append(nodes[ni] if ni >= 0 and k > 0 else null)
	root.add_child(drv)
