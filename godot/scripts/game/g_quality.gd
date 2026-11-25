class_name GQuality
extends GSound
## 🎨 Grafikas līmeņi un automātika (web quality.js) + lietotnes papildinājums: manuāli iestatījumi
## (izšķirtspēja, ēnas, redzamības attālums, kadru ierobežojums, gludinātās malas, mirdzums), ko var mainīt virs izvēlētā līmeņa.

const Q_ORDER := ["lowest", "low", "mid", "high"]
const Q_MODES := ["auto", "high", "mid", "low", "lowest"]
const Q_LABEL := {"auto": "Auto", "high": "Augsta", "mid": "Vidēja", "low": "Zema", "lowest": "Viszemākā", "custom": "Pielāgota"}
## pr — izšķirtspēja (kā web pikseļu attiecība; telefonā tiek dalīta ar ekrāna blīvumu), post — mirdzums + gludinātas malas,
## shadow — ēnu kartes izmērs (0 = bez), detail — sīkumu attāluma reizinātājs, fog/far — redzamība, cheap — vienkāršāka gaisma
const QUALITY := {
	"high": {"pr": 1.5, "post": true, "shadow": 2048, "soft": true, "photo": true, "grass": 1.0, "detail": 1.0, "fog": [100, 360], "far": 450, "snow": 1.0},
	"mid": {"pr": 1.25, "post": false, "shadow": 2048, "soft": true, "photo": true, "grass": 1.0, "detail": 1.0, "fog": [100, 360], "far": 450, "snow": 1.0},
	"low": {"pr": 1.0, "post": false, "shadow": 1024, "soft": false, "photo": false, "grass": 0.75, "grassR": 0.9, "detail": 0.7, "fog": [80, 280], "far": 340, "cheap": true, "snow": 0.6},
	"lowest": {"pr": 1.0, "post": false, "shadow": 0, "soft": false, "photo": false, "grass": 0.6, "grassR": 0.8, "detail": 0.5, "fog": [55, 200], "far": 240, "cheap": true, "snow": 0.4},
}
const LS_MODE := "mezvidi_gfx"
const LS_AUTO := "mezvidi_auto_q"
const LS_STATS := "mezvidi_stats"
const LS_CUSTOM := "mezvidi_gfx_custom"
const DOWN_FPS := 27.0
const UP_FPS := 50.0
const TRIAL_FPS := 40.0
const RETRY_MS := 30000
const RETRY_MAX := 300000
## manuālie papildu iestatījumi (null = kā līmenī)
const C_SCALE := [null, 0.5, 0.67, 0.8, 1.0]
const C_SHADOW := [null, 0, 1024, 2048, 4096]
const C_DIST := [null, 0.6, 0.8, 1.0, 1.25, 1.5]
const C_FPS := [0, 30, 45, 60, 90]
const C_AA := [null, 0, 2, 4]

var qMode := "auto"
var qLevel := "mid"
var prScale := 1.0
var qa = null
var custom := {}
var statsLabel: Label = null
var st := {"t": 0, "n": 0, "calls": 0, "tris": 0}

func dens() -> float:
	# telefona ekrāna blīvums (web devicePixelRatio aizstājējs)
	var dpi := DisplayServer.screen_get_dpi()
	return clampf(dpi / 160.0, 1.0, 4.0) if dpi > 0 else 1.0

func initQuality() -> void:
	var m := str(Game.get_item(LS_MODE, "auto"))
	qMode = m if Q_MODES.has(m) else "auto"
	var c = Game.get_item(LS_CUSTOM, {})
	custom = c if c is Dictionary else {}
	applyQuality(startLevel(qMode))
	if str(Game.get_item(LS_STATS, "0")) == "1": toggleStats(true)

func startLevel(mode: String) -> String:
	if mode != "auto": return mode
	var s := str(Game.get_item(LS_AUTO, ""))
	if Q_ORDER.has(s): return s
	var cores := OS.get_processor_count()
	var mem := float(OS.get_memory_info().get("physical", 4e9)) / 1e9
	if mem <= 3.0 or cores <= 4: return "low"
	if mem >= 8.0 and cores >= 8: return "high"
	return "mid"

