extends Node
## Galvenā plūsma: izvēlne → spēle. Testi: -- --autotest=<vārds> (tests/<vārds>.gd)

func _ready() -> void:
	var t := Game.arg("autotest")
	if t != "":
		var p := "res://tests/%s.gd" % t
		if ResourceLoader.exists(p):
			var n: Node = load(p).new()
			n.name = "Autotest"
			add_child(n)
			return
		push_error("Nav testa: " + p)
		get_tree().quit(2)
