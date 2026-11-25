class_name GActivities
extends GGarden
## Nodarbes (web activities.js): makšķerēšana, ogas, ugunskurs, tornis, dārgums, vietas, mājdzīvnieki, rotājumi,
## vēlēšanās aka, laimesta kartiņa, nedēļas mērķis, ķeramais un paslēpes.

const BERRY_RESPAWN := 150000.0
const MG_NAMES := {"tag": "🏃 Ķeramais", "hide": "🙈 Paslēpes"}
var berryField: Field
var placeById = {}
var scrolls = {}
var chestAnim = 0.0
var rod: Node3D
var bobber: Node3D
var fishLine: MeshInstance3D
var mgMarker: Label3D
var mgEdgeT = 0.0
var petCd = 0.0
var decorKeys: Array = ["", "", "", ""]
var prizeOv: Control
var prizeT = 0
var chestLid: Node3D
var chestCoins: Node3D
var flames: Array = []
var fireGlow: Node3D

static func weekNumber(ms: float) -> int: return floori((ms / 86400000.0 + 3.0) / 7.0)
static func weeklyGoal(week: int) -> Dictionary:
	var W: Array = Game.D.WEEKLY
	return W[((week % W.size()) + W.size()) % W.size()]

func makeTeam(nowm: float, weekly) -> Dictionary:
	var w = weekNumber(nowm)
	var g = weeklyGoal(w)
	return {"w": w, "c": int(weekly.get("c", 0)) if (weekly is Dictionary and int(weekly.get("w", -1)) == w) else 0, "target": int(g.n), "stat": g.stat}

func initActivities() -> void:
	fixDecor()
	berryPicked = {}
	chestAnim = 0.0
	rod = prop("rod")
	rod.position = Vector3(0, 1.0, 0.32)
	rod.visible = false
	avatar.root.add_child(rod)
	fishing = null
	pet = null
	setPet(save.get("pet"), true)
	mg = {"kind": null, "phase": "none"}
	mgMarker = null
	mgEdgeT = 0.0
	timers.places = 0.0
	team = makeTeam(Game.now_ms(), save.weekly)

func onAvatarRebuilt() -> void:
	if rod and is_instance_valid(rod):
		if rod.get_parent(): rod.get_parent().remove_child(rod)
		avatar.root.add_child(rod)
	updateMgMarker()

func buildForestExtras() -> void:
	super.buildForestExtras()
	buildCenterActivities()

func buildCenterActivities() -> void:
	var items = []
	for b in world.d.berries: items.append({"id": int(b.id), "kind": b.kind, "x": b.x, "y": b.y, "z": b.z, "ry": int(b.id) * 1.7, "s": 0.9 + (int(b.id) % 5) * 0.06})
	berryField = Field.new()
	var holder = Node3D.new(); holder.name = "Berries"; scene.add_child(holder)
	berryField.build(items, func(k): return prop("berry:" + k), holder, "berries")
	placeById = {}
	for p in world.d.places: placeById[p.id] = p
	scrolls = {}
	for id in Game.D.MAP_PIECES:
		var p = placeById.get(id)
		if p == null or p.get("piece") == null or save.pieces.has(id): continue
		var s = prop("scroll")
		s.position = Vector3(p.piece.x, p.piece.y, p.piece.z)
		scene.add_child(s)
		scrolls[id] = s
	chestLid = null; chestCoins = null; flames = []; fireGlow = null
	for n in land_node.find_children("*", "Node3D", true, false):
		var nm = str(n.get_meta("n", ""))
		if nm == "chestLid": chestLid = n
		elif nm == "chestCoins": chestCoins = n
		elif nm.begins_with("flame:"): flames.append(n)
		elif nm == "fireGlow": fireGlow = n
	if save.get("treasure", false) and chestLid:
		chestLid.rotation.x = -1.9
		if chestCoins: chestCoins.visible = false

func updateActivities(dt, t) -> void:
	var cx: float = me.pos.x
	var cz: float = me.pos.z
	timers.berry -= dt
	if timers.berry <= 0:
		timers.berry = 0.3
		for b in world.d.berries:
			if absf(float(b.x) - cx) < 130 and absf(float(b.z) - cz) < 130:
				berryField.set_hidden(int(b.id), float(berryPicked.get(str(int(b.id)), 0)) > t)
	for id in scrolls:
		var s: Node3D = scrolls[id]
		s.rotation.y += dt * 1.5
		s.position.y = float(placeById[id].piece.y) + sin(t / 400.0) * 0.08
	if chestAnim > 0 and chestLid:
		chestAnim = maxf(0.0, chestAnim - dt)
		chestLid.rotation.x = -1.9 * (1.0 - chestAnim / 1.2)
	updatePlacesFx(t / 1000.0)
	updateFishing(dt, t)
	updatePets(dt)
	updateMg(dt, t)
	timers.places -= dt
	if timers.places <= 0:
		timers.places = 0.5
		checkDiscover()

func updatePlacesFx(ts: float) -> void:
	var tt = fmod(ts, 10000.0)
	for i in flames.size():
		var f: Node3D = flames[i]
		var s = 0.8 + sin(tt * (7 + i) + i * 2) * 0.2 + sin(tt * 13 + i) * 0.08
		f.scale = Vector3(1 + sin(tt * 5 + i) * 0.1, s, 1 + cos(tt * 6 + i) * 0.1)
		f.position.y = 0.45 * s
	if fireGlow is Sprite3D: (fireGlow as Sprite3D).modulate.a = 0.3 + sin(tt * 9) * 0.05 + sin(tt * 23) * 0.03

# ======================= darbības =======================
func findActivityActions(consider, d2):
	var t = now()
	if fishing != null: return fishButton()
	for b in world.d.berries:
		if absf(float(b.x) - me.pos.x) > 3 or absf(float(b.z) - me.pos.z) > 3: continue
		if float(berryPicked.get(str(int(b.id)), 0)) > t: continue
		var bb: Dictionary = b
		consider.call(d2.call(b.x, b.z), 1.9, "%s Lasīt: %s" % [Game.D.BERRIES[b.kind].icon, Game.D.BERRIES[b.kind].name], func(): pickBerry(bb))
	for id in scrolls:
		var p: Dictionary = placeById[id].piece
		if absf(float(p.y) - 0.4 - me.pos.y) > 1.6: continue
		var iid: String = id
		consider.call(d2.call(p.x, p.z), 2.0, "🗺️ Paņemt kartes gabalu", func(): takePiece(iid))
	var camp = placeById.get("nometne")
	if camp != null:
		var raw = int(save.inv.get("baravika", 0)) + int(save.inv.get("gailene", 0))
		consider.call(d2.call(camp.x, camp.z), 3.2, ("🔥 Cept sēnes (%d)" % raw) if raw else "🔥 Sildīties pie ugunskura", func(): cookMushrooms())
	var tw = placeById.get("tornis")
	if tw != null:
		var top: float = float(tw.h) + float(tw.top)
		if me.pos.y > top - 1: consider.call(d2.call(tw.x, tw.z) + 0.5, 2.6, "🪜 Kāpt lejā", func(): towerDown())
		elif me.pos.y < float(tw.h) + 3: consider.call(d2.call(tw.base.x, tw.base.z), 2.6, "🪜 Kāpt skatu tornī", func(): towerUp())
	var ch = world.d.get("chest")
	if ch != null:
		var n: int = save.pieces.size()
		var need: int = Game.D.MAP_PIECES.size()
		var label: String = "🏰 Lāde ir tukša" if save.get("treasure", false) else ("🗝️ Atvērt dārguma lādi!" if n >= need else "🔒 Lāde (kartes gabali %d/%d)" % [n, need])
		consider.call(d2.call(ch.x, ch.z), 2.4, label, func(): openChest())
	consider.call(d2.call(0.0, 0.0) - 0.8, 2.9, "🪙 Iemest akā %d🪙 un vēlēties" % int(Game.D.WISH_PRICE), func(): wishWell())
	if pet != null and not pet.get("inCar", false) and not (petCd > t):
		consider.call(d2.call(pet.x, pet.z) + 1.2, 2.6, "🤗 Paglaudīt: %s" % Game.D.PETS[pet.id].name, func(): petMyPet())
	if save.get("rod", false) and me.onGround and me.state != "swim":
		var spot = fishSpot()
		if spot != null:
			var sp: Dictionary = spot
			consider.call(1.6, 1.7, "🎣 Makšķerēt", func(): startFishing(sp))
	return null

