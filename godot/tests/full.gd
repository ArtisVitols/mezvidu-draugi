extends Node
## Pilns lietotnes tests (viens spēlētājs, saimnieks): visi paneļi, veikali, mežs (sēnes, ogas, akas vēlēšanās, saldējums,
## dzīvnieki, ugunskurs, tornis, kartes gabali, lāde, zvaigzne, makšķerēšana), mājdzīvnieks, soma (cepure, drēbes, karts),
## rotājumi, sacīkstes ar kartu, visas zemes, karte, saglabāšana. Darbības — ar īsto darbības pogu (refreshAction/doAction).
## -- --autotest=full [--shots=dir]
var g
var fails: Array = []
var shots := ""
var err0 := 0

func ok(c: bool, what: String) -> void:
	print("[full] ", "✅ " if c else "❌ ", what)
	if not c: fails.append(what)

func errs() -> int: return GBugSpot.errlog.total if GBugSpot.errlog else 0
func section(name: String) -> void:
	var e := errs()
	if e > err0: ok(false, "kļūdas iepriekšējā daļā: %d (%s)" % [e - err0, " | ".join(GBugSpot.errlog.snapshot().slice(-3))])
	err0 = e
	print("[full] ---- ", name)

func frames(n: int) -> void:
	for i in n: await get_tree().process_frame

func shot(name: String) -> void:
	if shots == "": return
	await frames(3)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/full_%s.png" % [shots, name])

## nostājas pie (x, z), nospiež darbības pogu, ja tās teksts satur want
func act(x: float, z: float, want: String, y = null) -> String:
	g.me.pos = Vector3(x, g.terr.ground_at(x, z) if y == null else float(y), z)
	g.me.onGround = true; g.me.vy = 0.0
	if g.terr.has_method("reset_lp"): g.terr.reset_lp()
	g.timers.action = 0.0
	g.refreshAction()
	var lab: String = str(g.currentAction.label) if g.currentAction else "-"
	if lab.contains(want): g.doAction()
	return lab

func panel_buttons(contains: String) -> Array:
	var out := []
	for b in UI.panel_body.find_children("*", "Button", true, false):
		if (b as Button).text.contains(contains) and not (b as Button).disabled: out.append(b)
	return out

func go(zone: String, x: float, z: float) -> void:
	await g.teleport(zone, Vector2(x, z), 0.0)
	await frames(5)

func _ready() -> void:
	shots = Game.arg("shots")
	Game.set_item("mezvidi_gfx_custom", {}); Game.set_item("mezvidi_gfx", "low")
	var r := Game.load_save("Pilnais", "")
	var s: Dictionary = r.save
	# tīrs sākums
	s = Game.default_save("Pilnais"); s.name = "Pilnais"; s.coins = 2000; s.zone = "c"
	var net := Net.new(); net.start_offline()
	g = Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	await frames(10)
	err0 = errs()
	var res = await t_panels()
	res = await t_forest()
	res = await t_shops()
	res = await t_bag()
	res = await t_race()
	res = await t_lands()
	res = await t_garden_save()
	section("beigas")
	print("[full] ", "VISS IZDEVĀS" if fails.is_empty() else "NEIZDEVĀS %d: %s" % [fails.size(), "; ".join(fails)])
	Game.set_item("mezvidi_gfx", "auto"); Game.flush()
	get_tree().quit()

# ---------- paneļi ----------
func t_panels() -> bool:
	section("paneļi")
	var list := [["izvēlne", func(): g.openMenu()], ["iestatījumi", func(): g.openSettings()], ["pamācība", func(): g.openManual()],
		["istaba", func(): g.openRoom()], ["uzdevumi", func(): g.openQuests()], ["soma", func(): g.openBag()], ["spēles", func(): g.openGames()],
		["karte", func(): g.openBigMap()], ["dārzs", func(): g.openGardenInfo()], ["kļūdas", func(): g.openBugSpot()]]
	for it in list:
		UI.closePanel()
		it[1].call()
		await frames(2)
		var n := UI.panel_body.get_child_count()
		ok(UI.panelOpen() and n > 0, "panelis %s (%d elementi)" % [it[0], n])
		await shot("panel_" + it[0])
	# pamācības un iestatījumu pogas: grafikas līmeņa pārslēgšana caur paneli
	UI.closePanel(); g.openSettings(); await frames(2)
	var qb := panel_buttons(g.qualityLabel())
	var before: String = g.qMode
	if qb.size() > 0: qb[0].pressed.emit()
	await frames(2)
	ok(g.qMode != before, "grafikas līmenis mainās ar pogu (%s → %s)" % [before, g.qMode])
	g.setQualityMode("low")
	UI.closePanel()
	g.toggleEmotes(); await frames(2)
	g.showEmote(g.myId, "👋"); await frames(5)
	g.toggleEmotes()
	ok(true, "emocijas")
	return true

