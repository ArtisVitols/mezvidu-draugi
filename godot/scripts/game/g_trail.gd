class_name GTrail
extends GWinter
## 🧭 Piedzīvojumu takas uzdevumi (web trail.js Trail mixin): saimnieka stāvoklis, NPC sarunas, nešana, zivis, šķēršļi, laiva.

const KL := 0
const KB := 4
const KK := 3
const KE := 2
const KS := 6
const STEP_KEYS := ["run", "step", "c", "acc", "bridge", "boat", "ob"]
const OB_GAP := 250
const CARRY_MS := 180000
const FAIL_MS := 4000
const ITEM_SCALE := {"malka": 1.0, "rieksti": 1.8, "abols": 1.4, "delis": 1.0, "gliemezis": 1.9, "zivs": 1.5}

var trailPanel = null
var trailPend = 0
var obCd = 0
var fishLast = {}
var obLast = {}
var trailTickT = 0
var trailOutT = 0
var _items_pack: Node3D = null
var _tlay = null

func TASKS() -> Array: return Game.C.trail.TASKS
func OBT() -> Dictionary: return Game.C.trail.OB_TYPES
func defState() -> Dictionary: return {"run": 0, "step": 0, "c": 0, "acc": false, "bridge": false, "boat": false, "taken": {}, "ob": []}
## takas izkārtojums (pieturas, šķēršļi) bez zemes ielādes
func tlay() -> Dictionary:
	if _tlay == null:
		if terr is TrailLand: _tlay = terr.lay
		else:
			var f = FileAccess.open("res://web/data/trail.json", FileAccess.READ)
			_tlay = JSON.parse_string(f.get_as_text()).lay
	return _tlay
func inQuestRange(k: int, x: float, z: float) -> bool:
	var st: Array = tlay().stops
	if k >= st.size(): return false
	var s: Dictionary = st[k]
	return Vector2(x - float(s.clear.x), z - float(s.clear.z)).length() < float(s.range)

func trailItem(k) -> Node3D:
	if _items_pack == null: _items_pack = Avatar.asset("trailitems").build()
	for c in _items_pack.get_children():
		if str(c.get_meta("n", "")) == "item:" + str(k):
			var o: Node3D = c.duplicate()
			o.scale = Vector3.ONE * float(ITEM_SCALE.get(k, 1.0)) * 0.9
			return o
	return Node3D.new()

func trailIcons(tr) -> Array:
	var L = tlay()
	var out = []
	for k in L.stops.size(): out.append([TASKS()[k].icon, L.stops[k].x, L.stops[k].z, k])
	for o in L.obst:
		var n = 0
		if tr != null and tr.get("ob") is Array and tr.ob.size() > int(o.o): n = int(tr.ob[int(o.o)])
		if tr == null or n < int(OBT()[o.type].hits): out.append([OBT()[o.type].icon, o.x, o.z, "o"])
	return out

func initTrail() -> void: trail = defState()

func hostInitTrail() -> void:
	var s: Dictionary = save.get("trail", {}) if save.get("trail") is Dictionary else {}
	var tr = defState()
	for k in STEP_KEYS: if s.get(k) != null: tr[k] = s[k]
	var ob = []
	if tr.ob is Array: for n in tr.ob: ob.append(int(n) if n != null else 0)
	tr.ob = ob
	tr.step = clampi(int(tr.step), 0, TASKS().size()); tr.run = int(tr.run); tr.c = int(tr.c)
	tr.bridge = tr.step > KB
	tr.boat = tr.step > KS
	hs.trail = tr
	var bv = hs.vehs.get(Game.C.trail.BOAT_ID) if hs.get("vehs") != null else null
	if bv != null and not tr.boat and not (tr.step == KS and tr.acc): hostBoatPark(bv)

func trailZone() -> TrailLand: return terr if (zone == "s" and terr is TrailLand) else null

func enterTrail() -> void:
	_tlay = null
	var Z = trailZone()
	if Z: Z.state = trail; Z.applyState(trail)
	trailFixPos()
	updateTeamBar()

