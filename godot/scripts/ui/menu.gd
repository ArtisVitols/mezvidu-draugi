class_name Menu
extends CanvasLayer
## Sākuma izvēlne (web main.js + index.html #menu): 1. vārds → 2. tēls (3D priekšskatījums) → 3. istaba
## (spēles izvēle saimniekam, izveidot istabu, pievienoties ar kodu vai IP tajā pašā Wi-Fi, spēlēt vienam).

const EMOJI := {"lacis": "🐻", "lapsa": "🦊", "zakis": "🐰", "kakis": "🐱", "cuka": "🐷", "suns": "🐶", "varde": "🐸", "pile": "🦆"}
var S := UI.S
var root: Control
var box: PanelContainer
var body: VBoxContainer
var save: Dictionary
var isNew := false
var net: Net = null
var pv: SubViewport = null
var pvAv: Avatar = null
var pvT := 0.0
var status: Label
var busy := false
var gameSel: OptionButton
var gameIds: Array = []
var newBox: VBoxContainer
var gname: LineEdit
var keep := {"look": true, "decor": false, "coins": false}
var saveInfo: Label
var hostBtn: Button
var codeIn: LineEdit
var ipIn: LineEdit

func _ready() -> void:
	layer = 5
	UI.hud.visible = false
	root = Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.theme = UI.theme_main
	add_child(root)
	var bg := TextureRect.new(); bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	var gt := GradientTexture2D.new(); var gr := Gradient.new()
	gr.colors = PackedColorArray([Color("#8fd0f0"), Color("#cfeec0"), Color("#4fa456")]); gr.offsets = PackedFloat32Array([0.0, 0.6, 1.0])
	gt.gradient = gr; gt.fill_from = Vector2(0, 0); gt.fill_to = Vector2(0, 1)
	bg.texture = gt; bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; bg.stretch_mode = TextureRect.STRETCH_SCALE
	root.add_child(bg)
	_hills(root)
	var sc := ScrollContainer.new(); sc.set_anchors_preset(Control.PRESET_FULL_RECT); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(sc)
	var cc := CenterContainer.new(); cc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.add_child(cc)
	var mg := MarginContainer.new()
	for k in ["margin_top", "margin_bottom"]: mg.add_theme_constant_override(k, int(14 * S))
	cc.add_child(mg)
	box = PanelContainer.new()
	box.add_theme_stylebox_override("panel", UI._sb(Color(1, 0.973, 0.9, 0.96), 22 * S, 16 * S))
	box.custom_minimum_size.x = 400 * S
	mg.add_child(box)
	body = VBoxContainer.new(); body.add_theme_constant_override("separation", int(8 * S))
	box.add_child(body)
	showName()

## dekoratīvi pakalni un egles (kā web izvēlnes SVG)
func _hills(parent: Control) -> void:
	var c := Control.new(); c.set_anchors_preset(Control.PRESET_FULL_RECT); c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.draw.connect(func() -> void:
		var w := c.size.x
		var h := c.size.y
		var hill := func(y0: float, amp: float, col: Color, ph: float) -> void:
			var pts := PackedVector2Array()
			for i in 41:
				var x := w * i / 40.0
				pts.append(Vector2(x, h * y0 + sin(i * 0.35 + ph) * amp * h + sin(i * 0.9 + ph * 2) * amp * 0.3 * h))
			pts.append(Vector2(w, h)); pts.append(Vector2(0, h))
			c.draw_colored_polygon(pts, col)
		hill.call(0.72, 0.03, Color("#4fa456"), 0.0)
		for i in 9:
			var x := w * (0.06 + i * 0.115)
			var y := h * (0.72 + sin(i * 1.7) * 0.02)
			var s := h * (0.11 + 0.04 * sin(i * 2.3))
			c.draw_colored_polygon(PackedVector2Array([Vector2(x - s * 0.32, y + 4), Vector2(x, y - s), Vector2(x + s * 0.32, y + 4)]), Color("#24603a"))
		hill.call(0.86, 0.025, Color("#357f45"), 1.3))
	parent.add_child(c)

func _clear() -> void:
	for ch in body.get_children(): ch.queue_free()
	_stop_preview()

