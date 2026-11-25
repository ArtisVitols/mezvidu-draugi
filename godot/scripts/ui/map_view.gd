class_name MapView
extends Control
## Karte (web game.js drawLands / mapMarkers / drawMinimap / openBigMap). Zemju attēli — data/maps/*.png (no web).
## mini = true: minikarte ap spēlētāju, pagriezta pēc skata virziena (bulta vienmēr uz augšu).
## Lielā karte: viena zeme vai visas; vilkt — bīdīt, 2 pirksti / ritenis — tuvināt, pieskāriens zemei — tuvāk.

var g                      # spēle
var mini = true
var all = false
var zone = "c"
var k = 1.0
var cx = 0.5              # skata centrs kartes kvadrātā (0..1)
var cy = 0.5
static var tex = {}
var ptrs = {}
var gest = null
var dragged = false
const PLAYER_DOT := ["#ff4040", "#40a0ff", "#ffd040", "#c060ff"]
const ZONE_HALF := 315.0

static func land_tex(id: String, hi := false) -> Texture2D:
	var key = id + ("_hi" if hi else "")
	if not tex.has(key):
		var p = "res://data/maps/%s.png" % key
		tex[key] = load(p) if ResourceLoader.exists(p) else (load("res://data/maps/%s.png" % id) if ResourceLoader.exists("res://data/maps/%s.png" % id) else null)
	return tex[key]

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP if not mini else Control.MOUSE_FILTER_PASS
	clip_contents = true

func gpos(z: String, x: float, zz: float) -> Vector2:
	var o = Terra.zone_offset(z)
	return Vector2(x + o.x, zz + o.y)

# ---------- zīmēšana ----------
func _draw() -> void:
	if g == null or g.me.is_empty(): return
	if mini: _draw_mini()
	else: _draw_big()

func _draw_mini() -> void:
	var S = size.x
	var c = S / 2.0
	var VIEW = 110.0
	var p = gpos(g.zone, g.me.pos.x, g.me.pos.z)
	var sc = S / (2.0 * VIEW)
	var h: float = _my_heading()
	var rot = -PI / 2.0 - atan2(cos(h), sin(h))
	draw_rect(Rect2(Vector2.ZERO, size), Color("#4d5a40"))
	draw_set_transform(Vector2(c, c), rot, Vector2.ONE)
	_draw_lands(func(x: float, z: float) -> Vector2: return Vector2((x - p.x) * sc, (z - p.y) * sc), false, "")
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var cs = cos(rot)
	var sn = sin(rot)
	var to_px = func(x: float, z: float) -> Vector2:
		var dx = (x - p.x) * sc
		var dy = (z - p.y) * sc
		return Vector2(c + dx * cs - dy * sn, c + dx * sn + dy * cs)
	_draw_markers(to_px, 0, rot)
	var n = Vector2(c + sn * (c - 9 * UI.S * 0.8), c - cs * (c - 9 * UI.S * 0.8))
	draw_circle(n, 8 * UI.S * 0.8, Color(0.78, 0.12, 0.12, 0.9))
	_text("N", n + Vector2(0, 1), 11, Color.WHITE)
	# apaļa mala
	draw_arc(Vector2(c, c), c - 1, 0, TAU, 64, Color(1, 1, 1, 0.7), 3.0, true)

func _my_heading() -> float:
	if g.me.inKart and g.me.kart: return g.me.kart.heading
	if g.me.veh != null: return g.me.veh.heading
	return g.me.heading

func _big_to_px() -> Callable:
	var CW = size.x
	var CH = size.y
	var S = CW
	var to0: Callable
	if all:
		var E = ZONE_HALF * 4.0
		var CZ = ZONE_HALF
		to0 = func(x: float, z: float) -> Vector2: return Vector2((x + E) / (2.0 * E) * S, (z - CZ + E) / (2.0 * E) * S)
	else:
		var o = Terra.zone_offset(zone)
		var R: float = (ZONE_HALF + 10.0) * (2.0 if zone == "s" else 1.0)
		var oz: float = o.y + (ZONE_HALF if zone == "s" else 0.0)
		to0 = func(x: float, z: float) -> Vector2: return Vector2((x - o.x + R) / (2.0 * R) * S, (z - oz + R) / (2.0 * R) * S)
	return func(x: float, z: float) -> Vector2:
		var q: Vector2 = to0.call(x, z)
		return Vector2((q.x - cx * S) * k + CW / 2.0, (q.y - cy * S) * k + CH / 2.0)