# ======================= makšķerēšana =======================
func fishButton():
	var f: Dictionary = fishing
	return {"label": "🐟 VILKT!" if f.phase == "bite" else "🎣 Gaidi… (beigt)", "fn": func():
		if f.phase == "bite": catchFish()
		else: stopFishing(true)}

func fishSpot():
	var W = terr
	var p: Vector3 = me.pos
	var best = null
	for k in 16:
		var a = k / 16.0 * TAU
		var dx = sin(a)
		var dz = cos(a)
		var wd = 0.0
		for d in [2.2, 3.4, 4.6]:
			if W.get_height(p.x + dx * d, p.z + dz * d) < WATER_Y - 0.4:
				wd = d; break
		if wd == 0.0: continue
		var diff = absf(fmod(fmod(a - me.heading, TAU) + PI * 3.0, TAU) - PI)
		if best == null or diff < best.diff: best = {"a": a, "diff": diff, "x": p.x + dx * (wd + 2.2), "z": p.z + dz * (wd + 2.2)}
	if best != null and W.get_height(best.x, best.z) > WATER_Y - 0.2:
		best.x = p.x + sin(best.a) * 3.4; best.z = p.z + cos(best.a) * 3.4
	return best

func startFishing(spot: Dictionary, trl := false) -> void:
	var on_pier: bool = not trl and terr.ground_at(me.pos.x, me.pos.z, me.pos.y) > terr.get_height(me.pos.x, me.pos.z) + 0.3
	me.heading = spot.a
	if bobber == null or not is_instance_valid(bobber):
		bobber = prop("bobber")
		fishLine = MeshInstance3D.new()
		var lm = StandardMaterial3D.new(); lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		lm.albedo_color = Color(0.91, 0.91, 0.91, 0.7); lm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		fishLine.material_override = lm
	if bobber.get_parent(): bobber.get_parent().remove_child(bobber)
	if fishLine.get_parent(): fishLine.get_parent().remove_child(fishLine)
	stage.add_child(bobber); stage.add_child(fishLine)
	bobber.position = Vector3(spot.x, WATER_Y + 0.02, spot.z)
	fishing = {"phase": "wait", "t": 0.0, "bite": (2.0 if trl else 2.5) + randf() * (3.5 if trl else 4.5), "x": spot.x, "z": spot.z, "pier": on_pier, "trail": trl}
	rod.visible = true
	sfx("cloth", {"vol": 0.7, "rate": 1.2}); sfx("plop", {"vol": 0.6, "delay": 0.55})
	if not save.stats.has("fishTip"):
		save.stats.fishTip = 1
		UI.toast("🎣 Gaidi, kamēr pludiņš raustās, tad ātri spied „VILKT!”", "", 4500)
	timers.action = 0.0

func stopFishing(manual = false) -> void:
	if fishing == null: return
	fishing = null
	if rod: rod.visible = false
	if bobber and is_instance_valid(bobber) and bobber.get_parent(): bobber.get_parent().remove_child(bobber)
	if fishLine and is_instance_valid(fishLine) and fishLine.get_parent(): fishLine.get_parent().remove_child(fishLine)
	if manual: UI.toast("🎣 Beidzi makšķerēt")
	timers.action = 0.0

func updateFishing(dt, t) -> void:
	var f = fishing
	if f == null: return
	f.t += dt
	var b = bobber
	if f.phase == "wait":
		b.position.y = WATER_Y + 0.02 + sin(t / 500.0) * 0.015
		if f.t >= f.bite:
			f.phase = "bite"; f.t = 0.0; sfx("splash_s", {"vol": 0.7}); timers.action = 0.0
	elif f.phase == "bite":
		b.position.y = WATER_Y - 0.06 + sin(f.t * 30.0) * 0.05
		b.position.x = f.x + sin(f.t * 17.0) * 0.06
		if f.t > 1.7:
			UI.toast("🐟 Zivs norāva ēsmu… Gaidi nākamo!")
			f.phase = "wait"; f.t = 0.0; f.bite = 2.0 + randf() * 4.0; b.position.x = f.x
			timers.action = 0.0
	var tipn: Node3D = rod.find_child("tip", true, false)
	var tip: Vector3 = tipn.global_position if tipn else rod.global_position
	var im = ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINES)
	im.surface_add_vertex(tip); im.surface_add_vertex(b.global_position + Vector3(0, 0.05, 0))
	im.surface_end()
	fishLine.mesh = im

func catchFish() -> void:
	var f = fishing
	if f == null or f.phase != "bite": return
	if f.trail:
		trailCatch(f)
		return
	var tot = 0.0
	for k in Game.D.FISH: tot += float(Game.D.FISH[k].pier if f.pier else Game.D.FISH[k].w)
	var r = randf() * tot
	var kind: String = Game.D.FISH.keys()[0]
	for k in Game.D.FISH:
		r -= float(Game.D.FISH[k].pier if f.pier else Game.D.FISH[k].w)
		if r <= 0:
			kind = k; break
	var d: Dictionary = Game.D.FISH[kind]
	spawnFloat("💦", Vector3(f.x, WATER_Y, f.z))
	if d.get("junk", false):
		sfx("splash_s", {"vol": 0.6}); sfx("j_fail", {"vol": 0.5})
		showPrize("👢 Ak vai…", null, "Vecs zābaks!", "Tas gan nav ēdams… Metam atpakaļ 😄", "@fishSvg:zabaks")
	else:
		var fish = rollFish(kind, f.pier)
		save.fishBag.append(fish)
		stat("fish")
		var best = float(save.fishBest.get(kind, 0))
		var record: bool = fish.kg > best
		if record: save.fishBest[kind] = fish.kg
		sfx("splash_b", {"vol": 0.8})
		if kind == "zelta":
			stat("goldfish"); sfx("star")
		else: sfx("win" if (record and best > 0) else "pick")
		var kg_txt: String = ("%d g" % roundi(fish.kg * 1000)) if fish.kg < 1 else ("%.2f kg" % fish.kg).replace(".", ",")
		showPrize("✨ Zelta zivtiņa!" if kind == "zelta" else "🎣 Noķēri zivi!", null, d.name, "📏 %d cm · ⚖️ %s · 💰 %d🪙%s" % [fish.cm, kg_txt, fish.v, "\n🏆 Tavs jaunais rekords!" if (record and best > 0) else ""], "@fishSvg:" + kind)
		spawnFloat(d.icon, me.pos)
	f.phase = "wait"; f.t = 0.0; f.bite = 2.5 + randf() * 4.5
	bobber.position.x = f.x
	me.petT = 0.4
	timers.action = 0.0