func leaveTrail() -> void: updateTeamBar()

func trailFixPos() -> void:
	var Z = trailZone()
	if Z == null or trail.bridge or not Z.southOfStream(me.pos.x, me.pos.z): return
	if me.ride != null: leaveRide()
	if me.veh != null and me.veh.kind == "boat": exitVehicle()
	var B: Dictionary = Z.C.BRIDGE
	me.pos = Vector3(float(B.x) - 3.0, 0, Z.BZ() - float(B.hl) - 4.0)
	me.pos.y = Z.ground_at(me.pos.x, me.pos.z)
	Z.lastSide = -1; Z.reset_lp()

# ---------- klients ----------
func _taken(tr: Dictionary, i):
	var t = tr.get("taken")
	if not (t is Dictionary): return null
	return t.get(str(int(i)))

func onTrail(tr, ev) -> void:
	if tr == null: return
	trail = tr.duplicate(true)
	if not (trail.get("taken") is Dictionary): trail.taken = {}
	var Z = trailZone()
	if Z:
		Z.state = trail; Z.applyState(trail); trailFixPos()
	var c = me.carry
	var evk = ev.k if ev is Dictionary else null
	if c != null and c.get("fish", false):
		if int(c.step) != int(trail.step) or not trail.acc:
			trailDropCarry(false)
			if evk != "fail": UI.toast("🐟 Zivs izlēca atpakaļ dīķī")
	elif c != null and c.get("trail") != null:
		var tk = _taken(trail, c.trail)
		if int(c.step) != int(trail.step) or tk == null or int(tk[0]) != int(myId) or float(tk[1]) < 0:
			trailDropCarry(false)
			if evk != "drop" and evk != "fail": UI.toast("🫳 Nesamais izkrita un atgriezās savā vietā")
	if fishing and fishing.get("trail", false) and (int(trail.step) != KK or not trail.acc): stopFishing()
	if ev is Dictionary: trailEvent(ev)
	updateTeamBar()
	if UI.panelOpen() and trailPanel != null: openTrailNpc(trailPanel, true)

func trailEvent(ev: Dictionary) -> void:
	var here = zone == "s"
	var step = int(ev.get("step", 0))
	var T = TASKS()[step] if step < TASKS().size() else null
	var mine: bool = ev.get("by") != null and int(ev.by) == int(myId)
	var k = ev.get("k")
	if k == "take" and mine and T != null:
		trailPend = 0
		me.carry = {"k": "t:" + T.item, "trail": int(ev.i), "step": step}
		avatar.set_carry(trailItem(T.item))
		sfx("leather", {"vol": 0.7})
		sendProfile()
		timers.action = 0.0
		UI.toast("🤲 Nes: %s %s. Aiznes pie %s!" % [T.itemIcon, T.itemName, T.icon])
	if k == "pick" and mine and T != null:
		trailPend = 0
		sfx("pick")
		spawnFloat(T.itemIcon, me.pos)
	if k == "drop" and mine:
		sfx("j_star", {"vol": 0.6}); spawnFloat("✨", me.pos)
	if k == "acc" and here and T != null:
		sfx("j_quest", {"vol": 0.6})
		var msg: String
		if T.kind == "fish": msg = "🎣 %s iedeva katram makšķeri! Noķeriet kopā %d zivis un nesiet uz grozu." % [T.name, int(T.need)]
		elif T.kind == "boat": msg = "🚣 Laiva šūpojas jūrā! Aizpeldiet līdz tai, iekāpiet un brauciet uz %s piestātni." % T.icon
		else: msg = "%s Jauns uzdevums: %s! %s" % [T.icon, T.title, T.help]
		UI.toast(msg, "good", 5500)
	if k == "fail" and T != null:
		sfx("bad"); voice("t_fail", {"delay": 0.4})
		UI.toast("❌ Uzdevums neizdevās: %s — visi aizgāja prom no %s. %s %s gaida — sāciet vēlreiz!" % [T.title, T.icon, T.icon, T.name], "bad", 6000)
	if (k == "hit" or k == "clear") and here:
		var Z = trailZone()
		var obst: Array = tlay().obst
		var oi = int(ev.get("o", -1))
		if Z and oi >= 0 and oi < obst.size():
			var O: Dictionary = obst[oi]
			var OT: Dictionary = OBT()[O.type]
			Z.obHit(oi)
			if not mine: sfx(OT.snd, {"at": Vector2(O.x, O.z), "vol": 0.8})
			if k == "clear":
				sfx(OT.end, {"at": Vector2(O.x, O.z), "vol": 0.9})
				spawnFloat("✨", Vector3(O.x, float(O.h) + 1.0, O.z))
				if Vector2(float(O.x) - me.pos.x, float(O.z) - me.pos.z).length() < 80:
					UI.toast("%s %s novākts — ceļš brīvs! 💪" % [OT.icon, OT.name], "good", 3500); voice("t_clear", {"delay": 0.6})
	if k == "restart" and here:
		voice("t_restart")
		UI.toast("🔁 Piedzīvojums sākas no jauna — ej pie 🐻 Lāča Bruņa!", "good", 4500)
	if ev.get("done") != null and here:
		var dn = int(ev.done)
		var D: Dictionary = TASKS()[dn]
		addCoins(int(D.coins), true)
		gardenXp(int(D.xp), me.pos)
		sfx("j_quest")
		UI.toast("%s %s — paveikts kopā! +%d🪙" % [D.icon, D.title, int(D.coins)], "good", 5000)
		voice("t%d_thanks" % dn, {"delay": 0.9})
		if dn == KS: UI.toast("🚣 Laiva tagad ir brīva — braukt ar to pa jūru var visi!", "good", 5000)
		if dn == TASKS().size() - 1: trailFinish()
		persist()

