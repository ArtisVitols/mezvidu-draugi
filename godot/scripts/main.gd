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
