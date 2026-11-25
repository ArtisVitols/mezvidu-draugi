class_name WebData
extends RefCounted
## dumpData formāts (tools/export/dump.js): JSON ar {"$b": i} → tipizēts masīvs no .bin, {"$c": [r,g,b]} → Color

static func load_data(name: String) -> Dictionary:
	var f := FileAccess.open("res://web/" + name + ".json", FileAccess.READ)
	if f == null:
		push_error("WebData: nav " + name)
		return {}
	var j: Dictionary = JSON.parse_string(f.get_as_text())
	var bin := FileAccess.get_file_as_bytes("res://web/" + name + ".bin")
	return _fix(j.get("data", {}), j.get("bufs", []), bin)

static func _fix(v, bufs: Array, bin: PackedByteArray):
	if v is Dictionary:
		if v.has("$b") and v.size() == 1:
			var b: Array = bufs[int(v["$b"])]
			var raw := bin.slice(int(b[0]), int(b[0]) + int(b[1]))
			var kind: String = str(b[2]) if b.size() > 2 else "Float32Array"
			match kind:
				"Float32Array": return raw.to_float32_array()
				"Float64Array": return raw.to_float64_array()
				"Int32Array", "Uint32Array": return raw.to_int32_array()
				"Uint8Array", "Uint8ClampedArray": return raw
				"Uint16Array":
					var o := PackedInt32Array(); o.resize(raw.size() / 2)
					for i in o.size(): o[i] = raw.decode_u16(i * 2)
					return o
				"Int16Array":
					var o := PackedInt32Array(); o.resize(raw.size() / 2)
					for i in o.size(): o[i] = raw.decode_s16(i * 2)
					return o
				_: return raw.to_float32_array()
		if v.has("$c") and v.size() == 1:
			var c: Array = v["$c"]
			return Color(float(c[0]), float(c[1]), float(c[2]))
		var out := {}
		for k in v: out[k] = _fix(v[k], bufs, bin)
		return out
	if v is Array:
		var a := []
		a.resize(v.size())
		for i in v.size(): a[i] = _fix(v[i], bufs, bin)
		return a
	return v
