class_name GUi
extends GWorld
## HUD, karte, veikali, soma, dāvanas, uzdevumi, istaba, izvēlne, iestatījumi, pamācība (web game.js paneļi)

var minimap: MapView
var bigmap: MapView
var bagSel = null
var giftN = 1
var bagBuild = null
var doll = null
var dollAngle = 0.35
var statsOn = false
var buses: Array = []

# ======================= HUD =======================
func bindHud() -> void:
	UI.sfx_cb = func(n, o = {}): sfx(n, o)
	UI.press("btn-jump", func(): controls.jump_pressed = true)
	UI.press("btn-action", func(): doAction())
	UI.press("btn-emote", func(): toggleEmotes())
	UI.press("btn-bag", func(): openBag())
	UI.press("btn-quests", func(): openQuests())
	UI.press("btn-glevel", func(): openGardenInfo())
	UI.press("btn-menu", func(): openMenu())
	UI.press("btn-room", func(): openRoom())
	UI.press("btn-exit-kart", func():
		if me.bus != null: leaveBus()
		elif me.ride != null: leaveRide()
		elif me.veh != null: exitVehicle()
		else: exitKart())
	UI.press("btn-race", func():
		net.toHost({"t": "raceReq"}); sfx("beep"))
	UI.press("btn-games", func(): openGames())
	var em: HFlowContainer = UI.b["emote-menu"]
	for c in em.get_children(): c.queue_free()
	for t in Game.D.EMOTES:
		var b = UI.pill(str(t))
		var tt = str(t)
		b.pressed.connect(func():
			net.toHost({"t": "emote", "text": tt})
			em.visible = false)
		em.add_child(b)
	UI.hud.visible = true
	updateRoomButton()

func toggleEmotes() -> void: UI.b["emote-menu"].visible = not UI.b["emote-menu"].visible

# ======================= Karte =======================
func buildMinimap() -> void:
	var holder: Control = UI.b["minimap"]
	if minimap == null:
		minimap = MapView.new()
		minimap.g = self
		minimap.mini = true
		minimap.custom_minimum_size = holder.custom_minimum_size
		holder.get_parent().add_child(minimap)
		holder.get_parent().move_child(minimap, holder.get_index())
		holder.visible = false
		UI.b["minimap"] = minimap

func drawMinimap() -> void:
	if minimap: minimap.queue_redraw()
	if bigmap and is_instance_valid(bigmap) and UI.panelOpen(): bigmap.queue_redraw()

func globalPos(z: String, x: float, zz: float) -> Vector2: return Terra.zone_offset(z) + Vector2(x, zz)

func openBigMap() -> void:
	bigmap = MapView.new()
	bigmap.g = self
	bigmap.mini = false
	bigmap.zone = zone
	var vs = get_viewport().get_visible_rect().size
	var cw: float = minf(vs.x * 0.94 - 40.0 * UI.S, (vs.y - 190.0 * UI.S) * 16.0 / 9.0)
	bigmap.custom_minimum_size = Vector2(cw, cw * 9.0 / 16.0)
	UI.showPanel("🗺️ Karte", func(b: Control) -> void:
		b.add_child(bigmap)
		var row = HBoxContainer.new(); row.add_theme_constant_override("separation", int(8 * UI.S))
		var btn = UI.btn("", func(): pass)
		var back = UI.btn("", func(): pass, true)
		var zin = UI.btn("➕", func(): bigmap.zoom_at(1.6))
		var zout = UI.btn("➖", func(): bigmap.zoom_at(1.0 / 1.6))
		row.add_child(btn); row.add_child(back); row.add_child(zin); row.add_child(zout)
		b.add_child(row)
		var legend = UI.p("", 12.0, Color(0.3, 0.3, 0.3))
		b.add_child(legend)
		var upd = func() -> void:
			var Z: Dictionary = Game.C.zones.ZONES[bigmap.zone]
			var ZH: Dictionary = Game.C.zones.ZONES[zone]
			UI.panel_title.text = "🗺️ Visas zemes" if bigmap.all else "🗺️ %s %s" % [Z.icon, Z.name]
			btn.text = ("🔍 Tuvāk: %s %s" % [ZH.icon, ZH.name]) if bigmap.all else "🧭 Visas zemes"
			back.visible = not bigmap.all and bigmap.zone != zone
			back.text = "📍 Kur esmu: %s %s" % [ZH.icon, ZH.name]
			legend.text = "Pieskaries zemei, lai to redzētu tuvāk · 2 pirksti — tuvināt · bultas — spēlētāji" if bigmap.all else \
				"%s%sbultas — spēlētāji · 🚙🚲🛷🚌 transports · velc, 2 pirksti — tuvināt" % ["🌱🧺🎩🐾🏡 tirgotāji · 🪙 aka · " if bigmap.zone == FOREST else "", "⭐ zvaigznes · " if save.get("revealed", false) else ""]
		set_meta("bigmap_upd", upd)
		btn.pressed.connect(func():
			bigmap.all = not bigmap.all
			if not bigmap.all: bigmap.zone = zone
			bigmap.reset_zoom(); bigmap.queue_redraw(); upd.call())
		back.pressed.connect(func():
			bigmap.all = false; bigmap.zone = zone; bigmap.reset_zoom(); bigmap.queue_redraw(); upd.call())
		upd.call()
		bigmap.ready.connect(func(): bigmap.reset_zoom(), CONNECT_ONE_SHOT), func(): bigmap = null, true)

func bigMapChanged() -> void:
	if has_meta("bigmap_upd"): (get_meta("bigmap_upd") as Callable).call()

# ======================= Veikali =======================
func openShop(id) -> void:
	voice("v_" + str(id))
	match str(id):
		"seeds": shopSeeds()
		"buyer": shopBuyer()
		"pets": shopPets()
		"decor": shopDecor()
		_: shopHats()

func coinLine(b: Control) -> void: b.add_child(UI.h3("Tev ir 🪙 %d" % int(save.coins)))

func _unlock(k: String) -> int: return int(Game.C.garden.UNLOCK.get(k, 1))