func cval(k: String):
	return custom.get(k) if custom.get(k) != null else null

## aktīvie iestatījumi: līmenis + manuālās izmaiņas
func applyQuality(level: String) -> void:
	qLevel = level
	var base: Dictionary = QUALITY[level]
	Q = base.duplicate(true)
	var vp := get_viewport()
	# izšķirtspēja
	var sc: float = clampf(float(Q.pr) / dens(), 0.35, 1.0) * prScale
	if cval("scale") != null: sc = float(custom.scale)
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	vp.scaling_3d_scale = sc
	# gludinātās malas un mirdzums
	var aa: int = 2 if Q.post else 0
	if cval("aa") != null: aa = int(custom.aa)
	vp.msaa_3d = Viewport.MSAA_4X if aa >= 4 else (Viewport.MSAA_2X if aa >= 2 else Viewport.MSAA_DISABLED)
	var glow: bool = Q.post
	if cval("glow") != null: glow = bool(custom.glow)
	env.glow_enabled = glow
	if glow:
		env.glow_intensity = 0.35; env.glow_bloom = 0.04; env.glow_hdr_threshold = 1.1
	# ēnas
	var sh: int = int(Q.shadow)
	if cval("shadow") != null: sh = int(custom.shadow)
	sun.shadow_enabled = sh > 0
	if sh > 0:
		RenderingServer.directional_shadow_atlas_set_size(sh, true)
		RenderingServer.directional_soft_shadow_filter_set_quality(RenderingServer.SHADOW_QUALITY_SOFT_LOW if Q.soft else RenderingServer.SHADOW_QUALITY_HARD)
		sun.directional_shadow_max_distance = 70.0 if sh <= 1024 else 90.0
	# redzamība
	var dm: float = float(custom.dist) if cval("dist") != null else 1.0
	env.fog_depth_begin = float(Q.fog[0]) * dm
	env.fog_depth_end = float(Q.fog[1]) * dm
	camera.far = float(Q.far) * dm
	Q.far = camera.far
	# sīkumi (web slānis 1 → Godot 2. slānis)
	camera.set_cull_mask_value(2, float(Q.detail) > 0)
	# vienkāršotā gaisma: bez debesu atspīduma
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED if Q.get("cheap", false) else Environment.REFLECTION_SOURCE_SKY
	Mats.terrain().set_shader_parameter("photo", 1.0 if Q.photo else 0.0)
	# kadru ierobežojums
	Engine.max_fps = int(custom.get("fps", 0))
	applyLandQuality()

## zemes daļām: sīkumu redzamības attālums
func applyLandQuality() -> void:
	if land_node == null or not is_instance_valid(land_node) or Q.is_empty(): return
	var det := float(Q.detail)
	var far := float(Q.far)
	for n in land_node.find_children("*", "GeometryInstance3D", true, false):
		var gi := n as GeometryInstance3D
		if gi.layers & 2: gi.visibility_range_end = maxf(30.0, 110.0 * det)
		elif gi is MultiMeshInstance3D: gi.visibility_range_end = far + 60.0
	if terr and terr.has_method("applyQuality"): terr.applyQuality(self)
	# zāle (meža, sētas un trases zemē)
	if terr is WorldLand:
		if terr.grass == null:
			terr.grass = Grass.new(terr)
			if terr == farmW: farmGrassHoles()
		var gr: Grass = terr.grass
		if gr.ok():
			if gr.node == null or not is_instance_valid(gr.node) or gr.node.get_parent() != land_node: gr.attach(land_node)
			gr.set_quality(float(Q.grass), float(Q.get("grassR", 1.0)))
			gr.update(me.pos.x, me.pos.z)
	timers.vis = 0.0

func qualitySnow() -> float: return float(Q.get("snow", 1.0))
func isCheap() -> bool: return bool(Q.get("cheap", false))

func setQualityMode(mode) -> void:
	qMode = str(mode)
	Game.set_item(LS_MODE, qMode)
	qa = null
	prScale = 1.0
	if qMode != "auto": applyQuality(qMode)
	else: applyQuality(qLevel)

