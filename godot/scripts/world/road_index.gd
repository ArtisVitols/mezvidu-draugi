class_name RoadIndex
extends RefCounted
## zones.js RoadIndex: punkti režģī; near(x, z) → {d, p} (p — punkta vārdnīca ar x, z, h …)
var cell := 16.0
var reach := 2
var cells := {}
var lines: Array

func _init(ls: Array, c: float = 16.0, r: int = 2) -> void:
	lines = ls; cell = c; reach = r
	for l in ls:
		for p in l:
			var k := Vector2i(floori(float(p.x) / cell), floori(float(p.z) / cell))
			if not cells.has(k): cells[k] = []
			cells[k].append(p)

func near(x: float, z: float) -> Dictionary:
	var cx := floori(x / cell)
	var cz := floori(z / cell)
	var best := 99.0 * 99.0
	var bp = null
	for a in range(-reach, reach + 1):
		for b in range(-reach, reach + 1):
			var l = cells.get(Vector2i(cx + a, cz + b))
			if l == null: continue
			for p in l:
				var dx: float = float(p.x) - x
				var dz: float = float(p.z) - z
				var d := dx * dx + dz * dz
				if d < best:
					best = d; bp = p
	return {"d": sqrt(best), "p": bp}