static func rollFish(kind: String, pier: bool) -> Dictionary:
	var d: Dictionary = Game.D.FISH[kind]
	var rr = minf(1.0, randf() * 1.08) if pier else randf()
	var t = pow(rr, 1.7)
	var cm = roundi(float(d.cm[0]) + (float(d.cm[1]) - float(d.cm[0])) * t)
	var kg = roundf((float(d.kg[0]) + (float(d.kg[1]) - float(d.kg[0])) * pow(t, 2.4)) * 100.0) / 100.0
	var v = maxi(1, roundi(float(d.sell) * (0.45 + 2.3 * pow(t, 1.4))))
	return {"k": kind, "cm": cm, "kg": kg, "v": v}

# ======================= ogas, ugunskurs, tornis, dārgums =======================
func pickBerry(b: Dictionary) -> void:
	berryPicked[str(int(b.id))] = now() + 5000.0
	berryField.set_hidden(int(b.id), true)
	me.petT = 0.5
	net.toHost({"t": "pickB", "id": int(b.id)})

func cookMushrooms() -> void:
	var inv: Dictionary = save.inv
	var n = int(inv.get("baravika", 0)) + int(inv.get("gailene", 0))
	if n == 0:
		UI.toast("🔥 Silti un omulīgi! Atnes baravikas vai gailenes — te tās var izcept.")
		me.waveT = 1.0
		return
	inv.baravika = 0; inv.gailene = 0
	addItem("cepta", n)
	stat("cooked", n)
	sfx("creak", {"vol": 0.4}); sfx("pop", {"vol": 0.6})
	me.petT = 1.0
	UI.toast("%s Izcepi %d sēnes! Ceptas tās maksā %d🪙 gabalā." % [Game.D.COOKED.icon, n, int(Game.D.COOKED.sell)], "good", 3500)
	spawnFloat("🍢", me.pos)

func towerUp() -> void:
	var tw: Dictionary = placeById.tornis
	me.pos = Vector3(tw.x, float(tw.h) + float(tw.top) + 0.05, float(tw.z) + 0.6)
	me.vy = 0.0
	cam.pitch = maxf(cam.pitch, 0.5)
	cam.dist = maxf(cam.dist, 10.0)
	sfx("st_wood", {"vol": 0.8})
	stat("tower")
	if not save.get("revealed", false):
		save.revealed = true
		sfx("star")
		UI.toast("🔭 No torņa redzama visa apkārtne! Visas zelta zvaigznes tagad atzīmētas kartē ⭐", "good", 5000)
	else: UI.toast("🔭 Skaists skats! Pieskaries kartei, lai redzētu visu pasauli.", "", 3000)

func towerDown() -> void:
	var tw: Dictionary = placeById.tornis
	me.pos = Vector3(tw.base.x, world.get_height(tw.base.x, tw.base.z), float(tw.base.z) + 0.4)
	me.vy = 0.0
	sfx("st_wood", {"vol": 0.8})

func takePiece(id: String) -> void:
	var s = scrolls.get(id)
	if s == null: return
	s.queue_free()
	scrolls.erase(id)
	if not save.pieces.has(id): save.pieces.append(id)
	sfx("book", {"vol": 0.7}); sfx("star")
	var n: int = save.pieces.size()
	var need: int = Game.D.MAP_PIECES.size()
	if n >= need: UI.toast("🗺️ Visi kartes gabali kopā! Krustiņš rāda uz 🏰 Pilsdrupām — tur ir dārguma lāde!", "good", 6000)
	else: UI.toast("🗺️ Kartes gabals %d/%d! Pārējie ir citās īpašajās vietās." % [n, need], "good", 4500)
	persist()

func openChest() -> void:
	if save.get("treasure", false):
		UI.toast("🏰 Lāde jau ir tukša — dārgumu tu atradi!"); return
	var n: int = save.pieces.size()
	var need: int = Game.D.MAP_PIECES.size()
	if n < need:
		var miss = []
		for id in Game.D.MAP_PIECES:
			if not save.pieces.has(id): miss.append("%s %s" % [Game.D.PLACES[id].icon, Game.D.PLACES[id].name])
		UI.toast("🔒 Lāde aizslēgta. Vajag %d kartes gabalus (%d/%d). Meklē: %s" % [need, n, need, ", ".join(miss)], "bad", 5500)
		return
	save.treasure = true
	chestAnim = 1.2
	if chestCoins:
		chestCoins.visible = true
		get_tree().create_timer(6.0).timeout.connect(func(): if is_instance_valid(chestCoins): chestCoins.visible = false)
	addCoins(150)
	if not save.ownedHats.has("kivere"): save.ownedHats.append("kivere")
	setHat("kivere")
	stat("treasure")
	sfx("door_open", {"vol": 0.8}); sfx("j_prize", {"vol": 0.8, "delay": 0.3})
	persist()
	UI.showPanel("🏰 Dārgums!", func(b: Control) -> void:
		var l = UI.p("💰🛡️", 40.0); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; b.add_child(l)
		b.add_child(UI.p("Tu atradi seno pilsdrupu dārgumu! +150🪙 un īsta bruņinieka ķivere (tā jau ir galvā, mainīt var pie Pūces Paulas).")))

func checkDiscover() -> void:
	var p: Vector3 = me.pos
	for pl in world.d.places:
		if save.places.has(pl.id): continue
		if Vector2(float(pl.x) - p.x, float(pl.z) - p.z).length() > (26.0 if pl.id == "purvs" else 18.0): continue
		save.places.append(pl.id)
		save.stats.places = save.places.size()
		addCoins(10, true)
		sfx("star")
		UI.toast("🗺️ Atklāji jaunu vietu: %s %s! +10🪙" % [Game.D.PLACES[pl.id].icon, Game.D.PLACES[pl.id].name], "good", 4500)
		checkQuests()