func shopSeeds() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		b.add_child(UI.p("Sveiks! Man ir labākās sēklas visā Mežvidu ciemā, augļu koku stādi un makšķeres. Viena sēkla apsēj vienu lauciņu. Dārgākās aug ilgāk, bet nes vairāk! 🌱🎣"))
		coinLine(b)
		rodRow(b, build)
		var L: int = gardenLvl()
		b.add_child(UI.p("🌱 Tavs dārznieka līmenis: %d. Jaunas sēklas atveras, kad novāc ražu un iegūsti ⭐." % L, 13.0))
		var crops: Array = Game.D.CROPS.keys()
		crops.sort_custom(func(p, q):
			var a = _unlock(p)
			var c = _unlock(q)
			return a < c if a != c else float(Game.D.CROPS[p].grow) < float(Game.D.CROPS[q].grow))
		for k in crops:
			var c: Dictionary = Game.D.CROPS[k]
			var have = int(save.inv.get(k + "_seed", 0))
			var info = "aug %s · raža ×%d (%d🪙)" % [fmtLeft(float(c.grow)), int(c.yield), int(c.yield) * int(c.sell)]
			if not cropOpen(k):
				b.add_child(UI.itemRow(Icons.tex(k + "_seed"), "🔒 %s" % c.name, "no %d. līmeņa · %s%s" % [_unlock(k), info, (" · tev: %d" % have) if have else ""]))
				continue
			var kk: String = k
			var buy = func(n: int) -> void:
				if int(save.coins) < int(c.seedPrice) * n:
					UI.toast("Nepietiek monētu 🪙", "bad")
					return
				addCoins(-int(c.seedPrice) * n, true); addItem(kk + "_seed", n); sfx("buy")
				UI.refreshPanel(build)
			b.add_child(UI.itemRow(Icons.tex(k + "_seed"), "%s — sēkla" % c.name, "%d🪙 · %s · tev: %d" % [int(c.seedPrice), info, have], [
				{"label": "Pirkt", "onclick": func(): buy.call(1), "disabled": int(save.coins) < int(c.seedPrice)},
				{"label": "×5", "onclick": func(): buy.call(5), "disabled": int(save.coins) < int(c.seedPrice) * 5}]))
		b.add_child(UI.h3("🌳 Augļu koki (stādi)"))
		b.add_child(UI.p("Iestādi uz uzarta lauciņa. Kad koks izaug, tas atkal un atkal dod augļus!", 13.0, Color(0.3, 0.3, 0.3)))
		var trees: Array = Game.D.TREES.keys()
		trees.sort_custom(func(p, q): return _unlock(p) < _unlock(q))
		for k in trees:
			var t: Dictionary = Game.D.TREES[k]
			var have = int(save.inv.get(k + "_sap", 0))
			var f: Dictionary = Game.D.FRUITS[t.fruit]
			if not cropOpen(k):
				b.add_child(UI.itemRow(Icons.tex(k + "_sap"), "🔒 %s — stāds" % t.name, "no %d. līmeņa · %d🪙" % [_unlock(k), int(t.price)]))
				continue
			var kk: String = k
			b.add_child(UI.itemRow(Icons.tex(k + "_sap"), "%s — stāds" % t.name, "%d🪙 · izaug %s · %s ×%d ik pa %s (%d🪙) · tev: %d" % [int(t.price), fmtLeft(float(t.grow)), str(f.name).to_lower(), int(t.yield), fmtLeft(float(t.every)), int(t.yield) * int(f.sell), have], [
				{"label": "Pirkt", "disabled": int(save.coins) < int(t.price), "onclick": func():
					if int(save.coins) < int(t.price): return
					addCoins(-int(t.price), true); addItem(kk + "_sap"); sfx("buy"); UI.refreshPanel(build)}]))
	UI.showPanel("🌱 Ūdrs Ojārs — sēklas un stādi", build)

func sellables() -> Array:
	var out = []
	for k in Game.D.MUSHROOMS:
		if not Game.D.MUSHROOMS[k].get("poison", false): out.append({"k": k, "name": Game.D.MUSHROOMS[k].name, "price": int(Game.D.MUSHROOMS[k].sell)})
	for k in Game.D.CROPS: out.append({"k": k, "name": Game.D.CROPS[k].name, "price": int(Game.D.CROPS[k].sell)})
	for k in Game.D.FRUITS: out.append({"k": k, "name": Game.D.FRUITS[k].name, "price": int(Game.D.FRUITS[k].sell)})
	for k in Game.D.BERRIES: out.append({"k": k, "name": Game.D.BERRIES[k].name, "price": int(Game.D.BERRIES[k].sell)})
	out.append({"k": "cepta", "name": Game.D.COOKED.name, "price": int(Game.D.COOKED.sell)})
	return out

func fishGroups() -> Array:
	var g = {}
	for f in save.get("fishBag", []):
		if not g.has(f.k): g[f.k] = []
		g[f.k].append(f)
	var out = []
	for k in g:
		var list: Array = g[k]
		list.sort_custom(func(a, b): return float(a.kg) > float(b.kg))
		var sum = 0
		for f in list: sum += int(f.v)
		out.append({"k": k, "list": list, "sum": sum})
	return out

func shopBuyer() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		b.add_child(UI.p("Es uzpērku sēnes, dārzeņus, augļus, zivis un ogas. Par lielu zivi maksāju vairāk! 🧺"))
		coinLine(b)
		var any = false
		var total_all = 0
		for it in sellables():
			var n = int(save.inv.get(it.k, 0))
			if n <= 0: continue
			any = true; total_all += n * int(it.price)
			var itd: Dictionary = it
			var sell = func(cnt: int) -> void:
				var c = mini(cnt, int(save.inv.get(itd.k, 0)))
				if c <= 0: return
				save.inv[itd.k] = int(save.inv[itd.k]) - c
				addCoins(c * int(itd.price))
				stat("sold", c)
				UI.refreshPanel(build)
			b.add_child(UI.itemRow(Icons.tex(it.k), "%s ×%d" % [it.name, n], "%d🪙 gabalā" % int(it.price), [
				{"label": "Pārdot 1", "onclick": func(): sell.call(1)}, {"label": "Visu", "onclick": func(): sell.call(n), "alt": true}]))
		for fg in fishGroups():
			any = true; total_all += int(fg.sum)
			var fk: String = fg.k
			var sell_fish = func(all: bool) -> void:
				var bag: Array = save.fishBag
				var mine = bag.filter(func(f): return f.k == fk)
				mine.sort_custom(func(a, c): return int(a.v) > int(c.v))
				var go: Array = mine if all else mine.slice(0, 1)
				var sum = 0
				for f in go:
					sum += int(f.v); bag.erase(f)
				addCoins(sum); stat("sold", go.size()); UI.refreshPanel(build)
			var big: Dictionary = fg.list[0]
			b.add_child(UI.itemRow(Icons.tex("fish:" + fg.k, 80), "%s ×%d" % [Game.D.FISH[fg.k].name, fg.list.size()], "kopā %d🪙 · lielākā %d cm, %s kg (%d🪙)" % [int(fg.sum), int(big.cm), str(big.kg), int(big.v)], [
				{"label": "Lielāko", "onclick": func(): sell_fish.call(false)}, {"label": "Visas", "onclick": func(): sell_fish.call(true), "alt": true}]))
		if not any: b.add_child(UI.p("Tev pagaidām nav ko pārdot. Salasi sēnes mežā, izaudzē dārzeņus vai noķer zivis!"))
		else:
			b.add_child(UI.btn("💰 Pārdot visu (%d🪙)" % total_all, func():
				var sum = 0
				var cnt = 0
				for it in sellables():
					var n = int(save.inv.get(it.k, 0))
					sum += n * int(it.price); cnt += n; save.inv[it.k] = 0
				for f in save.fishBag:
					sum += int(f.v); cnt += 1
				save.fishBag = []
				addCoins(sum); stat("sold", cnt); UI.refreshPanel(build)))
	UI.showPanel("🧺 Āpsis Arnolds — uzpircējs", build)

