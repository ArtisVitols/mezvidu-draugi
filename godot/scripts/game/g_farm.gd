class_name GFarm
extends GUi
## 🏡 Sēta (web farm.js): savs dārzs, nocērtami objekti, aršana, sēšana, laistīšana, raža, augļu koki,
## rotājumu nešana, sētu zīmes, mājiņas caurspīdīgums, ciemošanās.

const MAX_TILES := 400
const GRAINS := {"auzas": true, "kviesi": true}
const HITS := {"tree": 3, "rock": 2, "bush": 1}
const OBJ_NAME := {"ozols": "ozolu", "berzs": "bērzu", "egle": "egli", "priede": "priedi", "rock": "akmeni", "bush": "krūmu"}
var CROP_IDS: Array = []
var TREE_IDS: Array = []
var plotField: Field
var objHits = {}
var farmViews: Array = [null, null, null, null]
var farmRen: Array = []
var farmClearedDirty = false
var cropTpl = {}
var gardenSigns: Array = [null, null, null, null]
var gardenSignNames: Array = [null, null, null, null]
var tileHL: MeshInstance3D
var farm_extra: Node3D
var soilMat: StandardMaterial3D
var decorSize = {}
var plotPack: Node3D
var cropPack: Node3D
var treePack: Node3D
var yardHouses: Array = []

static func tkey(ix: int, iz: int) -> String: return "%d,%d" % [ix, iz]
static func fhash(a: float, b: float) -> float:
	var h = sin(a * 127.1 + b * 311.7) * 43758.5453
	return h - floorf(h)

func fmtLeft(s: float) -> String:
	var sec = ceili(s)
	if sec < 60: return "%d s" % sec
	if sec < 3600: return "%d min" % ceili(sec / 60.0)
	var h = floori(sec / 3600.0)
	var m = ceili((sec % 3600) / 60.0)
	return ("%d h %d min" % [h, m]) if m else ("%d h" % h)

func buildFarm() -> void:
	CROP_IDS = Game.D.CROPS.keys()
	TREE_IDS = Game.D.TREES.keys()
	farmRen = []
	for i in 4: farmRen.append({"key": null, "soil": null, "plants": [], "growing": false, "t": 0.0})
	objHits = {}
	fixFarm()

func fixFarm() -> void:
	var f: Dictionary = save.farm
	if int(f.get("v", 3)) < 3:
		f.cl = []; f.v = 3
	var lost = 0
	var items = 0
	for k in f.t.keys():
		var p: PackedStringArray = str(k).split(",")
		if tileOk(int(p[0]), int(p[1]), 0): continue
		var v: Dictionary = f.t[k]
		if v.get("tr") != null and Game.D.TREES.has(v.tr):
			addItem(v.tr + "_sap"); items += 1
		elif v.get("c") != null and Game.D.CROPS.has(v.c):
			if cropProgress(v) >= 1:
				addItem(v.c, int(Game.D.CROPS[v.c].yield)); items += int(Game.D.CROPS[v.c].yield)
			else:
				addItem(v.c + "_seed"); items += 1
		f.t.erase(k); lost += 1
	if lost:
		get_tree().create_timer(7.0).timeout.connect(func(): UI.toast("🛣️ %d lauciņi bija ārpus dārza — tos noņēmām%s." % [lost, ", raža un sēklas ir tavā somā 🎒" if items else ""], "good", 7000))

func tileOk(ix: int, iz: int, slot: int) -> bool:
	var c = Yard.tile_to_canon(ix, iz, slot)
	return Yard.garden_tile(c.x, c.y)

func ckey(key: String) -> String:
	var p = key.split(",")
	var c = Yard.tile_to_canon(int(p[0]), int(p[1]), mySlot)
	return tkey(c.x, c.y)

func plotOf(x, z) -> int: return Yard.plot_of(float(x), float(z))

# ---------- ielāde ----------
func loadFarm() -> void:
	terr = farmW
	farmOn = true
	farm_extra = Node3D.new(); farm_extra.name = "FarmExtra"; stage.add_child(farm_extra)
	if plotPack == null: plotPack = Avatar.asset("plottpl").build()
	var items = []
	for o in farmW.d.plotObjs:
		items.append({"id": int(o.id), "kind": o.kind, "x": o.x, "y": float(o.y) - float(o.s) * 0.12 if o.type == "rock" else o.y, "z": o.z, "ry": o.ry, "s": o.s})
	plotField = Field.new()
	plotField.build(items, func(k):
		for c in plotPack.get_children(): if str(c.get_meta("n", "")) == "plot:" + str(k): return c
		return null, farm_extra)
	soilMat = StandardMaterial3D.new()
	soilMat.albedo_texture = _soil_tex()
	soilMat.vertex_color_use_as_albedo = true
	soilMat.roughness = 1.0
	soilMat.uv1_triplanar = false
	soilMat.render_priority = 1
	tileHL = MeshInstance3D.new()
	var hm = StandardMaterial3D.new(); hm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; hm.albedo_color = Color("#ffe14a")
	tileHL.material_override = hm
	tileHL.visible = false
	farm_extra.add_child(tileHL)
	yardHouses = []
	for b in farmW.d.get("yardBuildings", []):
		var roof: Node3D = null
		var walls: MeshInstance3D = null
		for n in land_node.find_children("*", "Node3D", true, false):
			var nm = str(n.get_meta("n", ""))
			if nm == "yardRoof:%d" % int(b.slot): roof = n
			elif nm == "yardWalls:%d" % int(b.slot): walls = n
		yardHouses.append({"b": b, "roof": roof, "walls": walls, "inside": false})
	for s in 4:
		farmRen[s].key = null
		gardenSigns[s] = null
		gardenSignNames[s] = null
		setGardenSign(s, null)
	for prof in profiles.values():
		setGardenSign(int(prof.slot), prof.name)
		renderDecor(int(prof.slot), prof.get("decor"))
	syncFarmViews()
	renderLandBorder()
	farmClearedDirty = true
	timers.vis = 0.0

