class_name Yard
extends RefCounted
## Sētas ģeometrija (web world.js): 4 sētas krustojuma stūros, pagrieztas ap centru par 90°
const YARD_IN := 9.0
const YARD_OUT := 81.0
const TILE := 2.5
const GARDEN_T := [-25, -6]
const PLOT_ROT := [0, 1, 3, 2]
const HOME := Vector2(-37, -72)
const HOUSE := Vector2(-72, -22)
const GREEN := Vector2(-72, -49)
const GATE_A := 37.5

static func plot_sign(slot: int) -> Vector2: return Vector2(1 if slot % 2 else -1, -1 if slot < 2 else 1)

static func rot_plot(x: float, z: float, slot: int) -> Vector2:
	for k in PLOT_ROT[slot]:
		var t := x
		x = -z; z = t
	return Vector2(x, z)

static func rot_plot_y(slot: int) -> float: return -PLOT_ROT[slot] * PI / 2.0

static func tile_to_slot(ix: int, iz: int, slot: int) -> Vector2i:
	for k in PLOT_ROT[slot]:
		var t := ix
		ix = -1 - iz; iz = t
	return Vector2i(ix, iz)

static func tile_to_canon(ix: int, iz: int, slot: int) -> Vector2i:
	for k in PLOT_ROT[slot]:
		var t := ix
		ix = iz; iz = -1 - t
	return Vector2i(ix, iz)

static func canon_pt(x: float, z: float, slot: int) -> Vector2:
	for k in PLOT_ROT[slot]:
		var t := x
		x = z; z = -t
	return Vector2(x, z)

static func garden_tile(a: int, b: int) -> bool: return a >= GARDEN_T[0] and a <= GARDEN_T[1] and b >= GARDEN_T[0] and b <= GARDEN_T[1]

static func plot_of(x: float, z: float) -> int:
	var a := absf(x)
	var b := absf(z)
	if a < YARD_IN or b < YARD_IN or a > YARD_OUT or b > YARD_OUT: return -1
	return (1 if x > 0 else 0) + (2 if z > 0 else 0)

static func yard_part(x: float, z: float) -> String:
	var s := plot_of(x, z)
	if s < 0: return ""
	var c := canon_pt(x, z, s)
	if absf(c.x - HOUSE.x) < 3.3 and absf(c.y - HOUSE.y) < 2.8: return "house"
	if absf(c.x - GREEN.x) < 3.2 and absf(c.y - GREEN.y) < 5.7: return "green"
	if garden_tile(floori(c.x / TILE), floori(c.y / TILE)): return "garden"
	return "yard"

static func gate_spots(slot: int) -> Array:
	var out := []
	for g in [[-GATE_A, -YARD_IN, 0.0], [-YARD_IN, -GATE_A, PI / 2.0]]:
		var p := rot_plot(g[0], g[1], slot)
		out.append({"x": p.x, "z": p.y, "ry": float(g[2]) + rot_plot_y(slot)})
	return out