func shopHats() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		b.add_child(UI.p("Ū-hū! Cepures, krekli, brilles, apavi un vēl! Nopirkto uzvelc somā 🎒 (tur redzams tavs tēls). Esi stilīgs! 🎩"))
		coinLine(b)
		var row = func(key: String, name: String, price: int, owned: bool, worn: bool, on_buy: Callable, on_wear: Callable) -> void:
			var btns: Array
			if owned: btns = [{"label": "Novilkt" if worn else "Uzvilkt", "alt": worn, "onclick": func():
				on_wear.call(not worn); UI.refreshPanel(build)}]
			else: btns = [{"label": "Pirkt %d🪙" % price, "disabled": int(save.coins) < price, "onclick": func():
				if int(save.coins) < price: return
				addCoins(-price); on_buy.call(); UI.refreshPanel(build)}]
			b.add_child(UI.itemRow(Icons.tex(key), name, ("✔ Uzvilkts" if worn else "Tev pieder") if owned else "%d🪙" % price, btns, worn))
		b.add_child(UI.h3("Cepures"))
		for k in Game.D.HATS:
			var h: Dictionary = Game.D.HATS[k]
			if h.get("hidden", false) and not save.ownedHats.has(k): continue
			var kk: String = k
			row.call("hat:" + k, h.name, int(h.price), save.ownedHats.has(k), save.hat == k,
				func():
					save.ownedHats.append(kk); setHat(kk),
				func(on): setHat(kk if on else null))
		for sl in Game.D.SLOTS:
			if sl.id == "hat": continue
			b.add_child(UI.h3(sl.name))
			for k in Game.D.CLOTHES:
				var c: Dictionary = Game.D.CLOTHES[k]
				if c.slot != sl.id: continue
				var kk: String = k
				row.call("cl:" + k, c.name, int(c.price), save.ownedClothes.has(k), save.wear.get(c.slot) == k,
					func():
						save.ownedClothes.append(kk); setWearItem(c.slot, kk); UI.toast("👕 %s — uzvilkts!" % c.name, "good"),
					func(on): setWearItem(c.slot, kk if on else null))
		b.add_child(UI.h3("Kartinga krāsa"))
		for kc in Game.D.KART_COLORS:
			var owned: bool = save.ownedKarts.has(kc.id)
			var cur: bool = save.kartColor == kc.id
			var kid: String = kc.id
			var btns: Array
			if owned: btns = [{"label": "Izvēlēta" if cur else "Izvēlēties", "disabled": cur, "onclick": func():
				setKartColor(kid); UI.refreshPanel(build)}]
			else: btns = [{"label": "Pirkt %d🪙" % int(kc.price), "disabled": int(save.coins) < int(kc.price), "onclick": func():
				if int(save.coins) < int(kc.price): return
				addCoins(-int(kc.price)); save.ownedKarts.append(kid); setKartColor(kid); UI.refreshPanel(build)}]
			var sw = Image.create(40, 40, false, Image.FORMAT_RGBA8); sw.fill(Color(kc.color))
			b.add_child(UI.itemRow(ImageTexture.create_from_image(sw), kc.name, "", btns))
	UI.showPanel("🎩 Pūce Paula — drēbes un cepures", build)

func setHat(k) -> void:
	save.hat = k
	avatar.set_hat(k)
	sendProfile()

func setWearItem(slot: String, id) -> void:
	if slot == "hat":
		setHat(id)
		return
	var w: Dictionary = (save.get("wear", {}) as Dictionary).duplicate()
	if id != null: w[slot] = id
	else: w.erase(slot)
	save.wear = w
	if slot == "top": rebuildMyAvatar()
	else: avatar.set_wear(w)
	sfx("cloth", {"vol": 0.8})
	sendProfile()

func rebuildMyAvatar() -> void:
	var old = avatar
	var parent = old.root.get_parent()
	var av = Avatar.make(avatarProf())
	av.root.transform = old.root.transform
	av.root.visible = old.root.visible
	if av.shadow and old.shadow: av.shadow.visible = old.shadow.visible
	if parent:
		parent.add_child(av.root)
	av.set_name_tag(save.name, Color("#d8ffc8"))
	if old.winter: av.set_winter(true)
	if old.skis != null: av.set_skis(true)
	if me.carry != null: av.set_carry(carryModel(me.carry.k))
	old.root.queue_free()
	avatar = av
	onAvatarRebuilt()

func setKartColor(id: String) -> void:
	save.kartColor = id
	if me.kart: setKartColor3D(me.kart.obj, kartColorHex(id))
	sendProfile()

# ---------- tēls somā (savs mazs 3D skats) ----------
func dollView() -> Control:
	if doll == null:
		var sv = SubViewport.new()
		sv.size = Vector2i(360, 480)
		sv.own_world_3d = true
		sv.transparent_bg = true
		sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		var we = WorldEnvironment.new(); var e = Environment.new()
		e.background_mode = Environment.BG_CLEAR_COLOR; e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		e.ambient_light_color = Color(0.85, 0.85, 0.8); e.ambient_light_energy = 0.9; e.tonemap_mode = Environment.TONE_MAPPER_AGX
		we.environment = e; sv.add_child(we)
		var l = DirectionalLight3D.new(); l.light_energy = 1.4; sv.add_child(l); l.look_at_from_position(Vector3(2, 4, 4), Vector3.ZERO, Vector3.UP)
		var c = Camera3D.new(); c.fov = 26; sv.add_child(c); c.look_at_from_position(Vector3(0, 0.95, 4.4), Vector3(0, 0.82, 0), Vector3.UP)
		add_child(sv)
		doll = {"sv": sv, "key": "", "av": null}
	var key = JSON.stringify(avatarProf())
	if doll.key != key:
		if doll.av: doll.av.root.queue_free()
		doll.av = Avatar.make(avatarProf())
		if doll.av.shadow: doll.av.shadow.visible = false
		for i in 40: doll.av.animate(0.05, "idle", 0.0)
		doll.sv.add_child(doll.av.root)
		doll.key = key
	doll.av.root.rotation.y = dollAngle
	var tr = TextureRect.new()
	tr.texture = (doll.sv as SubViewport).get_texture()
	tr.custom_minimum_size = Vector2(180, 240) * UI.S * 0.85
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return tr

# ======================= Soma =======================
func bagItems() -> Array:
	var inv: Dictionary = save.inv
	var out = []
	var add = func(key: String, n: int, name: String, kind: String, extra := {}) -> void:
		if n > 0:
			var d = {"key": key, "n": n, "name": name, "kind": kind}
			d.merge(extra)
			out.append(d)
	for k in Game.D.CROPS: add.call(k + "_seed", int(inv.get(k + "_seed", 0)), "%s sēkla" % Game.D.CROPS[k].name, "seed", {"crop": k})
	for k in Game.D.TREES: add.call(k + "_sap", int(inv.get(k + "_sap", 0)), "%s — stāds" % Game.D.TREES[k].name, "sap", {"tree": k})
	for k in Game.D.DECOR: add.call("d_" + k, int(inv.get("d_" + k, 0)), Game.D.DECOR[k].name, "decor", {"decor": k})
	for it in sellables(): add.call(it.k, int(inv.get(it.k, 0)), it.name, "goods", {"price": it.price})
	for fg in fishGroups(): add.call("fish:" + fg.k, fg.list.size(), Game.D.FISH[fg.k].name, "fish", {"fish": fg})
	for k in save.ownedHats: add.call("hat:" + k, 1, Game.D.HATS[k].name if Game.D.HATS.has(k) else k, "hat", {"id": k, "worn": save.hat == k})
	for k in save.ownedClothes:
		if Game.D.CLOTHES.has(k): add.call("cl:" + k, 1, Game.D.CLOTHES[k].name, "cloth", {"id": k, "worn": save.wear.get(Game.D.CLOTHES[k].slot) == k})
	if save.get("rod", false): add.call("rod", 1, "Makšķere", "tool")
	return out