func nextQualityMode() -> String: return Q_MODES[(Q_MODES.find(qMode) + 1) % Q_MODES.size()]

func qualityLabel() -> String:
	var c := " ✏️" if hasCustom() else ""
	return ("Auto (tagad: %s)" % Q_LABEL[qLevel] if qMode == "auto" else Q_LABEL[qMode]) + c

func hasCustom() -> bool:
	for k in ["scale", "shadow", "dist", "aa", "glow"]: if custom.get(k) != null: return true
	return false

func setCustom(k: String, v) -> void:
	if v == null: custom.erase(k)
	else: custom[k] = v
	Game.set_item(LS_CUSTOM, custom.duplicate())
	applyQuality(qLevel)

## automātika: fps 3 s logos (web autoQuality); ar manuāliem iestatījumiem darbojas tikai līmenis
func autoQuality() -> void:
	if statsOn: statsTick()
	if terr is WorldLand and terr.grass != null: terr.grass.update(me.pos.x, me.pos.z)
	if qMode != "auto": return
	var now := Time.get_ticks_msec()
	if qa == null: qa = {"last": now, "t": 0.0, "n": 0, "hold": 4.0, "good": 0, "trial": null, "trialN": 0, "retry": {}, "wait": {}}
	var a: Dictionary = qa
	var d := (now - int(a.last)) / 1000.0
	a.last = now
	if zoneBusy or not get_window().has_focus() or d > 5.0:
		a.t = 0.0; a.n = 0; a.hold = maxf(float(a.hold), 1.5); return
	if a.hold > 0:
		a.hold -= d; return
	a.t += d; a.n += 1
	if a.t < 3.0: return
	var fps: float = a.n / a.t
	a.t = 0.0; a.n = 0
	var i := Q_ORDER.find(qLevel)
	if a.trial == qLevel:
		if fps < TRIAL_FPS:
			var w: int = mini(RETRY_MAX, int(a.wait.get(qLevel, RETRY_MS / 2)) * 2)
			a.wait[qLevel] = w
			a.retry[qLevel] = now + w
			a.trial = null
			autoChange(Q_ORDER[i - 1])
			return
		a.trialN += 1
		if a.trialN >= 2:
			a.trial = null; a.wait.erase(qLevel)
		return
	if fps < DOWN_FPS and i > 0:
		a.good = 0; autoChange(Q_ORDER[i - 1]); return
	if i == 0 and (prScale > 0.86 if fps < DOWN_FPS else (fps >= 45 and prScale < 1.0)):
		prScale = snappedf(clampf(prScale + (-0.05 if fps < DOWN_FPS else 0.05), 0.85, 1.0), 0.01)
		applyQuality(qLevel)
		a.hold = 1.0
		if fps >= 45: return
	if fps >= UP_FPS and i < Q_ORDER.size() - 1:
		var nx: String = Q_ORDER[i + 1]
		a.good += 1
		if a.good >= 2 and not (int(a.retry.get(nx, 0)) > now):
			a.good = 0; a.trial = nx; a.trialN = 0
			autoChange(nx)
	else: a.good = 0

func autoChange(level: String) -> void:
	var up := Q_ORDER.find(level) > Q_ORDER.find(qLevel)
	applyQuality(level)
	Game.set_item(LS_AUTO, level)
	qa.hold = 2.5
	UI.toast("🎨 Grafika automātiski %s: %s" % ["uzlabota" if up else "vienkāršota", Q_LABEL[level]], "", 2500)

# ---------- 📊 mērītājs ----------
func toggleStats(on = null) -> void:
	statsOn = (not statsOn) if on == null else bool(on)
	Game.set_item(LS_STATS, "1" if statsOn else "0")
	if statsOn and statsLabel == null:
		statsLabel = Label.new()
		statsLabel.add_theme_font_size_override("font_size", int(11 * UI.S))
		statsLabel.add_theme_color_override("font_color", Color.WHITE)
		var sb := StyleBoxFlat.new(); sb.bg_color = Color(0, 0, 0, 0.6); sb.set_corner_radius_all(int(8 * UI.S)); sb.content_margin_left = 8 * UI.S; sb.content_margin_right = 8 * UI.S
		statsLabel.add_theme_stylebox_override("normal", sb)
		statsLabel.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		statsLabel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		statsLabel.set_anchors_preset(Control.PRESET_CENTER_TOP)
		statsLabel.position.y = 50 * UI.S
		UI.hud.add_child(statsLabel)
	if statsLabel: statsLabel.visible = statsOn
	st = {"t": Time.get_ticks_msec(), "n": 0, "calls": 0, "tris": 0}