# ======================= mājdzīvnieki =======================
func makePet(id: String) -> Dictionary:
	var def: Dictionary = Game.D.PETS[id]
	var m = Npc.make(def.npc, true)
	m.root.scale *= float(def.scale)
	var ns = float_tag(def.name, 36, Color("#ffe8c0"))
	ns.position.y = 1.1 / m.root.scale.y
	ns.scale = Vector3.ONE / m.root.scale.y
	m.root.add_child(ns)
	stage.add_child(m.root)
	return {"id": id, "model": m, "x": 0.0, "z": 0.0, "heading": 0.0, "init": false, "inCar": false, "hopT": 0.0, "hopFrom": Vector3.ZERO}

func setPet(id, silent := false) -> void:
	if pet != null:
		pet.model.root.queue_free(); pet = null
	save.pet = id if id else null
	if id and Game.D.PETS.has(id): pet = makePet(id)
	if not silent: sendProfile()

func movePet(p: Dictionary, ox: float, oz: float, oh: float, oy: float, dt: float) -> void:
	var tx = ox - sin(oh) * 1.5 + cos(oh) * 0.7
	var tz = oz - cos(oh) * 1.5 - sin(oh) * 0.7
	var dx: float = tx - p.x
	var dz: float = tz - p.z
	var d = Vector2(dx, dz).length()
	if not p.init or d > 30:
		p.x = tx; p.z = tz; p.init = true
	var sp = 0.0
	if d > 0.5:
		sp = minf(14.0, d * 2.8)
		p.x += dx / d * sp * dt; p.z += dz / d * sp * dt
		p.heading = Game.angle_lerp(p.heading, atan2(dx, dz), 1.0 - exp(-dt * 8.0))
	var y = maxf(terr.ground_at(p.x, p.z, oy + 0.3), WATER_Y - 0.1)
	p.model.root.position = Vector3(p.x, y, p.z)
	p.model.root.rotation.y = p.heading
	p.model.animate(dt, sp > 0.3, sp)

func petVehicle(r):
	if r == null:
		if me.bus != null:
			var B = buses[int(me.bus.get("b", 0))] if buses.size() > int(me.bus.get("b", 0)) else null
			return [B.obj, me.bus.seat] if B else null
		if me.inKart and me.kart: return [me.kart.obj, 0]
		if me.lift != null and avatar.root.has_meta("liftChair"): return [avatar.root.get_meta("liftChair"), 0]
		if me.veh != null: return [me.veh.obj, 0]
		if me.ride != null:
			var d = remotes.get(me.ride.driver)
			return [d.vehObj, me.ride.seat] if (d != null and d.vehObj != null) else null
		return null
	var vc = int(r.vehCode)
	if r.vehObj != null and vc in [2, 3, 5, 7]: return [r.vehObj, 0]
	if vc == 1 and r.kart != null: return [r.kart, 0]
	if vc == 6:
		var n = int(r.rideSeat)
		var bi = floori(n / 12.0)
		var B = buses[bi] if buses.size() > bi else (buses[0] if buses.size() else null)
		return [B.obj, n % 12] if B else null
	if r.anim == "lift" and r.avatar.root.has_meta("liftChair"): return [r.avatar.root.get_meta("liftChair"), 0]
	if vc == 4:
		var car = null
		if int(r.rideDriver) == myId: car = me.veh.obj if me.veh != null else null
		else:
			var d = remotes.get(int(r.rideDriver))
			car = d.vehObj if d != null else null
		return [car, int(r.rideSeat)] if car != null else null
	return null

func _pet_spots(obj) -> Array:
	if obj == null: return []
	if obj is Dictionary:
		if obj.has("petSpots"): return obj.petSpots
		if obj.get("pet") != null: return [obj.pet]
		return []
	if obj is Node3D:
		var out = []
		for n in (obj as Node3D).find_children("*", "Node3D", true, false):
			if str(n.get_meta("n", "")) == "pet": out.append(n)
		return out
	return []

func petInVehicle(p: Dictionary, veh, dt: float) -> bool:
	var root: Node3D = p.model.root
	var spots = _pet_spots(veh[0]) if veh != null else []
	if spots.size() > 0:
		var spot: Node3D = spots[int(veh[1]) % spots.size()]
		if root.get_parent() != spot:
			var wp = root.global_position if root.is_inside_tree() else Vector3.ZERO
			var from = spot.to_local(wp) if root.is_inside_tree() else Vector3.ZERO
			if from.length() > 12: from = Vector3.ZERO
			p.hopFrom = from
			p.hopT = 0.0
			if root.get_parent(): root.get_parent().remove_child(root)
			spot.add_child(root)
			root.rotation = Vector3.ZERO
		p.hopT = minf(1.0, p.hopT + dt * 2.2)
		var k: float = p.hopT
		root.position = p.hopFrom * (1.0 - k) + Vector3(0, sin(k * PI) * 1.1, 0)
		p.model.animate(dt, k < 1, 4.0 if k < 1 else 0.0)
		p.inCar = true
		return true
	if p.inCar:
		if root.get_parent(): root.get_parent().remove_child(root)
		stage.add_child(root)
		root.scale = Vector3.ONE * float(Game.D.PETS[p.id].scale) * p.model.baseScale
		p.inCar = false; p.init = false
	return false

func updatePets(dt) -> void:
	if pet != null and not petInVehicle(pet, petVehicle(null), dt):
		var h: float = me.kart.heading if me.inKart else me.heading
		movePet(pet, me.pos.x, me.pos.z, h, me.pos.y, dt)
	for r in remotes.values():
		var want = r.prof.get("pet")
		var have = r.pet.id if r.get("pet") != null else null
		if have != want:
			if r.get("pet") != null: r.pet.model.root.queue_free()
			r.pet = makePet(want) if (want != null and Game.D.PETS.has(want)) else null
		if r.pet == null: continue
		var near: bool = str(r.zone) == zone and absf(r.pos.x - me.pos.x) < 120 and absf(r.pos.z - me.pos.z) < 120
		r.pet.model.root.visible = near and not mgHidden(r.id)
		if near and not petInVehicle(r.pet, petVehicle(r), dt): movePet(r.pet, r.pos.x, r.pos.z, r.ry, r.pos.y, dt)

func petMyPet() -> void:
	petCd = now() + 180000.0
	me.petT = 1.2
	me.heading = atan2(pet.x - me.pos.x, pet.z - me.pos.z)
	spawnFloat("❤️", pet.model.root.global_position)
	sfx("pet")
	if "suns" in str(pet.id) or "kuc" in str(pet.id): sfx("bark", {"vol": 0.6, "delay": 0.1})
	var msgs = ["priecīgi lēkā apkārt!", "apmierināti murrā… vai ņurd.", "grib vēl paglaudīšanu!", "ir tavs labākais draugs!"]
	UI.toast("🐾 %s %s" % [Game.D.PETS[pet.id].name, msgs[randi() % msgs.size()]])

