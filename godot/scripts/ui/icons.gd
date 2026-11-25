class_name Icons
extends RefCounted
## Ikonas no web icons.js (data/icons.json — SVG teksti) → ImageTexture (kešā pēc atslēgas un izmēra)
static var svgs := {}
static var cache := {}

static func _load() -> void:
	if not svgs.is_empty(): return
	var f := FileAccess.open("res://data/icons.json", FileAccess.READ)
	if f: svgs = JSON.parse_string(f.get_as_text())

static func tex(key: String, px: int = 64) -> Texture2D:
	_load()
	var ck := "%s@%d" % [key, px]
	if cache.has(ck): return cache[ck]
	var svg: String = str(svgs.get(key, svgs.get("nothing", "")))
	if svg == "": return null
	# izmērs no viewBox (ThorVG nesaprot width="100%")
	var re := RegEx.create_from_string('viewBox="([\\d.\\-]+) ([\\d.\\-]+) ([\\d.]+) ([\\d.]+)"')
	var m := re.search(svg)
	var vw := 64.0
	var vh := 64.0
	if m:
		vw = float(m.get_string(3)); vh = float(m.get_string(4))
	svg = svg.replace('width="100%"', 'width="%d"' % int(vw)).replace('height="100%"', 'height="%d"' % int(vh))
	var img := Image.new()
	var err := img.load_svg_from_string(svg, float(px) / maxf(vw, vh))
	if err != OK: return null
	var t := ImageTexture.create_from_image(img)
	cache[ck] = t
	return t