func _steps(n: int) -> void:
	var h := HBoxContainer.new(); h.alignment = BoxContainer.ALIGNMENT_CENTER; h.add_theme_constant_override("separation", int(6 * S))
	for i in 3:
		var d := Panel.new(); d.custom_minimum_size = Vector2(28 if i == n else 10, 10) * S
		d.add_theme_stylebox_override("panel", UI._sb(UI.GREEN if i <= n else Color(0, 0, 0, 0.15), 5 * S, 0, false))
		h.add_child(d)
	body.add_child(h)

func _title(t: String, size := 24.0) -> Label:
	var l := UI.p(t, size, UI.GREEN); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(l)
	return l

func _input_line(ph: String, maxlen: int) -> LineEdit:
	var e := LineEdit.new(); e.placeholder_text = ph; e.max_length = maxlen
	e.add_theme_font_size_override("font_size", int(17 * S)); e.custom_minimum_size.y = 46 * S
	e.add_theme_stylebox_override("normal", UI._sb(Color.WHITE, 12 * S, 8 * S, false))
	e.add_theme_stylebox_override("focus", UI._sb(Color(1, 1, 0.95), 12 * S, 8 * S, false))
	e.add_theme_color_override("font_color", UI.INK)
	e.add_theme_color_override("font_placeholder_color", Color(0, 0, 0, 0.35))
	return e

func _primary(t: String, fn: Callable) -> Button:
	var bt := UI.btn(t, fn)
	bt.add_theme_font_size_override("font_size", int(18 * S)); bt.custom_minimum_size.y = 52 * S
	return bt

# ---------- 1. vārds ----------
func showName() -> void:
	_clear()
	var logo := _title("🦊  Mežvidu Draugi", 34.0)
	logo.add_theme_color_override("font_outline_color", Color.WHITE); logo.add_theme_constant_override("outline_size", int(6 * S))
	var sub := UI.p("Kopīga piedzīvojumu pasaule līdz 4 draugiem", 14.0, Color(0.35, 0.35, 0.35)); sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(sub)
	_steps(0)
	body.add_child(UI.p("Tavs vārds", 14.0))
	var inp := _input_line("Ieraksti savu vārdu", 14)
	inp.text = Game.last_profile_name()
	body.add_child(inp)
	var profs := Game.list_profiles()
	if profs.size() > 0:
		var fl := HFlowContainer.new(); fl.add_theme_constant_override("h_separation", int(6 * S)); fl.add_theme_constant_override("v_separation", int(6 * S))
		for n in profs.slice(0, 6):
			fl.add_child(UI.btn("👤 " + str(n), func(): inp.text = str(n), true))
		body.add_child(fl)
	var ok := func() -> void:
		var nm := inp.text.strip_edges()
		while nm.contains("  "): nm = nm.replace("  ", " ")
		if nm.length() < 2:
			inp.text = ""; inp.placeholder_text = "Vismaz 2 burti!"; inp.grab_focus(); return
		var lg := Game.last_game_id()
		var r := Game.load_save(nm, lg if (lg != "" and Game.has_save(nm, lg)) else "")
		save = r.save; isNew = r.get("isNew", false)
		save.name = nm
		showChar()
	inp.text_submitted.connect(func(_t): ok.call())
	body.add_child(_primary("Tālāk ➜", ok))
	# 📋 žurnāls — ja iepriekšējā reize avarēja, poga izceļas
	var pc := CrashLog.previous_info(1)
	var crashed: bool = pc.get("exists", false) and pc.get("crashed", false)
	var lb := UI.btn("⚠️ Iepriekšējā reize avarēja — 📋 kopēt žurnālu" if crashed else "📋 Žurnāls", func(): CrashLog.open_panel(), not crashed)
	body.add_child(lb)
	var v := UI.p("Versija %s · Android" % Game.VERSION, 12.0, Color(0.45, 0.45, 0.45)); v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(v)

