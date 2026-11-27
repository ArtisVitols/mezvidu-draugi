extends Node
## Iešana pa sniegu ziemā (lietotājs: avarē, ejot pa sniegu, uz ceļa ne): -- --autotest=winterwalk
func _ready() -> void:
	var s: Dictionary = Game.default_save("Sniegs"); s.name = "Sniegs"; s.zone = "n"; s.pos = {"x": 0.0, "z": 250.0}
	var net := Net.new(); net.start_offline()
	var g := Play.new(); g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	for i in 10: await get_tree().process_frame
	var surf := {}
	var steps := 0
	var plays0 := Aud.lastPlay.size()
	# ejam dažādos virzienos pa sniegu
	for dir in [Vector2(0, 1), Vector2(1, 0.3), Vector2(-0.5, 1), Vector2(-1, 0), Vector2(0.4, -1), Vector2(1, 1)]:
		UI.touch.move = dir.normalized()
		for i in 150:
			await get_tree().process_frame
			var sf: String = g.surfaceAt(g.me.pos.x, g.me.pos.z, g.me.pos.y)
			surf[sf] = int(surf.get(sf, 0)) + 1
		print("[winterwalk] pos %s" % g.me.pos)
	UI.touch.move = Vector2.ZERO
	print("[winterwalk] virsmas %s, skaņas atskaņotas: %s" % [surf, Aud.lastPlay.has("st_snow")])
	print("[winterwalk] ", "VISS IZDEVĀS" if surf.get("snow", 0) > 100 and Aud.lastPlay.has("st_snow") else "NEIZDEVĀS")
	get_tree().quit()