func unloadFarm() -> void:
	if not farmOn: return
	farmOn = false
	if farm_extra and is_instance_valid(farm_extra): farm_extra.queue_free()
	farm_extra = null
	for s in 4:
		farmRen[s].soil = null; farmRen[s].plants = []
		gardenSigns[s] = null
	landBorder = null
	decorNodes = [null, null, null, null]

func _soil_tex() -> Texture2D:
	var img = Image.create(128, 128, false, Image.FORMAT_RGBA8)
	img.fill(Color8(110, 84, 64))
	var rng = RandomNumberGenerator.new(); rng.seed = 17
	for i in 2600:
		var l = 60 + rng.randf() * 110
		var c = Color8(int(l), int(l * 0.8), int(l * 0.6), 153)
		var x = rng.randi() % 128
		var y = rng.randi() % 128
		for dx in 1 + rng.randi() % 3:
			img.set_pixel((x + dx) % 128, y, img.get_pixel((x + dx) % 128, y).lerp(c, 0.6))
	for y in range(0, 128, 16):
		for yy in 4:
			for x in 128: img.set_pixel(x, y + yy, img.get_pixel(x, y + yy).lerp(Color8(30, 18, 8), 0.4))
		for yy in 5:
			for x in 128: img.set_pixel(x, y + 7 + yy, img.get_pixel(x, y + 7 + yy).lerp(Color8(255, 225, 190), 0.08))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)

# ---------- skats draugiem ----------
func farmView():
	var f: Dictionary = save.farm
	var t = []
	for k in f.t:
		var p: PackedStringArray = str(k).split(",")
		var v: Dictionary = f.t[k]
		if v.get("tr") != null: t.append([int(p[0]), int(p[1]), 100 + TREE_IDS.find(v.tr), v.at, 1 if v.get("w", false) else 0, v.get("pk", 0)])
		elif v.get("c") != null: t.append([int(p[0]), int(p[1]), CROP_IDS.find(v.c), v.at, 1 if v.get("w", false) else 0])
		else: t.append([int(p[0]), int(p[1])])
	return {"t": t, "cl": (f.cl as Array).duplicate()}

func farmChanged() -> void:
	farmDirty = true
	renderFarm(mySlot, farmView())

func syncFarmViews() -> void:
	var seen = {}
	for prof in profiles.values():
		seen[int(prof.slot)] = true
		renderFarm(int(prof.slot), prof.get("farm"))
	for s in 4:
		if not seen.has(s): renderFarm(s, null)

func renderFarm(slot, view) -> void:
	if slot == null or int(slot) < 0 or int(slot) > 3 or farmViews.is_empty(): return
	var s = int(slot)
	if view != null:
		var nt = []
		for e in view.t:
			var p = Yard.tile_to_slot(int(e[0]), int(e[1]), s)
			var ne = [p.x, p.y]
			ne.append_array(e.slice(2))
			nt.append(ne)
		var ncl = []
		for id in view.get("cl", []): ncl.append(s * 100 + (int(id) % 100))
		view = {"t": nt, "cl": ncl}
	farmViews[s] = view
	if farmRen.size() > s: farmRen[s].key = null
	farmClearedDirty = true

# ---------- kadrs ----------
func updateFarm(dt) -> void:
	if not farmOn: return
	var t = now()
	if farmClearedDirty:
		farmClearedDirty = false
		var cl = {}
		for s in 4:
			var v = farmViews[s]
			if v == null: continue
			for id in v.cl: cl[int(id)] = true
			var tiles = {}
			for e in v.t: tiles[tkey(int(e[0]), int(e[1]))] = true
			if tiles.size():
				for o in farmW.d.plotObjs:
					if int(o.slot) != s or cl.has(int(o.id)): continue
					var r = maxf(0.5, float(o.r))
					for dd in [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]:
						if tiles.has(tkey(floori((float(o.x) + dd[0]) / Yard.TILE), floori((float(o.z) + dd[1]) / Yard.TILE))):
							cl[int(o.id)] = true
							break
		farmW.cleared = cl
		for o in farmW.d.plotObjs: plotField.set_hidden(int(o.id), cl.has(int(o.id)))
	var holes = false
	for s in 4:
		var R: Dictionary = farmRen[s]
		var v = farmViews[s]
		var key = JSON.stringify(v.t) if v != null else ""
		if R.key != key:
			R.key = key
			buildSoil(s, v)
			buildPlants(s, v, t)
			holes = true
			continue
		R.t -= dt
		if R.growing and R.t <= 0: buildPlants(s, v, t)
	if holes: farmGrassHoles()
	updateTileHL()
	updateYardHouses()

