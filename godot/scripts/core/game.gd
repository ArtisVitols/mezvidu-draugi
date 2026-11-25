extends Node
## Globālais: konstantes no web versijas (data/consts.json — tools/export consts), localStorage aizstājējs (Store),
## saglabājumi (save.js), palīgfunkcijas (util.js), komandrindas argumenti.

var C: Dictionary = {}          # moduļu konstantes: C.data.CROPS, C.trail.TASKS …
var D: Dictionary = {}          # = C.data (īsāk)
var store: Dictionary = {}      # localStorage
const STORE_PATH := "user://store.json"
const PREFIX := "mezvidi_save_v1_"
const LAST := "mezvidi_last_profile"
const GAMES := "mezvidi_games"
const LAST_GAME := "mezvidi_last_game"
var FIRST_GAME := {"id": "", "name": "Pirmā spēle", "at": 0, "keep": {}}
var VERSION := "2.0.0"
var _store_dirty := false
var _store_t := 0.0

func _ready() -> void:
	var f := FileAccess.open("res://data/consts.json", FileAccess.READ)
	if f: C = JSON.parse_string(f.get_as_text())
	D = C.get("data", {})
	VERSION = str(ProjectSettings.get_setting("application/config/version", VERSION))
	var sf := FileAccess.open(STORE_PATH, FileAccess.READ)
	if sf:
		var j = JSON.parse_string(sf.get_as_text())
		if j is Dictionary: store = j
	set_process(true)

func _process(dt: float) -> void:
	if _store_dirty:
		_store_t -= dt
		if _store_t <= 0.0: flush()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		flush()

# ---------- localStorage ----------
func get_item(k: String, def = null):
	return store.get(k, def)

func set_item(k: String, v) -> void:
	store[k] = v
	_store_dirty = true
	if _store_t <= 0.0: _store_t = 0.5

func remove_item(k: String) -> void:
	store.erase(k)
	_store_dirty = true

func flush() -> void:
	if not _store_dirty: return
	_store_dirty = false
	var f := FileAccess.open(STORE_PATH + ".tmp", FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify(store))
	f.close()
	DirAccess.rename_absolute(ProjectSettings.globalize_path(STORE_PATH + ".tmp"), ProjectSettings.globalize_path(STORE_PATH))

# ---------- saglabājumi (save.js) ----------
func default_save(pname: String) -> Dictionary:
	return {
		"name": pname, "gid": "", "animal": "lacis", "fur": "#8b5a2b", "shirt": "#d23b3b", "hat": null,
		"ownedHats": [], "kartColor": "sarkana", "ownedKarts": ["sarkana"], "coins": 20,
		"inv": {"burkans_seed": 3, "redisi_seed": 4}, "gd": null, "farm": {"t": {}, "cl": [], "v": 3},
		"layout": 2, "stats": {}, "quests": {}, "stars": [], "bestLap": null, "pos": null, "zone": "c", "zones": {},
		"playTime": 0.0, "rod": false, "pet": null, "ownedPets": [], "decor": [], "ownedDecor": [], "wear": {},
		"ownedClothes": [], "fishBag": [], "fishBest": {}, "vehs": null, "trophies": 0, "places": [], "pieces": [],
		"treasure": false, "revealed": false, "weekly": null,
	}

func save_key(pname: String, gid: String = "") -> String:
	return PREFIX + pname.strip_edges().to_lower() + ("@" + gid if gid != "" else "")

func has_save(pname: String, gid: String = "") -> bool:
	return store.has(save_key(pname, gid))

func load_save(pname: String, gid: String = "") -> Dictionary:
	var raw = store.get(save_key(pname, gid))
	if raw is String:
		var data = JSON.parse_string(raw)
		if data is Dictionary:
			var merged := default_save(pname)
			merged.merge(data, true)
			merged.gid = gid
			merged.inv = (data.get("inv", {}) as Dictionary).duplicate() if data.get("inv") is Dictionary else {}
			merged.stats = (data.get("stats", {}) as Dictionary).duplicate() if data.get("stats") is Dictionary else {}
			for k in ["wear", "fishBest", "quests", "zones"]:
				if not (merged[k] is Dictionary): merged[k] = {}
			for k in ["ownedClothes", "fishBag", "decor", "ownedDecor", "ownedHats", "ownedKarts", "ownedPets", "stars", "places", "pieces"]:
				if not (merged[k] is Array): merged[k] = []
			if not (merged.farm is Dictionary) or not (merged.farm.get("t") is Dictionary): merged.farm = {"t": {}, "cl": []}
			if not (merged.farm.get("cl") is Array): merged.farm.cl = []
			return {"save": merged, "isNew": false}
	var fresh := default_save(pname)
	fresh.gid = gid
	return {"save": fresh, "isNew": true}