func _draw_big() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#2e3a2a"))
	var to_px = _big_to_px()
	_draw_lands(to_px, "all" if all else "", "" if all else zone)
	_draw_markers(to_px, 2 if all else 1, 0.0)
	if k > 1.01: _label("🔍 ×%.1f" % k, Vector2(34 * UI.S, size.y - 14 * UI.S), 12)
	_label("⬆ N", Vector2(size.x - 26 * UI.S, 16 * UI.S), 13)

func _draw_lands(to_px: Callable, labels, hi_zone: String) -> void:
	for id in ["c", "n", "e", "s", "w"]:
		var o = Terra.zone_offset(id)
		var b = Terra.zone_bounds(id)
		var a: Vector2 = to_px.call(o.x + b[0], o.y + b[1])
		var c: Vector2 = to_px.call(o.x + b[2], o.y + b[3])
		var t = land_tex(id, hi_zone == id and k >= 1.5)
		if t: draw_texture_rect(t, Rect2(a, c - a), false)
		else: draw_rect(Rect2(a, c - a), Color(Game.C.zones.ZONES[id].map))
		if id == "n" and (labels or g.zone == "n"):
			for wi in Game.C.winter.WINTER_ICONS:
				_text(str(wi[0]), to_px.call(o.x + float(wi[1]), o.y + float(wi[2])), 15 if labels else 11, Color.WHITE)
		if id == "s" and (labels or g.zone == "s"):
			var step: int = int(g.trail.step) if g.trail != null else 0
			for ic in g.trailIcons(g.trail):
				var pp: Vector2 = to_px.call(o.x + float(ic[1]), o.y + float(ic[2]))
				_icon(str(ic[0]), pp, 15 if labels else 11, Color(1, 0.78, 0.24, 0.95) if ic.size() > 3 and int(ic[3]) == step else Color(0, 0, 0, 0))
		draw_rect(Rect2(a, c - a), Color(90 / 255.0, 60 / 255.0, 30 / 255.0, 0.8), false, 1.0)
		if labels is String and labels == "all":
			var Z: Dictionary = Game.C.zones.ZONES[id]
			_label("%s %s" % [Z.icon, Z.name], to_px.call(o.x, o.y + (ZONE_HALF if id == "s" else 0.0)), 15)