func tileAt(x: float, z: float):
	var ix = floori(x / Yard.TILE)
	var iz = floori(z / Yard.TILE)
	var cx = (ix + 0.5) * Yard.TILE
	var cz = (iz + 0.5) * Yard.TILE
	var slot = Yard.plot_of(cx, cz)
	if slot < 0 or not tileOk(ix, iz, slot): return null
	return {"ix": ix, "iz": iz, "cx": cx, "cz": cz, "slot": slot, "key": tkey(ix, iz)}

func updateTileHL() -> void:
	var tl = tileAt(me.pos.x, me.pos.z) if (me.veh == null and me.ride == null and zone == FARM) else null
	if tl == null or (tl.slot != mySlot and farmTile(tl.slot, tl.key) == null):
		tileHL.visible = false
		return
	if tileHL.get_meta("key", "") != tl.key:
		tileHL.set_meta("key", tl.key)
		var x0: float = tl.ix * Yard.TILE
		var z0: float = tl.iz * Yard.TILE
		var im = ImmediateMesh.new()
		im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
		for ab in [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5], [0, 0]]:
			var x: float = x0 + ab[0] * Yard.TILE
			var z: float = z0 + ab[1] * Yard.TILE
			im.surface_add_vertex(Vector3(x, farmW.get_height(x, z) + 0.08, z))
		im.surface_end()
		tileHL.mesh = im
	(tileHL.material_override as StandardMaterial3D).albedo_color = Color("#ffe14a") if tl.slot == mySlot else Color("#7fd0ff")
	tileHL.visible = true

func farmTile(slot: int, key: String):
	if slot == mySlot: return save.farm.t.get(ckey(key))
	var v = farmViews[slot]
	if v == null: return null
	for e in v.t:
		if tkey(int(e[0]), int(e[1])) == key:
			if e.size() > 2:
				if int(e[2]) >= 100: return {"tr": TREE_IDS[int(e[2]) - 100], "at": e[3], "w": bool(e[4]), "pk": e[5] if e.size() > 5 else 0}
				return {"c": CROP_IDS[int(e[2])], "at": e[3], "w": bool(e[4])}
			return {}
	return null

func cropProgress(v: Dictionary, t := -1.0) -> float:
	if t < 0: t = now()
	if v.get("tr") != null: return treeProgress(v, t)
	var def: Dictionary = Game.D.CROPS[v.c]
	var dur: float = float(def.grow) * (0.6 if v.get("w", false) else 1.0)
	return clampf((t / 1000.0 - float(v.at)) / dur, 0.0, 1.0)

func cropLeft(v: Dictionary, t := -1.0) -> float:
	if t < 0: t = now()
	var def: Dictionary = Game.D.TREES[v.tr] if v.get("tr") != null else Game.D.CROPS[v.c]
	return maxf(0.0, float(v.at) + float(def.grow) * (0.6 if v.get("w", false) else 1.0) - t / 1000.0)

func treeProgress(v: Dictionary, t := -1.0) -> float:
	if t < 0: t = now()
	var d: Dictionary = Game.D.TREES[v.tr]
	return clampf((t / 1000.0 - float(v.at)) / (float(d.grow) * (0.6 if v.get("w", false) else 1.0)), 0.0, 1.0)

func fruitAt(v: Dictionary) -> float:
	var d: Dictionary = Game.D.TREES[v.tr]
	return (float(v.pk) + float(d.every)) if float(v.get("pk", 0)) > 0 else (float(v.at) + float(d.grow) * (0.6 if v.get("w", false) else 1.0))

func fruitReady(v: Dictionary, t := -1.0) -> bool:
	if t < 0: t = now()
	return treeProgress(v, t) >= 1.0 and t / 1000.0 >= fruitAt(v)

# ---------- zīmēšana ----------
## uzartajos lauciņos zāli noņem (web setGrassHoles)
func farmGrassHoles() -> void:
	if farmW == null or farmW.grass == null: return
	var all = []
	for v in farmViews: if v != null: for e in v.t: all.append(e)
	farmW.grass.set_holes(all, Yard.TILE)

func buildSoil(slot: int, v) -> void:
	var R: Dictionary = farmRen[slot]
	if R.soil != null and is_instance_valid(R.soil): R.soil.queue_free()
	R.soil = null
	if v == null or v.t.is_empty() or farm_extra == null: return
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var H = func(x: float, z: float) -> float: return farmW.get_height(x, z) + 0.035
	for e in v.t:
		var x0: float = int(e[0]) * Yard.TILE
		var z0: float = int(e[1]) * Yard.TILE
		var wet = 0.68 if (e.size() > 4 and int(e[4]) == 1) else 1.0
		var P = []
		for j in 3:
			for i in 3:
				var x = x0 + i * Yard.TILE / 2.0
				var z = z0 + j * Yard.TILE / 2.0
				P.append([Vector3(x, H.call(x, z), z), Vector2(x / Yard.TILE, z / Yard.TILE)])
		for j in 2:
			for i in 2:
				var a = j * 3 + i
				for q in [a, a + 1, a + 3, a + 1, a + 4, a + 3]:
					st.set_color(Color(wet, wet, wet))
					st.set_uv(P[q][1])
					st.add_vertex(P[q][0])
	st.generate_normals()
	var mi = MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = soilMat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	farm_extra.add_child(mi)
	R.soil = mi

