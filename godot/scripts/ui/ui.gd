extends CanvasLayer
## HUD, paziņojumi, paneļi (web ui.js + index.html + style.css). Pogas pieejamas pēc web id: UI.b["btn-action"].
## Mērogs: audekls 720 px augsts (telefonā guļus ≈ 400 CSS px) → web izmēri × S.

const S := 1.7
const GREEN := Color("#2f7d32")
const GREEN2 := Color("#4caf50")
const CREAM := Color("#fff8e6")
const INK := Color("#2b2b2b")
const GOLD := Color("#f2c12e")

var font: FontFile
var theme_main: Theme
var b := {}                 # web id → Control
var hud: Control
var touch: TouchArea
var toasts: VBoxContainer
var panel_root: Control
var panel_box: PanelContainer
var panel_title: Label
var panel_body: VBoxContainer
var panel_scroll: ScrollContainer
var panel_on_close: Callable
var panel_build: Callable
var loading: Control
var loading_text: Label
var loading_bar: ProgressBar
var zone_load: Control
var top_l: Control
var top_r: Control
var sfx_cb: Callable = func(_n, _o = {}): pass   # audio sasaista vēlāk

func _ready() -> void:
	layer = 10
	# importētie fonti (eksportētajā lietotnē .ttf faila nav, tikai .fontdata)
	font = (load("res://assets/fonts/Inter.ttf") as FontFile).duplicate()
	var emoji: FontFile = load("res://assets/fonts/NotoColorEmoji.ttf")
	var sym: FontFile = load("res://assets/fonts/SymbolsDejaVu.ttf")   # ☰ ⇧ ➜ ✕ u. c. simboli (DejaVu Sans apakškopa)
	font.fallbacks = [emoji, sym]
	font.allow_system_fallback = false   # kā telefonā — tikai līdzi ņemtie fonti
	theme_main = _make_theme()
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = theme_main
	add_child(root)
	_build_hud(root)
	_build_panel(root)
	_build_loading(root)

## komandas josla: starp augšējām grupām, ja tur ietilpst; citādi zem labās grupas (kā web šaurā ekrānā)
func _process(_dt: float) -> void:
	if hud == null or not hud.visible or top_l == null: return
	var tb: Control = b["team-bar"]
	if not tb.visible: return
	var gap_l := top_l.get_global_rect().end.x + 8 * S
	var gap_r := top_r.get_global_rect().position.x - 8 * S
	var w := tb.get_combined_minimum_size().x
	tb.size.x = w
	if gap_r - gap_l >= w:
		tb.position = Vector2((gap_l + gap_r - w) / 2.0 - hud.get_global_rect().position.x, 10 * S)
		toasts.position.y = 56 * S
	else:
		tb.position = Vector2(top_r.get_global_rect().end.x - w - hud.get_global_rect().position.x, top_r.get_global_rect().end.y + 8 * S)
		toasts.position.y = tb.position.y + tb.size.y + 8 * S

# ---------- tēma ----------
func _sb(bg: Color, r: float, pad: float = 8.0, shadow := true) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(int(r))
	s.content_margin_left = pad * 1.4; s.content_margin_right = pad * 1.4
	s.content_margin_top = pad; s.content_margin_bottom = pad
	if shadow:
		s.shadow_color = Color(0, 0, 0, 0.2); s.shadow_size = 4; s.shadow_offset = Vector2(0, 2)
	s.anti_aliasing = true
	return s

