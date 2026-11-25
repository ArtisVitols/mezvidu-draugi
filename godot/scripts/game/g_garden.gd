class_name GGarden
extends GFarm
## 🌱 Dārznieka līmenis un dārza paplašināšana (web garden.js)

const MAX_LVL := 24

static func xpFor(n: int) -> int: return 0 if n <= 1 else roundi(20.0 * pow(n - 1, 1.6))
static func levelOf(xp: int) -> int:
	var n = 1
	while n < MAX_LVL and xp >= xpFor(n + 1): n += 1
	return n

func LAND() -> Array: return Game.C.garden.LAND

func landRect(land: int) -> Dictionary:
	var L: Dictionary = LAND()[clampi(land, 0, LAND().size() - 1)]
	var ix0: int = -15 - int(L.w) / 2
	var ix1: int = -15 + int(L.w) / 2 - 1
	var iz1: int = Yard.GARDEN_T[1]
	var iz0: int = iz1 - int(L.d) + 1
	return {"ix0": ix0, "ix1": ix1, "iz0": iz0, "iz1": iz1}

func inLand(a, b, land) -> bool:
	var r = landRect(int(land))
	return int(a) >= r.ix0 and int(a) <= r.ix1 and int(b) >= r.iz0 and int(b) <= r.iz1

func cropXp(k) -> int: return roundi(2.0 + 2.0 * sqrt(float(Game.D.CROPS[k].grow) / 60.0))
func fruitXp(k) -> int: return 3 + roundi(float(Game.D.TREES[k].yield) / 2.0)

func initGarden() -> void:
	var s = save
	if s.get("gd") is Dictionary and s.gd.has("xp"): return
	var st: Dictionary = s.get("stats", {})
	var xp: int = int(st.get("harvested", 0)) * 6 + int(st.get("plowed", 0)) + int(st.get("cleared", 0)) * 2 + int(st.get("fruits", 0))
	var land = 0
	for k in s.farm.t:
		var p: PackedStringArray = str(k).split(",")
		while land < LAND().size() - 1 and not inLand(int(p[0]), int(p[1]), land): land += 1
	s.gd = {"xp": xp, "land": land}

func gardenLvl() -> int: return levelOf(int(save.gd.xp))
func cropOpen(k) -> bool: return gardenLvl() >= _unlock(str(k))

func gardenXp(n, at = null) -> void:
	if not n: return
	var g: Dictionary = save.gd
	var before = levelOf(int(g.xp))
	g.xp = int(g.xp) + int(n)
	if at != null: spawnFloat("+%d⭐" % int(n), at)
	var after = levelOf(int(g.xp))
	updateGardenHud()
	if after > before:
		for L in range(before + 1, after + 1): gardenLevelUp(L)

func gardenLevelUp(L: int) -> void:
	var prize = L * 10
	addCoins(prize, true)
	sfx("j_level", {"vol": 0.85}); voice("g_level", {"delay": 0.8})
	var opened = []
	for k in Game.C.garden.UNLOCK:
		if int(Game.C.garden.UNLOCK[k]) == L:
			opened.append(("%s %s" % [Game.D.CROPS[k].icon, Game.D.CROPS[k].name]) if Game.D.CROPS.has(k) else "🌳 %s" % Game.D.TREES[k].name)
	var land = -1
	for i in LAND().size():
		if i > int(save.gd.land) and int(LAND()[i].lvl) == L:
			land = i
			break
	spawnFloat("🎉", me.pos)
	UI.toast("🎉 Dārznieka %d. līmenis! +%d🪙%s%s" % [L, prize, (" · Jaunas sēklas: " + ", ".join(opened)) if opened.size() else "", (" · Var paplašināt dārzu (%d×%d)" % [int(LAND()[land].w), int(LAND()[land].d)]) if land >= 0 else ""], "good", 7000)
	persist()