func _pack_parts(pack: Node3D, name: String) -> Array:
	if cropTpl.has(name): return cropTpl[name]
	var out = []
	for c in pack.get_children():
		if str(c.get_meta("n", "")) == name:
			Field._collect(c, Transform3D.IDENTITY, out, true)
			break
	cropTpl[name] = out
	return out

func cropParts(crop: String, stage: int) -> Array:
	if cropPack == null: cropPack = Avatar.asset("crops").build()
	return _pack_parts(cropPack, "crop:%s:%d" % [crop, stage])

func treeParts(tr: String, stage: int, fruit: bool) -> Array:
	if treePack == null: treePack = Avatar.asset("fruittrees").build()
	return _pack_parts(treePack, "tree:%s:%d:%d" % [tr, stage, 1 if fruit else 0])

func buildPlants(slot: int, v, t: float) -> void:
	var R: Dictionary = farmRen[slot]
	R.growing = false; R.t = 4.0
	var lists = {}
	if v != null:
		var map = {}
		for e in v.t:
			if e.size() > 2 and int(e[2]) < 100: map[tkey(int(e[0]), int(e[1]))] = CROP_IDS[int(e[2])]
		for e in v.t:
			if e.size() < 3: continue
			if int(e[2]) >= 100:
				var ti = int(e[2]) - 100
				if ti >= TREE_IDS.size(): continue
				var tr: String = TREE_IDS[ti]
				var tv = {"tr": tr, "at": e[3], "w": bool(e[4]), "pk": e[5] if e.size() > 5 else 0}
				var p = treeProgress(tv, t)
				var fr = fruitReady(tv, t)
				R.growing = true
				var stage = 0 if p < 0.35 else (1 if p < 1.0 else 2)
				var sc = (0.8 + p * 0.6) if stage == 0 else ((0.75 + 0.25 * p) if stage == 1 else 1.0)
				var key = "T%s%d%s" % [tr, stage, "f" if fr else ""]
				if not lists.has(key): lists[key] = {"crop": tr, "stage": stage, "tree": true, "fruit": fr, "m": []}
				var x = (int(e[0]) + 0.5) * Yard.TILE
				var z = (int(e[1]) + 0.5) * Yard.TILE
				lists[key].m.append(Transform3D(Basis(Vector3.UP, fhash(x, z) * 6.28).scaled(Vector3(sc, sc, sc)), Vector3(x, farmW.get_height(x, z) + 0.02, z)))
				continue
			var crop: String = CROP_IDS[int(e[2])] if int(e[2]) < CROP_IDS.size() else ""
			if crop == "": continue
			var def: Dictionary = Game.D.CROPS[crop]
			var p = cropProgress({"c": crop, "at": e[3], "w": bool(e[4])}, t)
			if p < 1.0: R.growing = true
			var stage = 0 if p < 0.3 else (1 if p < 1.0 else 2)
			var sc = (0.7 + p) if stage == 0 else ((0.6 + 0.4 * p) if stage == 1 else 1.0)
			var n = maxi(1, roundi(Yard.TILE / float(def.sp)))
			var d = Yard.TILE / n
			var e0 = int(e[0])
			var e1 = int(e[1])
			var same = func(dx: int, dz: int) -> bool: return map.get(tkey(e0 + dx, e1 + dz)) == crop
			var gl: bool = not same.call(-1, 0)
			var gr: bool = not same.call(1, 0)
			var gu: bool = not same.call(0, -1)
			var gb: bool = not same.call(0, 1)
			var key = crop + str(stage)
			if not lists.has(key): lists[key] = {"crop": crop, "stage": stage, "m": []}
			var L: Array = lists[key].m
			for j in n:
				for i in n:
					if n >= 3 and ((i == 0 and gl) or (i == n - 1 and gr) or (j == 0 and gu) or (j == n - 1 and gb)): continue
					var ox = (i + 0.5) * d
					var oz = (j + 0.5) * d
					if n < 3:
						if gl and i == 0: ox += 0.2
						if gr and i == n - 1: ox -= 0.2
						if gu and j == 0: oz += 0.2
						if gb and j == n - 1: oz -= 0.2
					var x = e0 * Yard.TILE + ox + (fhash(e0 * 8 + i, e1 * 8 + j) - 0.5) * d * 0.25
					var z = e1 * Yard.TILE + oz + (fhash(e1 * 8 + j, e0 * 8 + i + 3) - 0.5) * d * 0.25
					var s = sc * (0.88 + fhash(x, z) * 0.24)
					L.append(Transform3D(Basis(Vector3.UP, fhash(z, x) * 6.28).scaled(Vector3(s, s, s)), Vector3(x, farmW.get_height(x, z) + 0.03, z)))
	for m in R.plants: if is_instance_valid(m): m.queue_free()
	R.plants = []
	if farm_extra == null: return
	for key in lists:
		var L: Dictionary = lists[key]
		if L.m.is_empty(): continue
		var parts: Array = treeParts(L.crop, L.stage, L.fruit) if L.get("tree", false) else cropParts(L.crop, L.stage)
		for part in parts:
			var mm = MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = part[0]
			mm.instance_count = L.m.size()
			for i in L.m.size(): mm.set_instance_transform(i, L.m[i] * part[1])
			var mmi = MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if GRAINS.has(L.crop) else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			farm_extra.add_child(mmi)
			R.plants.append(mmi)

