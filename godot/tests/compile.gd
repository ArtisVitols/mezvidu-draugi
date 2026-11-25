extends Node
## Visu skriptu ielāde (autoload ir pieejams): -- --autotest=compile
func _ready() -> void:
	var bad := 0
	var n := 0
	for dir in ["res://scripts", "res://tests"]:
		for f in _files(dir):
			n += 1
			var s = load(f)
			if not (s is GDScript) or not (s as GDScript).can_instantiate():
				bad += 1
				print("[compile] KĻŪDA ", f)
	print("[compile] skripti %d, kļūdaini %d" % [n, bad])
	get_tree().quit(1 if bad else 0)

func _files(d: String) -> Array:
	var out := []
	var da := DirAccess.open(d)
	if da == null: return out
	for f in da.get_files():
		if f.ends_with(".gd"): out.append(d + "/" + f)
	for s in da.get_directories(): out += _files(d + "/" + s)
	return out
