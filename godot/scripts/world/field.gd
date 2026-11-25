class_name Field
extends RefCounted
## Daudz vienādu objektu (web InstanceField): katram veidam un katram veidnes sietam — MultiMesh.
## items: [{id, kind, x, y, z, ry, s}]; set_hidden(id, true) → instance saspiesta līdz 0.
var parent: Node3D
var where = {}      # id → [[MultiMesh, nr], …]
var xf = {}         # id → Transform3D (bez paslēpšanas)
var hidden = {}

func build(items: Array, tpl: Callable, p: Node3D, hide_name: String = "") -> void:
	parent = p
	var by_kind = {}
	for it in items:
		var k = str(it.kind)
		if not by_kind.has(k): by_kind[k] = []
		by_kind[k].append(it)
	for k in by_kind:
		var t: Node3D = tpl.call(k)
		if t == null: continue
		var parts: Array = []   # [mesh, local xf, vārds]
		_collect(t, Transform3D.IDENTITY, parts, true)
		if hide_name != "":
			# paslēpj tikai daļas ar šo vārdu (piem. ogas krūmā)
			for part in parts: part.append(_under(t, part[2], hide_name))
		var list: Array = by_kind[k]
		for part in parts:
			var mm = MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = part[0]
			mm.instance_count = list.size()
			var mmi = MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			p.add_child(mmi)
			for i in list.size():
				var it: Dictionary = list[i]
				var s: float = float(it.get("s", 1.0))
				var x = Transform3D(Basis(Vector3.UP, float(it.get("ry", 0.0))).scaled(Vector3(s, s, s)), Vector3(float(it.x), float(it.y), float(it.z))) * part[1]
				mm.set_instance_transform(i, x)
				var id = it.id
				if hide_name != "" and not part[3]: continue
				if not where.has(id): where[id] = []
				where[id].append([mm, i, x])

static func _collect(n: Node, acc: Transform3D, out: Array, is_root := false) -> void:
	var t: Transform3D = acc if is_root else acc * (n as Node3D).transform
	if n is MeshInstance3D and (n as MeshInstance3D).mesh and str(n.name) != "shadow" and (n as Node3D).visible:
		out.append([(n as MeshInstance3D).mesh, t, n])
	for c in n.get_children():
		if c is Node3D: _collect(c, t, out)

static func _under(root: Node, n: Node, name: String) -> bool:
	while n != null and n != root:
		if str(n.get_meta("n", n.name)) == name: return true
		n = n.get_parent()
	return false

func set_hidden(id, h: bool) -> void:
	if bool(hidden.get(id, false)) == h: return
	hidden[id] = h
	for e in where.get(id, []):
		(e[0] as MultiMesh).set_instance_transform(e[1], Transform3D(Basis().scaled(Vector3.ZERO), Vector3(0, -1000, 0)) if h else e[2])