# ---------- sētas zīme ----------
func makeSign(text: String, color: Color, min_w := 2.1, h := 0.46) -> Node3D:
	var g = Node3D.new()
	var lb = Label3D.new()
	lb.text = text; lb.font = UI.font; lb.font_size = 64; lb.pixel_size = h / 64.0 * 0.62
	lb.modulate = Color("#3a2410"); lb.outline_size = 0; lb.double_sided = true
	lb.position.z = 0.04
	var w = maxf(min_w, UI.font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 64).x * lb.pixel_size + 0.3)
	var board = MeshInstance3D.new(); var bm = BoxMesh.new(); bm.size = Vector3(w, h, 0.06); board.mesh = bm
	var mat = StandardMaterial3D.new(); mat.albedo_color = color; mat.roughness = 0.9; board.material_override = mat
	g.add_child(board)
	g.add_child(lb)
	var back = lb.duplicate(); back.position.z = -0.04; back.rotation.y = PI; g.add_child(back)
	return g

func setGardenSign(slot, name) -> void:
	if not farmOn or slot == null or farm_extra == null: return
	var s = int(slot)
	if gardenSigns[s] != null and gardenSignNames[s] == name: return
	gardenSignNames[s] = name
	if gardenSigns[s] != null and is_instance_valid(gardenSigns[s]): gardenSigns[s].queue_free()
	var g = Node3D.new()
	var txt: String = ("🏡 %s" % name) if name != null else "🌾 Brīvā sēta"
	for sp in Yard.gate_spots(s):
		var sg = makeSign(txt, Color("#b58450") if name != null else Color("#9c9586"))
		sg.position = Vector3(sp.x, farmW.get_height(sp.x, sp.z) + 2.6, sp.z)
		sg.rotation.y = sp.ry
		g.add_child(sg)
	farm_extra.add_child(g)
	gardenSigns[s] = g

func updateYardHouses() -> void:
	var p: Vector3 = me.pos
	for H in yardHouses:
		var b: Dictionary = H.b
		var dx: float = p.x - float(b.x)
		var dz: float = p.z - float(b.z)
		var c = cos(float(b.ry))
		var s = sin(float(b.ry))
		var lx = dx * c - dz * s
		var lz = dx * s + dz * c
		var inside: bool = absf(lx) < float(b.inner[0]) and absf(lz) < float(b.inner[1]) and p.y < float(b.y0) + 2.0
		if inside == H.inside: continue
		H.inside = inside
		if H.roof: H.roof.visible = not inside
		if H.walls: H.walls.transparency = 0.72 if inside else 0.0

