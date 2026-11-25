class_name Terra
extends RefCounted
## Zemes reljefa vaicājumi (web: World / WinterZone / TrailZone kopīgā saskarne).
## Godot Vector3 ir vērtība → collide atgriež jauno pozīciju, `hit` — vai bija sadursme.

const ZONE_HALF := 315.0
const CROSS_AT := 3.0
const GROUND_Y := 1.0
const WATER_Y := 0.0
const DIRS := {"n": Vector2(0, -1), "e": Vector2(1, 0), "s": Vector2(0, 1), "w": Vector2(-1, 0)}
const OPP := {"n": "s", "s": "n", "e": "w", "w": "e"}

var zone := "c"
var open: Array = []
var hit := false
var is_world := false
var node: Node3D            # uzbūvētā aina (WebScene)

static func neighbour(id: String, side: String) -> String:
	if id == "c": return side
	return "c" if side == OPP.get(id, "") else ""

static func open_sides(id: String) -> Array:
	var out := []
	for s in ["n", "e", "s", "w"]:
		if neighbour(id, s) != "": out.append(s)
	return out

static func sq_dist(x: float, z: float) -> float: return maxf(absf(x), absf(z))

static func zone_bounds(id: String) -> Array:
	var H := ZONE_HALF
	return [-H, -H, H, ZONE_HALF * 3.0 if id == "s" else H]

static func zone_offset(id: String) -> Vector2:
	var d: Vector2 = DIRS.get(id, Vector2.ZERO)
	return d * ZONE_HALF * 2.0

static func along_lat(x: float, z: float, side: String) -> Vector2:
	var d: Vector2 = DIRS[side]
	return Vector2(x * d.x + z * d.y, x * d.y - z * d.x)

## notur kvadrātā; pār atvērtajām robežām var paiet nedaudz tālāk
func clamp_square(pos: Vector3) -> Vector3:
	for s in DIRS:
		var d: Vector2 = DIRS[s]
		var along := pos.x * d.x + pos.z * d.y
		var lim := ZONE_HALF + CROSS_AT + 3.0 if open.has(s) else ZONE_HALF
		if s == "s" and zone == "s": lim = ZONE_HALF * 3.0
		if along > lim:
			pos.x -= d.x * (along - lim); pos.z -= d.y * (along - lim)
			hit = true
	return pos

func get_height(_x: float, _z: float) -> float: return GROUND_Y
func ground_at(x: float, z: float, _y: float = 1e9) -> float: return get_height(x, z)
func collide(pos: Vector3, _r: float) -> Vector3:
	hit = false
	return clamp_square(pos)
func road_dist(_x: float, _z: float) -> float: return 99.0
func ceiling_at(_x: float, _z: float) -> float: return INF
func cam_block(_x: float, _y: float, _z: float) -> bool: return false
func update(_dt: float, _g) -> void: pass
func update_visibility(_x: float, _z: float) -> void: pass
func dispose() -> void:
	if node and is_instance_valid(node): node.queue_free()