func updateGardenHud() -> void:
	if not save.get("gd") is Dictionary: return
	var xp = int(save.gd.xp)
	var L = levelOf(xp)
	var p = 1.0 if L >= MAX_LVL else float(xp - xpFor(L)) / float(xpFor(L + 1) - xpFor(L))
	var b: Button = UI.b.get("btn-glevel")
	if b == null: return
	b.text = "🌱 %d" % L
	var g = GradientTexture2D.new()
	var gr = Gradient.new()
	gr.offsets = PackedFloat32Array([0.0, p, minf(1.0, p + 0.001), 1.0])
	gr.colors = PackedColorArray([Color(140 / 255.0, 220 / 255.0, 110 / 255.0, 0.95), Color(140 / 255.0, 220 / 255.0, 110 / 255.0, 0.95), Color(1, 1, 1, 0.88), Color(1, 1, 1, 0.88)])
	g.gradient = gr; g.width = 64; g.height = 8
	var sb = StyleBoxTexture.new(); sb.texture = g
	sb.content_margin_left = 6 * UI.S * 1.4; sb.content_margin_right = 6 * UI.S * 1.4; sb.content_margin_top = 6 * UI.S; sb.content_margin_bottom = 6 * UI.S
	b.add_theme_stylebox_override("normal", sb); b.add_theme_stylebox_override("hover", sb); b.add_theme_stylebox_override("pressed", sb)

func nextLand():
	var i = int(save.gd.land) + 1
	if i >= LAND().size(): return null
	var d: Dictionary = (LAND()[i] as Dictionary).duplicate(); d.i = i
	return d

func buyLand() -> void:
	var n = nextLand()
	if n == null: return
	if gardenLvl() < int(n.lvl):
		UI.toast("🔒 Lielāku dārzu var nopirkt no %d. līmeņa" % int(n.lvl)); return
	if int(save.coins) < int(n.price):
		UI.toast("Nepietiek monētu — vajag %d🪙" % int(n.price), "bad"); return
	addCoins(-int(n.price), true)
	save.gd.land = n.i
	sfx("coin")
	UI.toast("🏡 Dārzs paplašināts: %d × %d lauciņi!" % [int(n.w), int(n.d)], "good", 4000)
	renderLandBorder()
	persist()

func renderLandBorder() -> void:
	if farm_extra == null or mySlot < 0: return
	if landBorder != null and is_instance_valid(landBorder): landBorder.queue_free()
	landBorder = null
	var land = int(save.gd.land)
	if land >= LAND().size() - 1: return
	var r = landRect(land)
	var slot = mySlot
	var x0: float = r.ix0 * Yard.TILE
	var x1: float = (r.ix1 + 1) * Yard.TILE
	var z0: float = r.iz0 * Yard.TILE
	var z1: float = (r.iz1 + 1) * Yard.TILE
	var pts = []
	var edge = func(ax: float, az: float, bx: float, bz: float) -> void:
		var n = roundi(Vector2(bx - ax, bz - az).length() / Yard.TILE)
		for i in n: pts.append(Vector2(ax + (bx - ax) * i / n, az + (bz - az) * i / n))
	edge.call(x0, z1, x0, z0); edge.call(x0, z0, x1, z0); edge.call(x1, z0, x1, z1); edge.call(x1, z1, x0, z1)
	var g = Node3D.new()
	var mk = func(c: String) -> StandardMaterial3D:
		var m = StandardMaterial3D.new(); m.albedo_color = Color(c); m.roughness = 0.9; return m
	var wood: StandardMaterial3D = mk.call("#8a6440")
	var rope: StandardMaterial3D = mk.call("#e8d9a8")
	var flag: StandardMaterial3D = mk.call("#ffcf3a")
	var stake = CylinderMesh.new(); stake.top_radius = 0.045; stake.bottom_radius = 0.06; stake.height = 0.7; stake.radial_segments = 6
	var wpts = []
	for p in pts:
		var w = Yard.rot_plot(p.x, p.y, slot)
		wpts.append(Vector3(w.x, farmW.get_height(w.x, w.y), w.y))
	for i in wpts.size():
		var p: Vector3 = wpts[i]
		var s = MeshInstance3D.new(); s.mesh = stake; s.material_override = wood; s.position = p + Vector3(0, 0.3, 0); g.add_child(s)
		var q: Vector3 = wpts[(i + 1) % wpts.size()]
		var len = Vector2(q.x - p.x, q.z - p.z).length()
		var rp = MeshInstance3D.new(); var bm = BoxMesh.new(); bm.size = Vector3(0.03, 0.03, len); rp.mesh = bm; rp.material_override = rope
		g.add_child(rp)
		rp.position = (p + q) / 2.0 + Vector3(0, 0.5, 0)
		if len > 0.01: rp.look_at_from_position(rp.position, q + Vector3(0, 0.5, 0), Vector3.UP)
		if i % 2 == 0:
			var f = MeshInstance3D.new(); var fm = BoxMesh.new(); fm.size = Vector3(0.02, 0.12, 0.18); f.mesh = fm; f.material_override = flag
			f.position = p + Vector3(0, 0.62, 0.1); g.add_child(f)
	landBorder = g
	farm_extra.add_child(g)