func _slot_btn(sl: Dictionary, build: Callable) -> Button:
	var id = save.hat if sl.id == "hat" else save.wear.get(sl.id)
	var bt = Button.new()
	bt.custom_minimum_size = Vector2(70, 70) * UI.S * 0.8
	var on: bool = bagSel == "slot:" + str(sl.id)
	bt.add_theme_stylebox_override("normal", UI._sb(Color("#fff3c4") if on else Color(1, 1, 1, 0.8), 12 * UI.S, 4 * UI.S, false))
	bt.add_theme_stylebox_override("hover", UI._sb(Color("#fff3c4"), 12 * UI.S, 4 * UI.S, false))
	bt.add_theme_stylebox_override("pressed", UI._sb(Color("#ffe58a"), 12 * UI.S, 4 * UI.S, false))
	if id != null: bt.icon = Icons.tex(("hat:" if sl.id == "hat" else "cl:") + str(id), 56)
	else: bt.text = "＋"
	bt.expand_icon = true
	bt.add_theme_color_override("font_color", Color(0.4, 0.4, 0.4))
	bt.tooltip_text = sl.name
	bt.pressed.connect(func():
		bagSel = "slot:" + str(sl.id); UI.refreshPanel(build))
	return bt

func openBag(sel = null) -> void:
	bagSel = sel
	giftN = 1
	var build: Callable
	build = func(b: Control) -> void:
		var dollrow = HBoxContainer.new(); dollrow.alignment = BoxContainer.ALIGNMENT_CENTER; dollrow.add_theme_constant_override("separation", int(10 * UI.S))
		var colL = VBoxContainer.new()
		var colR = VBoxContainer.new()
		var slots: Array = Game.D.SLOTS
		for i in slots.size():
			(colL if i < 3 else colR).add_child(_slot_btn(slots[i], build))
		var mid = VBoxContainer.new()
		mid.add_child(dollView())
		var rot = HBoxContainer.new(); rot.alignment = BoxContainer.ALIGNMENT_CENTER
		rot.add_child(UI.btn("↺", func():
			dollAngle -= 0.8; UI.refreshPanel(build), true))
		rot.add_child(UI.btn("↻", func():
			dollAngle += 0.8; UI.refreshPanel(build), true))
		mid.add_child(rot)
		dollrow.add_child(colL); dollrow.add_child(mid); dollrow.add_child(colR)
		b.add_child(dollrow)
		var coin = UI.btn("🪙 %d monētas%s" % [int(save.coins), " · 🎁 dāvināt" if remotes.size() else ""], func():
			bagSel = "coins"; UI.refreshPanel(build), bagSel != "coins")
		b.add_child(coin)
		if me.carry != null and me.carry.get("trail") == null:
			b.add_child(UI.itemRow(Icons.tex("decor:" + str(me.carry.k)), "Nes rokās: %s" % Game.D.DECOR[me.carry.k].name, "Novieto savā sētā vai ieliec somā", [{"label": "🎒 Ielikt somā", "onclick": func():
				stowCarry(); UI.refreshPanel(build)}], true))
		var det = bagDetail(build)
		if det != null: b.add_child(det)
		var items = bagItems()
		b.add_child(UI.h3("Somā (%d)" % items.size()))
		var grid = UI.grid(6)
		for it in items:
			var cell = Button.new()
			cell.custom_minimum_size = Vector2(64, 64) * UI.S * 0.9
			var on: bool = bagSel == it.key
			cell.add_theme_stylebox_override("normal", UI._sb(Color("#fff3c4") if on else (Color("#dff0d8") if it.get("worn", false) else Color(1, 1, 1, 0.8)), 12 * UI.S, 2 * UI.S, false))
			cell.add_theme_stylebox_override("hover", UI._sb(Color("#fff3c4"), 12 * UI.S, 2 * UI.S, false))
			cell.add_theme_stylebox_override("pressed", UI._sb(Color("#ffe58a"), 12 * UI.S, 2 * UI.S, false))
			cell.icon = Icons.tex(it.key, 80 if it.kind == "fish" else 64)
			cell.expand_icon = true
			cell.tooltip_text = it.name
			var badge = ""
			if it.n > 1: badge = str(it.n)
			if it.get("worn", false): badge = "✔"
			if it.kind == "seed" and currentSeed() == it.crop: badge += "🌱"
			if it.kind == "sap" and currentSeed() == "sap:" + str(it.tree): badge += "🌳"
			if badge != "":
				var bl = Label.new(); bl.text = badge; bl.add_theme_font_size_override("font_size", int(12 * UI.S))
				bl.add_theme_color_override("font_color", Color.WHITE); bl.add_theme_constant_override("outline_size", int(5 * UI.S))
				bl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
				bl.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT); bl.grow_horizontal = Control.GROW_DIRECTION_BEGIN; bl.grow_vertical = Control.GROW_DIRECTION_BEGIN
				cell.add_child(bl)
			var key: String = it.key
			cell.pressed.connect(func():
				bagSel = key; giftN = 1; UI.refreshPanel(build))
			grid.add_child(cell)
		if items.is_empty(): b.add_child(UI.p("Soma ir tukša."))
		else: b.add_child(grid)
		b.add_child(UI.h3("🏆 Mani sasniegumi"))
		var st: Dictionary = save.stats
		b.add_child(UI.itemRow("⭐", "Zelta zvaigznes: %d/15" % save.stars.size(), "Visas redzamas kartē" if save.get("revealed", false) else "Uzkāp 🗼 skatu tornī — no turienes redz visas!"))
		var pls = ""
		for id in save.places: pls += Game.D.PLACES[id].icon + " "
		b.add_child(UI.itemRow("🗺️", "Īpašās vietas: %d/%d" % [save.places.size(), world.d.places.size()], pls))
		b.add_child(UI.itemRow("📜", "Kartes gabali: %d/%d" % [save.pieces.size(), Game.D.MAP_PIECES.size()], "Dārgums atrasts! 🏰" if save.get("treasure", false) else "Ar visiem gabaliem atver lādi 🏰 Pilsdrupās"))
		var fb: Dictionary = save.get("fishBest", {})
		var rec = []
		for k in fb: rec.append("%s %s kg" % [Game.D.FISH[k].name, str(fb[k])])
		b.add_child(UI.itemRow("🎣", ("Noķertas zivis: %d" % int(st.get("fish", 0))) if save.get("rod", false) else "Makšķere — pie Ūdra Ojāra", ("Rekordi: " + ", ".join(rec)) if rec.size() else ""))
		b.add_child(UI.itemRow("🫐", "Salasītas ogas: %d" % int(st.get("berries", 0))))
		b.add_child(UI.itemRow("🐾", ("Mājdzīvnieks: %s" % Game.D.PETS[save.pet].name) if save.get("pet") != null else "Mājdzīvnieka vēl nav", "Suns Sprīdis ciematā"))
		b.add_child(UI.itemRow("🏆", "Nedēļas mērķi sasniegti: %d" % int(save.get("trophies", 0))))
		b.add_child(UI.itemRow("🍄", "Salasītas sēnes: %d" % int(st.get("mushrooms", 0))))
		b.add_child(UI.itemRow("🥕", "Novākti dārzeņi: %d · augļi: %d" % [int(st.get("harvested", 0)), int(st.get("fruits", 0))]))
		b.add_child(UI.itemRow("🏎️", "Sacīkstes: %d · uzvaras: %d" % [int(st.get("races", 0)), int(st.get("wins", 0))], ("Labākais aplis: %s" % UI.fmt_time(float(save.bestLap))) if save.get("bestLap") != null else ""))
		b.add_child(UI.itemRow("⏱️", "Spēlēts: %d min" % roundi(float(save.get("playTime", 0)) / 60.0)))
	bagBuild = build
	UI.showPanel("🎒 Mana soma", build)

