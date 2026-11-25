class_name WorldLand
extends Terra
## Sēta (c), mežs (e), trase (w) — web World vaicājumi no izgāztajiem datiem (web/data/<forest|farm|race>).

const SIZE := 760.0
const SEG := 304
const CELL := SIZE / SEG
const HALF := SIZE / 2.0
const TRACK_Y := 3.0
const TRACK_WIDTH := 12.0
const TRACK_N := 800
const TUN_W := 9.4
const TUN_WALL := 4.2
const TUN_TOP := 7.8
const TUN_H := 9.5
const ROAD_HW := 3.6

var d: Dictionary            # visi dati
var heights: PackedFloat32Array
var platforms: Array = []
var grid := {}               # Vector2i(8 m šūna) → [[x, z, r, id?]]
var cleared := {}            # nocirsti/novākti objekti (id → true)
var grass = null             # Grass (izveido pirmajā ielādē)
var road_idx: RoadIndex
var track_idx: RoadIndex
var track_pts: Array = []    # [{x, y, z, i}]
var tun_out: PackedFloat32Array
var mode := "forest"

static func land_name(id: String) -> String: return {"c": "farm", "e": "forest", "w": "race"}.get(id, "forest")

func _init(id: String) -> void:
	zone = id
	is_world = true
	open = Terra.open_sides(id)
	d = WebData.load_data("data/" + land_name(id))
	mode = str(d.get("mode", "forest"))
	heights = d.heights
	platforms = d.get("platforms", [])
	for c in d._extra.colliders: add_collider(float(c[0]), float(c[1]), float(c[2]), c[3] if c.size() > 3 else null)
	road_idx = RoadIndex.new(d.roadLines)
	if d.has("trackPts"):
		track_pts = d.trackPts
		for i in track_pts.size():
			var p = track_pts[i]
			if p is Array: track_pts[i] = {"x": float(p[0]), "y": float(p[1]), "z": float(p[2]), "i": i}
		track_idx = RoadIndex.new([track_pts], 20.0, 3)
		tun_out = d.tunOut

func add_collider(x: float, z: float, r: float, id = null) -> void:
	var k := Vector2i(floori(x / 8.0), floori(z / 8.0))
	if not grid.has(k): grid[k] = []
	grid[k].append([x, z, r] if id == null else [x, z, r, id])

func get_height(x: float, z: float) -> float:
	var n := SEG + 1
	var fx := clampf((x + HALF) / CELL, 0.0, SEG - 0.0001)
	var fz := clampf((z + HALF) / CELL, 0.0, SEG - 0.0001)
	var ix := int(fx)
	var iz := int(fz)
	var u := fx - ix
	var v := fz - iz
	var ha := heights[iz * n + ix]
	var hb := heights[(iz + 1) * n + ix]
	var hc := heights[(iz + 1) * n + ix + 1]
	var hd := heights[iz * n + ix + 1]
	if u + v <= 1.0: return ha + (hd - ha) * u + (hb - ha) * v
	return hc + (hb - hc) * (1.0 - u) + (hd - hc) * (1.0 - v)

func ground_at(x: float, z: float, y: float = 1e9) -> float:
	var h := get_height(x, z)
	if track_idx and y > TRACK_Y + 5.0:
		var t := in_tunnel(x, z)
		if not t.is_empty(): h = maxf(h, roof_at(t.d))
	for p in platforms:
		var dx: float = x - float(p.x)
		var dz: float = z - float(p.z)
		var c := cos(float(p.ang))
		var s := sin(float(p.ang))
		var lx := dx * c + dz * s
		var lz := -dx * s + dz * c
		if absf(lx) <= float(p.hw) and absf(lz) <= float(p.hl) and y >= float(p.y) - 0.7 and float(p.y) > h: h = float(p.y)
	return h

func is_water(x: float, z: float) -> bool: return get_height(x, z) < WATER_Y - 0.2

func collide(pos: Vector3, radius: float) -> Vector3:
	hit = false
	var cx := floori(pos.x / 8.0)
	var cz := floori(pos.z / 8.0)
	for a in range(-1, 2):
		for b in range(-1, 2):
			var list = grid.get(Vector2i(cx + a, cz + b))
			if list == null: continue
			for c in list:
				if c.size() > 3 and cleared.has(c[3]): continue
				var dx: float = pos.x - float(c[0])
				var dz: float = pos.z - float(c[1])
				var mn: float = float(c[2]) + radius
				var d2 := dx * dx + dz * dz
				if d2 < mn * mn and d2 > 1e-6:
					var dd := sqrt(d2)
					pos.x = float(c[0]) + dx / dd * mn
					pos.z = float(c[1]) + dz / dd * mn
					hit = true
	if track_idx and not (pos.y > TRACK_Y + 5.0):
		var t := in_tunnel(pos.x, pos.z)
		var lim := TUN_W - radius
		if not t.is_empty() and t.d > lim:
			var p = t.p
			var dx: float = pos.x - float(p.x)
			var dz: float = pos.z - float(p.z)
			var dd := maxf(0.0001, Vector2(dx, dz).length())
			pos.x = float(p.x) + dx / dd * lim; pos.z = float(p.z) + dz / dd * lim
			hit = true
	var h0 := hit
	pos = clamp_square(pos)
	hit = hit or h0
	return pos

func road_dist(x: float, z: float) -> float: return float(road_idx.near(x, z).d) - (ROAD_HW - 3.0)

# ---------- trase ----------
func track_dist(x: float, z: float) -> float: return float(track_idx.near(x, z).d) if track_idx else 999.0

func tunnel_info(x: float, z: float) -> Dictionary:
	if not track_idx: return {}
	var q := track_idx.near(x, z)
	if q.p == null: return {}
	return {"d": q.d, "e": tun_out[int(q.p.i)], "p": q.p}

func roof_at(l: float) -> float: return TRACK_Y + TUN_H * (1.0 - Game.smoothstep(14.0, 58.0, l)) - maxf(0.0, l - 13.8) * 0.6

func arch_at(l: float) -> float:
	var a := absf(l)
	if a >= TUN_W: return TUN_WALL
	return TUN_WALL + (TUN_TOP - TUN_WALL) * sqrt(maxf(0.0, 1.0 - pow(a / TUN_W, 2.0)))

func in_tunnel(x: float, z: float) -> Dictionary:
	var t := tunnel_info(x, z)
	return t if not t.is_empty() and float(t.e) == 0.0 and float(t.d) < 14.0 else {}

func ceiling_at(x: float, z: float) -> float:
	var t := in_tunnel(x, z)
	return TRACK_Y + arch_at(t.d) - 0.5 if not t.is_empty() and float(t.d) < TUN_W else INF

func nearest_track_idx(x: float, z: float, hint: int = -1) -> Dictionary:
	var best := 1e9
	var bi := 0
	var n := track_pts.size()
	if hint >= 0:
		for k in range(-25, 26):
			var i := (hint + k + n) % n
			var p = track_pts[i]
			var dd := pow(float(p.x) - x, 2.0) + pow(float(p.z) - z, 2.0)
			if dd < best:
				best = dd; bi = i
		if best < 400.0: return {"idx": bi, "dist": sqrt(best)}
	for i in n:
		var p = track_pts[i]
		var dd := pow(float(p.x) - x, 2.0) + pow(float(p.z) - z, 2.0)
		if dd < best:
			best = dd; bi = i
	return {"idx": bi, "dist": sqrt(best)}
