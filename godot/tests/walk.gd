extends Node
## Spēle vienatnē: ielāde, iešana mežā, ekrānuzņēmums: -- --autotest=walk [--zone=e] [--shot=path]
func _ready() -> void:
	var r := Game.load_save("Testers", "")
	var s: Dictionary = r.save
	s.zone = Game.arg("zone", "e"); s.pos = {"x": 5, "z": 30}
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	var t0 := Time.get_ticks_msec()
	await g.init_game(func(f, t): print("[walk] %d%% %s" % [int(f * 100), t]))
	UI.loading.visible = false
	g.start_game()
	print("[walk] ielādēts %d ms, zeme %s, pozīcija %s" % [Time.get_ticks_msec() - t0, g.zone, g.me.pos])
	# ejam uz priekšu 3 s
	UI.touch.move = Vector2(0, 1)
	for i in 90: await get_tree().process_frame
	UI.touch.move = Vector2.ZERO
	print("[walk] pēc iešanas: ", g.me.pos, " stāvoklis ", g.me.state, " darbība ", g.currentAction.label if g.currentAction else "-")
	for i in 5: await get_tree().process_frame
	var shot := Game.arg("shot")
	if shot != "":
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
		print("[walk] ekrānuzņēmums ", shot)
	get_tree().quit()
