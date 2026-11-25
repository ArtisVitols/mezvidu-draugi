extends Node3D
## Zemes ekrānuzņēmums: -- --autotest=landshot --land=forest --view=x,y,z,tx,ty,tz
func _ready() -> void:
	var land := Game.arg("land", "forest")
	var t0 := Time.get_ticks_msec()
	var ws := WebScene.open("land_" + land)
	var root := ws.build()
	add_child(root)
	print("[landshot] uzbūvēts %d ms, mezgli %d" % [Time.get_ticks_msec() - t0, ws.j.nodes.size()])
	Env.make(self)
	if Game.arg("photo") != "": Mats.terrain().set_shader_parameter("photo", float(Game.arg("photo")))
	var cam := Camera3D.new()
	cam.fov = 60; cam.near = 0.2; cam.far = 450
	add_child(cam)
	var v := Game.arg("view", "30,25,60,0,8,0").split(",")
	cam.look_at_from_position(Vector3(float(v[0]), float(v[1]), float(v[2])), Vector3(float(v[3]), float(v[4]), float(v[5])), Vector3.UP)
	for i in 6: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var out := Game.arg("out", "user://shot_%s.png" % land)
	img.save_png(out)
	print("[landshot] saglabāts ", ProjectSettings.globalize_path(out))
	get_tree().quit()
