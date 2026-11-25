extends Node
## Zemju maiņa ar renderēšanu (Xvfb): ejot pāri robežai uz ziemu un atpakaļ, atmiņa un kļūdas. -- --autotest=zonemem
var g
func mem() -> String:
	return "RAM %d MB, video %d MB, objekti %d" % [OS.get_static_memory_usage() / 1048576, Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576, Performance.get_monitor(Performance.OBJECT_COUNT)]
func _ready() -> void:
	var s: Dictionary = Game.default_save("Zemes"); s.name = "Zemes"; s.zone = "c"
	var net := Net.new(); net.start_offline()
	g = Play.new(); g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 20: await get_tree().process_frame
	print("[zonemem] sākums c: ", mem())
	var peak := 0
	var fails := 0
	for z in ["n", "c", "n", "e", "n", "s", "n", "w", "c"]:
		# iet pāri robežai kā spēlētājs (travel), nevis teleportējas
		var t0 := Time.get_ticks_msec()
		if z == "n" and g.zone == "c":
			g.me.pos = Vector3(0, 0, -g.ZONE_HALF - 4.0); g.travel("n", "n")
		else: g.teleport(z, Vector2(0, 0), 0.0)
		while (g.zoneBusy or g.zone != z) and Time.get_ticks_msec() - t0 < 60000:
			peak = maxi(peak, OS.get_static_memory_usage())
			await get_tree().process_frame
		for i in 60:
			peak = maxi(peak, OS.get_static_memory_usage())
			await get_tree().process_frame
		if g.zone != z: fails += 1
		print("[zonemem] %s → %s" % [z, mem()])
	print("[zonemem] maksimālā RAM %d MB" % (peak / 1048576))
	print("[zonemem] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