func _make_theme() -> Theme:
	var t := Theme.new()
	t.default_font = font
	t.default_font_size = int(15 * S)
	t.set_color("font_color", "Label", INK)
	t.set_color("font_color", "Button", Color.WHITE)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_pressed_color", "Button", Color.WHITE)
	t.set_color("font_focus_color", "Button", Color.WHITE)
	t.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.6))
	t.set_stylebox("normal", "Button", _sb(GREEN2, 12 * S, 6 * S, false))
	t.set_stylebox("hover", "Button", _sb(GREEN2.lightened(0.08), 12 * S, 6 * S, false))
	t.set_stylebox("pressed", "Button", _sb(GREEN2.darkened(0.15), 12 * S, 6 * S, false))
	t.set_stylebox("disabled", "Button", _sb(Color(0.6, 0.6, 0.6), 12 * S, 6 * S, false))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_stylebox("normal", "LineEdit", _sb(Color.WHITE, 12 * S, 8 * S, false))
	t.set_stylebox("focus", "LineEdit", _sb(Color.WHITE, 12 * S, 8 * S, false))
	t.set_color("font_color", "LineEdit", INK)
	t.set_stylebox("panel", "PanelContainer", _sb(CREAM, 20 * S, 0, true))
	t.set_stylebox("background", "ProgressBar", _sb(Color(0, 0, 0, 0.15), 6 * S, 0, false))
	t.set_stylebox("fill", "ProgressBar", _sb(GREEN2, 6 * S, 0, false))
	t.set_color("font_color", "CheckBox", INK)
	t.set_color("font_color", "OptionButton", Color.WHITE)
	return t

## balta „tablete” (pill) — poga vai teksts
func pill(text: String, is_button := true) -> Control:
	var c: Control
	if is_button:
		var bt := Button.new()
		bt.text = text
		bt.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.88), 18 * S, 6 * S))
		bt.add_theme_stylebox_override("hover", _sb(Color(1, 1, 1, 0.95), 18 * S, 6 * S))
		bt.add_theme_stylebox_override("pressed", _sb(Color(0.9, 0.9, 0.9, 0.95), 18 * S, 6 * S))
		for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: bt.add_theme_color_override(k, INK)
		bt.add_theme_font_size_override("font_size", int(16 * S))
		c = bt
	else:
		var p := PanelContainer.new()
		p.add_theme_stylebox_override("panel", _sb(Color(1, 1, 1, 0.88), 18 * S, 6 * S))
		var l := Label.new(); l.text = text; l.name = "L"
		l.add_theme_font_size_override("font_size", int(16 * S))
		p.add_child(l)
		c = p
	c.mouse_filter = Control.MOUSE_FILTER_STOP if is_button else Control.MOUSE_FILTER_IGNORE
	return c

func round_btn(text: String, size: float = 54.0) -> Button:
	var bt := Button.new()
	bt.text = text
	bt.custom_minimum_size = Vector2(size, size) * S
	var sb := _sb(Color(1, 1, 1, 0.88), size * S / 2.0, 0)
	bt.add_theme_stylebox_override("normal", sb)
	bt.add_theme_stylebox_override("hover", sb)
	bt.add_theme_stylebox_override("pressed", _sb(Color(0.88, 0.88, 0.88, 0.95), size * S / 2.0, 0))
	bt.add_theme_font_size_override("font_size", int(size * 0.42 * S))
	for k in ["font_color", "font_hover_color", "font_pressed_color"]: bt.add_theme_color_override(k, INK)
	return bt

func set_text(id: String, text: String) -> void:
	var c: Control = b.get(id)
	if c == null: return
	if c is Button: (c as Button).text = text
	elif c is Label: (c as Label).text = text
	elif c.has_node("L"): (c.get_node("L") as Label).text = text

func show_id(id: String, on: bool) -> void:
	if b.has(id): (b[id] as Control).visible = on