func bagDetail(build: Callable):
	var sel = bagSel
	if sel == null: return UI.p("👆 Pieskaries lietai, lai to izmantotu, uzvilktu vai uzdāvinātu draugam.", 13.0, Color(0.35, 0.35, 0.35))
	var box = VBoxContainer.new(); box.add_theme_constant_override("separation", int(6 * UI.S))
	var head = func(key: String, title: String, sub: String) -> void:
		var h = HBoxContainer.new(); h.add_theme_constant_override("separation", int(10 * UI.S))
		var tr = TextureRect.new(); tr.texture = Icons.tex(key, 110 if key.begins_with("fish:") else 80)
		tr.custom_minimum_size = Vector2(90 if key.begins_with("fish:") else 64, 64) * UI.S * 0.9
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		h.add_child(tr)
		var t = VBoxContainer.new(); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var tl = UI.p(title, 16.0); tl.add_theme_color_override("font_color", Color("#2b2b2b")); t.add_child(tl)
		if sub != "": t.add_child(UI.p(sub, 12.5, Color(0.3, 0.3, 0.3)))
		h.add_child(t)
		box.add_child(h)
	var btns = HFlowContainer.new()
	var btn = func(label: String, fn: Callable, alt := false) -> void:
		btns.add_child(UI.btn(label, func():
			fn.call(); UI.refreshPanel(build), alt))
	if str(sel).begins_with("slot:"):
		var slot: String = str(sel).substr(5)
		var sl_name = ""
		for x in Game.D.SLOTS: if x.id == slot: sl_name = x.name
		box.add_child(UI.h3("%s: izvēlies, ko uzvilkt" % sl_name))
		var opts = []
		if slot == "hat":
			for k in save.ownedHats: opts.append(["hat:" + k, k, Game.D.HATS[k].name if Game.D.HATS.has(k) else k])
		else:
			for k in save.ownedClothes:
				if Game.D.CLOTHES.has(k) and Game.D.CLOTHES[k].slot == slot: opts.append(["cl:" + k, k, Game.D.CLOTHES[k].name])
		var cur = save.hat if slot == "hat" else save.wear.get(slot)
		var row = HFlowContainer.new()
		for o in opts:
			var c = Button.new(); c.icon = Icons.tex(o[0], 56); c.expand_icon = true; c.custom_minimum_size = Vector2(56, 56) * UI.S * 0.9
			c.add_theme_stylebox_override("normal", UI._sb(Color("#dff0d8") if cur == o[1] else Color(1, 1, 1, 0.8), 10 * UI.S, 2 * UI.S, false))
			var oid: String = o[1]
			c.pressed.connect(func():
				setWearItem(slot, null if cur == oid else oid); UI.refreshPanel(build))
			row.add_child(c)
		if opts.is_empty(): box.add_child(UI.p("Tev vēl nav — nopērc pie 🎩 Pūces Paulas tirgū!"))
		else: box.add_child(row)
		if cur != null: btn.call("🚫 Novilkt", func(): setWearItem(slot, null), true)
		box.add_child(btns)
		return box
	if sel == "coins":
		head.call("coin", "%d monētas" % int(save.coins), "Vari uzdāvināt monētas draugam.")
		var am = [5, 10, 25, 50, 100].filter(func(n): return n <= int(save.coins))
		giftRow(box, am, func(n): return {"coins": n}, build)
		return box
	var it = null
	for x in bagItems(): if x.key == sel: it = x
	if it == null:
		bagSel = null
		return null
	match str(it.kind):
		"seed":
			var c: Dictionary = Game.D.CROPS[it.crop]
			head.call(it.key, "%s ×%d" % [it.name, it.n], "Aug %s (aplaistīts — ātrāk) · raža ×%d · %d🪙 gab." % [fmtLeft(float(c.grow)), int(c.yield), int(c.sell)])
			if currentSeed() != it.crop:
				var cr: String = it.crop
				btn.call("🌱 Sēt šo", func():
					selectedSeed = cr; UI.toast("🌱 Sēsi: %s" % c.name))
			else: btns.add_child(UI.p("✔ Izvēlēta sēšanai", 13.0))
		"sap":
			var t: Dictionary = Game.D.TREES[it.tree]
			head.call(it.key, "%s ×%d" % [it.name, it.n], "Iestādi uz uzarta lauciņa savā dārzā. Izaug %s, tad ik pa %s — %s ×%d." % [fmtLeft(float(t.grow)), fmtLeft(float(t.every)), str(Game.D.FRUITS[t.fruit].name).to_lower(), int(t.yield)])
			if currentSeed() != "sap:" + str(it.tree):
				var tr: String = it.tree
				btn.call("🌳 Stādīt šo", func():
					selectedSeed = "sap:" + tr; UI.toast("🌳 Stādīsi: %s. Ej uz uzartu lauciņu!" % t.name))
			else: btns.add_child(UI.p("✔ Izvēlēts stādīšanai", 13.0))
		"decor":
			head.call(it.key, "%s%s" % [it.name, (" ×%d" % it.n) if it.n > 1 else ""], "Dārza rotājums. Izņem to savā sētā un novieto, kur patīk!")
			var dk: String = it.key
			var dd: String = it.decor
			btn.call("📍 Novietot sētā", func():
				if zone != FARM or plotOf(me.pos.x, me.pos.z) != mySlot:
					UI.toast("🏡 Vispirms aizej uz savu sētu"); return
				if me.carry != null or me.veh != null or me.ride != null:
					UI.toast("Rokas jau aizņemtas!"); return
				save.inv[dk] = int(save.inv[dk]) - 1
				UI.closePanel()
				startCarry(dd)
				UI.toast("🤲 Nes rokās. Pagriezies, kur likt, un spied „📍 Novietot”.", "", 4000))
		"goods":
			head.call(it.key, "%s ×%d" % [it.name, it.n], "Vērtība: %d🪙 gab. · kopā %d🪙 · pārdod 🧺 Āpsim Arnoldam tirgū" % [int(it.price), int(it.price) * int(it.n)])
		"fish":
			var fg: Dictionary = it.fish
			var lines = []
			for f in fg.list.slice(0, 6): lines.append("%d cm · %s kg · %d🪙" % [int(f.cm), str(f.kg), int(f.v)])
			if fg.list.size() > 6: lines.append("…")
			lines.append("Kopā %d🪙" % int(fg.sum))
			head.call(it.key, "%s ×%d" % [it.name, it.n], "\n".join(lines))
		"hat", "cloth":
			var slot: String = "hat" if it.kind == "hat" else str(Game.D.CLOTHES[it.id].slot)
			head.call(it.key, it.name, "✔ Uzvilkts" if it.worn else "Tev pieder")
			var iid: String = it.id
			var worn: bool = it.worn
			btn.call("🚫 Novilkt" if worn else "👕 Uzvilkt", func(): setWearItem(slot, null if worn else iid), worn)
		_:
			head.call(it.key, it.name, "Ej pie ezera un spied „🎣 Makšķerēt”.")
	box.add_child(btns)
	if it.kind != "tool" and not it.get("worn", false):
		if it.kind == "hat" or it.kind == "cloth":
			var iid: String = it.id
			var ih: bool = it.kind == "hat"
			giftRow(box, [1], func(_n): return {"hat": iid} if ih else {"cloth": iid}, build)
		elif it.kind == "fish":
			var fl: Array = it.fish.list
			var am = [1] if int(it.n) == 1 else [1, int(it.n)]
			giftRow(box, am, func(n):
				var out = []
				for f in fl.slice(0, n): out.append(f.duplicate())
				return {"fish": out}, build)
		else:
			var am = []
			for v in [1, 5, int(it.n)]:
				if v <= int(it.n) and not am.has(v): am.append(v)
			var ik: String = it.key
			giftRow(box, am, func(n): return {"k": ik, "n": n}, build)
	return box

