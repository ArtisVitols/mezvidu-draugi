extends Node
## Mašīna: iekāpt, braukt, izkāpt: -- --autotest=drive [--veh=car1] [--shot=path]
func _ready() -> void:
	var r := Game.load_save("Braucējs", "")
	var s: Dictionary = r.save
	var vid := Game.arg("veh", "car1")
	var vd: Dictionary = {}
	for d in Game.C.vehicles.VEHICLES: if d.id == vid: vd = d
	s.zone = vd.zone; s.pos = {"x": float(vd.x) + 1.5, "z": float(vd.z) + 1.0}
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 10: await get_tree().process_frame
	var fails := 0
	g.timers.action = 0.0; g.refreshAction()
	print("[drive] darbība: ", g.currentAction.label if g.currentAction else "-")
	g.doAction()
	for i in 10: await get_tree().process_frame
	if g.me.veh == null:
		fails += 1; print("[drive] ❌ neiekāpa")
	else:
		var p0: Vector3 = g.me.pos
		for i in 120:
			g.updateVehicle(1.0 / 30.0, {"x": 0.0, "y": 1.0, "run": false})
			await get_tree().process_frame
		print("[drive] nobrauca %.1f m, ātrums %.1f" % [p0.distance_to(g.me.pos), g.me.veh.speed])
		if p0.distance_to(g.me.pos) < 5: fails += 1
		var shot := Game.arg("shot")
		if shot != "":
			for i in 5: await get_tree().process_frame
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(shot)
		print("[drive] pirms izkāpšanas pos ", g.me.pos, " zone ", g.zone)
		g.exitVehicle()
		for i in 5: await get_tree().process_frame
		print("[drive] izkāpa, stāv: ", g.vehs[vid].zone, " ", g.vehs[vid].x, ",", g.vehs[vid].z, " d=", g.vehs[vid].d)
		if g.me.veh != null or int(g.vehs[vid].d) != -1: fails += 1
	print("[drive] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
