extends Node
## Kopīgā spēle divos procesos: dāvana, emocija, līdzbraucējs mašīnā, ķeramais, kopīgas sacīkstes, takas priekšmets.
## -- --autotest=lanfull --role=host|join [--ip=127.0.0.1]   (laika soļi skaitās no brīža, kad abi redz viens otru)
var g
var role := ""
var fails: Array = []
func ok(c: bool, what: String) -> void:
	print("[lanfull] %s %s %s" % [role, "✅" if c else "❌", what])
	if not c: fails.append(what)

func _ready() -> void:
	role = Game.arg("role", "host")
	var nm := "Saimnieks" if role == "host" else "Viesis"
	var s: Dictionary = Game.default_save(nm); s.name = nm; s.zone = "c"; s.coins = 100
	var net := Net.new()
	if role == "host":
		if net.host("TESTB") != OK:
			print("[lanfull] NEIZDEVĀS host"); get_tree().quit(); return
	else:
		var res := [null]
		net.join("TESTB", Game.arg("ip", ""), func(o, w): res[0] = [o, w])
		var t0 := Time.get_ticks_msec()
		while res[0] == null and Time.get_ticks_msec() - t0 < 20000:
			net.poll(0.016); await get_tree().process_frame
		if res[0] == null or not res[0][0]:
			print("[lanfull] NEIZDEVĀS join"); get_tree().quit(); return
	g = Play.new()
	g.setup(s, net, "TESTB", {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	var t1 := Time.get_ticks_msec()
	while g.remotes.size() == 0 and Time.get_ticks_msec() - t1 < 40000: await get_tree().process_frame
	ok(g.remotes.size() == 1, "redz otru")
	if g.remotes.is_empty():
		_end(); return
	var other = g.remotes.keys()[0]
	var T0 := Time.get_ticks_msec()
	var at := func(sec: float) -> void:
		while Time.get_ticks_msec() - T0 < sec * 1000.0: await get_tree().process_frame
	var host := role == "host"
	# 1) dāvana + emocija
	var coins0 := int(g.save.coins)
	await at.call(2)
	if not host:
		g.sendGift(int(other), {"coins": 5})
		g.net.toHost({"t": "emote", "text": "👋"})
	await at.call(5)
	if host:
		ok(int(g.save.coins) == coins0 + 5, "saņēma dāvanu (🪙 %d → %d)" % [coins0, int(g.save.coins)])
		var r = g.remotes[other]
		ok(r.avatar != null and r.avatar.root.has_meta("emote"), "redz drauga emociju")
	else: ok(int(g.save.coins) == coins0 - 5, "aizsūtīja dāvanu")
	# 2) mašīna ar līdzbraucēju
	await at.call(6)
	if host:
		g.me.pos = Vector3(g.vehs.car1.x + 3.0, 4.0, g.vehs.car1.z)
		g.requestVehicle("car1")
	await at.call(9)
	if host: ok(g.me.veh != null, "saimnieks mašīnā")
	else:
		var r = g.remotes[other]
		ok(r.vehObj != null, "viesis redz draugu mašīnā")
		if r.vehObj != null:
			g.me.pos = r.pos + Vector3(2, 0, 0)
			g.joinRide(r)
		ok(g.me.ride != null, "viesis sēž kā līdzbraucējs")
	await at.call(12)
	if host:
		ok(int(g.remotes[other].rideDriver) == 0, "saimnieks redz līdzbraucēju")
		for i in 60: g.updateVehicle(1.0 / 30.0, {"x": 0.0, "y": 1.0, "run": false})
	await at.call(14)
	if not host:
		ok(g.me.ride != null, "līdzbraucējs joprojām mašīnā, kad tā brauc")
		g.leaveRide()
	await at.call(15)
	if host: g.exitVehicle()
	# 3) ķeramais mežā (sāk ar īsto ziņu mgStart, kā poga „Spēles”)
	await at.call(16)
	await g.teleport("e", Vector2(5 + (0 if host else 3), 30), 0.0)
	await at.call(24)
	if host: g.net.toHost({"t": "mgStart", "kind": "tag"})
	ok(await until(func(): return g.mgActive() and g.mg.get("kind") == "tag", 8.0), "ķeramais notiek (%s)" % str(g.mg.get("phase")))
	await at.call(34)
	if host:
		g.hs.mg = {"kind": null, "phase": "none"}
		g.net.broadcast({"t": "mg", "mg": g.hs.mg})
	ok(await until(func(): return not g.mgActive(), 5.0), "ķeramais beidzās")
	# 4) kopīgas sacīkstes (abi pieteicas)
	await at.call(38)
	g.net.toHost({"t": "raceReq"})
	ok(await until(func(): return g.race != null and g.race.get("racers", []).size() == 2, 8.0), "abi sacīkšu sarakstā (%s)" % str(g.race.get("racers") if g.race else "-"))
	await at.call(48)
	g.net.toHost({"t": "raceLeave"})
	await at.call(50)
	_end()

func until(cond: Callable, sec: float) -> bool:
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < sec * 1000.0:
		if cond.call(): return true
		await get_tree().process_frame
	return cond.call()

func _end() -> void:
	print("[lanfull] %s %s" % [role, "VISS IZDEVĀS" if fails.is_empty() else "NEIZDEVĀS: " + "; ".join(fails)])
	if g:
		g.ended = true
		g.net.close()
	get_tree().quit()