func trailFinish() -> void:
	var GH: String = Game.C.trail.GIFT_HAT
	var FC = int(Game.C.trail.FINAL_COINS)
	var first: bool = not save.ownedHats.has(GH)
	addCoins(FC, true)
	save.trailDone = int(save.get("trailDone", 0)) + 1
	if first:
		save.ownedHats.append(GH); setHat(GH)
	sfx("j_prize", {"vol": 0.8, "delay": 0.3})
	var hn: String = Game.D.HATS[GH].name if Game.D.HATS.has(GH) else GH
	showPrize("🎉 Taka pabeigta!", "hat:" + GH, ("%s — tikai tiem, kas izgājuši visu Piedzīvojumu taku! +%d🪙" % [hn, FC]) if first else ("Atkal visa taka kopā! +%d🪙" % FC), "Cepuri var mainīt somā 🎒")

func trailSend(m: Dictionary) -> void: net.toHost(m)

func trailActions(consider, d2) -> void:
	var Z = trailZone()
	if Z == null or not Z.built: return
	var tr: Dictionary = trail
	var step = int(tr.step)
	var T = TASKS()[step] if step < TASKS().size() else null
	for n in Z.npcs:
		var nk: int = n.k
		consider.call(d2.call(float(n.s.x), float(n.s.z)) - 0.4, 3.2, "💬 %s" % TASKS()[nk].name, func(): openTrailNpc(nk))
	var p: Vector3 = me.pos
	for o in Z.lay.obst:
		var oi = int(o.o)
		if Z.obClear.size() > oi and Z.obClear[oi]: continue
		var dx: float = p.x - float(o.x)
		var dz: float = p.z - float(o.z)
		var along = absf(dx * float(o.tx) + dz * float(o.tz))
		var across = absf(dx * float(o.nx) + dz * float(o.nz))
		if across > 4.5 or along > 4: continue
		var OT: Dictionary = OBT()[o.type]
		var n = int(tr.ob[oi]) if (tr.get("ob") is Array and tr.ob.size() > oi) else 0
		var oo: Dictionary = o
		consider.call(maxf(0.0, along - float(Z.C.OB_HALF)), 2.4, "%s %s (%d/%d)" % [OT.tool, OT.verb, n, int(OT.hits)], func():
			var nw = Time.get_ticks_msec()
			if nw < obCd: return
			obCd = nw + 320
			me.petT = 0.4
			sfx(OT.snd, {"vol": 0.9})
			if randf() < 0.5: spawnFloat("🪵" if oo.type == "koks" else ("💥" if oo.type == "akmens" else "🍃"), Vector3(oo.x, float(oo.h) + 1.2, oo.z))
			trailSend({"t": "tHit", "o": oi}))
	if T == null or not tr.acc or trailPend > Time.get_ticks_msec(): return
	if T.kind == "fish":
		var pd = Z.lay.stops[step].get("pond")
		if pd != null and Vector2(p.x - float(pd.x), p.z - float(pd.z)).length() < float(pd.r) + 5 and me.onGround and me.state != "swim":
			var spot = fishSpot()
			if spot != null and Vector2(float(spot.x) - float(pd.x), float(spot.z) - float(pd.z)).length() < float(pd.r):
				consider.call(1.2, 1.7, "🎣 Makšķerēt", func(): startFishing(spot, true))
	for o in Z.itemObjs:
		if not o.obj.visible or absf(float(o.it.x) - p.x) > 3 or absf(float(o.it.z) - p.z) > 3: continue
		var oo: Dictionary = o
		consider.call(d2.call(float(o.it.x), float(o.it.z)), 2.0, ("%s Lasīt: %s" % [T.itemIcon, T.itemName]) if T.kind == "pick" else ("🤲 Pacelt: %s" % T.itemName), func():
			trailPend = Time.get_ticks_msec() + 2500
			oo.obj.visible = false
			me.petT = 0.5
			trailSend({"t": "tPick", "step": step, "i": int(oo.it.i)}))