func landAction(consider) -> void:
	var n = nextLand()
	if n == null: return
	if gardenLvl() < int(n.lvl): consider.call(1.0, 2.0, "🔒 Dārzs vēl mazs — lielāks no %d. līmeņa" % int(n.lvl), func(): openGardenInfo())
	else: consider.call(1.0, 2.0, "🏡 Paplašināt dārzu līdz %d×%d (%d🪙)" % [int(n.w), int(n.d), int(n.price)], func(): buyLand())

func openGardenInfo() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		var xp = int(save.gd.xp)
		var L = levelOf(xp)
		var land: Dictionary = LAND()[int(save.gd.land)]
		var nxt = xpFor(L + 1) if L < MAX_LVL else -1
		b.add_child(UI.h3("🌱 Dārznieka %d. līmenis" % L))
		b.add_child(UI.bar(float(xp - xpFor(L)) / float(nxt - xpFor(L)) if nxt > 0 else 1.0))
		b.add_child(UI.p(("⭐ %d / %d — līdz %d. līmenim vēl %d ⭐" % [xp, nxt, L + 1, nxt - xp]) if nxt > 0 else ("⭐ %d — augstākais līmenis! 🏆" % xp), 14.0))
		b.add_child(UI.p("⭐ nāk par ražas novākšanu (ilgāk augošas kultūras dod vairāk), augļu lasīšanu, zemes uzaršanu, koku un akmeņu novākšanu un draugu lauku aplaistīšanu. Katrā līmenī: monētas un jaunas sēklas!", 13.0, Color(0.3, 0.3, 0.3)))
		b.add_child(UI.h3("🏡 Dārzs: %d × %d lauciņi" % [int(land.w), int(land.d)]))
		var n = nextLand()
		if n != null:
			var can = L >= int(n.lvl)
			b.add_child(UI.itemRow("🏡", "Paplašināt līdz %d × %d" % [int(n.w), int(n.d)], ("%d🪙 · tev ir %d🪙" % [int(n.price), int(save.coins)]) if can else ("🔒 no %d. līmeņa · %d🪙" % [int(n.lvl), int(n.price)]), [
				{"label": "Pirkt", "disabled": not can or int(save.coins) < int(n.price), "onclick": func():
					buyLand(); UI.refreshPanel(build)}]))
		else: b.add_child(UI.p("Tavs dārzs ir pilnā izmērā — 20 × 20! 🎉"))
		b.add_child(UI.h3("🔓 Sēklas un koki pa līmeņiem"))
		for k in range(1, MAX_LVL + 1):
			var ids = []
			for id in Game.C.garden.UNLOCK: if int(Game.C.garden.UNLOCK[id]) == k: ids.append(id)
			if ids.is_empty(): continue
			var row = HFlowContainer.new()
			row.modulate.a = 1.0 if k <= L else 0.55
			var lb = UI.p("%s %d." % ["✅" if k <= L else "🔒", k], 14.0); lb.custom_minimum_size.x = 62 * UI.S; lb.size_flags_horizontal = 0
			row.add_child(lb)
			for id in ids:
				var box = VBoxContainer.new(); box.custom_minimum_size.x = 64 * UI.S
				var tr = TextureRect.new(); tr.texture = Icons.tex(id if Game.D.CROPS.has(id) else id + "_sap", 48)
				tr.custom_minimum_size = Vector2(30, 30) * UI.S; tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
				box.add_child(tr)
				var nl = UI.p(Game.D.CROPS[id].name if Game.D.CROPS.has(id) else Game.D.TREES[id].name, 11.0)
				nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
				box.add_child(nl)
				row.add_child(box)
			b.add_child(row)
	UI.showPanel("🌱 Mans dārzs", build)