# ---------- darbības ----------
func farmActions(consider, d2) -> void:
	var slot = mySlot
	if me.ski != null or me.lift != null or me.carry != null: return
	var dec: Array = save.get("decor", [])
	for i in dec.size():
		var d = dec[i]
		if not (d is Dictionary): continue
		var w = Yard.rot_plot(float(d.x), float(d.z), slot)
		if absf(w.x - me.pos.x) > 4 or absf(w.y - me.pos.z) > 4: continue
		var ii: int = i
		consider.call(d2.call(w.x, w.y) + 0.3, 2.3, "🤲 Pacelt: %s" % Game.D.DECOR.get(d.k, {"name": d.k}).name, func(): pickDecor(ii))
	for o in farmW.d.plotObjs:
		if int(o.slot) != slot or farmW.cleared.has(int(o.id)): continue
		if absf(float(o.x) - me.pos.x) > 5 or absf(float(o.z) - me.pos.z) > 5: continue
		var left: int = int(HITS[o.type]) - int(objHits.get(int(o.id), 0))
		var verb: String = "🪓 Cirst" if o.type == "tree" else ("⛏️ Novākt" if o.type == "rock" else "✂️ Izcirst")
		var oo: Dictionary = o
		consider.call(d2.call(o.x, o.z) - float(o.r) * 0.5, 2.4 + float(o.r), "%s %s%s" % [verb, OBJ_NAME.get(o.kind, o.kind), (" (%d)" % left) if int(HITS[o.type]) > 1 else ""], func(): clearObj(oo))
	var tl = tileAt(me.pos.x, me.pos.z)
	if tl == null: return
	if tl.slot == slot:
		var v = save.farm.t.get(ckey(tl.key))
		var blocked = false
		for o in farmW.d.plotObjs:
			if int(o.slot) == slot and not farmW.cleared.has(int(o.id)) and absf(float(o.x) - tl.cx) < Yard.TILE / 2.0 + 0.8 and absf(float(o.z) - tl.cz) < Yard.TILE / 2.0 + 0.8: blocked = true
		var tld: Dictionary = tl
		if v == null:
			var cp = ckey(tl.key).split(",")
			if blocked: consider.call(9.0, 10.0, "🪓 Vispirms notīri šo vietu", func(): UI.toast("Šeit aug koks vai ir akmens — vispirms nocērt vai novāc to!"))
			elif not inLand(int(cp[0]), int(cp[1]), int(save.gd.land)): landAction(consider)
			else: consider.call(1.0, 2.0, "⛏️ Uzart lauciņu", func(): plowTile(tld))
		elif v.get("tr") != null:
			var d: Dictionary = Game.D.TREES[v.tr]
			var p = treeProgress(v)
			var fname = str(Game.D.FRUITS[d.fruit].name).to_lower()
			if fruitReady(v): consider.call(1.0, 2.2, "🧺 Lasīt: %s (%s)" % [fname, d.name], func(): pickFruit(tld))
			elif p < 1 and not v.get("w", false): consider.call(1.0, 2.2, "💧 Aplaistīt: %s" % d.name, func(): waterTile(tld))
			elif p < 1: consider.call(1.0, 2.2, "⏳ %s aug… %d%% · vēl %s" % [d.name, roundi(p * 100), fmtLeft(cropLeft(v))], func(): UI.toast("🌳 %s izaugs pēc %s, tad nesīs %s" % [d.name, fmtLeft(cropLeft(v)), fname]))
			else: consider.call(1.0, 2.2, "🌳 %s: %s pēc %s" % [d.name, fname, fmtLeft(fruitAt(v) - now() / 1000.0)], func(): UI.toast("🌳 Nākamie %s būs gatavi pēc %s" % [fname, fmtLeft(fruitAt(v) - now() / 1000.0)]))
		elif v.get("c") == null:
			var seed = currentSeed()
			if seed is String and seed.begins_with("sap:"):
				var tr: String = seed.substr(4)
				consider.call(1.0, 2.0, "🌳 Stādīt: %s (%d)" % [Game.D.TREES[tr].name, int(save.inv.get(tr + "_sap", 0))], func(): plantTree(tld, tr))
			elif seed != null:
				var sd: String = seed
				consider.call(1.0, 2.0, "🌱 Sēt: %s %s (%d)" % [Game.D.CROPS[sd].icon, Game.D.CROPS[sd].name, int(save.inv.get(sd + "_seed", 0))], func(): sowTile(tld, sd))
			else: consider.call(1.0, 2.0, "🌱 Nav sēklu — nopērc tirgū mežā 🛒", func(): UI.toast("Sēklas un kociņus pārdod Ūdrs Ojārs Mežvidu mežā (austrumos) 🌱"))
		else:
			var p = cropProgress(v)
			var def: Dictionary = Game.D.CROPS[v.c]
			if p >= 1: consider.call(1.0, 2.0, "🧺 Novākt: %s %s" % [def.icon, def.name], func(): harvestTile(tld))
			elif not v.get("w", false): consider.call(1.0, 2.0, "💧 Aplaistīt (%s)" % def.name, func(): waterTile(tld))
			else: consider.call(1.0, 2.0, "⏳ %s %s aug… %d%% · vēl %s" % [def.icon, def.name, roundi(p * 100), fmtLeft(cropLeft(v))], func(): UI.toast("%s %s būs gatavs pēc %s — augs arī tad, kad spēle aizvērta" % [def.icon, def.name, fmtLeft(cropLeft(v))]))
	else:
		var v = farmTile(tl.slot, tl.key)
		var owner_id = null
		var owner = null
		for id in profiles:
			if int(profiles[id].slot) == int(tl.slot):
				owner_id = id; owner = profiles[id]
		if v != null and (v.get("c") != null or v.get("tr") != null) and owner != null and not v.get("w", false) and cropProgress(v) < 1:
			var oid = owner_id
			var key: String = tl.key
			consider.call(1.0, 2.0, "💧 Aplaistīt %s lauku" % owner.name, func():
				net.toHost({"t": "water", "owner": oid, "plot": key}); sfx("plant"); me.petT = 0.6)

func clearObj(o: Dictionary) -> void:
	var n = int(objHits.get(int(o.id), 0)) + 1
	objHits[int(o.id)] = n
	me.petT = 0.6
	me.heading = atan2(float(o.x) - me.pos.x, float(o.z) - me.pos.z)
	sfx("chop" if o.type == "tree" else ("hammer" if o.type == "rock" else "leaves"), {"at": Vector2(o.x, o.z), "vol": 0.9})
	if n < int(HITS[o.type]):
		spawnFloat("🪓" if o.type == "tree" else "⛏️", Vector3(o.x, float(o.y) + 1, o.z))
		return
	var f: Dictionary = save.farm
	if not f.cl.has(int(o.id) % 100): f.cl.append(int(o.id) % 100)
	var coins = 3 if o.type == "tree" else (2 if o.type == "rock" else 1)
	addCoins(coins, true)
	if o.type == "tree": sfx("tree_fall", {"at": Vector2(o.x, o.z), "vol": 0.8})
	else: sfx("pop", {"vol": 0.6})
	sfx("coin", {"vol": 0.5, "delay": 0.25})
	gardenXp(int(Game.C.garden.XP.clear))
	spawnFloat("🪵" if o.type == "tree" else ("🪨" if o.type == "rock" else "🌿"), Vector3(o.x, float(o.y) + 1, o.z))
	UI.toast("%s! +%d🪙" % ["🪵 Koks nocirsts" if o.type == "tree" else ("🪨 Akmens novākts" if o.type == "rock" else "🌿 Krūms izcirsts"), coins])
	stat("cleared")
	farmChanged()