# ======================= dārza rotājumi =======================
func fixDecor() -> void:
	var s = save
	if int(s.get("decorV", 0)) == 2: return
	var gs = Yard.rot_plot(Yard.HOME.x, Yard.HOME.y, 0)
	var placed = []
	for d in s.get("decor", []):
		if d is String:
			var sp = Game.C.props.DECOR_SPOTS.get(d)
			if sp != null: placed.append({"k": d, "x": gs.x + float(sp[0]), "z": gs.y + float(sp[1]), "r": float(sp[2])})
		elif d is Dictionary and d.has("k"): placed.append(d)
	for k in s.get("ownedDecor", []):
		var any = false
		for d in placed: if d.k == k: any = true
		if not any and Game.D.DECOR.has(k): s.inv["d_" + k] = int(s.inv.get("d_" + k, 0)) + 1
	s.decor = placed
	s.decorV = 2

func decorView():
	var out = []
	for d in save.get("decor", []):
		if d is Dictionary: out.append([d.k, d.x, d.z, d.get("r", 0)])
	return out

func renderDecor(slot, list) -> void:
	if not farmOn or slot == null or farm_extra == null: return
	var s = int(slot)
	var items = []
	var gs = Yard.rot_plot(Yard.HOME.x, Yard.HOME.y, 0)
	for d in (list if list != null else []):
		if d is String:
			var sp = Game.C.props.DECOR_SPOTS.get(d)
			if sp != null: items.append([d, gs.x + float(sp[0]), gs.y + float(sp[1]), float(sp[2])])
		elif d is Array: items.append(d)
		elif d is Dictionary and d.has("k"): items.append([d.k, d.x, d.z, d.get("r", 0)])
	var key = JSON.stringify(items)
	if decorKeys[s] == key and decorNodes[s] != null and is_instance_valid(decorNodes[s]): return
	decorKeys[s] = key
	if decorNodes[s] != null and is_instance_valid(decorNodes[s]): decorNodes[s].queue_free()
	var g = Node3D.new()
	for it in items:
		if not Game.D.DECOR.has(it[0]): continue
		var w = Yard.rot_plot(float(it[1]), float(it[2]), s)
		var o = prop("decor:" + str(it[0]))
		o.position = Vector3(w.x, farmW.get_height(w.x, w.y), w.y)
		o.rotation.y = float(it[3] if it[3] != null else 0.0) + Yard.rot_plot_y(s)
		g.add_child(o)
	farm_extra.add_child(g)
	decorNodes[s] = g

# ======================= veikali =======================
func rodRow(b, rebuild) -> void:
	b.add_child(UI.h3("Makšķerēšana"))
	var price: int = int(Game.D.ROD_PRICE)
	var owned: bool = save.get("rod", false)
	b.add_child(UI.itemRow(Icons.tex("rod"), "Makšķere", "Tev pieder! Ej pie ezera un spied „Makšķerēt”" if owned else "%d🪙 · ķer zivis ezeros (no laipas ķeras labāk!)" % price,
		[] if owned else [{"label": "Pirkt %d🪙" % price, "disabled": int(save.coins) < price, "onclick": func():
			if int(save.coins) < price: return
			addCoins(-price); save.rod = true; sfx("buy")
			UI.toast("🎣 Makšķere ir tavā somā! Ej pie ūdens.", "good")
			UI.refreshPanel(rebuild)}]))
	b.add_child(UI.h3("Sēklas"))

func shopPets() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		b.add_child(UI.p("Vau! Katram vajag draugu, kas visur skrien līdzi. 🐾"))
		coinLine(b)
		for k in Game.D.PETS:
			var p: Dictionary = Game.D.PETS[k]
			var owned: bool = save.ownedPets.has(k)
			var cur: bool = save.get("pet") == k
			var kk: String = k
			var btns: Array
			if owned: btns = [{"label": "Mājās" if cur else "Ņemt līdzi", "alt": cur, "onclick": func():
				setPet(null if cur else kk); UI.refreshPanel(build)}]
			else: btns = [{"label": "Pirkt %d🪙" % int(p.price), "disabled": int(save.coins) < int(p.price), "onclick": func():
				if int(save.coins) < int(p.price): return
				addCoins(-int(p.price)); save.ownedPets.append(kk)
				save.stats.pets = save.ownedPets.size(); checkQuests()
				setPet(kk); sfx("buy"); sfx("j_quest", {"vol": 0.6, "delay": 0.2})
				UI.toast("🐾 %s tagad ir tavs draugs un skries tev līdzi!" % p.name, "good")
				UI.refreshPanel(build)}]
			b.add_child(UI.itemRow(Icons.tex("pet:" + k), p.name, ("Skrien tev līdzi" if cur else "Tev pieder") if owned else "%d🪙" % int(p.price), btns))
	UI.showPanel("🐾 Suns Sprīdis — mājdzīvnieki", build)

func shopDecor() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		b.add_child(UI.p("Padari savu sētu skaistāko ciemā! Nopirktais rotājums nonāk tavā somā 🎒 — sētā izņem to un novieto, kur gribi. Jau noliktu rotājumu var pacelt un pārnest. 🏡"))
		coinLine(b)
		for k in Game.D.DECOR:
			var d: Dictionary = Game.D.DECOR[k]
			var in_bag = int(save.inv.get("d_" + k, 0))
			var placed = 0
			for x in save.get("decor", []): if x is Dictionary and x.k == k: placed += 1
			var kk: String = k
			b.add_child(UI.itemRow(Icons.tex("decor:" + k), d.name, "%d🪙%s%s" % [int(d.price), (" · sētā: %d" % placed) if placed else "", (" · somā: %d" % in_bag) if in_bag else ""], [{"label": "Pirkt %d🪙" % int(d.price), "disabled": int(save.coins) < int(d.price), "onclick": func():
				if int(save.coins) < int(d.price): return
				addCoins(-int(d.price)); addItem("d_" + kk)
				var od: Array = save.get("ownedDecor", [])
				if not od.has(kk): od.append(kk)
				save.ownedDecor = od
				save.stats.decor = od.size(); checkQuests()
				sfx("buy")
				UI.toast("%s %s ir tavā somā! Sētā atver 🎒 un spied „Novietot”." % [d.icon, d.name], "good", 4000)
				UI.refreshPanel(build)}]))
	UI.showPanel("🏡 Lapsa Liene — dārza rotājumi", build)