func trailCarryAction():
	var c: Dictionary = me.carry
	var Z = trailZone()
	var cs = int(c.step)
	var T = TASKS()[cs] if cs < TASKS().size() else null
	var dp = Z.lay.stops[cs].get("drop") if (Z != null and cs < Z.lay.stops.size()) else null
	if dp != null and Vector2(float(dp.x) - me.pos.x, float(dp.z) - me.pos.z).length() < float(dp.r) + 1.2:
		var where = "šķūnītī" if cs == KL else ("grozā" if (cs == KE or cs == KK) else "pie tilta")
		if c.get("fish", false): return {"label": "📦 Ielikt grozā: %s %s" % [T.itemIcon, T.itemName], "fn": func():
			trailSend({"t": "tFish", "step": cs}); trailDropCarry(true)}
		var ci = c.trail
		return {"label": "📦 Nolikt %s: %s" % [where, T.itemName], "fn": func():
			trailSend({"t": "tDrop", "step": cs, "i": ci}); trailDropCarry(true)}
	if c.get("fish", false): return {"label": "🐟 Palaist zivi atpakaļ", "fn": func():
		trailDropCarry(false); UI.toast("🐟 Zivs aizpeldēja…")}
	return {"label": "🫳 Nomest: %s" % (T.itemName if T != null else ""), "fn": func(): trailDropCarry(false)}

func trailCatch(f) -> void:
	var tr: Dictionary = trail
	var step = int(tr.step)
	var T = TASKS()[step] if step < TASKS().size() else null
	stopFishing()
	if T == null or T.kind != "fish" or not tr.acc or zone != "s": return
	sfx("splash_b", {"vol": 0.8}); sfx("pick", {"delay": 0.15})
	spawnFloat("💦", Vector3(f.x, 0.0, f.z))
	me.carry = {"k": "t:" + T.item, "trail": -1, "step": step, "fish": true}
	avatar.set_carry(trailItem(T.item))
	me.petT = 0.4
	sendProfile()
	timers.action = 0.0
	UI.toast("🐟 Noķēri zivi! Aiznes to uz grozu pie %s %s." % [T.icon, T.name], "good")