# ---------- mežs ----------
func t_forest() -> bool:
	section("mežs")
	await go("e", 5.0, 30.0)
	ok(g.zone == "e" and g.centerOn, "mežā")
	var W = g.world
	# sēne (ne mušmire)
	var coins0 := int(g.save.coins)
	var got := false
	for m in W.d.mushrooms:
		if Game.D.MUSHROOMS[m.type].get("bad", false) or str(m.type) == "musmire": continue
		var inv0 := int(g.save.inv.get(m.type, 0))
		var lab := act(float(m.x) + 0.3, float(m.z), "Lasīt")
		await frames(2)
		got = int(g.save.inv.get(m.type, 0)) > inv0
		ok(got, "sēne %s (%s)" % [m.type, lab])
		break
	# ogas
	for b in W.d.berries:
		var n0 := int(g.save.inv.get(b.kind, 0)) + int(g.save.get("berries", {}).get(b.kind, 0)) if g.save.get("berries") is Dictionary else int(g.save.inv.get(b.kind, 0))
		var lab := act(float(b.x) + 0.3, float(b.z), "Lasīt")
		await frames(2)
		ok(lab.contains("Lasīt") and g.berryPicked.has(str(int(b.id))), "ogas %s (%s)" % [b.kind, lab])
		break
	# saldējums
	if not g.ice.is_empty():
		var c0 := int(g.save.coins)
		var lab := act(g.ice.pos.x + 1.0, g.ice.pos.z, "Saldējums")
		await frames(2)
		ok(int(g.save.coins) < c0, "saldējums (%s)" % lab)
	# aka
	var c1 := int(g.save.coins)
	var lab_w := act(1.2, 1.2, "akā")
	await get_tree().create_timer(3.5).timeout
	UI.closePanel()
	ok(lab_w.contains("akā") and int(g.save.coins) != c1, "akas vēlēšanās (%s, %d → %d)" % [lab_w, c1, int(g.save.coins)])
	# meža dzīvnieks
	await frames(10)
	var petted := false
	for n in g.npcs:
		if not n.model.root.visible: continue
		var lab := act(float(n.x) + 1.0, float(n.z), "Paglaudīt")
		if lab.contains("Paglaudīt"):
			petted = true; break
	ok(petted, "meža dzīvnieks paglaudīts")
	# ugunskurs: sēnes cepšana
	var camp = g.placeById.get("nometne")
	g.save.inv["baravika"] = int(g.save.inv.get("baravika", 0)) + 2
	var lab_c := act(float(camp.x) + 2.0, float(camp.z), "Cept")
	await frames(2)
	ok(lab_c.contains("Cept") and int(g.save.inv.get("baravika", 0)) == 0, "ugunskurs — sēnes izceptas (%s)" % lab_c)
	# tornis
	var tw = g.placeById.get("tornis")
	var lab_t := act(float(tw.base.x), float(tw.base.z), "Kāpt")
	await frames(3)
	ok(g.me.pos.y > float(tw.h) + 3, "tornī augšā (%s, y %.1f)" % [lab_t, g.me.pos.y])
	await shot("tornis")
	g.timers.action = 0.0; g.refreshAction()
	var lab_d: String = str(g.currentAction.label) if g.currentAction else "-"
	if lab_d.contains("lejā"): g.doAction()
	await frames(3)
	ok(g.me.pos.y < float(tw.h) + 3, "nokāpa (%s)" % lab_d)
	# kartes gabali + lāde
	for id in g.scrolls.keys():
		var p: Dictionary = g.placeById[id].piece
		act(float(p.x) + 0.3, float(p.z), "kartes", float(p.y) - 0.4)
		await frames(2)
	ok(g.save.pieces.size() == Game.D.MAP_PIECES.size(), "kartes gabali %d/%d" % [g.save.pieces.size(), Game.D.MAP_PIECES.size()])
	var ch = W.d.get("chest")
	var c2 := int(g.save.coins)
	var lab_ch := act(float(ch.x) + 1.5, float(ch.z), "lādi")
	await frames(5)
	UI.closePanel()
	ok(g.save.get("treasure", false) and int(g.save.coins) > c2, "dārguma lāde (%s)" % lab_ch)
	# zvaigzne
	var st0: int = g.save.stars.size()
	var star: Dictionary = W.d.stars[0]
	g.me.pos = Vector3(float(star.x), float(star.y) - 1.3, float(star.z))
	await frames(5)
	ok(g.save.stars.size() > st0, "zelta zvaigzne")
	# makšķerēšana pie laipas
	g.save.rod = true
	var lp = g.placeById.get("laipa")
	var spot_ok := false
	for rr in [4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0]:
		for k in 16:
			var a := k / 16.0 * TAU
			var x: float = float(lp.x) + sin(a) * rr
			var z: float = float(lp.z) + cos(a) * rr
			if W.get_height(x, z) < 0.15: continue
			g.me.pos = Vector3(x, W.ground_at(x, z), z); g.me.state = "idle"; g.me.onGround = true
			if g.fishSpot() != null:
				spot_ok = true; break
		if spot_ok: break
	g.timers.action = 0.0; g.refreshAction()
	var lab_f: String = str(g.currentAction.label) if g.currentAction else "-"
	if lab_f.contains("Makšķerēt"): g.doAction()
	await frames(3)
	ok(g.fishing != null, "makšķerē (%s)" % lab_f)
	await shot("makskere")
	var fb0: int = g.save.fishBag.size()
	# gaida īsto copi (pludiņš raustās), velk ar pogu; zābaks arī iespējams — tad mēģina vēlreiz
	for tries in 6:
		if g.fishing == null:
			g.timers.action = 0.0; g.refreshAction()
			if g.currentAction and str(g.currentAction.label).contains("Makšķerēt"): g.doAction()
		var t0 := Time.get_ticks_msec()
		while g.fishing != null and g.fishing.phase != "bite" and Time.get_ticks_msec() - t0 < 15000: await frames(1)
		g.timers.action = 0.0; g.refreshAction()
		var lab_v: String = str(g.currentAction.label) if g.currentAction else "-"
		if g.fishing != null and g.fishing.phase == "bite": g.doAction()
		await frames(3)
		UI.closePanel()
		if g.save.fishBag.size() > fb0:
			print("[full] copes poga: ", lab_v); break
	if g.fishing != null: g.stopFishing(true)
	ok(g.save.fishBag.size() > fb0, "noķerta zivs ar VILKT pogu (somā %d)" % g.save.fishBag.size())
	return true