# ======================= vēlēšanās aka =======================
func wishWell() -> void:
	var price: int = int(Game.D.WISH_PRICE)
	if int(save.coins) < price:
		UI.toast("Akā jāiemet %d🪙 — tev nepietiek" % price, "bad"); return
	addCoins(-price, true)
	stat("wishes")
	me.petT = 0.7
	me.heading = atan2(-me.pos.x, -me.pos.z)
	sfx("coin", {"vol": 0.6}); sfx("plop", {"vol": 0.8, "delay": 0.7})
	spawnFloat("🪙", Vector3(0, VILLAGE_Y + 1, 0))
	var pick = func(arr: Array): return arr[randi() % arr.size()]
	var r = randf()
	var gift = null
	if r < 0.42: gift = null
	elif r < 0.70:
		var c: String = pick.call(Game.D.CROPS.keys())
		gift = {"k": c + "_seed", "n": 2 + randi() % 3, "text": "%s sēklas" % Game.D.CROPS[c].name}
	elif r < 0.80: gift = {"coins": 8 + randi() % 13}
	elif r < 0.89:
		var d: String = pick.call(Game.D.DECOR.keys().filter(func(k): return int(Game.D.DECOR[k].price) <= 55))
		gift = {"k": "d_" + d, "n": 1, "text": Game.D.DECOR[d].name}
	elif r < 0.95:
		var t: String = pick.call(Game.D.TREES.keys())
		gift = {"k": t + "_sap", "n": 1, "text": "Stāds: %s" % Game.D.TREES[t].name}
	elif r < 0.985:
		var free = Game.D.CLOTHES.keys().filter(func(k): return not save.ownedClothes.has(k) and int(Game.D.CLOTHES[k].price) <= 45)
		gift = {"cloth": pick.call(free)} if free.size() else {"coins": 30}
	else: gift = {"coins": 60, "big": true}
	await get_tree().create_timer(0.65).timeout
	if gift == null:
		UI.toast(pick.call(["🪙 Plunkš… Aka klusē. Šoreiz nav veiksmes!", "🪙 Monēta aizripoja dziļi… Varbūt nākamreiz!", "🪙 Tikai ūdens apļi… Mēģini vēlreiz!"]), "", 3200)
		return
	sfx("win" if gift.get("big", false) else "star")
	var txt = ""
	var ic = ""
	if gift.has("coins"):
		addCoins(int(gift.coins), true); txt = "%d🪙" % int(gift.coins); ic = "coin"
	elif gift.has("cloth"):
		save.ownedClothes.append(gift.cloth); txt = Game.D.CLOTHES[gift.cloth].name + " (somā)"; ic = "cl:" + str(gift.cloth)
	else:
		addItem(gift.k, int(gift.n)); txt = "%s%s" % [gift.text, (" ×%d" % int(gift.n)) if int(gift.n) > 1 else ""]; ic = gift.k
	showPrize("✨ Aka piepildīja vēlēšanos!", ic, txt, "")
	persist()

# ======================= laimesta kartiņa =======================
func showPrize(title, iconKey, text, sub = "", svgKey = null) -> void:
	if prizeOv == null or not is_instance_valid(prizeOv):
		prizeOv = ColorRect.new()
		(prizeOv as ColorRect).color = Color(0, 0, 0, 0.35)
		prizeOv.set_anchors_preset(Control.PRESET_FULL_RECT)
		prizeOv.gui_input.connect(func(e: InputEvent) -> void:
			if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed): prizeOv.visible = false)
		UI.add_child(prizeOv)
	for c in prizeOv.get_children(): c.queue_free()
	var box = PanelContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER); box.grow_horizontal = Control.GROW_DIRECTION_BOTH; box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.theme = UI.theme_main
	var v = VBoxContainer.new(); v.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_theme_constant_override("separation", int(8 * UI.S))
	var m = MarginContainer.new()
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]: m.add_theme_constant_override(k, int(20 * UI.S))
	m.add_child(v); box.add_child(m)
	var tl = UI.p(str(title), 22.0, UI.GREEN); tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(tl)
	var key: String = str(svgKey) if svgKey != null else str(iconKey if iconKey != null else "nothing")
	var wide = key.begins_with("@fishSvg") or key.begins_with("fish:")
	var tr = TextureRect.new(); tr.texture = Icons.tex(key, 320 if wide else 200)
	tr.custom_minimum_size = Vector2(300 if wide else 150, 150) * UI.S * 0.8
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	v.add_child(tr)
	var tx = UI.p(str(text), 20.0); tx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(tx)
	if str(sub) != "":
		var sl = UI.p(str(sub), 15.0, Color(0.3, 0.3, 0.3)); sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(sl)
	var h = UI.p("Pieskaries, lai turpinātu", 12.0, Color(0.5, 0.5, 0.5)); h.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(h)
	box.custom_minimum_size.x = 420 * UI.S * 0.9
	prizeOv.add_child(box)
	prizeOv.visible = true
	prizeT += 1
	var my_t = prizeT
	get_tree().create_timer(6.0).timeout.connect(func(): if prizeT == my_t and is_instance_valid(prizeOv): prizeOv.visible = false)

# ======================= nedēļas mērķis =======================
func onTeam(tm) -> void:
	if tm == null or tm.get("w") == null: return
	team = (tm as Dictionary).duplicate()
	var sw: Dictionary = save.weekly if (save.weekly is Dictionary and int(save.weekly.get("w", -1)) == int(tm.w)) else {"w": tm.w, "c": 0, "done": false}
	sw.c = maxi(int(sw.get("c", 0)), int(tm.c))
	if int(tm.c) >= int(tm.target) and not sw.get("done", false):
		sw.done = true
		addCoins(int(Game.D.WEEKLY_REWARD))
		save.trophies = int(save.get("trophies", 0)) + 1
		sfx("win")
		UI.toast("🏆 Nedēļas kopīgais mērķis sasniegts! Visiem +%d🪙" % int(Game.D.WEEKLY_REWARD), "good", 6000)
	save.weekly = sw
	updateTeamBar()

func teamText() -> String:
	var g = weeklyGoal(int(team.w))
	return str(g.text).replace("{n}", str(team.target))

func weeklyIcon() -> String:
	return {"mushrooms": "🍄", "fish": "🐟", "berries": "🫐", "harvested": "🥕", "petted": "🦌", "races": "🏎️"}.get(team.stat if team else "", "")

# ======================= saimnieka puse =======================
func hostActivity(from, m) -> void:
	var nowm = Game.now_ms()
	match str(m.get("t", "")):
		"pickB":
			var id = int(m.get("id", -1))
			if id < 0 or id >= world.d.berries.size() or float(hs.pickedB.get(str(id), 0)) > nowm: return
			hs.pickedB[str(id)] = nowm + BERRY_RESPAWN
			net.broadcast({"t": "pickedB", "id": id, "until": hs.pickedB[str(id)], "by": from})
		"teamAdd":
			if int(m.get("w", -1)) != int(hs.team.w): return
			hs.team.c = int(hs.team.c) + clampi(int(m.get("n", 1)), 1, 50)
			net.broadcast({"t": "team", "team": hs.team})
		"mgStart": hostMgStart(from, str(m.get("kind", "")))
		_:
			if not hostBug(from, m) and not hostTrail(from, m): hostWinter(from, m)

func hostMergeWeekly(weekly) -> void:
	if weekly is Dictionary and int(weekly.get("w", -1)) == int(hs.team.w) and int(weekly.get("c", 0)) > int(hs.team.c): hs.team.c = int(weekly.c)