func plowTile(tl: Dictionary) -> void:
	var f: Dictionary = save.farm
	var cp = ckey(tl.key).split(",")
	if not inLand(int(cp[0]), int(cp[1]), int(save.gd.land)):
		UI.toast("🏡 Šī vieta vēl nav tavā dārzā — paplašini dārzu!")
		return
	if f.t.size() >= MAX_TILES:
		UI.toast("Uzarti jau %d lauciņi — vairāk nevar apstrādāt 🙂" % MAX_TILES)
		return
	f.t[ckey(tl.key)] = {}
	me.petT = 0.6
	sfx("dig", {"vol": 0.9})
	spawnFloat("⛏️", Vector3(tl.cx, me.pos.y, tl.cz))
	stat("plowed")
	gardenXp(int(Game.C.garden.XP.plow))
	farmChanged()

func sowTile(tl: Dictionary, crop: String) -> void:
	var v = save.farm.t.get(ckey(tl.key))
	if v == null or v.get("c") != null or not (int(save.inv.get(crop + "_seed", 0)) > 0): return
	save.inv[crop + "_seed"] = int(save.inv[crop + "_seed"]) - 1
	v.c = crop; v.at = roundi(now() / 1000.0); v.w = false
	me.petT = 0.6
	sfx("leaves", {"vol": 0.7})
	stat("planted")
	var def: Dictionary = Game.D.CROPS[crop]
	UI.toast("🌱 Iesēji: %s %s (aug %s). Aplaisti — augs ātrāk!" % [def.icon, def.name, fmtLeft(float(def.grow))])
	farmChanged()

func waterTile(tl: Dictionary) -> void:
	var v = save.farm.t.get(ckey(tl.key))
	if v == null or (v.get("c") == null and v.get("tr") == null): return
	var p = cropProgress(v)
	v.w = true
	var def: Dictionary = Game.D.TREES[v.tr] if v.get("tr") != null else Game.D.CROPS[v.c]
	v.at = roundi(now() / 1000.0 - p * float(def.grow) * 0.6)
	me.petT = 0.6
	sfx("water", {"vol": 0.6})
	spawnFloat("💧", Vector3(tl.cx, me.pos.y, tl.cz))
	farmChanged()

func harvestTile(tl: Dictionary) -> void:
	var v = save.farm.t.get(ckey(tl.key))
	if v == null or v.get("c") == null or cropProgress(v) < 1: return
	var def: Dictionary = Game.D.CROPS[v.c]
	addItem(v.c, int(def.yield))
	var crop: String = v.c
	save.farm.t[ckey(tl.key)] = {}
	stat("harvested")
	me.petT = 0.6
	sfx("pluck", {"vol": 0.8}); sfx("leaves", {"vol": 0.5})
	spawnFloat(def.icon, me.pos)
	var xp = cropXp(crop)
	gardenXp(xp, Vector3(tl.cx, me.pos.y + 0.6, tl.cz))
	UI.toast("🧺 Novāci: %s %s ×%d! +%d⭐ · Pārdod Āpsim Arnoldam tirgū mežā." % [def.icon, def.name, int(def.yield), xp], "good")
	farmChanged()

func plantTree(tl: Dictionary, tr: String) -> void:
	var v = save.farm.t.get(ckey(tl.key))
	if v == null or v.get("c") != null or v.get("tr") != null or not (int(save.inv.get(tr + "_sap", 0)) > 0): return
	save.inv[tr + "_sap"] = int(save.inv[tr + "_sap"]) - 1
	v.tr = tr; v.at = roundi(now() / 1000.0); v.w = false; v.pk = 0
	me.petT = 0.8
	sfx("dig", {"vol": 0.9}); sfx("leaves", {"vol": 0.5})
	stat("planted")
	var d: Dictionary = Game.D.TREES[tr]
	UI.toast("🌳 Iestādīji: %s! Izaugs pēc %s un tad ik pa %s dos %s. Aplaisti!" % [d.name, fmtLeft(float(d.grow)), fmtLeft(float(d.every)), str(Game.D.FRUITS[d.fruit].name).to_lower()], "good", 5000)
	if selectedSeed == "sap:" + tr and not (int(save.inv.get(tr + "_sap", 0)) > 0): selectedSeed = null
	farmChanged()

func pickFruit(tl: Dictionary) -> void:
	var v = save.farm.t.get(ckey(tl.key))
	if v == null or v.get("tr") == null or not fruitReady(v): return
	var d: Dictionary = Game.D.TREES[v.tr]
	v.pk = roundi(now() / 1000.0)
	addItem(d.fruit, int(d.yield))
	stat("fruits", int(d.yield))
	me.petT = 0.8
	sfx("pluck", {"vol": 0.8})
	spawnFloat("🧺", me.pos)
	gardenXp(fruitXp(v.tr), Vector3(tl.cx, me.pos.y + 0.6, tl.cz))
	UI.toast("🧺 Salasīji: %s ×%d! Nākamie pēc %s." % [Game.D.FRUITS[d.fruit].name, int(d.yield), fmtLeft(float(d.every))], "good")
	farmChanged()

# ---------- rotājumu nešana ----------
func pickDecor(i: int) -> void:
	var d = save.decor[i] if i < save.decor.size() else null
	if d == null or me.carry != null: return
	save.decor.remove_at(i)
	startCarry(d.k)
	UI.toast("🤲 Nes: %s. Ej uz vietu savā sētā un spied „📍 Novietot”." % Game.D.DECOR.get(d.k, {"name": d.k}).name, "", 4000)

