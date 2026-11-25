class_name WinterLand
extends Terra
## ❄️ Ziemas zeme (web winter.js WinterZone) — vaicājumi no izgāztajiem datiem
var g
func _init(game) -> void:
	g = game
	zone = "n"
	open = Terra.open_sides("n")