func trailDropCarry(delivered) -> void:
	var c = me.carry
	if c == null or c.get("trail") == null: return
	var tk = _taken(trail, c.trail)
	if not delivered and tk != null and int(tk[0]) == int(myId): trailSend({"t": "tLost", "step": c.step, "i": c.trail})
	me.carry = null
	avatar.set_carry(null)
	sendProfile()
	timers.action = 0.0

func _say(b: Control, txt: String, vid, refresh: bool) -> void:
	if not refresh and vid != null: voice(vid)
	var pc = PanelContainer.new()
	var sb = StyleBoxFlat.new(); sb.bg_color = Color("#fff8e6"); sb.set_corner_radius_all(int(14 * UI.S)); sb.content_margin_left = 12 * UI.S; sb.content_margin_right = 12 * UI.S; sb.content_margin_top = 10 * UI.S; sb.content_margin_bottom = 10 * UI.S
	pc.add_theme_stylebox_override("panel", sb)
	pc.add_child(UI.p("„%s”" % txt, 15.0, Color("#3a2a12")))
	b.add_child(pc)

func openTrailNpc(k, refresh := false) -> void:
	var T: Dictionary = TASKS()[k]
	trailPanel = k
	var build = func(b: Control) -> void:
		var tr: Dictionary = trail
		var N = TASKS().size()
		var step = int(tr.step)
		var hd = UI.row([UI.p(T.icon, 40.0), UI.p("%s\n%d. pietura no %d" % [T.name, k + 1, N], 15.0)], 12.0)
		b.add_child(hd)
		if step >= N:
			_say(b, T.thanks if k == N - 1 else "Paldies vēlreiz par palīdzību! Visi meža draugi jums pateicīgi.", ("t%d_thanks" % k) if k == N - 1 else ("t%d_again" % k), refresh)
			b.add_child(UI.p("🎉 Visa taka pabeigta kopā! Piedzīvojumu var sākt no jauna — atkal nopelnīsiet 🪙."))
			b.add_child(UI.btn("🔁 Sākt piedzīvojumu no jauna", func(): trailSend({"t": "tRestart"}); UI.closePanel()))
		elif step < k:
			var P: Dictionary = TASKS()[step]
			_say(b, "Sveiks! Man arī būs vajadzīga palīdzība, bet vispirms palīdziet %s %s — tas ir atpakaļ pa taku." % [P.icon, P.name], "t%d_wait%d" % [k, step], refresh)
		elif step > k:
			_say(b, T.thanks, "t%d_thanks" % k, refresh)
		elif not tr.acc:
			_say(b, T.ask, "t%d_ask" % k, refresh)
			b.add_child(UI.p("Uzdevums visai komandai — palīdzēt var visi, kas ir šajā zemē. Balva katram: +%d🪙 un +%d⭐" % [int(T.coins), int(T.xp)], 13.0, Color(0.3, 0.3, 0.3)))
			b.add_child(UI.btn("🤝 Palīdzēsim!", func(): trailSend({"t": "tAcc", "step": k}); UI.closePanel()))
		else:
			_say(b, T.help, "t%d_help" % k, refresh)
			if T.kind == "boat":
				b.add_child(UI.p("🚣 Laiva jūrā — aizpeldi līdz tai (dzeltenā poga „Sēsties”), brauc ar ⛽ un stūrē ar ◀ ▶. Iebrauc starp bojām pie piestātnes!"))
				return
			b.add_child(UI.p("%s %s: %d/%d" % [T.itemIcon, T.title, int(tr.c), int(T.need)]))
			b.add_child(UI.bar(float(tr.c) / float(T.need)))
	if refresh: UI.refreshPanel(build)
	else: UI.showPanel("%s %s" % [T.icon, T.name], build, func(): trailPanel = null; stopVoice())