func _draw_markers(to0: Callable, zoom: int, rot: float) -> void:
	var big = zoom > 0
	var IS = 20 if zoom == 1 else (13 if zoom == 2 else 11)
	var fo = Terra.zone_offset("e")
	var to_f = func(x: float, z: float) -> Vector2: return to0.call(x + fo.x, z + fo.y)
	for p in g.world.d.places:
		var ic: String = Game.D.PLACES[p.id].icon
		if big: _icon(ic, to_f.call(p.x, p.z), IS)
		else: _text(ic, to_f.call(p.x, p.z), IS, Color.WHITE)
	if g.mgIn():
		var mg = g.mg
		var cc: Vector2 = to_f.call(mg.cx, mg.cz)
		var ee: Vector2 = to_f.call(mg.cx + mg.R, mg.cz)
		draw_arc(cc, cc.distance_to(ee), 0, TAU, 48, Color("#ff3030"), 2.0)
	if g.save.get("revealed", false):
		for s in g.world.d.stars:
			if g.save.stars.has(int(s.id)): continue
			draw_circle(to_f.call(s.x, s.z), 4.0 if big else 2.0, Color("#ffe14a"))
	if zoom == 1:
		for v in Game.C.world.VENDORS: _icon(str(v.title).split(" ")[0], to_f.call(v.x, v.z), 16)
		_icon("🪙", to_f.call(0.0, 0.0), 16, Color(0.63, 0.86, 1.0, 0.9))
		if not g.ice.is_empty(): _icon("🍦", to_f.call(g.ice.pos.x, g.ice.pos.z), 14)
	else:
		if big: _icon("🛒", to_f.call(0.0, 0.0), IS)
		else: _text("🛒", to_f.call(0.0, 0.0), IS, Color.WHITE)
	var ro = Terra.zone_offset("w")
	var ks: Dictionary = g.raceW.d.kartSpot
	var kp: Vector2 = to0.call(float(ks.x) + ro.x, float(ks.z) + ro.y)
	if big: _icon("🏎️", kp, IS)
	else: _text("🏎️", kp, IS, Color.WHITE)
	var ho = Terra.zone_offset("c")
	if big:
		for slot in 4:
			var sg = [1.0 if slot % 2 else -1.0, -1.0 if slot < 2 else 1.0]
			var pp: Vector2 = to0.call(ho.x + sg[0] * 45.0, ho.y + sg[1] * 45.0)
			var owner = null
			for pr in g.profiles.values(): if int(pr.get("slot", -1)) == slot: owner = pr.name
			if zoom == 1 or owner != null:
				_label("🏡 %s" % owner if owner != null else "🌾 brīva", pp, 15 if zoom == 1 else 11, Color.WHITE if owner != null else Color("#e8e0c0"))
	else: _text("🏡", to0.call(ho.x, ho.y), IS, Color.WHITE)
	for v in g.vehMarkers():
		if v.driven: continue
		var gp = gpos(v.zone, v.x, v.z)
		var ic: String = "🚙" if v.kind == "car" else ("🚲" if v.kind == "bike" else ("🚣" if v.kind == "boat" else "🛷"))
		_icon(ic, to0.call(gp.x, gp.y), 17 if zoom == 1 else (12 if zoom == 2 else 10), Color(v.color))
	if g.buses.size() > 0:
		if zoom > 0:
			var named = {}
			for s in Game.C.bus.BUS_STOPS:
				var sp: Vector2 = to0.call(float(s.x), float(s.z))
				_icon("🚏", sp, 14 if zoom == 1 else 10, Color(1, 1, 1, 0.9))
				if k >= 2.5 and not named.has(s.name):
					named[s.name] = true
					_label(str(s.name), sp + Vector2(0, 16 * UI.S * 0.6), 11, Color("#cfe4ff"))
		for B in g.buses:
			if B.get("zone") == null or str(B.zone) == "": continue
			var bp = gpos(B.zone, B.lx, B.lz)
			_icon("🚌", to0.call(bp.x, bp.y), 19 if zoom == 1 else (14 if zoom == 2 else 12), Color("#1f6fd6"))
	for r in g.remotes.values():
		if not r.seen or g.mgHidden(r.id): continue
		var rp = gpos(r.zone, r.pos.x, r.pos.z)
		var pp: Vector2 = to0.call(rp.x, rp.y)
		var col = Color(PLAYER_DOT[int(r.prof.get("slot", 0)) % 4])
		var vc = int(r.vehCode)
		var vk = {2: "🚙", 5: "🚲", 3: "🛷", 1: "🏎️", 7: "🚣"}.get(vc)
		if vk != null and big: _icon(vk, pp, 17 if zoom == 1 else 12, col)
		_arrow(pp, r.ry, rot, (1.6 if zoom == 1 else 1.2) if big else 1.0, col, Color.WHITE)
		if big: _label(str(r.prof.name), pp - Vector2(0, (20 if zoom == 1 else 14) * UI.S * 0.6), 14 if zoom == 1 else 11)
	var mp = gpos(g.zone, g.me.pos.x, g.me.pos.z)
	var mpx: Vector2 = to0.call(mp.x, mp.y)
	_arrow(mpx, _my_heading(), rot, 1.9 if zoom == 1 else (1.4 if zoom == 2 else 1.15), Color.WHITE, Color("#d00000"))
	if big: _label("Tu", mpx - Vector2(0, (22 if zoom == 1 else 15) * UI.S * 0.6), 14 if zoom == 1 else 11, Color("#ffe14a"))

# ---------- zīmēšanas palīgi ----------
func _fs(px: float) -> int: return int(px * UI.S * (0.8 if mini else 0.9))