# ---------- HUD ----------
func _build_hud(root: Control) -> void:
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.visible = false
	root.add_child(hud)
	touch = TouchArea.new()
	touch.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.add_child(touch)
	var M := 10.0 * S
	# augšā kreisajā
	var tl := VBoxContainer.new(); tl.position = Vector2(M, M); tl.add_theme_constant_override("separation", int(8 * S)); tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var trow := HBoxContainer.new(); trow.add_theme_constant_override("separation", int(6 * S)); trow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["coins"] = pill("🪙 0", false); trow.add_child(b.coins)
	b["btn-glevel"] = pill("🌱 1"); trow.add_child(b["btn-glevel"])
	tl.add_child(trow)
	var mm := TextureRect.new(); mm.custom_minimum_size = Vector2(140, 140) * S * 0.85; mm.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	mm.mouse_filter = Control.MOUSE_FILTER_STOP
	b["minimap"] = mm; tl.add_child(mm)
	hud.add_child(tl)
	# augšā labajā
	var tr := HBoxContainer.new(); tr.add_theme_constant_override("separation", int(8 * S))
	tr.set_anchors_preset(Control.PRESET_TOP_RIGHT); tr.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	tr.position = Vector2(-M, M); tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["btn-room"] = pill("👥 1/4"); tr.add_child(b["btn-room"])
	for p in [["btn-bag", "🎒"], ["btn-quests", "📜"], ["btn-games", "🎲"], ["btn-menu", "☰"]]:
		b[p[0]] = round_btn(p[1]); tr.add_child(b[p[0]])
	hud.add_child(tr)
	top_l = trow; top_r = tr
	# vidū augšā
	b["team-bar"] = _center_top(pill("", false), 10.0)
	b["team-bar"].get_node("L").add_theme_font_size_override("font_size", int(14 * S))
	toasts = VBoxContainer.new(); toasts.alignment = BoxContainer.ALIGNMENT_BEGIN; toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toasts.set_anchors_preset(Control.PRESET_CENTER_TOP); toasts.grow_horizontal = Control.GROW_DIRECTION_BOTH
	toasts.position.y = 56 * S; toasts.add_theme_constant_override("separation", int(3 * S))
	hud.add_child(toasts)
	for id in ["race-hud", "mg-hud", "snow-hud"]:
		b[id] = _center_top(pill("", false), 92.0); b[id].visible = false
	b["zone-sign"] = _center_top(pill("", false), 48.0); b["zone-sign"].visible = false
	b["countdown"] = Label.new(); b.countdown.add_theme_font_size_override("font_size", int(110 * S)); b.countdown.add_theme_color_override("font_color", Color.WHITE)
	b.countdown.add_theme_constant_override("outline_size", int(14 * S)); b.countdown.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	b.countdown.set_anchors_preset(Control.PRESET_CENTER); b.countdown.grow_horizontal = Control.GROW_DIRECTION_BOTH; b.countdown.grow_vertical = Control.GROW_DIRECTION_BOTH
	b.countdown.visible = false; b.countdown.mouse_filter = Control.MOUSE_FILTER_IGNORE; hud.add_child(b.countdown)
	var cover := ColorRect.new(); cover.color = Color(0.05, 0.08, 0.05, 0.96); cover.set_anchors_preset(Control.PRESET_FULL_RECT); cover.visible = false; cover.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["hide-cover"] = cover; hud.add_child(cover)
	var flash := ColorRect.new(); flash.color = Color(1, 1, 1, 0); flash.set_anchors_preset(Control.PRESET_FULL_RECT); flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["snow-flash"] = flash; hud.add_child(flash)
	# apakšā kreisajā — braukšana
	var bl := HBoxContainer.new(); bl.add_theme_constant_override("separation", int(14 * S))
	bl.set_anchors_preset(Control.PRESET_BOTTOM_LEFT); bl.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bl.position = Vector2(16 * S, -16 * S); bl.visible = false; bl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["btn-brake"] = _drive_btn("🛑\nBremze", Color(0.85, 0.25, 0.2, 0.85), Vector2(84, 84)); bl.add_child(b["btn-brake"])
	b["btn-gas"] = _drive_btn("⛽\nGāze", Color(0.2, 0.65, 0.25, 0.85), Vector2(92, 110)); bl.add_child(b["btn-gas"])
	b["hud-bl"] = bl; hud.add_child(bl)
	# apakšā labajā
	var br := VBoxContainer.new(); br.alignment = BoxContainer.ALIGNMENT_END; br.add_theme_constant_override("separation", int(10 * S))
	br.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT); br.grow_horizontal = Control.GROW_DIRECTION_BEGIN; br.grow_vertical = Control.GROW_DIRECTION_BEGIN
	br.position = Vector2(-16 * S, -16 * S); br.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var act := Button.new(); act.visible = false
	act.add_theme_stylebox_override("normal", _sb(GOLD, 22 * S, 10 * S))
	act.add_theme_stylebox_override("hover", _sb(GOLD, 22 * S, 10 * S))
	act.add_theme_stylebox_override("pressed", _sb(GOLD.darkened(0.15), 22 * S, 10 * S))
	for k in ["font_color", "font_hover_color", "font_pressed_color"]: act.add_theme_color_override(k, INK)
	act.add_theme_font_size_override("font_size", int(17 * S))
	act.size_flags_horizontal = Control.SIZE_SHRINK_END
	b["btn-action"] = act; br.add_child(act)
	var steer := HBoxContainer.new(); steer.add_theme_constant_override("separation", int(12 * S)); steer.visible = false; steer.size_flags_horizontal = Control.SIZE_SHRINK_END
	b["btn-left"] = _drive_btn("◀", Color(1, 1, 1, 0.8), Vector2(92, 92)); steer.add_child(b["btn-left"])
	b["btn-right"] = _drive_btn("▶", Color(1, 1, 1, 0.8), Vector2(92, 92)); steer.add_child(b["btn-right"])
	b["steer-row"] = steer; br.add_child(steer)
	var walk := HBoxContainer.new(); walk.add_theme_constant_override("separation", int(12 * S)); walk.alignment = BoxContainer.ALIGNMENT_END; walk.size_flags_horizontal = Control.SIZE_SHRINK_END
	b["btn-emote"] = round_btn("💬"); walk.add_child(b["btn-emote"])
	b["btn-jump"] = round_btn("⇧", 76); walk.add_child(b["btn-jump"])
	b["walk-row"] = walk; br.add_child(walk)
	hud.add_child(br)
	# apakšā vidū
	var bc := HBoxContainer.new(); bc.add_theme_constant_override("separation", int(10 * S))
	bc.set_anchors_preset(Control.PRESET_CENTER_BOTTOM); bc.grow_horizontal = Control.GROW_DIRECTION_BOTH; bc.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bc.position.y = -16 * S; bc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b["btn-race"] = pill("🏁 Sacīkstes"); b["btn-race"].visible = false; bc.add_child(b["btn-race"])
	b["btn-exit-kart"] = pill("🚶 Izkāpt"); b["btn-exit-kart"].visible = false; bc.add_child(b["btn-exit-kart"])
	hud.add_child(bc)
	var em := HFlowContainer.new(); em.visible = false
	em.set_anchors_preset(Control.PRESET_CENTER_BOTTOM); em.grow_horizontal = Control.GROW_DIRECTION_BOTH; em.grow_vertical = Control.GROW_DIRECTION_BEGIN
	em.position.y = -150 * S; em.custom_minimum_size.x = 520 * S; em.alignment = FlowContainer.ALIGNMENT_CENTER
	b["emote-menu"] = em; hud.add_child(em)
	# zemes ielādes ekrāns
	zone_load = ColorRect.new(); (zone_load as ColorRect).color = Color(0.1, 0.18, 0.1, 0.0)
	zone_load.set_anchors_preset(Control.PRESET_FULL_RECT); zone_load.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var zb := VBoxContainer.new(); zb.set_anchors_preset(Control.PRESET_CENTER); zb.grow_horizontal = Control.GROW_DIRECTION_BOTH; zb.grow_vertical = Control.GROW_DIRECTION_BOTH
	zb.alignment = BoxContainer.ALIGNMENT_CENTER
	for p in [["load-title", "Dodies uz", 18], ["load-name", "", 34], ["load-hint", "Ielādē jauno zemi…", 15]]:
		var l := Label.new(); l.text = p[1]; l.add_theme_font_size_override("font_size", int(p[2] * S)); l.add_theme_color_override("font_color", Color.WHITE)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; b[p[0]] = l; zb.add_child(l)
	zone_load.add_child(zb)
	zone_load.visible = false
	b["zone-load"] = zone_load
	hud.add_child(zone_load)

