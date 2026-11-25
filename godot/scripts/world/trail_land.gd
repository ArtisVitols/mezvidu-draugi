class_name TrailLand
extends Terra
## 🧭 Piedzīvojumu mežs (web trail.js TrailZone) — vaicājumi no izgāztajiem datiem
var g
func _init(game) -> void:
	g = game
	zone = "s"
	open = Terra.open_sides("s")