func trailBarText() -> String:
	var tr: Dictionary = trail
	var step = int(tr.step)
	if step >= TASKS().size(): return "🧭 Taka pabeigta! 🎉"
	var T: Dictionary = TASKS()[step]
	if not tr.acc: return "🧭 Ej pie: %s %s" % [T.icon, T.name]
	if T.kind == "boat": return "🧭 %s Peldi pie laivas un brauc uz piestātni!" % T.icon
	return "🧭 %s %s: %d/%d" % [T.icon, T.title, int(tr.c), int(T.need)]

# ---------- saimnieks ----------
func hostTrail(from, m) -> bool:
	if hs == null or hs.get("trail") == null: return false
	var tr: Dictionary = hs.trail
	var N = TASKS().size()
	var T = TASKS()[tr.step] if int(tr.step) < N else null
	var nw = Time.get_ticks_msec()
	var ev = null
	var t = m.get("t")
	match t:
		"tAcc":
			if T == null or tr.acc or int(m.get("step", -1)) != int(tr.step): return true
			tr.acc = true; tr.c = 0; tr.taken = {}
			ev = {"k": "acc", "step": tr.step, "by": from}
			if T.kind == "boat": hostBoatHome()
		"tPick":
			var i = int(m.get("i", -1))
			if T == null or not tr.acc or int(m.get("step", -1)) != int(tr.step) or i < 0 or i >= int(T.items): return true
			if tr.taken.has(str(i)):
				net.sendTo(from, {"t": "trail", "tr": tr}); return true
			if T.kind == "pick":
				tr.taken[str(i)] = [from, -1]; tr.c = int(tr.c) + 1
				ev = {"k": "pick", "step": tr.step, "i": i, "by": from}
				if int(tr.c) >= int(T.need): hostTrailNext(ev)
			else:
				tr.taken[str(i)] = [from, Game.now_ms() + CARRY_MS]
				ev = {"k": "take", "step": tr.step, "i": i, "by": from}
		"tDrop":
			var tk = tr.taken.get(str(int(m.get("i", -1))))
			if T == null or T.kind != "carry" or int(m.get("step", -1)) != int(tr.step) or tk == null or int(tk[0]) != int(from) or float(tk[1]) < 0: return true
			tk[1] = -1; tr.c = int(tr.c) + 1
			ev = {"k": "drop", "step": tr.step, "i": int(m.i), "by": from}
			if int(tr.c) >= int(T.need): hostTrailNext(ev)
		"tFish":
			if T == null or T.kind != "fish" or not tr.acc or int(m.get("step", -1)) != int(tr.step): return true
			if nw - int(fishLast.get(from, -100000)) < 1500: return true
			fishLast[from] = nw
			tr.c = int(tr.c) + 1
			ev = {"k": "drop", "step": tr.step, "i": -1, "by": from}
			if int(tr.c) >= int(T.need): hostTrailNext(ev)
		"tLost":
			var key = str(int(m.get("i", -1)))
			var tk = tr.taken.get(key)
			if int(m.get("step", -1)) != int(tr.step) or tk == null or int(tk[0]) != int(from) or float(tk[1]) < 0: return true
			tr.taken.erase(key)
		"tRestart":
			if int(tr.step) < N: return true
			tr.run = int(tr.run) + 1; tr.step = 0; tr.c = 0; tr.acc = false; tr.taken = {}; tr.ob = []
			tr.bridge = false; tr.boat = false
			hostBoatHome()
			ev = {"k": "restart", "step": 0, "by": from}
		"tHit":
			var o = int(m.get("o", -1))
			var obst: Array = tlay().obst
			if o < 0 or o >= obst.size(): return true
			var hits = int(OBT()[obst[o].type].hits)
			while tr.ob.size() <= o: tr.ob.append(0)
			var n = int(tr.ob[o])
			if n >= hits: return true
			if nw - int(obLast.get(from, -100000)) < OB_GAP: return true
			obLast[from] = nw
			tr.ob[o] = n + 1
			ev = {"k": "clear" if n + 1 >= hits else "hit", "o": o, "by": from, "step": tr.step}
		_: return false
	hostTrailSend(ev)
	return true