func hostMgStart(from: int, kind: String) -> void:
	var nowm = Game.now_ms()
	if hs.mg.phase != "none" and hs.mg.phase != "done":
		net.sendTo(from, {"t": "toast", "text": "Spēle jau notiek! ⏳"}); return
	var zone_of = func(id) -> int:
		var p = hs.positions.get(id)
		return int(p[7]) if p != null and p.size() > 7 and p[7] != null else 0
	var FZ = ZONE_IDS.find(FOREST)
	if zone_of.call(from) != FZ:
		net.sendTo(from, {"t": "toast", "text": "Ķeramo un paslēpes var spēlēt tikai Mežvidu mežā 🌲"}); return
	var players = hs.profiles.keys().filter(func(id): return zone_of.call(id) == FZ)
	if players.size() < 2:
		net.sendTo(from, {"t": "toast", "text": "Šai spēlei vajag vismaz 2 spēlētājus — uzaicini draugus! 👥"}); return
	var p = hs.positions.get(from, [0, 0, 0])
	var it = players[randi() % players.size()]
	if kind == "tag":
		hs.mg = {"kind": kind, "phase": "run", "players": players, "it": it, "cx": p[0], "cz": p[2], "R": 40, "startAt": nowm + 4000, "endAt": nowm + 94000, "itTime": {}, "last": null, "lastTick": nowm}
	else:
		hs.mg = {"kind": "hide", "phase": "hide", "players": players, "it": it, "cx": p[0], "cz": p[2], "R": 60, "startAt": nowm, "seekAt": nowm + 25000, "endAt": nowm + 145000, "found": []}
	net.broadcast({"t": "mg", "mg": hs.mg})

func hostMgTick(nowm) -> void:
	var M = hs.mg
	if M == null or M.phase == "none": return
	var pos = func(id): return hs.positions.get(id)
	var dist = func(a, b) -> float:
		var pa = pos.call(a)
		var pb = pos.call(b)
		if pa == null or pb == null or int(pa[7] if pa[7] != null else 0) != int(pb[7] if pb[7] != null else 0): return 1e9
		return Vector2(float(pa[0]) - float(pb[0]), float(pa[2]) - float(pb[2])).length()
	if M.phase == "done":
		if nowm > float(M.doneAt) + 8000:
			hs.mg = {"kind": null, "phase": "none"}; net.broadcast({"t": "mg", "mg": hs.mg})
		return
	M.players = M.players.filter(func(id): return hs.profiles.has(id))
	if M.players.size() < 2 or not M.players.has(M.it):
		hs.mg = {"kind": null, "phase": "none"}
		net.broadcast({"t": "mg", "mg": hs.mg})
		net.broadcast({"t": "toast", "text": "Spēle beidzās — palika par maz spēlētāju."})
		return
	var finish = func(winners: Array) -> void:
		M.phase = "done"; M.doneAt = nowm; M.winners = winners
		net.broadcast({"t": "mg", "mg": M})
	if M.kind == "tag":
		if nowm < float(M.startAt): return
		M.itTime[str(M.it)] = float(M.itTime.get(str(M.it), 0.0)) + (nowm - float(M.lastTick))
		M.lastTick = nowm
		for id in M.players:
			if id == M.it: continue
			if M.last != null and M.last.from == id and nowm - float(M.last.at) < 3000: continue
			if dist.call(M.it, id) < 1.7:
				M.last = {"from": M.it, "at": nowm}
				M.it = id
				net.broadcast({"t": "mg", "mg": M})
				break
		if nowm >= float(M.endAt):
			var best = null
			for id in M.players:
				var tm = float(M.itTime.get(str(id), 0.0))
				if best == null or tm < best: best = tm
			finish.call(M.players.filter(func(id): return float(M.itTime.get(str(id), 0.0)) == best))
	else:
		if M.phase == "hide" and nowm >= float(M.seekAt):
			M.phase = "seek"; net.broadcast({"t": "mg", "mg": M}); return
		if M.phase != "seek": return
		var hiders: Array = M.players.filter(func(id): return id != M.it)
		for id in hiders:
			if M.found.has(id): continue
			if dist.call(M.it, id) < 2.6:
				M.found.append(id); net.broadcast({"t": "mg", "mg": M, "foundNow": id})
		if hiders.all(func(id): return M.found.has(id)): finish.call([M.it])
		elif nowm >= float(M.endAt): finish.call(hiders.filter(func(id): return not M.found.has(id)))

# ======================= klienta ziņojumi =======================
func onActivityMessage(m) -> void:
	match str(m.get("t", "")):
		"pickedB":
			berryPicked[str(int(m.id))] = m.until
			if int(m.by) == myId:
				var b: Dictionary = world.d.berries[int(m.id)]
				var def: Dictionary = Game.D.BERRIES[b.kind]
				addItem(b.kind)
				stat("berries")
				sfx("pick")
				UI.toast("%s Salasīji: %s!" % [def.icon, def.name])
				spawnFloat(def.icon, me.pos)
		"team": onTeam(m.team)
		"mg": onMg(m.mg, m.get("foundNow"))
		_:
			if not onBugMessage(m) and not onTrailMessage(m): onWinterMessage(m)

func mgActive() -> bool: return mg != null and mg.get("kind") != null and mg.phase != "none" and mg.phase != "done"
func mgIn() -> bool: return mgActive() and mg.players.has(myId)
func mgHidden(id) -> bool:
	return mgActive() and mg.kind == "hide" and mg.it == myId and id != myId and mg.players.has(id) and not mg.found.has(id)
func mgFrozen() -> bool: return mgActive() and mg.kind == "hide" and mg.phase == "hide" and mg.it == myId

func onMg(mgv, foundNow = null) -> void:
	var M: Dictionary = (mgv as Dictionary).duplicate(true)
	var prev: Dictionary = mg if mg != null else {"phase": "none"}
	mg = M
	var mine: bool = M.has("players") and M.players.has(myId)
	var name_of = func(id) -> String: return "Tu" if id == myId else (remotes[id].prof.name if remotes.has(id) else "?")
	if M.kind == "tag" and mine:
		if prev.phase != "run":
			if me.inKart: exitKart()
			UI.closePanel()
			UI.toast("🏃 Ķeramais! TU esi ķērājs — pieskaries kādam!" if M.it == myId else "🏃 Ķeramais! Ķērājs ir %s — bēdz!" % name_of.call(M.it), "good", 4500)
			sfx("go")
		elif prev.get("it") != M.it and M.phase == "run":
			sfx("bad" if M.it == myId else "beep")
			UI.toast("😱 Tevi noķēra! Tagad TU ķer!" if M.it == myId else "🏃 %s tagad ir ķērājs!" % name_of.call(M.it))
	if M.kind == "hide" and mine:
		if prev.phase == "none" or prev.get("kind") != "hide":
			if me.inKart: exitKart()
			UI.closePanel()
			UI.toast("🙈 Paslēpes! Tu meklē. Aizver acis un skaiti…" if M.it == myId else "🙈 Paslēpes! %s skaita — ātri slēpies (25 s)!" % name_of.call(M.it), "good", 5000)
			sfx("go")
		elif M.phase == "seek" and prev.phase == "hide":
			UI.toast("👀 Gatavs vai nē — eju meklēt! Skaties pēc 🔥/❄️ norādes." if M.it == myId else "👀 Meklētājs nāk! Neizdod sevi!", "good", 4000)
			sfx("go")
		if foundNow != null:
			sfx("beep")
			UI.toast("🙈 Tevi atrada!" if foundNow == myId else "👀 Atrasts: %s!" % name_of.call(foundNow))
	if M.phase == "done" and prev.phase != "done" and mine:
		var won: bool = M.winners.has(myId)
		addCoins(25 if won else 5)
		if won: stat("mgwins")
		sfx("win" if won else "beep")
		UI.showPanel("%s — rezultāti" % MG_NAMES.get(M.kind, ""), func(b: Control) -> void:
			if M.kind == "tag":
				var rows = []
				for id in M.players: rows.append({"id": id, "t": float(M.itTime.get(str(id), 0.0))})
				rows.sort_custom(func(a, c): return a.t < c.t)
				b.add_child(UI.p("Uzvar tas, kurš vismazāk laika bija ķērājs:"))
				var med = ["🥇", "🥈", "🥉", "4."]
				for i in rows.size(): b.add_child(UI.itemRow(med[i] if i < 4 else "•", name_of.call(rows[i].id), "ķērājs %s" % UI.fmt_time(rows[i].t), [], rows[i].id == myId))
			else:
				var seeker_won: bool = M.winners.has(M.it)
				var wn = []
				for id in M.winners: wn.append(name_of.call(id))
				b.add_child(UI.p("👀 %s atrada visus!" % name_of.call(M.it) if seeker_won else "🙈 Paslēpās un netika atrasti: %s" % ", ".join(wn)))
			b.add_child(UI.p("🎉 Tu uzvarēji! +25🪙" if won else "Paldies par spēli! +5🪙")))
	updateMgMarker()

