extends Node
## Visas pogas ar īstiem pieskārieniem (InputEventScreenTouch → Godot to emulē arī kā peli, tieši kā telefonā):
## augšējās pogas, karte, emocijas, lēciens, darbība, izvēlnes flīzes, katra poga katrā logā, braukšanas pogas, balvas kartiņa.
## Pārbauda, ka logs atveras un PALIEK atvērts (neaizveras no tā paša pieskāriena), ✕ un fons aizver. Bez skaņas.
## -- --autotest=buttons [--shots=dir]   (vajag Xvfb, lai izkārtojums būtu kā ekrānā)
var g
var fails: Array = []
var shots := ""
var err0 := 0
var n_ok := 0

func ok(c: bool, what: String) -> void:
	if c: n_ok += 1
	print("[buttons] ", "✅ " if c else "❌ ", what)
	if not c: fails.append(what)

func errs() -> int: return GBugSpot.errlog.total if GBugSpot.errlog else 0
func frames(n: int) -> void:
	for i in n: await get_tree().process_frame
func wait(s: float) -> void: await get_tree().create_timer(s).timeout

func touch(p: Vector2, down: bool, idx := 0) -> void:
	var e := InputEventScreenTouch.new()
	e.index = idx; e.position = p; e.pressed = down
	Input.parse_input_event(e)

## pirksts uz pogas ~0,12 s, tad atlaiž (kā īsts pieskāriens)
func tap(p: Vector2) -> void:
	touch(p, true)
	await wait(0.12)
	touch(p, false)
	await frames(4)

func center(c: Control) -> Vector2: return c.get_global_rect().get_center()

func title() -> String: return UI.panel_title.text if UI.panelOpen() else ""

func shot(name: String) -> void:
	if shots == "": return
	await frames(2)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/btn_%s.png" % [shots, name.validate_filename()])

func close_btn() -> Button:
	for b in UI.panel_box.find_children("*", "Button", true, false):
		if (b as Button).text == "✕": return b
	return null

## atver ar pieskārienu un pārbauda, ka logs paliek atvērts arī pēc 0,6 s
func open_check(ctrl: Control, want_title: String, what: String) -> bool:
	await tap(center(ctrl))
	await wait(0.6)
	var t := title()
	var good := UI.panelOpen() and (want_title == "" or t.contains(want_title))
	ok(good, "%s → atveras un paliek atvērts (%s)" % [what, t if t != "" else "aizvērts"])
	return good

func _ready() -> void:
	shots = Game.arg("shots")
	Game.set_item("mezvidi_gfx_custom", {}); Game.set_item("mezvidi_gfx", "lowest")
	var s: Dictionary = Game.default_save("Pogas"); s.name = "Pogas"; s.coins = 3000; s.zone = "c"
	var net := Net.new(); net.start_offline()
	g = Play.new()
	g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	await wait(1.0)
	err0 = errs()
	await t_hud()
	await t_menu_tiles()
	await t_panel_buttons()
	await t_action_drive()
	await t_prize()
	var e := errs() - err0
	ok(e == 0, "kļūdas visā testā: %d %s" % [e, " | ".join(GBugSpot.errlog.snapshot().slice(-4)) if e else ""])
	print("[buttons] pārbaudes: %d, neizdevās: %d" % [n_ok + fails.size(), fails.size()])
	print("[buttons] ", "VISS IZDEVĀS" if fails.is_empty() else "NEIZDEVĀS: " + "; ".join(fails))
	Game.set_item("mezvidi_gfx", "auto"); Game.flush()
	get_tree().quit()

# ---------- augšējās pogas, karte, emocijas, lēciens ----------
func t_hud() -> void:
	print("[buttons] ---- augšējās pogas")
	var list := [["btn-bag", "soma"], ["btn-quests", "Uzdevumi"], ["btn-glevel", "dārzs"], ["btn-menu", "Izvēlne"], ["btn-room", "Istaba"], ["btn-games", "Spēles"]]
	for it in list:
		var c: Control = UI.b[it[0]]
		if await open_check(c, it[1], it[0]):
			await shot(it[0])
			var cb := close_btn()
			await tap(center(cb))
			await wait(0.3)
			ok(not UI.panelOpen(), "%s → ✕ aizver" % it[0])
		# vēlreiz atver un aizver ar pieskārienu fonā (ārpus loga)
		UI.closePanel()
		await tap(center(c)); await wait(0.6)
		var r := UI.panel_box.get_global_rect()
		var bg := Vector2(maxf(8.0, r.position.x - 30.0), get_viewport().get_visible_rect().size.y - 20.0)
		await tap(bg); await wait(0.3)
		ok(not UI.panelOpen(), "%s → pieskāriens fonā aizver" % it[0])
	# karte
	await open_check(UI.b["minimap"], "", "minikarte")
	await shot("karte")
	UI.closePanel(); await wait(0.2)
	# emocijas
	await tap(center(UI.b["btn-emote"]))
	await wait(0.3)
	var em: Control = UI.b["emote-menu"]
	ok(em.visible, "💬 atver emocijas")
	var first: Control = null
	for c in em.get_children(): if c is Button and c.is_visible_in_tree(): first = c; break
	if first:
		await tap(center(first)); await wait(0.3)
		ok(not em.visible and g.avatar.root.has_meta("emote"), "emocija parādās virs galvas")
	# lēciens
	var y0: float = g.me.pos.y
	await tap(center(UI.b["btn-jump"]))
	var top := y0
	for i in 20:
		await frames(1); top = maxf(top, g.me.pos.y)
	ok(top > y0 + 0.2, "⇧ lēciens (+%.2f m)" % (top - y0))