func giftRow(box: Control, amounts: Array, mk: Callable, build: Callable) -> void:
	if remotes.is_empty():
		box.add_child(UI.p("🎁 Dāvināt var, kad istabā ir draugi.", 12.5, Color(0.35, 0.35, 0.35)))
		return
	if amounts.is_empty(): return
	if not amounts.has(giftN): giftN = amounts[0]
	var w = HFlowContainer.new()
	w.add_child(UI.p("🎁 Uzdāvināt: ", 14.0))
	if amounts.size() > 1:
		for n in amounts:
			var nn: int = n
			w.add_child(UI.btn("×%d" % n, func():
				giftN = nn; UI.refreshPanel(build), giftN != n))
	box.add_child(w)
	var pl = HFlowContainer.new()
	for r in remotes.values():
		var rid: int = r.id
		pl.add_child(UI.btn("🎁 %s" % r.prof.name, func():
			sendGift(rid, mk.call(giftN)); UI.refreshPanel(build)))
	box.add_child(pl)

func giftText(g: Dictionary) -> String:
	if g.has("coins"): return "%d🪙" % int(g.coins)
	if g.has("hat"): return Game.D.HATS[g.hat].name if Game.D.HATS.has(g.hat) else str(g.hat)
	if g.has("cloth"): return Game.D.CLOTHES[g.cloth].name if Game.D.CLOTHES.has(g.cloth) else str(g.cloth)
	if g.has("fish"): return "%s ×%d" % [Game.D.FISH[g.fish[0].k].name, g.fish.size()]
	var k: String = str(g.get("k", ""))
	var name = k
	for x in bagItems(): if x.key == k: name = x.name
	if name == k:
		if k.ends_with("_seed") and Game.D.CROPS.has(k.trim_suffix("_seed")): name = "%s sēkla" % Game.D.CROPS[k.trim_suffix("_seed")].name
		elif k.ends_with("_sap") and Game.D.TREES.has(k.trim_suffix("_sap")): name = "%s — stāds" % Game.D.TREES[k.trim_suffix("_sap")].name
		elif k.begins_with("d_") and Game.D.DECOR.has(k.substr(2)): name = Game.D.DECOR[k.substr(2)].name
		else:
			for x in sellables(): if x.k == k: name = x.name
	return "%s%s" % [name, (" ×%d" % int(g.n)) if int(g.get("n", 1)) > 1 else ""]

func sendGift(to: int, g: Dictionary) -> void:
	var s = save
	if g.has("coins"):
		if int(s.coins) < int(g.coins): return
		addCoins(-int(g.coins), true)
	elif g.has("hat"):
		if not s.ownedHats.has(g.hat) or s.hat == g.hat: return
		s.ownedHats.erase(g.hat)
	elif g.has("cloth"):
		if not s.ownedClothes.has(g.cloth) or s.wear.values().has(g.cloth): return
		s.ownedClothes.erase(g.cloth)
	elif g.has("fish"):
		for f in g.fish:
			for i in s.fishBag.size():
				var x: Dictionary = s.fishBag[i]
				if x.k == f.k and float(x.kg) == float(f.kg) and int(x.cm) == int(f.cm):
					s.fishBag.remove_at(i)
					break
	else:
		var n = mini(int(g.n), int(s.inv.get(g.k, 0)))
		if n <= 0: return
		g.n = n
		s.inv[g.k] = int(s.inv[g.k]) - n
	var r = remotes.get(to)
	net.toHost({"t": "gift", "to": to, "g": g})
	sfx("ui_gift", {"vol": 0.7})
	UI.toast("🎁 Uzdāvināji %s: %s" % [r.prof.name if r else "draugam", giftText(g)], "good")
	persist()

func onGift(m) -> void:
	var s = save
	var g = m.get("g")
	if not (g is Dictionary): return
	if g.has("coins"): addCoins(clampi(int(g.coins), 0, 100000), true)
	elif g.has("hat"):
		if Game.D.HATS.has(g.hat) and not s.ownedHats.has(g.hat): s.ownedHats.append(g.hat)
	elif g.has("cloth"):
		if Game.D.CLOTHES.has(g.cloth) and not s.ownedClothes.has(g.cloth): s.ownedClothes.append(g.cloth)
	elif g.get("fish") is Array:
		for f in g.fish.slice(0, 200):
			if Game.D.FISH.has(f.k) and not Game.D.FISH[f.k].get("junk", false): s.fishBag.append({"k": f.k, "cm": int(f.cm), "kg": float(f.kg), "v": maxi(0, int(f.v))})
	elif g.get("k") is String and RegEx.create_from_string("^[a-z_]+$").search(g.k) != null:
		addItem(g.k, clampi(int(g.get("n", 0)), 0, 999))
	if m.get("back", false): UI.toast("🎁 Dāvanu nevarēja nodot — %s atpakaļ tavā somā" % giftText(g))
	else:
		sfx("ui_gift", {"vol": 0.7}); sfx("j_quest", {"vol": 0.6, "delay": 0.2})
		var key: String = "coin" if g.has("coins") else ("hat:" + str(g.hat) if g.has("hat") else ("cl:" + str(g.cloth) if g.has("cloth") else ("fish:" + str(g.fish[0].k) if g.has("fish") else str(g.k))))
		showPrize("🎁 Dāvana no %s!" % m.get("name", "drauga"), key, giftText(g), "Tā ir tavā somā 🎒")
	persist()
	if UI.panelOpen() and bagBuild != null and UI.panel_title.text == "🎒 Mana soma": UI.refreshPanel(bagBuild)

# ======================= Uzdevumi, istaba, izvēlne =======================
func openQuests() -> void:
	UI.showPanel("📜 Uzdevumi", func(b: Control) -> void:
		var left = 7 - ((floori(Game.now_ms() / 86400000.0) + 3) % 7)
		b.add_child(UI.p("🤝 Šīs nedēļas kopīgais mērķis: %s (%d/%d). Skaitās visu draugu darbi, un progress saglabājas! Balva — %d🪙 katram. Jauns mērķis pēc %d d." % [teamText(), mini(int(team.c), int(team.target)), int(team.target), int(Game.D.WEEKLY_REWARD), left]))
		var sorted: Array = Game.D.QUESTS.duplicate()
		sorted.sort_custom(func(a, c): return int(save.quests.get(a.id, false)) < int(save.quests.get(c.id, false)))
		for q in sorted:
			var done: bool = save.quests.get(q.id, false)
			var have = mini(int(q.need), int(save.stats.get(q.stat, 0)))
			var row = UI.itemRow("✅" if done else "📌", q.text, "Izpildīts!" if done else "%d/%d · balva %d🪙" % [have, int(q.need), int(q.reward)])
			if not done:
				var nm: VBoxContainer = row.get_child(0).get_child(1)
				nm.add_child(UI.bar(float(have) / float(q.need)))
			else: row.modulate = Color(1, 1, 1, 0.65)
			b.add_child(row))