# ---------- 2. tēls ----------
func showChar() -> void:
	_clear()
	_steps(1)
	_title("Izvēlies savu tēlu", 22.0)
	var tex := TextureRect.new(); tex.custom_minimum_size = Vector2(300, 220) * S * 0.75
	tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	body.add_child(tex)
	_start_preview(tex)
	var grid := GridContainer.new(); grid.columns = 4; grid.add_theme_constant_override("h_separation", int(6 * S)); grid.add_theme_constant_override("v_separation", int(6 * S))
	for a in Game.D.ANIMALS:
		var sel: bool = save.animal == a.id
		var bt := UI.btn("%s\n%s" % [EMOJI.get(a.id, "🐾"), a.name], func():
			if save.animal != a.id: save.fur = a.fur
			save.animal = a.id
			showChar(), not sel)
		bt.custom_minimum_size = Vector2(88, 64) * S * 0.85
		bt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(bt)
	body.add_child(grid)
	body.add_child(UI.p("Kažoka krāsa", 14.0))
	body.add_child(_swatches(Game.D.FUR_COLORS, "fur"))
	body.add_child(UI.p("Krekla krāsa", 14.0))
	body.add_child(_swatches(Game.D.SHIRT_COLORS, "shirt"))
	var back := UI.btn("⬅", func(): showName(), true); back.custom_minimum_size = Vector2(70, 52) * S
	var ok := _primary("Tālāk ➜", func():
		Game.write_save(save)
		showRoom())
	ok.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(UI.row([back, ok]))

func _swatches(colors: Array, key: String) -> Control:
	var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", int(6 * S)); h.add_theme_constant_override("v_separation", int(6 * S))
	for c in colors:
		var bt := Button.new(); bt.custom_minimum_size = Vector2(36, 36) * S
		var on: bool = str(save.get(key, "")) == str(c)
		var sb := UI._sb(Color(c), 18 * S, 0, false)
		if on:
			sb.border_color = UI.GREEN; sb.set_border_width_all(int(4 * S))
		else:
			sb.border_color = Color(0, 0, 0, 0.15); sb.set_border_width_all(int(1 * S))
		for st in ["normal", "hover", "pressed", "focus"]: bt.add_theme_stylebox_override(st, sb)
		var cc: String = c
		bt.pressed.connect(func():
			Aud.sfx("ui_click", {"vol": 0.35})
			save[key] = cc; showChar())
		h.add_child(bt)
	return h

func _start_preview(tex: TextureRect) -> void:
	pv = SubViewport.new(); pv.size = Vector2i(480, 352); pv.own_world_3d = true; pv.transparent_bg = true
	pv.render_target_update_mode = SubViewport.UPDATE_ALWAYS; pv.msaa_3d = Viewport.MSAA_4X
	var we := WorldEnvironment.new(); var e := Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR; e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.9, 0.95, 0.85); e.ambient_light_energy = 0.85; e.tonemap_mode = Environment.TONE_MAPPER_AGX
	we.environment = e; pv.add_child(we)
	var l := DirectionalLight3D.new(); l.light_energy = 1.4; pv.add_child(l); l.look_at_from_position(Vector3(2, 4, 3), Vector3.ZERO, Vector3.UP)
	var cam := Camera3D.new(); cam.fov = 30; pv.add_child(cam); cam.look_at_from_position(Vector3(0, 1.1, 3.6), Vector3(0, 0.85, 0), Vector3.UP)
	add_child(pv)
	pvAv = Avatar.make({"animal": save.animal, "fur": save.fur, "shirt": save.shirt, "hat": save.get("hat"), "wear": save.get("wear", {})})
	pv.add_child(pvAv.root)
	tex.texture = pv.get_texture()

func _stop_preview() -> void:
	if pv:
		pv.queue_free(); pv = null; pvAv = null

func _process(dt: float) -> void:
	if pvAv:
		pvT += dt
		pvAv.root.rotation.y = sin(pvT * 0.8) * 0.8
		pvAv.animate(dt, "walk" if int(pvT / 3.0) % 2 == 1 else "wave", 3.0)
	if net: net.poll(dt)

