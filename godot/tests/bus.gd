extends Node
## Autobuss: grafiks, pietura, iekāpšana, brauciens uz citu zemi: -- --autotest=bus
func _ready() -> void:
	var r := Game.load_save("Pasažieris", "")
	var s: Dictionary = r.save
	s.coins = 50
	var net := Net.new(); net.start_offline()
	var g := Play.new()
	# ejam uz pirmo sētas pieturu, kad autobuss tur stāv: atrodam laiku, kad 0. autobuss stāv pieturā 1
	s.zone = "c"; s.pos = {"x": 0, "z": -40}
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	var fails := 0
	print("[bus] pieturas: ", g.BUS_STOPS.size(), " periods ", g.BD.P)
	# pārbīdām pulksteni, lai 0. autobuss stāv pieturā sētā (pietura ar zonu c)
	var stop = null
	for st in g.BUS_STOPS: if st.zone == "c" and stop == null: stop = st
	var ev0 = null
	for e in g.BD.ev: if e.kind == "dwell" and int(e.stop) == int(stop.i): ev0 = e
	var want_t: float = (float(ev0.t0) + 2.0) * 1000.0
	var nowm: float = g.now()
	var P: float = float(g.BD.P) * 1000.0
	g.timeOffset += want_t - fmod(nowm, P)
	for i in 5: await get_tree().process_frame
	var B: Dictionary = g.buses[0]
	print("[bus] autobuss zone ", B.zone, " stop ", B.st.stop, " vis ", B.vis, " pos ", B.lx, ",", B.lz)
	if B.zone != "c" or int(B.st.stop) != int(stop.i): fails += 1
	g.me.pos = Vector3(B.lx + cos(B.h) * -2.0, g.terr.get_height(B.lx, B.lz), B.lz - sin(B.h) * -2.0)
	for i in 3: await get_tree().process_frame
	g.timers.action = 0.0; g.refreshAction()
	print("[bus] darbība: ", g.currentAction.label if g.currentAction else "-")
	if g.currentAction and str(g.currentAction.label).begins_with("🚌"): g.doAction()
	else: fails += 1
	print("[bus] autobusā: ", g.me.bus, " monētas ", g.save.coins)
	if g.me.bus == null: fails += 1
	# pārlecam līdz nākamajai pieturai citā zemē
	var start_zone: String = g.zone
	for k in 40:
		g.timeOffset += 15000.0
		for i in 3: await get_tree().process_frame
		if g.zone != start_zone and not g.zoneBusy: break
	print("[bus] tagad zemē ", g.zone, " autobuss ", B.zone)
	if g.zone == start_zone: fails += 1
	print("[bus] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
