extends Node
## Galvenā plūsma: izvēlne → spēle. Testi: -- --autotest=<vārds> (tests/<vārds>.gd)

func _ready() -> void:
	var t := Game.arg("autotest")
	if t != "":
		var p := "res://tests/%s.gd" % t
		var scr = load(p) if ResourceLoader.exists(p) else null
		if scr is GDScript and (scr as GDScript).can_instantiate():
			var n: Node = scr.new()
			n.name = "Autotest"
			add_child(n)
			return
		push_error("Nav testa vai tas nekompilējas: " + p)
		get_tree().quit(2)
		return
	var m := Menu.new()
	add_child(m)
	# pārbaudei ar eksportēto paku: -- --autosolo=<vārds> [--shot=ceļš] — uzreiz spēle vienam, pēc 25 s ekrānuzņēmums un iziešana
	var auto := Game.arg("autosolo")
	if auto != "":
		await get_tree().process_frame
		m.save = Game.load_save(auto, "").save; m.save.name = auto
		m.showRoom()
		m._solo()
		await get_tree().create_timer(25.0).timeout
		var shot := Game.arg("shot")
		if shot != "":
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(shot)
		print("[autosolo] gatavs")
		get_tree().quit()