# ---------- 3. istaba ----------
func showRoom() -> void:
	_clear()
	_steps(2)
	_title("Sveiks, %s!" % save.name, 24.0)
	saveInfo = UI.p("", 14.0, Color(0.35, 0.35, 0.35)); saveInfo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(saveInfo)
	body.add_child(UI.p("🎮 Spēle (izvēlas istabas veidotājs)", 14.0))
	gameSel = OptionButton.new(); gameSel.add_theme_font_size_override("font_size", int(16 * S)); gameSel.custom_minimum_size.y = 46 * S
	gameIds = []
	var want := str(save.get("gid", ""))
	for g in Game.list_games():
		gameSel.add_item("▶ " + (("%s · #%s" % [g.name, g.id]) if str(g.id) != "" else str(g.name)))
		gameIds.append(str(g.id))
		if str(g.id) == want: gameSel.select(gameIds.size() - 1)
	gameSel.add_item("🆕 Jauna spēle visiem…"); gameIds.append("__new")
	gameSel.get_popup().add_theme_font_size_override("font_size", int(16 * S))
	gameSel.item_selected.connect(func(_i): _gameChanged())
	body.add_child(gameSel)
	newBox = VBoxContainer.new(); newBox.add_theme_constant_override("separation", int(4 * S))
	gname = _input_line("Spēle %s" % Time.get_date_string_from_system(), 24)
	newBox.add_child(gname)
	for k in [["look", "👕 Paturēt drēbes, cepures, mājdzīvniekus, kartus"], ["decor", "🌷 Paturēt dārza rotājumus"], ["coins", "🪙 Paturēt monētas"]]:
		var cb := CheckBox.new(); cb.text = k[1]; cb.button_pressed = keep[k[0]]
		cb.add_theme_font_size_override("font_size", int(14 * S)); cb.add_theme_color_override("font_color", UI.INK)
		var kk: String = k[0]
		cb.toggled.connect(func(on): keep[kk] = on)
		newBox.add_child(cb)
	newBox.add_child(UI.p("Visi, kas pievienosies, sāks no sākuma. Iepriekšējo spēļu progress paliek saglabāts — tās var turpināt vēlāk.", 12.0, Color(0.4, 0.4, 0.4)))
	body.add_child(newBox)
	hostBtn = _primary("🏠 Izveidot istabu", func(): _host())
	body.add_child(hostBtn)
	var orl := UI.p("— vai pievienojies draugam tajā pašā Wi-Fi —", 13.0, Color(0.4, 0.4, 0.4)); orl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(orl)
	codeIn = _input_line("KODS", 5)
	codeIn.alignment = HORIZONTAL_ALIGNMENT_CENTER
	codeIn.text_changed.connect(func(t):
		var u := ""
		for ch in t.to_upper(): if "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".contains(ch): u += ch
		if u != t:
			codeIn.text = u; codeIn.caret_column = u.length())
	codeIn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var jb := UI.btn("🚪 Pievienoties", func(): _join())
	jb.custom_minimum_size.y = 46 * S
	body.add_child(UI.row([codeIn, jb]))
	ipIn = _input_line("Saimnieka IP (ja neatrod pēc koda)", 40)
	ipIn.add_theme_font_size_override("font_size", int(14 * S))
	body.add_child(ipIn)
	body.add_child(UI.btn("🌲 Spēlēt vienam (bez tīkla)", func(): _solo(), true))
	status = UI.p("", 14.0, UI.GREEN); status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(status)
	body.add_child(UI.btn("⬅ Atpakaļ", func(): showChar(), true))
	_gameChanged()

func _gameChanged() -> void:
	var v: String = gameIds[gameSel.selected] if gameSel.selected >= 0 else ""
	var nw := v == "__new"
	newBox.visible = nw
	hostBtn.text = "🆕 Sākt jaunu spēli visiem" if nw else "🏠 Izveidot istabu"
	if nw: return
	if v == str(save.get("gid", "")) and not isNew:
		saveInfo.text = "Tavs progress ielādēts: 🪙 %d · ⭐ %d/15" % [int(save.coins), save.stars.size()]
	elif isNew and v == str(save.get("gid", "")):
		saveInfo.text = "Jauns spēlētājs! Tev ir 20🪙 un 3 burkānu sēklas."
	elif Game.has_save(save.name, v):
		var s: Dictionary = Game.load_save(save.name, v).save
		saveInfo.text = "Šajā spēlē tev ir: 🪙 %d · ⭐ %d/15" % [int(s.coins), s.stars.size()]
	else: saveInfo.text = "Šajā spēlē tu sāksi no sākuma."

