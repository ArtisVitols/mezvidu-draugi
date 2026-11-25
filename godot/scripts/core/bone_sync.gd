class_name BoneSync
extends Node
## Kauli = parastas Node3D grupas (animācija groza grupas); katru kadru to lokālās transformācijas → Skeleton3D pozas.
## Ceļi relatīvi (eksportēti), lai modeļa kopija (duplicate) strādā bez papildu sasaistīšanas.
@export var skel_path: NodePath
@export var group_paths: Array[NodePath] = []
var skel: Skeleton3D
var groups: Array = []

func _ready() -> void:
	_bind()

func _bind() -> void:
	skel = get_node_or_null(skel_path) as Skeleton3D
	groups = []
	for p in group_paths: groups.append(get_node_or_null(p) if not p.is_empty() else null)

func _process(_dt: float) -> void:
	if skel == null:
		_bind()
		if skel == null: return
	if not skel.is_visible_in_tree(): return
	for k in groups.size():
		var g: Node3D = groups[k]
		if g: skel.set_bone_pose(k, g.transform)
