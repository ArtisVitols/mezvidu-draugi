extends Node
## Divi procesi vienā datorā: -- --autotest=lan --role=host|join [--ip=127.0.0.1]
## Saimnieks gaida klientu, abi redz viens otru kustamies, klients pieņem takas uzdevumu (saimnieks to redz).
func _ready() -> void:
	var role := Game.arg("role", "host")
	print("[lan] sāk ", role)
	var nm := "Saimnieks" if role == "host" else "Viesis"
	var s: Dictionary = Game.load_save(nm, "").save
	s.name = nm; s.zone = "c"; s.erase("trail")
	var net := Net.new()
	var code := "TESTA"
	var ginfo := {}
	if role == "host":
		if net.host(code) != OK:
			print("[lan] NEIZDEVĀS host"); get_tree().quit(); return
	else:
		var res := [null]
		net.join(code, Game.arg("ip", ""), func(ok, why): res[0] = [ok, why])
		var t0 := Time.get_ticks_msec()
		while res[0] == null and Time.get_ticks_msec() - t0 < 20000:
			net.poll(0.016); await get_tree().process_frame
		print("[lan] pievienojās: ", res[0])
		if res[0] == null or not res[0][0]:
			print("[lan] NEIZDEVĀS join"); get_tree().quit(); return
	var g := Play.new()
	g.setup(s, net, code, ginfo)
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	print("[lan] %s spēle sākta" % nm)
	var t1 := Time.get_ticks_msec()
	while g.remotes.size() == 0 and Time.get_ticks_msec() - t1 < 30000: await get_tree().process_frame
	print("[lan] %s redz: %d" % [nm, g.remotes.size()])
	var ok := g.remotes.size() == 1
	# pastaigā pa apli 6 s, tad pārbauda, ka otrs kustas
	var p0 = g.remotes.values()[0].pos if ok else Vector3.ZERO
	var t2 := Time.get_ticks_msec()
	var base: Vector3 = g.me.pos
	while Time.get_ticks_msec() - t2 < 6000:
		var a := (Time.get_ticks_msec() - t2) / 1000.0
		g.me.pos = Vector3(base.x + sin(a) * 4.0, base.y, base.z + cos(a) * 4.0)
		g.me.state = "walk"
		await get_tree().process_frame
	var moved := 0.0
	if ok: moved = (g.remotes.values()[0].pos as Vector3).distance_to(p0)
	print("[lan] %s: otrs pārvietojās %.1f m" % [nm, moved])
	if moved < 1.0: ok = false
	if role == "join": g.trailSend({"t": "tAcc", "step": 0})
	await get_tree().create_timer(2.0).timeout
	print("[lan] %s: taka acc=%s" % [nm, g.trail.acc])
	if not g.trail.acc: ok = false
	await get_tree().create_timer(1.0).timeout
	print("[lan] %s %s" % [nm, "VISS IZDEVĀS" if ok else "NEIZDEVĀS"])
	g.ended = true
	net.close()
	get_tree().quit()