# ---------- izvēlnes flīzes ----------
func t_menu_tiles() -> void:
	print("[buttons] ---- izvēlnes flīzes")
	var want := {"Pamācība": "Pamācība", "Iestatījumi": "Iestatījumi", "Soma": "soma", "Uzdevumi": "Uzdevumi", "Mans dārzs": "dārzs",
		"Istaba": "Istaba", "Karte": "", "Spēles": "Spēles", "Kļūdas vieta": "Kļūdas"}
	for name in want:
		UI.closePanel(); await wait(0.2)
		await tap(center(UI.b["btn-menu"])); await wait(0.5)
		var tile: Button = null
		for b in UI.panel_body.find_children("*", "Button", true, false):
			if (b as Button).text.contains("\n" + name + "\n"): tile = b
		if tile == null:
			ok(false, "flīze %s nav atrasta" % name); continue
		await tap(center(tile)); await wait(0.6)
		var t := title()
		ok(UI.panelOpen() and not t.contains("Izvēlne") and (want[name] == "" or t.contains(want[name])), "izvēlne → %s (%s)" % [name, t if t != "" else "aizvērts"])
		await shot("flize_" + name)
	# Saglabāt
	UI.closePanel(); await wait(0.2)
	await tap(center(UI.b["btn-menu"])); await wait(0.5)
	for b in UI.panel_body.find_children("*", "Button", true, false):
		if (b as Button).text.ends_with("Saglabāt"):
			await tap(center(b)); await wait(0.3)
			ok(UI.panelOpen(), "💾 Saglabāt (logs paliek)")
	UI.closePanel(); await wait(0.2)

# ---------- katra poga katrā logā ----------
const SKIP := ["Iziet", "iziet", "Sākt jaunu", "Turpināt", "🗑", "Dāvināt", "Uzdāvināt", "no jauna"]
func t_panel_buttons() -> void:
	print("[buttons] ---- pogas logos")
	var opens := [["Iestatījumi", func(): g.openSettings()], ["Soma", func(): g.openBag()], ["Uzdevumi", func(): g.openQuests()],
		["Dārzs", func(): g.openGardenInfo()], ["Istaba", func(): g.openRoom()], ["Spēles", func(): g.openGames()],
		["Kļūdas", func(): g.openBugSpot()], ["Pamācība", func(): g.openManual()], ["Karte", func(): g.openBigMap()]]
	await g.teleport("e", Vector2(5, 30), 0.0); await wait(0.5)
	for sh in ["seeds", "buyer", "hats", "pets", "decor"]:
		var id: String = sh
		opens.append(["Veikals " + id, func(): g.openShop(id)])
	g.save.inv["mellene"] = 6; g.save.inv["baravika"] = 3
	for o in opens:
		UI.closePanel(); await wait(0.15)
		o[1].call(); await wait(0.3)
		var tried := 0
		var closed := []
		var e0 := errs()
		# pogas pēc kārtas; pēc katras paneli atver no jauna (tas var būt pārbūvēts)
		var i := 0
		while i < 60:
			var btns := []
			for b in UI.panel_body.find_children("*", "BaseButton", true, false):
				var bb := b as BaseButton
				if not bb.is_visible_in_tree() or bb.disabled: continue
				var txt: String = bb.text if bb is Button else ""
				var skip := false
				for k in SKIP: if txt.contains(k): skip = true
				if not skip: btns.append(bb)
			if i >= btns.size(): break
			var b: BaseButton = btns[i]
			var txt: String = (b as Button).text.replace("\n", " ") if b is Button else b.get_class()
			UI.panel_scroll.ensure_control_visible(b); await frames(2)
			var vis := UI.panel_scroll.get_global_rect().intersects(b.get_global_rect())
			if vis:
				await tap(center(b)); await wait(0.25)
				tried += 1
				if not UI.panelOpen(): closed.append(txt)
			if not UI.panelOpen() or g.prizeOv and g.prizeOv.visible:
				if g.prizeOv: g.prizeOv.visible = false
				UI.closePanel(); await wait(0.1)
				o[1].call(); await wait(0.3)
			i += 1
		var de := errs() - e0
		ok(de == 0 and UI.panelOpen() or de == 0 and closed.size() > 0, "%s: nospiestas %d pogas, kļūdas %d%s" % [o[0], tried, de, (", aizvēra logu: " + ", ".join(closed)) if closed.size() else ""])
		await shot("logs_" + str(o[0]))
	UI.closePanel(); await wait(0.2)
	# iestatījumu slīdnis: pieskāriens vidū maina skaļumu
	g.openSettings(); await wait(0.3)
	var sl: HSlider = null
	for c in UI.panel_body.find_children("*", "HSlider", true, false): sl = c; break
	if sl:
		UI.panel_scroll.ensure_control_visible(sl); await frames(2)
		var v0 := sl.value
		var r := sl.get_global_rect()
		await tap(Vector2(r.position.x + r.size.x * (0.25 if v0 > sl.max_value / 2 else 0.75), r.get_center().y))
		ok(absf(sl.value - v0) > 1.0, "skaļuma slīdnis reaģē uz pieskārienu (%.0f → %.0f)" % [v0, sl.value])
	UI.closePanel(); await wait(0.2)