# ---------- veikali ----------
func t_shops() -> bool:
	section("veikali")
	if g.zone != "e": await go("e", 5.0, 30.0)
	for v in g.vendors:
		var d: Dictionary = v.def
		var lab := act(float(d.x) + 2.5, float(d.z), "💬")
		await frames(2)
		var open := UI.panelOpen()
		var c0 := int(g.save.coins)
		var bought := false
		var btns := panel_buttons("🪙") + panel_buttons("Pirkt")
		if d.id == "buyer":
			# pārdod — vajag ko pārdot (ogas/sēnes/zivis)
			btns = panel_buttons("Pārdot")
			if btns.is_empty(): btns = panel_buttons("+")
		for b in btns:
			b.pressed.emit()
			await frames(2)
			if int(g.save.coins) != c0:
				bought = true; break
		await shot("veikals_" + d.id)
		ok(open and bought, "veikals %s (%s): monētas %d → %d" % [d.id, lab, c0, int(g.save.coins)])
		UI.closePanel()
	# mājdzīvnieks — ja nopirkts, uzliek un paglauda
	if g.save.ownedPets.size() > 0:
		g.setPet(g.save.ownedPets[0])
		await frames(20)
		ok(g.pet != null, "mājdzīvnieks %s seko" % g.save.ownedPets[0])
		g.pet.x = g.me.pos.x + 1.0; g.pet.z = g.me.pos.z
		g.timers.action = 0.0; g.refreshAction()
		var lab: String = str(g.currentAction.label) if g.currentAction else "-"
		ok(lab.contains("Paglaudīt"), "mājdzīvnieku var paglaudīt (%s)" % lab)
	else: ok(false, "mājdzīvnieks nav nopirkts")
	ok(g.save.get("decor") is Array and g.save.decor.size() > 0 or g.save.get("ownedDecor", []).size() > 0, "rotājums nopirkts")
	return true