func _center_top(c: Control, top: float) -> Control:
	c.set_anchors_preset(Control.PRESET_CENTER_TOP)
	c.grow_horizontal = Control.GROW_DIRECTION_BOTH
	c.position.y = top * S
	hud.add_child(c)
	return c

func _drive_btn(text: String, col: Color, sz: Vector2) -> Button:
	var bt := Button.new(); bt.text = text
	bt.custom_minimum_size = sz * S
	var sb := _sb(col, 22 * S, 4 * S)
	bt.add_theme_stylebox_override("normal", sb); bt.add_theme_stylebox_override("hover", sb)
	bt.add_theme_stylebox_override("pressed", _sb(col.lightened(0.25), 22 * S, 4 * S))
	bt.add_theme_font_size_override("font_size", int(22 * S))
	for k in ["font_color", "font_hover_color", "font_pressed_color"]: bt.add_theme_color_override(k, INK if col.v > 0.7 else Color.WHITE)
	bt.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	return bt

func set_driving(on: bool) -> void:
	b["hud-bl"].visible = on
	b["steer-row"].visible = on
	b["walk-row"].visible = not on

## nospiešana (pointerdown kā web): fn() tiek izsaukta uzreiz
func press(id: String, fn: Callable) -> void:
	var c: Control = b.get(id)
	if c is BaseButton:
		(c as BaseButton).action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		(c as BaseButton).pressed.connect(func() -> void:
			if id != "btn-jump" and id != "btn-action": sfx_cb.call("ui_click", {"vol": 0.35, "gap": 50})
			fn.call())
	elif c:
		c.gui_input.connect(func(e: InputEvent) -> void:
			if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed): fn.call())