# ---------- darbības poga (atver veikalu) un braukšana ----------
func t_action_drive() -> void:
	print("[buttons] ---- darbība un braukšana")
	var v: Dictionary = g.vendors[0].def
	g.me.pos = Vector3(float(v.x) + 2.5, g.terr.ground_at(float(v.x) + 2.5, float(v.z)), float(v.z))
	g.timers.action = 0.0; g.refreshAction(); await frames(3)
	var ab: Control = UI.b["btn-action"]
	ok(ab.is_visible_in_tree(), "darbības poga redzama (%s)" % (g.currentAction.label if g.currentAction else "-"))
	await open_check(ab, "", "darbības poga (veikals)")
	UI.closePanel(); await wait(0.2)
	# mašīna
	await g.teleport("c", Vector2(0, 0), 0.0); await wait(0.5)
	var car = g.vehs.car1
	g.me.pos = Vector3(float(car.x) + 2.5, g.terr.ground_at(float(car.x) + 2.5, float(car.z)), float(car.z))
	g.timers.action = 0.0; g.refreshAction(); await frames(3)
	await tap(center(ab)); await wait(0.6)
	ok(g.me.veh != null, "darbības poga → mašīnā")
	if g.me.veh == null: return
	await shot("brauc")
	var p0: Vector3 = g.me.pos
	var gas: Control = UI.b["btn-gas"]
	touch(center(gas), true, 1)
	await wait(1.5)
	touch(center(gas), false, 1)
	ok(g.me.pos.distance_to(p0) > 2.0, "⛽ gāze (turēta 1,5 s) — aizbrauca %.1f m" % g.me.pos.distance_to(p0))
	var h0: float = g.me.veh.heading
	var lb: Control = UI.b["btn-left"]
	touch(center(gas), true, 1); touch(center(lb), true, 2)
	await wait(1.0)
	touch(center(lb), false, 2); touch(center(gas), false, 1)
	ok(absf(g.me.veh.heading - h0) > 0.1, "◀ stūre griež (%.2f rad)" % absf(g.me.veh.heading - h0))
	await wait(1.5)
	await tap(center(UI.b["btn-exit-kart"])); await wait(0.5)
	ok(g.me.veh == null, "Izkāpt")

# ---------- balvas kartiņa ----------
func t_prize() -> void:
	print("[buttons] ---- balvas kartiņa")
	var c := get_viewport().get_visible_rect().size / 2.0
	# tas pats pieskāriens, kas parāda kartiņu (atlaišana tūlīt pēc parādīšanās), to neaizver
	g.showPrize("🎉 Tests", null, "Balva", "Pieskaries")
	touch(c, true); touch(c, false)
	await frames(2)
	ok(g.prizeOv.visible, "kartiņa neaizveras uzreiz (tas pats pieskāriens)")
	await wait(0.5)
	await tap(c)
	ok(not g.prizeOv.visible, "kartiņa aizveras ar pieskārienu")