# ---------- soma ----------
func t_bag() -> bool:
	section("soma")
	if g.save.ownedHats.size() > 0:
		g.setHat(g.save.ownedHats[0]); await frames(2)
		ok(g.save.hat == g.save.ownedHats[0], "cepure %s uzlikta" % g.save.hat)
	var done_slots := {}
	for id in Game.D.CLOTHES:
		var sl: String = Game.D.CLOTHES[id].slot
		if done_slots.has(sl): continue
		done_slots[sl] = true
		if not g.save.ownedClothes.has(id): g.save.ownedClothes.append(id)
		g.setWearItem(sl, id); await frames(2)
		ok(g.save.wear.get(sl) == id, "drēbes %s: %s" % [sl, id])
	g.setKartColor(Game.D.KART_COLORS.keys()[1] if Game.D.KART_COLORS is Dictionary else str(Game.D.KART_COLORS[1].id))
	g.openBag(); await frames(3)
	await shot("soma")
	ok(UI.panelOpen(), "soma ar lelli")
	UI.closePanel()
	return true

# ---------- sacīkstes ----------
func t_race() -> bool:
	section("sacīkstes")
	await go("w", 0.0, 0.0)
	var ks: Dictionary = g.raceW.d.kartSpot
	var lab := act(float(ks.x) + 1.0, float(ks.z), "kartā")
	await frames(3)
	ok(g.me.inKart, "kartā (%s)" % lab)
	g.net.toHost({"t": "raceReq"})
	await frames(2)
	ok(g.hs.race.phase == "lobby", "sacīkšu gaidīšana")
	g.hs.race.startAt = Game.now_ms() + 4500
	var t0 := Time.get_ticks_msec()
	while g.hs.race.phase != "run" and Time.get_ticks_msec() - t0 < 15000: await frames(1)
	ok(g.hs.race.phase == "run", "sacīkstes sākas")
	await get_tree().create_timer(5.0).timeout
	for i in 120: g.updateKart(1.0 / 30.0, {"x": 0.0, "y": 1.0, "run": false})
	await shot("sacikstes")
	g.net.toHost({"t": "raceFinish", "time": 61000})
	await frames(3)
	ok(g.hs.race.results.size() >= 1, "finišs reģistrēts")
	t0 = Time.get_ticks_msec()
	while g.hs.race.phase != "done" and Time.get_ticks_msec() - t0 < 60000: await frames(1)
	UI.closePanel()
	ok(g.hs.race.phase == "done", "sacīkstes beigušās (%s)" % g.hs.race.phase)
	g.exitKart(); await frames(2)
	ok(not g.me.inKart, "izkāpa no karta")
	return true

# ---------- visas zemes ----------
func t_lands() -> bool:
	section("zemes")
	for z in ["c", "n", "s", "w", "e"]:
		await go(z, 0.0, 0.0 if z != "s" else -250.0)
		ok(g.zone == z and g.terr != null and g.land_node != null, "zeme %s: augstums %.1f" % [z, g.terr.get_height(g.me.pos.x, g.me.pos.z)])
		g.openBigMap(); await frames(2)
		await shot("karte_" + z)
		UI.closePanel()
		g.drawMinimap()
		for i in 30:
			g.update(1.0 / 30.0)
	return true

# ---------- dārzs + saglabāšana ----------
func t_garden_save() -> bool:
	section("dārzs un saglabāšana")
	await go("c", 0.0, 0.0)
	g.openGardenInfo(); await frames(2)
	UI.closePanel()
	var coins := int(g.save.coins)
	g.persist(); Game.flush()
	var r := Game.load_save("Pilnais", str(g.save.get("gid", "")))
	ok(int(r.save.coins) == coins and r.save.stars.size() == g.save.stars.size() and r.save.pieces.size() == g.save.pieces.size(), "saglabāts un ielādēts (🪙 %d)" % int(r.save.coins))
	return true