func hostTrailNext(ev: Dictionary) -> void:
	var tr: Dictionary = hs.trail
	ev.done = tr.step
	if int(tr.step) == KB: tr.bridge = true
	if int(tr.step) == KS: tr.boat = true
	tr.step = int(tr.step) + 1; tr.c = 0; tr.acc = false; tr.taken = {}

func hostTrailSend(ev) -> void:
	var tr: Dictionary = hs.trail
	var s = {}
	for k in STEP_KEYS: s[k] = (tr.ob as Array).duplicate() if k == "ob" else tr[k]
	s.v = 3
	save.trail = s
	net.broadcast({"t": "trail", "tr": tr.duplicate(true), "ev": ev})
	if ev is Dictionary and (ev.get("done") != null or ev.get("k") == "clear"): persist()

func hostTrailTick(nowm) -> void:
	if hs == null or hs.get("trail") == null: return
	var tr: Dictionary = hs.trail
	var nw = Game.now_ms()
	if nw - trailTickT < 1000: return
	trailTickT = nw
	var ch = false
	for i in tr.taken.keys():
		var tk = tr.taken[i]
		if float(tk[1]) > 0 and float(tk[1]) < nw:
			tr.taken.erase(i); ch = true
	if tr.acc and int(tr.step) < TASKS().size():
		var anyIn: bool = zone == "s" and inQuestRange(int(tr.step), me.pos.x, me.pos.z)
		for id in hs.positions:
			var p = hs.positions[id]
			if anyIn: break
			if int(id) != 0 and p is Array and p.size() > 7 and p[7] != null and ZONE_IDS[int(p[7])] == "s" and inQuestRange(int(tr.step), float(p[0]), float(p[2])): anyIn = true
		if anyIn: trailOutT = 0
		elif trailOutT == 0: trailOutT = nw
		elif nw - trailOutT > FAIL_MS:
			trailOutT = 0
			tr.acc = false; tr.c = 0; tr.taken = {}
			hostTrailSend({"k": "fail", "step": tr.step})
			return
	else: trailOutT = 0
	if ch: hostTrailSend(null)

func hostTrailLeave(id) -> void:
	if hs == null or hs.get("trail") == null: return
	var tr: Dictionary = hs.trail
	var ch = false
	for i in tr.taken.keys():
		var tk = tr.taken[i]
		if int(tk[0]) == int(id) and float(tk[1]) > 0:
			tr.taken.erase(i); ch = true
	if ch: hostTrailSend(null)

func boatOk(tr = null) -> bool:
	if tr == null: tr = trail
	return tr != null and (bool(tr.get("boat", false)) or (int(tr.step) == KS and bool(tr.acc)))
func hostBoatOk() -> bool: return hs != null and hs.get("trail") != null and boatOk(hs.trail)

func hostBoatHome() -> void:
	var v = hs.vehs.get(Game.C.trail.BOAT_ID) if hs.get("vehs") != null else null
	if v == null or int(v.d) != -1: return
	hostBoatPark(v)
	net.broadcast({"t": "veh", "v": _vcopy(v)})

func hostBoatPark(v) -> void:
	var H: Dictionary = Game.C.trail.BOAT_HOME
	v.zone = "s"; v.x = float(H.x); v.z = float(H.z); v.h = float(H.h); vehDirty = true

func hostBoatCheck(v) -> void:
	if hs == null or hs.get("trail") == null or v == null: return
	var tr: Dictionary = hs.trail
	if str(v.get("id", "")) != Game.C.trail.BOAT_ID or v.zone != "s" or int(tr.step) != KS or not tr.acc: return
	var D: Dictionary = Game.C.trail.DOCK
	if Vector2(float(v.x) - float(D.x), float(v.z) - float(D.z)).length() > float(D.r): return
	var ev = {"k": "boat", "step": tr.step, "by": v.d}
	hostTrailNext(ev)
	hostTrailSend(ev)

func onTrailMessage(m) -> bool:
	if m.get("t") != "trail": return false
	onTrail(m.tr, m.get("ev"))
	return true