func animalName(a: String) -> String:
	for x in Game.D.ANIMALS: if x.id == a: return x.name
	return a

func openRoom() -> void:
	UI.showPanel("👥 Istaba", func(b: Control) -> void:
		var gi = gameInfo
		b.add_child(UI.h3("🎮 Spēle: %s%s" % [gi.name, (" · #" + str(gi.id)) if str(gi.get("id", "")) != "" else ""]))
		if net.offline:
			b.add_child(UI.p("Tu spēlē viens. Lai spēlētu ar draugiem, izej uz sākumu un izveido istabu — draugiem jābūt tajā pašā Wi-Fi."))
		else:
			b.add_child(UI.h3("Istabas kods: %s" % str(roomCode)))
			if net.is_host:
				b.add_child(UI.p("Tu esi saimnieks 🏠. Draugi tajā pašā Wi-Fi var pievienoties ar šo kodu. Ja kods netiek atrasts, viņi var ierakstīt tavu IP adresi: %s. Ja tu aizvērsi spēli, istaba beigsies." % ", ".join(localIps())))
			else: b.add_child(UI.p("Tu esi pievienojies drauga istabai."))
			b.add_child(UI.p("💾 Katra spēlētāja progress (monētas, dārzs, soma, drēbes) glabājas viņa paša telefonā — katrai spēlei atsevišķi. Saimnieks, veidojot istabu, izvēlas spēli (vai „🆕 Jauna spēle visiem”), un katrs draugs ielādē savu progresu tieši šai spēlei. Saimnieka telefonā glabājas arī tas, kur stāv kopīgās mašīnas.", 13.0, Color(0.35, 0.35, 0.35)))
			b.add_child(UI.btn("📋 Kopēt istabas kodu", func():
				DisplayServer.clipboard_set(str(roomCode)); UI.toast("Kods nokopēts! 📋")))
		b.add_child(UI.h3("Spēlētāji"))
		var zn = func(z) -> String:
			var Z: Dictionary = Game.C.zones.ZONES[str(z) if z != null else "c"]
			return " · %s %s" % [Z.icon, Z.name]
		b.add_child(UI.itemRow("⭐", "%s (tu)" % save.name, animalName(save.animal) + (" · saimnieks" if net.is_host else "") + zn.call(zone)))
		for r in remotes.values(): b.add_child(UI.itemRow("🙂", str(r.prof.name), animalName(r.prof.animal) + (" · saimnieks" if r.id == 0 else "") + zn.call(r.zone)))
		b.add_child(UI.p("🚶 Pie draugiem un uz savu sētu nokļūsti kājām, ar velosipēdu, mašīnu vai autobusu — kartē redzams, kur kurš ir.", 12.0, Color(0.4, 0.4, 0.4))))

static func localIps() -> Array:
	var out = []
	for ip in IP.get_local_addresses():
		if ip.begins_with("192.168.") or ip.begins_with("10.") or (ip.begins_with("172.") and not ip.begins_with("172.17.")): out.append(ip)
	return out if out.size() else ["?"]

func _tile(grid: Control, ic: String, name: String, sub: String, col: Color, fn: Callable) -> void:
	var b = Button.new()
	b.custom_minimum_size = Vector2(150, 96) * UI.S * 0.85
	b.add_theme_stylebox_override("normal", UI._sb(col, 16 * UI.S, 6 * UI.S))
	b.add_theme_stylebox_override("hover", UI._sb(col.lightened(0.08), 16 * UI.S, 6 * UI.S))
	b.add_theme_stylebox_override("pressed", UI._sb(col.darkened(0.15), 16 * UI.S, 6 * UI.S))
	b.text = "%s\n%s\n%s" % [ic, name, sub]
	b.add_theme_font_size_override("font_size", int(14 * UI.S))
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(func():
		sfx("ui_select", {"vol": 0.35}); fn.call())
	grid.add_child(b)

func openMenu() -> void:
	UI.showPanel("☰ Izvēlne", func(b: Control) -> void:
		var gi = gameInfo
		b.add_child(UI.p("%s · 🎮 %s%s · 🪙 %d" % [save.name, gi.get("name", "Pirmā spēle"), (" #" + str(gi.id)) if str(gi.get("id", "")) != "" else "", int(save.coins)], 15.0))
		var grid = UI.grid(3)
		_tile(grid, "📖", "Pamācība", "Kā spēlēt", Color("#3a7bd5"), func(): openManual())
		_tile(grid, "⚙️", "Iestatījumi", "Grafika, skaņa", Color("#6b7280"), func(): openSettings())
		_tile(grid, "🎒", "Soma", "Lietas un drēbes", Color("#e08a2a"), func(): openBag())
		_tile(grid, "📜", "Uzdevumi", "Balvas", Color("#d4a017"), func(): openQuests())
		_tile(grid, "🌱", "Mans dārzs", "%d. līmenis" % gardenLvl(), Color("#2f9e44"), func(): openGardenInfo())
		_tile(grid, "👥", "Istaba", "Viens" if net.offline else "Kods %s" % str(roomCode), Color("#7b4fd0"), func(): openRoom())
		_tile(grid, "🗺️", "Karte", "Visas zemes", Color("#139a9a"), func():
			UI.closePanel(); openBigMap())
		_tile(grid, "🎲", "Spēles", "Ar draugiem", Color("#d0508a"), func(): openGames())
		_tile(grid, "🐞", "Kļūdas vieta", "Saglabāt / turpināt", Color("#6b7280"), func(): openBugSpot())
		b.add_child(grid)
		b.add_child(UI.row([UI.btn("💾 Saglabāt", func():
			persist(); UI.toast("💾 Saglabāts!", "good")), UI.btn("🚪 Saglabāt un iziet", func(): quit(), true)]))
		b.add_child(UI.p("Versija %s · Android" % Game.VERSION, 12.0, Color(0.45, 0.45, 0.45))))

