extends Node
## Grafika: līmeņi, manuālie iestatījumi, mērītājs, iestatījumu panelis: -- --autotest=quality [--shot=path]
func _ready() -> void:
	Game.set_item("mezvidi_gfx_custom", {})
	var r := Game.load_save("Grafiķis", "")
	var s: Dictionary = r.save
	s.zone = "e"
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 5: await get_tree().process_frame
	var fails := 0
	var vp := get_viewport()
	for m in ["high", "mid", "low", "lowest", "auto"]:
		g.setQualityMode(m)
		print("[quality] %s → %s mērogs %.2f ēnas %s tālums %.0f" % [m, g.qualityLabel(), vp.scaling_3d_scale, g.sun.shadow_enabled, g.camera.far])
	g.setQualityMode("low")
	if g.sun.shadow_enabled == false: fails += 1
	g.setCustom("shadow", 0); g.setCustom("scale", 0.5); g.setCustom("dist", 1.5); g.setCustom("fps", 30)
	print("[quality] pielāgots: ", g.qualityLabel(), " ēnas ", g.sun.shadow_enabled, " mērogs ", vp.scaling_3d_scale, " tālums ", g.camera.far, " fps ", Engine.max_fps)
	if g.sun.shadow_enabled or absf(vp.scaling_3d_scale - 0.5) > 0.01 or Engine.max_fps != 30 or absf(g.camera.far - 510) > 1: fails += 1
	g.toggleStats(true)
	for i in 20: await get_tree().process_frame
	print("[quality] mērītājs: ", g.statsLabel.text.replace("\n", " | "))
	g.openSettings()
	for i in 3: await get_tree().process_frame
	var shot := Game.arg("shot")
	if shot != "":
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
	Game.set_item("mezvidi_gfx_custom", {}); Game.set_item("mezvidi_gfx", "auto"); Game.set_item("mezvidi_stats", "0")
	Engine.max_fps = 0
	print("[quality] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
