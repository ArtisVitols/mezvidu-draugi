extends Node
## Ziema: pacēlājs, slēpošana, pikas: -- --autotest=winter [--shot=path]
func _ready() -> void:
	var r := Game.load_save("Slēpotājs", "")
	var s: Dictionary = r.save
	s.zone = "n"; s.pos = {"x": 42.0, "z": 66.0}
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
	print("[winter] zeme ", g.zone, " pos ", g.me.pos, " augstums ", g.terr.get_height(g.me.pos.x, g.me.pos.z))
	g.timers.action = 0.0; g.refreshAction()
	print("[winter] darbība: ", g.currentAction.label if g.currentAction else "-")
	if g.currentAction and str(g.currentAction.label).begins_with("🚡"): g.doAction()
	else: fails += 1
	var n := 0
	while g.me.lift != null and n < 4000:
		g.updateLift(0.05); n += 1
	print("[winter] augšā pēc %d soļiem, slēpes %s, pos %s" % [n, g.me.ski != null, g.me.pos])
	if g.me.ski == null: fails += 1
	var z0: float = g.me.pos.z
	for i in 600: g.updateSki(1.0 / 30.0, {"x": 0.0, "y": 0.0, "run": false}, false)
	print("[winter] nobrauca %.0f m, ātrums %.1f" % [g.me.pos.z - z0, g.me.ski.v if g.me.ski else -1.0])
	if g.me.pos.z - z0 < 30: fails += 1
	for i in 30: await get_tree().process_frame
	var W = g.terr
	print("[winter] slēpotāji ", W.skiers.size(), " brieži ", W.deer.size(), " mērķi ", W.targets.size())
	var shot := Game.arg("shot")
	if shot != "":
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
	print("[winter] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