func openSettings() -> void:
	var build: Callable
	build = func(b: Control) -> void:
		var opt = func(ic: String, name: String, sub: String, val: Callable, fn: Callable) -> void:
			var r = UI.itemRow(ic, name, sub, [{"label": str(val.call()), "alt": true, "onclick": func():
				fn.call(); UI.refreshPanel(build)}])
			b.add_child(r)
		var slider = func(ic: String, name: String, sub: String, getv: Callable, setv: Callable, mx: float, test: Callable) -> void:
			var r = UI.itemRow(ic, name, sub)
			var nm: VBoxContainer = r.get_child(0).get_child(1)
			var hs = HSlider.new(); hs.min_value = 0; hs.max_value = mx * 100.0; hs.step = 5; hs.value = float(getv.call()) * 100.0
			hs.custom_minimum_size = Vector2(240, 30) * UI.S * 0.8
			var vl = UI.p("%d%%" % int(hs.value), 13.0)
			hs.value_changed.connect(func(v):
				setv.call(v / 100.0); vl.text = "%d%%" % int(v))
			hs.drag_ended.connect(func(_c): test.call())
			nm.add_child(hs); r.get_child(0).add_child(vl)
			b.add_child(r)
		b.add_child(UI.h3("🎨 Grafika"))
		opt.call("🎨", "Grafikas līmenis", "Auto pats izvēlas pēc tā, cik ātri telefons zīmē — vai izvēlies pats", func(): return qualityLabel(), func(): setQualityMode(nextQualityMode()))
		qualitySettings(b, build)
		b.add_child(UI.h3("🔊 Skaņa"))
		slider.call("🔊", "Kopējais skaļums", "Visas skaņas kopā", func(): return getVolume(), func(v): setVolume(v), 1.0, func(): sfx("coin"))
		slider.call("🎵", "Efekti", "Skaņas, soļi, vide un dzinēji", func(): return getFxVolume(), func(v): setFxVolume(v), 1.0, func(): sfx("coin"))
		slider.call("🗣️", "Balsu skaļums", "Dzīvnieku un stāstnieka runa (virs 100 % — pastiprināta)", func(): return getVoiceVolume(), func(v): setVoiceVolume(v), 2.0, func(): voice("t_clear"))
		opt.call("🗣️", "Balsis", "Dzīvnieki un stāstnieks runā latviski", func(): return "Ieslēgtas" if voiceOn() else "Izslēgtas", func():
			setVoiceOn(not voiceOn())
			if voiceOn(): voice("t_clear"))
		b.add_child(UI.h3("📊 Cits"))
		opt.call("📊", "Ātruma mērītājs", "Kadri sekundē un zīmēšanas izsaukumi", func(): return "Ieslēgts" if statsOn else "Izslēgts", func(): toggleStats())
		b.add_child(UI.row([UI.btn("⬅ Atpakaļ", func(): openMenu(), true), UI.btn("💾 Saglabāt", func():
			persist(); UI.toast("💾 Saglabāts!", "good")), UI.btn("🚪 Iziet", func(): quit(), true)]))
	UI.showPanel("⚙️ Iestatījumi", build)

func openManual() -> void:
	var S = [
		["🕹️", "Vadība", ["Kreisā puse — velc pirkstu, lai staigātu.", "Labā puse — velc, lai grozītu kameru (2 pirksti — tuvināt).", "⤒ — lēkt. Dzeltenā poga parādās, kad vari kaut ko darīt.", "🚙 Braucot: kreisajā pusē ⛽ gāze un 🛑 bremze (atpakaļgaita), labajā ◀ ▶ stūre."]],
		["🏡", "Sēta un dārzs", ["Centrā ir sēta — katram draugam savs lauks.", "Nocērt kokus 🪓, novāc akmeņus ⛏️, uzar, sēj, aplaisti 💧 un novāc ražu 🧺.", "Augi aug arī tad, kad spēle aizvērta! Blakus vienādie augi saaug vienā laukā.", "🌱 Par darbiem dārzā krājas ⭐ — jauns līmenis atver jaunas sēklas un lielāku dārzu.", "🌳 Augļu koki dod augļus atkal un atkal. 🤲 Rotājumus var pārnest citur."]],
		["🌲", "Mežs un tirgus", ["Austrumos — Mežvidu ciems ar tirgu: pārdod ražu, pērc sēklas, cepures, drēbes, mājdzīvniekus un rotājumus.", "🍄 Lasi sēnes (bet ne sarkanās mušmires!), 🫐 mellenes, avenes, purvā — dzērvenes.", "🎣 Nopērc makšķeri un makšķerē ezeros — kad pludiņš raustās, spied „VILKT!”.", "⛺ Pie ugunskura izcep sēnes. 🪙 Akā iemet 5🪙 — dažreiz izkrīt kaut kas jauks!"]],
		["⭐", "Noslēpumi", ["Kalnu virsotnēs paslēptas 15 zelta zvaigznes — no 🗼 skatu torņa tās redz kartē.", "🗺️ Atrodi 3 kartes gabalus (ugunskurs, tornis, purvs) un atver dārguma lādi 🏰 Pilsdrupās!"]],
		["🚌", "Transports", ["🚌 Autobuss brauc pa apli: ziema → sēta → trase → tirgus. Iekāp pieturā (2🪙).", "🚙🚲 Mašīnas un velosipēdi — ar tiem var braukt ikviens; kur atstāsi, tur paliks.", "🏎️ Rietumos — sacīkšu trase ar tuneļiem un kartiem.", "🐾 Tavs mājdzīvnieks vienmēr brauc līdzi!"]],
		["❄️", "Ziema", ["Ziemeļos — slēpošanas kalns ar pacēlāju 🚡, sniega pikas un ziemas laukums."]],
		["🧭", "Piedzīvojumu mežs", ["Dienvidos — gara taka ar 7 meža draugiem, kuriem vajag palīdzību. Pēc katra uzdevuma zaļa bulta rāda ceļu tālāk."]],
		["🤝", "Ar draugiem", ["👥 Draugi tajā pašā Wi-Fi pievienojas ar istabas kodu.", "👥 Draugu sētās var aiziet ciemos un aplaistīt viņu laukus.", "🎁 Somā lietas un monētas var uzdāvināt.", "🎲 Spēlē ķeramo un paslēpes. Katru nedēļu — jauns kopīgais mērķis.", "🧭 Pār robežu var pāriet jebkur. Pieskaries minikartei — liela karte ar draugiem un transportu."]],
	]
	UI.showPanel("📖 Pamācība", func(b: Control) -> void:
		for sec in S:
			b.add_child(UI.h3("%s %s" % [sec[0], sec[1]]))
			for t in sec[2]: b.add_child(UI.p("• " + str(t), 14.0))
		b.add_child(UI.row([UI.btn("⬅ Atpakaļ", func(): openMenu(), true)])))

# tukšas (vēlākie slāņi)
func rodRow(_b, _build) -> void: pass
func gardenLvl() -> int: return 1
func cropOpen(_k) -> bool: return true
func fmtLeft(s: float) -> String:
	var sec = int(maxf(0.0, s))
	if sec < 60: return "%d s" % sec
	var m = sec / 60
	if m < 60: return "%d min" % m
	var h = m / 60
	var mm = m % 60
	return "%d h %d min" % [h, mm] if mm else "%d h" % h
func shopPets() -> void: pass
func shopDecor() -> void: pass
func plotOf(_x, _z) -> int: return -1
func startCarry(_k) -> void: pass
func showPrize(_title, _key, _name, _sub = "", _svg = null) -> void: pass
func teamText() -> String: return ""
func openGardenInfo() -> void: pass
func openGames() -> void: pass
func openBugSpot(_refresh := false) -> void: pass
func leaveBus(_force = false) -> void: pass
func qualityLabel() -> String: return "Auto"
func setQualityMode(_m) -> void: pass
func nextQualityMode() -> String: return "auto"
func qualitySettings(_b, _build) -> void: pass
func getVolume() -> float: return 1.0
func setVolume(_v) -> void: pass
func getFxVolume() -> float: return 1.0
func setFxVolume(_v) -> void: pass
func getVoiceVolume() -> float: return 1.3
func setVoiceVolume(_v) -> void: pass
func voiceOn() -> bool: return true
func setVoiceOn(_v) -> void: pass
func toggleStats() -> void: pass
func vehMarkers() -> Array: return []
func trailIcons(_tr) -> Array: return []
func onAvatarRebuilt() -> void: pass