func _text(t: String, p: Vector2, px: float, col: Color) -> void:
	var fs = _fs(px)
	var w = UI.font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(UI.font, p + Vector2(-w / 2.0, fs * 0.35), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

func _icon(t: String, p: Vector2, px: float, ring: Color = Color(0, 0, 0, 0)) -> void:
	var fs = _fs(px)
	if ring.a > 0.0: draw_circle(p, fs * 0.62, ring)
	else: draw_circle(p, fs * 0.6, Color(0, 0, 0, 0.25))
	_text(t, p, px, Color.WHITE)

func _label(t: String, p: Vector2, px: float, col := Color.WHITE) -> void:
	var fs = _fs(px)
	var w = UI.font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_rect(Rect2(p + Vector2(-w / 2.0 - 4, -fs * 0.7), Vector2(w + 8, fs * 1.25)), Color(0, 0, 0, 0.45))
	draw_string(UI.font, p + Vector2(-w / 2.0, fs * 0.35), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

func _arrow(p: Vector2, h: float, rot: float, kk: float, fill: Color, stroke: Color) -> void:
	# virziens kartē: (sin h, cos h), pagriezts par rot
	var d = Vector2(sin(h), cos(h)).rotated(rot)
	var nrm = Vector2(-d.y, d.x)
	var L = 9.0 * kk * UI.S * 0.6
	var pts = PackedVector2Array([p + d * L, p - d * L * 0.6 + nrm * L * 0.7, p - d * L * 0.25, p - d * L * 0.6 - nrm * L * 0.7])
	draw_colored_polygon(pts, fill)
	var cl = pts.duplicate(); cl.append(pts[0])
	draw_polyline(cl, stroke, 2.0, true)

# ---------- lielās kartes vadība ----------
func reset_zoom() -> void:
	k = (size.y / size.x) if all else 1.0
	cx = 0.5; cy = 0.5
	_clamp()

func _clamp() -> void:
	var kmin = size.y / maxf(1.0, size.x)
	k = clampf(k, kmin, 8.0)
	var hx = 1.0 / (2.0 * k)
	var hy = size.y / size.x / (2.0 * k)
	cx = 0.5 if hx * 2.0 >= 1.0 else clampf(cx, hx, 1.0 - hx)
	cy = 0.5 if hy * 2.0 >= 1.0 else clampf(cy, hy, 1.0 - hy)

func zoom_at(f: float, p := Vector2(-1, -1)) -> void:
	if p.x < 0: p = size / 2.0
	var mx = cx + (p.x - size.x / 2.0) / (k * size.x)
	var my = cy + (p.y - size.y / 2.0) / (k * size.x)
	k *= f; _clamp()
	cx = mx - (p.x - size.x / 2.0) / (k * size.x); cy = my - (p.y - size.y / 2.0) / (k * size.x); _clamp()
	queue_redraw()

func _gui_input(e: InputEvent) -> void:
	if mini:
		if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed):
			g.openBigMap()
			accept_event()
		return
	if e is InputEventMouseButton:
		var mb = e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: zoom_at(1.25, mb.position)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: zoom_at(0.8, mb.position)
		elif mb.button_index == MOUSE_BUTTON_LEFT and not DisplayServer.is_touchscreen_available(): _ptr(-1, mb.position, mb.pressed)
	elif e is InputEventMouseMotion and not DisplayServer.is_touchscreen_available():
		if ptrs.has(-1): _ptr_move(-1, (e as InputEventMouseMotion).position)
	elif e is InputEventScreenTouch:
		_ptr((e as InputEventScreenTouch).index, (e as InputEventScreenTouch).position, (e as InputEventScreenTouch).pressed)
	elif e is InputEventScreenDrag:
		_ptr_move((e as InputEventScreenDrag).index, (e as InputEventScreenDrag).position)
	accept_event()

func _start_gest() -> void:
	var p = ptrs.values()
	if p.size() == 1: gest = {"pan": true, "p": p[0], "cx": cx, "cy": cy}
	elif p.size() >= 2:
		var a: Vector2 = p[0]
		var b: Vector2 = p[1]
		var m = (a + b) / 2.0
		gest = {"pan": false, "d": maxf(10.0, a.distance_to(b)), "m": m, "k": k, "mx": cx + (m.x - size.x / 2.0) / (k * size.x), "my": cy + (m.y - size.y / 2.0) / (k * size.x)}
	else: gest = null

func _ptr(id: int, p: Vector2, down: bool) -> void:
	if down:
		ptrs[id] = p
		if ptrs.size() == 1: dragged = false
		_start_gest()
	else:
		if not ptrs.has(id): return
		ptrs.erase(id)
		if ptrs.is_empty() and not dragged and all: _tap(p)
		_start_gest()

func _ptr_move(id: int, p: Vector2) -> void:
	if not ptrs.has(id) or gest == null: return
	ptrs[id] = p
	var pv = ptrs.values()
	if gest.pan:
		var d: Vector2 = pv[0] - gest.p
		if d.length() > 6: dragged = true
		cx = gest.cx - d.x / (k * size.x); cy = gest.cy - d.y / (k * size.x); _clamp(); queue_redraw()
	elif pv.size() >= 2:
		dragged = true
		var a: Vector2 = pv[0]
		var b: Vector2 = pv[1]
		var m = (a + b) / 2.0
		k = gest.k * maxf(10.0, a.distance_to(b)) / gest.d; _clamp()
		cx = gest.mx - (m.x - size.x / 2.0) / (k * size.x); cy = gest.my - (m.y - size.y / 2.0) / (k * size.x); _clamp()
		queue_redraw()

func _tap(p: Vector2) -> void:
	var to_px = _big_to_px()
	for id in ["c", "n", "e", "s", "w"]:
		var o = Terra.zone_offset(id)
		var b = Terra.zone_bounds(id)
		var a: Vector2 = to_px.call(o.x + b[0], o.y + b[1])
		var c: Vector2 = to_px.call(o.x + b[2], o.y + b[3])
		if Rect2(a, c - a).has_point(p):
			all = false; zone = id; reset_zoom(); queue_redraw()
			if g.has_method("bigMapChanged"): g.bigMapChanged()
			return
