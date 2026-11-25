extends Node
## Visas rakstzīmes skriptos un datos ir fontos (Inter vai Noto Color Emoji): -- --autotest=glyphs
func _ready() -> void:
	var inter: FontFile = load("res://assets/fonts/Inter.ttf")
	var emo: FontFile = load("res://assets/fonts/NotoColorEmoji.ttf")
	var sym: FontFile = load("res://assets/fonts/SymbolsDejaVu.ttf")
	var texts := []
	for dir in ["res://scripts/game", "res://scripts/ui", "res://scripts/world", "res://scripts/core", "res://scripts/actors"]:
		for f in DirAccess.get_files_at(dir):
			if f.ends_with(".gd"): texts.append(FileAccess.get_file_as_string(dir + "/" + f))
	texts.append(FileAccess.get_file_as_string("res://data/consts.json"))
	var missing := {}
	for t in texts:
		for i in t.length():
			var c: int = t.unicode_at(i)
			if c < 0x2000: continue
			if c >= 0xFE00 and c <= 0xFE0F: continue   # variantu atlasītāji
			if c == 0x200D: continue
			if inter.has_char(c) or emo.has_char(c) or sym.has_char(c): continue
			missing[c] = true
	var out := []
	for c in missing: out.append("%s U+%X" % [String.chr(c), c])
	print("[glyphs] trūkst: ", out.size(), " ", ", ".join(out))
	print("[glyphs] ", "VISS IZDEVĀS" if out.is_empty() else "NEIZDEVĀS")
	get_tree().quit()
