extends Node
## Sēta: uzart, iesēt, aplaistīt ar darbības pogu: -- --autotest=farm [--shot=path]
func _ready() -> void:
	var r := Game.load_save("Fermeris", "")
	var s: Dictionary = r.save
	s.zone = "c"; s.pos = {"x": -37.5, "z": -18.0}
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 10: await get_tree().process_frame
	print("[farm] slot ", g.mySlot, " zone ", g.zone, " pos ", g.me.pos)
	var fails := 0
	for step in ["⛏️ Uzart", "🌱 Sēt", "💧 Aplaistīt"]:
		g.timers.action = 0.0
		g.refreshAction()
		var a = g.currentAction
		var label = a.label if a else "-"
		print("[farm] darbība: ", label)
		if a == null or not str(label).begins_with(step):
			fails += 1; print("[farm] ❌ gaidīju ", step)
		else: g.doAction()
		for i in 3: await get_tree().process_frame
	print("[farm] lauciņi: ", g.save.farm.t, " monētas ", g.save.coins, " xp ", g.save.gd)
	for i in 20: await get_tree().process_frame
	print("[farm] augi: ", g.farmRen[0].plants.size(), " augsne: ", g.farmRen[0].soil != null)
	var shot := Game.arg("shot")
	if shot != "":
		g.cam.yaw = 0.8; g.cam.pitch = 0.5; g.cam.dist = 6
		for i in 10: await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
	print("[farm] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