func statsTick() -> void:
	if statsLabel == null: return
	st.n += 1
	st.calls += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	st.tris += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var now := Time.get_ticks_msec()
	var d: int = now - int(st.t)
	if d >= 500:
		var vs := get_viewport().get_visible_rect().size * get_viewport().scaling_3d_scale
		statsLabel.text = "%d fps · %.1f ms · %s\n%d zīmējumi · %dk trijst. · %.2f Mpx" % [roundi(st.n * 1000.0 / d), float(d) / st.n, Q_LABEL[qLevel], roundi(float(st.calls) / st.n), roundi(float(st.tris) / st.n / 1000.0), vs.x * vs.y / 1e6]
		statsLabel.reset_size()
		statsLabel.position.x = (UI.hud.size.x - statsLabel.size.x) / 2.0
		st = {"t": now, "n": 0, "calls": 0, "tris": 0}

# ---------- iestatījumu panelis (lietotnes papildinājums) ----------
func _cycle(arr: Array, cur):
	var i := arr.find(cur)
	return arr[(i + 1) % arr.size()]

func qualitySettings(b, build) -> void:
	var row := func(ic: String, name: String, sub: String, label: String, fn: Callable) -> void:
		b.add_child(UI.itemRow(ic, name, sub, [{"label": label, "alt": true, "onclick": func():
			fn.call(); UI.refreshPanel(build)}]))
	var lv := "kā līmenī"
	var sc = custom.get("scale")
	row.call("🖼️", "Izšķirtspēja", "Mazāka — ātrāk, lielāka — asāk", lv if sc == null else "%d%%" % roundi(float(sc) * 100), func(): setCustom("scale", _cycle(C_SCALE, sc)))
	var sh = custom.get("shadow")
	var shl: String = lv if sh == null else ("Izslēgtas" if int(sh) == 0 else {1024: "Zemas", 2048: "Vidējas", 4096: "Augstas"}[int(sh)])
	row.call("🌗", "Ēnas", "Ēnu asums (izslēgtas — ātrākais)", shl, func(): setCustom("shadow", _cycle(C_SHADOW, sh)))
	var ds = custom.get("dist")
	row.call("🔭", "Redzamības attālums", "Cik tālu redz pirms miglas", lv if ds == null else "%d%%" % roundi(float(ds) * 100), func(): setCustom("dist", _cycle(C_DIST, ds)))
	var aa = custom.get("aa")
	row.call("📐", "Gludas malas", "Mazāk robainas malas (MSAA)", lv if aa == null else ("Izslēgtas" if int(aa) == 0 else "%d×" % int(aa)), func(): setCustom("aa", _cycle(C_AA, aa)))
	var gl = custom.get("glow")
	row.call("✨", "Mirdzums", "Gaismas mirdzums ap spožām vietām", lv if gl == null else ("Ieslēgts" if gl else "Izslēgts"), func(): setCustom("glow", _cycle([null, true, false], gl)))
	var fp := int(custom.get("fps", 0))
	row.call("⏱️", "Kadru ierobežojums", "Mazāk kadru — mazāk silst un ilgāk tur baterija", "Nav" if fp == 0 else "%d fps" % fp, func(): setCustom("fps", _cycle(C_FPS, fp)))
	if hasCustom():
		b.add_child(UI.btn("↩️ Atjaunot līmeņa iestatījumus", func():
			for k in ["scale", "shadow", "dist", "aa", "glow"]: custom.erase(k)
			setCustom("fps", custom.get("fps", 0))
			UI.refreshPanel(build), true))
