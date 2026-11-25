class_name BoneSync
extends Node
## Kauli = parastas Node3D grupas (kā web versijā: animācija groza grupas); katru kadru to lokālās
## transformācijas tiek pārnestas uz Skeleton3D kaulu pozām.
var skel: Skeleton3D
var groups: Array = []

func _process(_dt: float) -> void:
	if skel == null or not skel.is_visible_in_tree(): return
	for k in groups.size():
		var g: Node3D = groups[k]
		if g: skel.set_bone_pose(k, g.transform)
