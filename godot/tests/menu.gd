extends Node
## Izvēlne: vārds → tēls → istaba → spēlēt vienam: -- --autotest=menu --out=dir
var out := ""
func shot(n: String) -> void:
	for i in 4: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	if out != "": get_viewport().get_texture().get_image().save_png("%s/menu_%s.png" % [out, n])
func _ready() -> void:
	out = Game.arg("out")
	var m := Menu.new()
	add_child(m)
	await shot("1")
	m.save = Game.load_save("Izvēlne", "").save; m.save.name = "Izvēlne"
	m.showChar()
	await shot("2")
	m.showRoom()
	await shot("3")
	m._solo()
	var t0 := Time.get_ticks_msec()
	while is_instance_valid(m) and Time.get_ticks_msec() - t0 < 120000: await get_tree().process_frame
	var g = null
	for c in get_children(): if c is Play: g = c
	await shot("4")
	print("[menu] ", "VISS IZDEVĀS" if g != null and g.controls != null else "NEIZDEVĀS")
	get_tree().quit()