func updateMgMarker() -> void:
	if mgMarker != null and is_instance_valid(mgMarker): mgMarker.queue_free()
	mgMarker = null
	if not mgActive(): return
	var av: Avatar = avatar if mg.it == myId else (remotes[mg.it].avatar if remotes.has(mg.it) else null)
	if av == null: return
	var sp = float_tag("🏃 ĶĒRĀJS" if mg.kind == "tag" else "👀 MEKLĒ", 40, Color.WHITE)
	sp.outline_modulate = Color(0.78, 0.16, 0.16, 0.9); sp.outline_size = 24
	sp.position.y = 3.3
	av.root.add_child(sp)
	mgMarker = sp

func updateMg(dt, t) -> void:
	var hud: Control = UI.b["mg-hud"]
	var cover: ColorRect = UI.b["hide-cover"]
	if not mgIn():
		hud.visible = false; cover.visible = false
		for r in remotes.values():
			if r.avatar and r.avatar.name_tag: r.avatar.name_tag.visible = true
		return
	hud.visible = true
	var sec = func(ms: float) -> int: return maxi(0, ceili(ms / 1000.0))
	var M = mg
	var txt = ""
	if M.kind == "tag":
		txt = ("🏃 Ķeramais sāksies pēc %d s" % sec.call(float(M.startAt) - t)) if t < float(M.startAt) else ("🏃 %s · ⏱️ %d s" % ["TU ESI ĶĒRĀJS!" if M.it == myId else "Bēdz no ķērāja!", sec.call(float(M.endAt) - t)])
		cover.visible = false
	else:
		var seeker: bool = M.it == myId
		if M.phase == "hide":
			txt = ("🙈 Skaiti… %d" % sec.call(float(M.seekAt) - t)) if seeker else ("🙈 Slēpies! Meklētājs sāks pēc %d s" % sec.call(float(M.seekAt) - t))
			cover.visible = seeker
		else:
			cover.visible = false
			var left: int = M.players.filter(func(id): return id != M.it and not M.found.has(id)).size()
			if seeker:
				var nd = 1e9
				for r in remotes.values():
					if M.players.has(r.id) and not M.found.has(r.id): nd = minf(nd, r.pos.distance_to(me.pos))
				var hint = "🔥 Ļoti karsts!" if nd < 8 else ("🌡️ Silts" if nd < 18 else ("🙂 Vēsi" if nd < 35 else "❄️ Auksts"))
				txt = "👀 Meklē! Vēl %d · %s · ⏱️ %d s" % [left, hint, sec.call(float(M.endAt) - t)]
			else:
				txt = ("🙈 Tevi atrada · vēl slēpjas %d · ⏱️ %d s" % [left, sec.call(float(M.endAt) - t)]) if M.found.has(myId) else ("🤫 Slēpies! Vēl %d neatrasti · ⏱️ %d s" % [left, sec.call(float(M.endAt) - t)])
	UI.set_text("mg-hud", txt)
	for r in remotes.values():
		if r.avatar and r.avatar.name_tag: r.avatar.name_tag.visible = not mgHidden(r.id)
	var d = Vector2(me.pos.x - float(M.cx), me.pos.z - float(M.cz)).length()
	if d > float(M.R):
		me.pos.x = float(M.cx) + (me.pos.x - float(M.cx)) / d * float(M.R)
		me.pos.z = float(M.cz) + (me.pos.z - float(M.cz)) / d * float(M.R)
		mgEdgeT -= dt
		if mgEdgeT <= 0:
			mgEdgeT = 3.0; UI.toast("🚧 Spēles laukuma mala! (redzama kartē)")

func openGames() -> void:
	UI.showPanel("🎲 Spēles ar draugiem", func(b: Control) -> void:
		var alone = remotes.is_empty()
		if alone: b.add_child(UI.p("👥 Šīm spēlēm vajag vismaz 2 spēlētājus. Izveido istabu un uzaicini draugus (tajā pašā Wi-Fi)!"))
		b.add_child(UI.h3("🏃 Ķeramais"))
		b.add_child(UI.p("Viens ir ķērājs (sarkana zīme virs galvas). Pieskaries citam — tagad viņš ķer! 90 sekundes; uzvar tas, kurš vismazāk bija ķērājs. Spēlē 40 m ap vietu, kur spēle sākta."))
		b.add_child(UI.btn("🏃 Sākt ķeramo", func():
			net.toHost({"t": "mgStart", "kind": "tag"}); UI.closePanel(), false, alone))
		b.add_child(UI.h3("🙈 Paslēpes"))
		b.add_child(UI.p("Meklētājs 25 sekundes skaita (ekrāns aizvērts), pārējie slēpjas 60 m ap sākuma vietu. Tad 2 minūtes meklē — norāde rāda, vai ir 🔥 karsts vai ❄️ auksts. Vārdi virs galvām paslēpti!"))
		b.add_child(UI.btn("🙈 Sākt paslēpes", func():
			net.toHost({"t": "mgStart", "kind": "hide"}); UI.closePanel(), false, alone))
		b.add_child(UI.p("Uzvarētājam +25🪙, pārējiem +5🪙.", 13.0, Color(0.4, 0.4, 0.4))))

# tukšas (vēlākie slāņi)
func trailCatch(_f) -> void: pass
func hostBug(_from, _m) -> bool: return false
func hostTrail(_from, _m) -> bool: return false
func hostWinter(_from, _m) -> void: pass
func onBugMessage(_m) -> bool: return false
func onTrailMessage(_m) -> bool: return false
func onWinterMessage(_m) -> void: pass
