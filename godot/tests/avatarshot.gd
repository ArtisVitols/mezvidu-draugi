extends Node3D
## Dzīvnieku ekrānuzņēmums: -- --autotest=avatarshot
func _ready() -> void:
	Env.make(self)
	var ground := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(40, 40); ground.mesh = pm
	var gm := StandardMaterial3D.new(); gm.albedo_color = Color(0.35, 0.55, 0.25); ground.material_override = gm; add_child(ground)
	var list := [
		{"animal": "lacis", "fur": "#8b5a2b", "shirt": "#d23b3b", "hat": "kronis", "wear": {"glasses": "saulesbrilles"}, "st": "idle"},
		{"animal": "lapsa", "fur": "#e8742a", "shirt": "#2f6fd6", "hat": "nagene", "wear": {"top": "svitrains", "back": "mugursoma"}, "st": "walk"},
		{"animal": "zakis", "fur": "#d9d2c5", "shirt": "#2fa84f", "hat": null, "wear": {"neck": "taurenitis", "feet": "kedas"}, "st": "run"},
		{"animal": "kakis", "fur": "#7a4fb5", "shirt": "#f2c12e", "hat": "pirats", "wear": {"top": "latvija"}, "st": "wave"},
		{"animal": "cuka", "fur": "#f2a7b5", "shirt": "#ffffff", "hat": "vainags", "wear": {}, "st": "sit"},
		{"animal": "pile", "fur": "#f5f0e0", "shirt": "#9b3bd2", "hat": "salmu", "wear": {"back": "sparni"}, "st": "jump"},
		{"animal": "varde", "fur": "#5fae4a", "shirt": "#222222", "hat": "cilindrs", "wear": {"top": "zvaigznes"}, "st": "fish"},
		{"animal": "suns", "fur": "#c89b5e", "shirt": "#f07b2a", "hat": "kovbojs", "wear": {}, "st": "idle"},
	]
	var avs := []
	for i in list.size():
		var p: Dictionary = list[i]
		var a := Avatar.make(p)
		add_child(a.root)
		a.root.position = Vector3((i % 4) * 1.6 - 2.4, 0, -(i / 4) * 1.8)
		a.set_name_tag(p.animal)
		if i == 3: a.set_winter(true)
		avs.append([a, p.st])
	for f in 40:
		for x in avs: x[0].animate(0.03, x[1], 3.0)
		await get_tree().process_frame
	var cam := Camera3D.new(); add_child(cam)
	cam.look_at_from_position(Vector3(0.5, 2.6, 5.5), Vector3(0, 0.8, -0.9), Vector3.UP)
	for i in 4: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(Game.arg("out", "user://avatars.png"))
	print("[avatarshot] gatavs")
	get_tree().quit()
