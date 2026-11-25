extends Node
## Piedzīvojumu taka: lāča malka ar īstu darbības pogu, šķērslis, strauts bez tilta, neizdošanās, laivas vārti: -- --autotest=trail [--shot=path]
var fails := 0
func ok(c: bool, what: String) -> void:
	print("[trail] ", "✅ " if c else "❌ ", what)
	if not c: fails += 1

func _ready() -> void:
	var r := Game.load_save("Taciņa", "")
	var s: Dictionary = r.save
	s.zone = "s"; s.pos = {"x": 0.0, "z": -280.0}; s.erase("trail"); s.coins = 0; s.erase("vehs")
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 10: await get_tree().process_frame
	var Z: TrailLand = g.terr
	ok(Z is TrailLand and Z.built, "zeme uzbūvēta, NPC %d, bultas %d, šķēršļi %d" % [Z.npcs.size(), Z.arrows.size(), Z.obs.size()])
	ok(Z.npcs.size() == 7 and Z.obs.size() == Z.lay.obst.size(), "7 NPC un visi šķēršļi")
	var st0: Dictionary = Z.lay.stops[0]
	var place := func(x: float, z: float) -> void:
		g.me.pos = Vector3(x, Z.ground_at(x, z), z); Z.reset_lp(); g.timers.action = 0.0; g.refreshAction()
	place.call(float(st0.x) + 1.5, float(st0.z) + 1.0)
	ok(g.currentAction != null and str(g.currentAction.label).begins_with("💬"), "pie lāča: %s" % (g.currentAction.label if g.currentAction else "-"))
	g.doAction()
	ok(UI.panelOpen(), "saruna atvērta")
	UI.closePanel()
	g.trailSend({"t": "tAcc", "step": 0})
	await get_tree().process_frame
	ok(g.trail.acc and Z.itemObjs.size() == int(Game.C.trail.TASKS[0].items), "uzdevums pieņemts, pagales %d" % Z.itemObjs.size())
	var need := int(Game.C.trail.TASKS[0].need)
	var dp: Dictionary = st0.drop
	for n in need:
		var o = null
		for it in Z.itemObjs: if it.obj.visible:
			o = it; break
		if o == null: break
		place.call(float(o.it.x) + 0.3, float(o.it.z))
		var lab: String = g.currentAction.label if g.currentAction else "-"
		g.doAction()
		await get_tree().process_frame
		if g.me.carry == null:
			ok(false, "nepacēla (%s)" % lab); break
		place.call(float(dp.x), float(dp.z) + 0.3)
		g.doAction()
		await get_tree().process_frame
	ok(int(g.trail.step) == 1 and not g.trail.acc and g.me.carry == null, "malka sanesta → solis %d, monētas %d" % [int(g.trail.step), int(g.save.coins)])
	ok(Z.logs == null or Z.logs.multimesh.visible_instance_count == 8, "šķūnītī 8 pagales")
	ok(Z.arrows.size() > 0 and Z.arrows[0].m.visible, "bulta uz nākamo pieturu redzama")
	# šķērslis: sitieni līdz novākts
	var O: Dictionary = Z.lay.obst[0]
	var hits := int(Game.C.trail.OB_TYPES[O.type].hits)
	for i in hits:
		g.obLast = {}
		g.hostTrail(0, {"t": "tHit", "o": 0})
	ok(Z.obClear[0] and not Z.obs[0].root.visible, "šķērslis %s novākts (%d sitieni)" % [O.type, hits])
	# strauts: bez tilta pāri netiek
	var bx := 150.0 + 40.0
	var sz := Z.streamZ(bx)
	var p := Vector3(bx, 0, sz - 14.0)
	Z.reset_lp(); Z.lastSide = -1
	for i in 60:
		p.z += 0.5
		p = Z.collide(p, 0.5)
	ok(p.z < sz, "strauts aptur bez tilta (z %.1f < %.1f)" % [p.z, sz])
	# neizdošanās: pieņem 2. uzdevumu, visi aiziet
	g.trailSend({"t": "tAcc", "step": 1})
	ok(g.trail.acc, "vāveres uzdevums pieņemts")
	g.me.pos = Vector3(0, 0, -290)
	g.trailTickT = 0; g.hostTrailTick(0)
	await get_tree().create_timer(4.3).timeout
	g.trailTickT = 0; g.hostTrailTick(0)
	ok(not g.trail.acc and int(g.trail.step) == 1, "uzdevums neizdevās, kad visi aizgāja")
	ok(not g.boatOk(), "laiva vēl slēgta")
	# laukums: augstums atbilst tīmekļa datiem (vienā režģa punktā)
	var hx: float = Z.X0 + 100 * Z.CELL
	var hz: float = Z.Z0 + 200 * Z.CELL
	ok(absf(Z.get_height(hx, hz) - Z.heights[200 * (Z.NX + 1) + 100]) < 1e-3, "augstuma režģis")
	var shot := Game.arg("shot")
	if shot != "":
		var s1: Dictionary = Z.lay.stops[1]
		g.me.pos = Vector3(s1.x + 3, Z.ground_at(s1.x + 3, s1.z + 6), s1.z + 6)
		for i in 40: await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(shot)
	print("[trail] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