# ---------- paziņojumi ----------
func toast(text: String, kind: String = "", ms: float = 2600.0) -> void:
	ms = minf(ms, 2000.0 + text.length() * 35.0)
	var p := PanelContainer.new()
	var col := Color(0, 0, 0, 0.6)
	if kind == "good": col = Color(30 / 255.0, 120 / 255.0, 50 / 255.0, 0.75)
	elif kind == "bad": col = Color(170 / 255.0, 40 / 255.0, 40 / 255.0, 0.78)
	p.add_theme_stylebox_override("panel", _sb(col, 14 * S, 5 * S, false))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := Label.new(); l.text = text; l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_font_size_override("font_size", int(14 * S)); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.custom_minimum_size.x = minf(560.0 * S, maxf(120.0, text.length() * 8.0 * S))
	p.add_child(l)
	p.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	toasts.add_child(p)
	while toasts.get_child_count() > 3:
		var t0 := toasts.get_child(0); toasts.remove_child(t0); t0.queue_free()
	p.modulate.a = 0.0
	var tw := p.create_tween()
	tw.tween_property(p, "modulate:a", 1.0, 0.2)
	tw.tween_interval(maxf(0.15, ms / 1000.0 - 0.65))
	tw.tween_property(p, "modulate:a", 0.0, 0.45)
	tw.tween_callback(p.queue_free)

# ---------- panelis ----------
func _build_panel(root: Control) -> void:
	panel_root = ColorRect.new()
	(panel_root as ColorRect).color = Color(0, 0, 0, 0.35)
	panel_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel_root.visible = false
	panel_root.gui_input.connect(func(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed): closePanel())
	root.add_child(panel_root)
	panel_box = PanelContainer.new()
	panel_box.set_anchors_preset(Control.PRESET_CENTER)
	panel_box.grow_horizontal = Control.GROW_DIRECTION_BOTH; panel_box.grow_vertical = Control.GROW_DIRECTION_BOTH
	panel_root.add_child(panel_box)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 0)
	panel_box.add_child(v)
	var head := PanelContainer.new()
	var hs := _sb(GREEN, 20 * S, 10 * S, false); hs.corner_radius_bottom_left = 0; hs.corner_radius_bottom_right = 0
	head.add_theme_stylebox_override("panel", hs)
	var hb := HBoxContainer.new()
	panel_title = Label.new(); panel_title.add_theme_color_override("font_color", Color.WHITE); panel_title.add_theme_font_size_override("font_size", int(19 * S))
	panel_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; panel_title.clip_text = true
	hb.add_child(panel_title)
	var cl := Button.new(); cl.text = "✕"; cl.custom_minimum_size = Vector2(38, 38) * S
	var cs := _sb(Color(1, 1, 1, 0.25), 19 * S, 0, false)
	cl.add_theme_stylebox_override("normal", cs); cl.add_theme_stylebox_override("hover", cs); cl.add_theme_stylebox_override("pressed", cs)
	cl.pressed.connect(closePanel)
	hb.add_child(cl)
	head.add_child(hb)
	v.add_child(head)
	panel_scroll = ScrollContainer.new()
	panel_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var m := MarginContainer.new()
	for k in ["margin_left", "margin_right"]: m.add_theme_constant_override(k, int(16 * S))
	m.add_theme_constant_override("margin_top", int(12 * S)); m.add_theme_constant_override("margin_bottom", int(18 * S))
	m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel_body = VBoxContainer.new(); panel_body.add_theme_constant_override("separation", int(8 * S))
	panel_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.add_child(panel_body)
	panel_scroll.add_child(m)
	v.add_child(panel_scroll)