func pickedGame() -> Dictionary:
	var v: String = gameIds[gameSel.selected]
	if v != "__new":
		for g in Game.list_games(): if str(g.id) == v: return g
		return Game.FIRST_GAME.duplicate(true)
	var ids := {}
	for g in Game.list_games(): ids[str(g.id)] = true
	var id := Game.new_game_id()
	while ids.has(id): id = Game.new_game_id()
	var nm := gname.text.strip_edges().left(24)
	if nm == "": nm = gname.placeholder_text
	return {"id": id, "name": nm, "at": Game.now_ms(), "keep": keep.duplicate()}

## pārslēdz save uz spēles g saglabājumu; true — ja šajā spēlē sāk no jauna
func enterGame(g: Dictionary) -> bool:
	Game.remember_game(g)
	var prev := save
	if str(prev.get("gid", "")) == str(g.id):
		Game.write_save(prev); return isNew and str(g.id) != ""
	var fresh := false
	if Game.has_save(prev.name, g.id):
		save = Game.load_save(prev.name, g.id).save
		for k in ["animal", "fur", "shirt"]: save[k] = prev[k]
	else:
		save = Game.carry_over(prev, Game.load_save(prev.name, g.id).save, g.get("keep", {}))
		fresh = true
	save.name = prev.name; save.gid = g.id
	isNew = false
	Game.write_save(save)
	return fresh

func _setBusy(b: bool) -> void:
	busy = b
	for ch in body.find_children("*", "BaseButton", true, false): (ch as BaseButton).disabled = b

func _host() -> void:
	if busy: return
	_setBusy(true)
	status.text = "Veidojam istabu…"
	net = Net.new()
	var code := Net.random_code()
	var err := net.host(code)
	if err != OK:
		net.close(); net = null
		status.text = "Neizdevās izveidot istabu (%d). Pārbaudi Wi-Fi vai spēlē vienatnē." % err
		_setBusy(false); return
	var g := pickedGame()
	launch(net, code, g, enterGame(g))

func _join() -> void:
	if busy: return
	var code := codeIn.text.strip_edges().to_upper()
	var ip := ipIn.text.strip_edges()
	if code.length() != 5:
		status.text = "Ieraksti 5 simbolu istabas kodu"; return
	_setBusy(true)
	status.text = "Meklējam istabu %s tajā pašā Wi-Fi…" % code
	net = Net.new()
	var res := [null]
	net.join(code, ip, func(ok: bool, why: String): res[0] = [ok, why])
	while res[0] == null: await get_tree().process_frame
	if not res[0][0]:
		net.close(); net = null
		status.text = str(res[0][1]) if str(res[0][1]) != "" else "Neizdevās pievienoties"
		_setBusy(false); return
	status.text = "Savienots!"
	var g = await askGame()
	launch(net, code, g, enterGame(g))

## klients pajautā saimniekam, kura spēle (4 s → pirmā spēle)
func askGame() -> Dictionary:
	var got := [null]
	net.onMessage = func(m):
		if m.get("t") == "gi" and m.get("g") is Dictionary and m.g.get("id") is String: got[0] = m.g
	net.toHost({"t": "gq"})
	var t0 := Time.get_ticks_msec()
	while got[0] == null and Time.get_ticks_msec() - t0 < 4000: await get_tree().process_frame
	net.onMessage = func(_m): pass
	if got[0] == null: return Game.FIRST_GAME.duplicate(true)
	var g: Dictionary = got[0]
	return {"id": str(g.id).left(8), "name": str(g.get("name", "Spēle")).left(24), "at": g.get("at", 0), "keep": g.get("keep", {}) if g.get("keep") is Dictionary else {}}

func _solo() -> void:
	if busy: return
	_setBusy(true)
	net = Net.new(); net.start_offline()
	var g := pickedGame()
	launch(net, "", g, enterGame(g))

func launch(n: Net, code: String, g: Dictionary, fresh: bool) -> void:
	_stop_preview()
	UI.progress(0.0, "Veidojam pasauli…")
	await get_tree().process_frame
	var game := Play.new()
	game.setup(save, n, code if code != "" else null, g)
	net = null   # tālāk tīklu apkalpo spēle
	get_parent().add_child(game)
	await get_tree().process_frame
	await game.init_game(func(f, t): UI.progress(f, t))
	UI.loading.visible = false
	game.start_game()
	if fresh: UI.toast("🆕 Jauna spēle „%s” — visi sāk no sākuma! Iepriekšējais progress saglabāts." % g.name, "good", 7000)
	queue_free()