func carry_over(from: Dictionary, to: Dictionary, keep: Dictionary) -> Dictionary:
	for k in ["animal", "fur", "shirt"]: to[k] = from.get(k)
	if keep.get("look", false):
		for k in ["hat", "ownedHats", "kartColor", "ownedKarts", "wear", "ownedClothes", "pet", "ownedPets", "rod"]:
			var v = from.get(k)
			to[k] = v.duplicate(true) if (v is Dictionary or v is Array) else v
	if keep.get("decor", false):
		to.ownedDecor = (from.get("ownedDecor", []) as Array).duplicate(true)
		to.decor = (from.get("decor", []) as Array).duplicate(true)
		for k in (from.get("inv", {}) as Dictionary):
			if str(k).begins_with("d_"): to.inv[k] = from.inv[k]
	if keep.get("coins", false): to.coins = from.coins
	return to

func write_save(s: Dictionary) -> bool:
	set_item(save_key(s.name, str(s.get("gid", ""))), JSON.stringify(s))
	set_item(LAST, s.name)
	return true

func last_profile_name() -> String: return str(store.get(LAST, ""))

func list_profiles() -> Array:
	var out: Array = []
	for k in store:
		if str(k).begins_with(PREFIX):
			var j = JSON.parse_string(str(store[k]))
			if j is Dictionary and j.has("name"):
				var n: String = j.name
				var dup := false
				for o in out: if str(o).to_lower() == n.to_lower(): dup = true
				if not dup: out.append(n)
	return out

func list_games() -> Array:
	var arr = JSON.parse_string(str(store.get(GAMES, "[]")))
	if not (arr is Array): arr = []
	arr = arr.filter(func(g): return g is Dictionary and g.get("id") is String)
	var has_first := false
	for g in arr: if g.id == "": has_first = true
	if not has_first: arr.append(FIRST_GAME.duplicate(true))
	arr.sort_custom(func(a, b): return float(a.get("last", 0)) > float(b.get("last", 0)))
	return arr

func remember_game(g: Dictionary) -> void:
	var arr := list_games().filter(func(x): return x.id != g.id)
	arr.push_front({"id": g.id, "name": g.name, "at": g.get("at", 0), "keep": g.get("keep", {}), "last": now_ms()})
	set_item(GAMES, JSON.stringify(arr.slice(0, 12)))
	set_item(LAST_GAME, g.id)

func last_game_id() -> String: return str(store.get(LAST_GAME, ""))

func new_game_id() -> String:
	var chars := "ABCDEFGHJKLMNPRSTUVZ23456789"
	var s := ""
	for i in 4: s += chars[randi() % chars.length()]
	return s

# ---------- palīgi ----------
func now_ms() -> float: return Time.get_unix_time_from_system() * 1000.0

## '#rrggbb' (sRGB) → lineāra krāsa (kā THREE.Color)
static func lin(hex: String) -> Color:
	return Color.html(hex).srgb_to_linear()

static func smoothstep(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func angle_lerp(a: float, b: float, t: float) -> float:
	var d := b - a
	d = atan2(sin(d), cos(d))
	return a + d * t

func arg(pname: String, def: String = "") -> String:
	for a in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if a == "--" + pname: return "1"
		if a.begins_with("--" + pname + "="): return a.substr(pname.length() + 3)
	return def

## mulberry32 (noise.js) — 32 bitu aritmētika
static func mulberry32(seed: int) -> Callable:
	var st := [seed & 0xFFFFFFFF]
	return func() -> float:
		st[0] = (st[0] + 0x6D2B79F5) & 0xFFFFFFFF
		var t: int = st[0]
		t = _imul(t ^ (t >> 15), t | 1)
		t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
		t &= 0xFFFFFFFF
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

static func _imul(a: int, b: int) -> int:
	a &= 0xFFFFFFFF; b &= 0xFFFFFFFF
	var lo := ((a & 0xFFFF) * b) & 0xFFFFFFFF
	var hi := (((a >> 16) * b) & 0xFFFF) << 16
	return (lo + hi) & 0xFFFFFFFF