func _fit_panel(wide: bool) -> void:
	var vs := get_viewport().get_visible_rect().size
	var w := minf((760.0 if wide else 520.0) * S, vs.x - 24.0 * S)
	panel_box.custom_minimum_size = Vector2(w, 0)
	panel_scroll.custom_minimum_size = Vector2(w, 0)
	await get_tree().process_frame
	var content_h: float = panel_body.get_combined_minimum_size().y + 30.0 * S
	var max_h := vs.y * 0.92 - 60.0 * S
	panel_scroll.custom_minimum_size.y = minf(content_h, max_h)
	panel_box.reset_size()
	panel_box.position = (vs - panel_box.size) / 2.0

## paneļa saturu noņem uzreiz, bet atbrīvo kadra beigās (poga, kas pārbūvē paneli, vēl izpilda savu signālu)
func _clear_body() -> void:
	for c in panel_body.get_children():
		panel_body.remove_child(c); c.queue_free()

func showPanel(title: String, build: Callable, on_close: Callable = Callable(), wide := false) -> void:
	panel_title.text = title
	_clear_body()
	panel_build = build
	build.call(panel_body)
	sfx_cb.call("ui_open" if not panel_root.visible else "book", {"vol": 0.45})
	panel_root.visible = true
	panel_on_close = on_close
	_fit_panel(wide)

func refreshPanel(build: Callable = Callable()) -> void:
	var sc := panel_scroll.scroll_vertical
	_clear_body()
	(build if build.is_valid() else panel_build).call(panel_body)
	await get_tree().process_frame
	panel_scroll.scroll_vertical = sc

func closePanel() -> void:
	if panel_root.visible: sfx_cb.call("ui_close", {"vol": 0.4})
	panel_root.visible = false
	if panel_on_close.is_valid():
		var f := panel_on_close
		panel_on_close = Callable()
		f.call()

func panelOpen() -> bool: return panel_root.visible

# ---------- paneļa saturs (web el / itemRow aizstājēji) ----------
func p(text: String, size: float = 15.0, color: Color = INK) -> Label:
	var l := Label.new(); l.text = text; l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", int(size * S)); l.add_theme_color_override("font_color", color)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

func h3(text: String) -> Label: return p(text, 17.0, GREEN)

func btn(text: String, fn: Callable, alt := false, disabled := false) -> Button:
	var bt := Button.new(); bt.text = text
	bt.add_theme_font_size_override("font_size", int(14 * S))
	if alt:
		bt.add_theme_stylebox_override("normal", _sb(Color("#e0d6bf"), 12 * S, 6 * S, false))
		bt.add_theme_stylebox_override("hover", _sb(Color("#e8dfca"), 12 * S, 6 * S, false))
		bt.add_theme_stylebox_override("pressed", _sb(Color("#d0c6af"), 12 * S, 6 * S, false))
		for k in ["font_color", "font_hover_color", "font_pressed_color"]: bt.add_theme_color_override(k, INK)
	bt.disabled = disabled
	bt.pressed.connect(func() -> void:
		sfx_cb.call("ui_click", {"vol": 0.35, "gap": 50})
		fn.call())
	return bt