func startCarry(k) -> void:
	me.carry = {"k": k}
	avatar.set_carry(prop("decor:" + str(k)))
	sfx("leather", {"vol": 0.7})
	sendProfile()
	timers.action = 0.0

func carrySpot():
	var h: float = me.heading
	if not decorSize.has(me.carry.k):
		var bb = Avatar._aabb(prop("decor:" + str(me.carry.k)))
		decorSize[me.carry.k] = maxf(bb.size.x, bb.size.z) / 2.0
	var dist: float = 0.9 + float(decorSize[me.carry.k])
	var x: float = me.pos.x + sin(h) * dist
	var z: float = me.pos.z + cos(h) * dist
	if zone != FARM or Yard.plot_of(x, z) != mySlot: return null
	var part = Yard.yard_part(x, z)
	if part == "house" or part == "green": return null
	var tl = tileAt(x, z)
	if tl != null and tl.slot == mySlot and save.farm.t.has(ckey(tl.key)): return null
	return {"x": x, "z": z}

func carryAction():
	if me.carry.get("trail") != null: return trailCarryAction()
	var c: Dictionary = me.carry
	var name: String = Game.D.DECOR.get(c.k, {"name": c.k}).name
	var sp = carrySpot()
	if sp != null:
		var spd: Dictionary = sp
		return {"label": "📍 Novietot: %s" % name, "fn": func(): placeCarry(spd)}
	return {"label": "🎒 Ielikt somā: %s" % name, "fn": func():
		UI.toast("Šeit nevar novietot — tikai savā sētā (ne uz uzartas zemes). Ieliku somā 🎒" if zone == FARM else "Ieliku somā 🎒")
		stowCarry()}

func placeCarry(sp: Dictionary) -> void:
	var c = me.carry
	if c == null: return
	var p = Yard.canon_pt(sp.x, sp.z, mySlot)
	var r: float = me.heading + PI - Yard.rot_plot_y(mySlot)
	save.decor.append({"k": c.k, "x": snappedf(p.x, 0.01), "z": snappedf(p.y, 0.01), "r": snappedf(r, 0.01)})
	me.carry = null
	avatar.set_carry(null)
	sfx("leather", {"vol": 0.8})
	spawnFloat("✨", Vector3(sp.x, me.pos.y, sp.z))
	sendProfile()
	persist()

func stowCarry() -> void:
	var c = me.carry
	if c == null: return
	if c.get("trail") != null:
		trailDropCarry(false)
		return
	addItem("d_" + str(c.k))
	me.carry = null
	avatar.set_carry(null)
	sendProfile()

func carryModel(k) -> Node3D:
	if str(k).begins_with("t:"): return trailItem(str(k).substr(2))
	return prop("decor:" + str(k))

func onFarmWater(m) -> void:
	if m.get("owner") == myId:
		var v = save.farm.t.get(ckey(m.plot)) if m.get("plot") is String else null
		if v != null and (v.get("c") != null or v.get("tr") != null) and not v.get("w", false) and cropProgress(v) < 1:
			var p = cropProgress(v)
			v.w = true
			var def: Dictionary = Game.D.TREES[v.tr] if v.get("tr") != null else Game.D.CROPS[v.c]
			v.at = roundi(now() / 1000.0 - p * float(def.grow) * 0.6)
			var who = remotes.get(m.by)
			if m.by != myId: UI.toast("💧 %s aplaistīja tavu lauku! Augi augs ātrāk." % (who.prof.name if who else "Draugs"), "good")
			farmChanged()
	if m.get("by") == myId and m.get("owner") != myId:
		stat("watered"); gardenXp(int(Game.C.garden.XP.waterFriend))
	if zone == FARM and m.get("plot") is String:
		var pp: PackedStringArray = str(m.plot).split(",")
		var x = (int(pp[0]) + 0.5) * Yard.TILE
		var z = (int(pp[1]) + 0.5) * Yard.TILE
		spawnFloat("💧", Vector3(x, farmW.get_height(x, z), z))

func goToPlot(slot: int) -> void:
	if me.inKart or me.veh != null or me.ride != null:
		UI.toast("Vispirms izkāp 🚶"); return
	if mgIn():
		UI.toast("🎲 Spēles laikā nevar aiziet!"); return
	if zoneBusy: return
	var gp = Yard.rot_plot(-Yard.GATE_A, -5, slot)
	var dv = Yard.rot_plot(0, -1, slot)
	var heading = atan2(dv.x, dv.y)
	if zone == FARM:
		me.pos = Vector3(gp.x, farmW.get_height(gp.x, gp.y), gp.y)
		me.heading = heading; cam.yaw = heading + PI; camInit = false
		sfx("beep")
		return
	teleport(FARM, gp, heading)

# tukšas (vēlākie slāņi)
var landBorder = null
var decorNodes: Array = [null, null, null, null]
func inLand(_a, _b, _land) -> bool: return true
func landAction(_c) -> void: pass
func gardenXp(_n, _at = null) -> void: pass
func cropXp(_k) -> int: return 0
func fruitXp(_k) -> int: return 0
func trailCarryAction(): return null
func trailItem(_k) -> Node3D: return Node3D.new()