func row(items: Array, sep := 8.0) -> HBoxContainer:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", int(sep * S))
	for c in items: h.add_child(c)
	return h

## rinda ar ikonu, nosaukumu un pogām [{label, onclick, disabled, alt}]
func itemRow(icon, name: String, sub: String = "", buttons: Array = [], highlight := false) -> PanelContainer:
	var pc := PanelContainer.new()
	pc.add_theme_stylebox_override("panel", _sb(Color(1, 0.96, 0.75) if highlight else Color(1, 1, 1, 0.75), 12 * S, 6 * S, false))
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", int(10 * S))
	if icon is Texture2D:
		var tr := TextureRect.new(); tr.texture = icon; tr.custom_minimum_size = Vector2(40, 40) * S
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		h.add_child(tr)
	else:
		var il := Label.new(); il.text = str(icon); il.add_theme_font_size_override("font_size", int(26 * S))
		il.custom_minimum_size = Vector2(40, 40) * S; il.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; il.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		h.add_child(il)
	var nm := VBoxContainer.new(); nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL; nm.add_theme_constant_override("separation", 0)
	var nl := p(name, 15.0); nm.add_child(nl)
	if sub != "": nm.add_child(p(sub, 12.0, Color(0.35, 0.35, 0.35)))
	h.add_child(nm)
	for bd in buttons:
		h.add_child(btn(str(bd.get("label", "")), bd.get("onclick", func(): pass), bd.get("alt", false), bd.get("disabled", false)))
	pc.add_child(h)
	return pc

func bar(frac: float) -> ProgressBar:
	var pb := ProgressBar.new(); pb.max_value = 1.0; pb.value = clampf(frac, 0.0, 1.0); pb.show_percentage = false
	pb.custom_minimum_size.y = 10 * S
	return pb

func grid(cols: int) -> GridContainer:
	var g := GridContainer.new(); g.columns = cols
	g.add_theme_constant_override("h_separation", int(8 * S)); g.add_theme_constant_override("v_separation", int(8 * S))
	return g

# ---------- ielāde ----------
func _build_loading(root: Control) -> void:
	loading = ColorRect.new()
	(loading as ColorRect).color = Color(0.18, 0.49, 0.2)
	loading.set_anchors_preset(Control.PRESET_FULL_RECT)
	loading.visible = false
	var v := VBoxContainer.new(); v.set_anchors_preset(Control.PRESET_CENTER); v.grow_horizontal = Control.GROW_DIRECTION_BOTH; v.grow_vertical = Control.GROW_DIRECTION_BOTH
	v.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_theme_constant_override("separation", int(12 * S))
	loading_text = Label.new(); loading_text.add_theme_color_override("font_color", Color.WHITE); loading_text.add_theme_font_size_override("font_size", int(18 * S))
	loading_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_bar = ProgressBar.new(); loading_bar.custom_minimum_size = Vector2(320, 14) * S; loading_bar.max_value = 1.0
	v.add_child(loading_text); v.add_child(loading_bar)
	loading.add_child(v)
	root.add_child(loading)

func progress(f: float, text: String) -> void:
	loading.visible = true
	loading_text.text = text
	loading_bar.value = clampf(f, 0.0, 1.0)

func zone_loading(on: bool, name: String = "") -> void:
	if name != "": set_text("load-name", name)
	var cr: ColorRect = zone_load
	if on:
		zone_load.visible = true
		zone_load.mouse_filter = Control.MOUSE_FILTER_STOP
		var tw := create_tween(); tw.tween_property(cr, "color:a", 0.96, 0.3)
	else:
		zone_load.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var tw := create_tween(); tw.tween_property(cr, "color:a", 0.0, 0.35); tw.tween_callback(func(): zone_load.visible = false)

func fmt_time(ms: float) -> String:
	var s := ms / 1000.0
	var m := int(s / 60.0)
	var sec := fmod(s, 60.0)
	return ("%d:%04.1f" % [m, sec]) if m > 0 else ("%.1f" % sec)
