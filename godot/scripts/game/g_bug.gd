class_name GBugSpot
extends GTrail
## 🐞 Kļūdas vieta (web bugspot.js): saimnieks pieraksta visu spēlētāju vietas, nesamos, takas stāvokli un kļūdas;
## glabājas ierīcē (`mezvidi_bugspots`, pēdējās 10); saimnieks var visus pārcelt atpakaļ ("▶ Turpināt").

const BKEY := "mezvidi_bugspots"
const BMAX := 10

## kļūdu ķērājs (Godot Logger) — pēdējās 12 kļūdas
class ErrLog extends Logger:
	var list: Array = []
	var mx := Mutex.new()
	func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, error_type: int, _bt: Array[ScriptBacktrace]) -> void:
		if error_type == ERROR_TYPE_WARNING: return
		var s := "%s %s @ %s:%d %s" % [Time.get_time_string_from_system(), (rationale if rationale != "" else code).left(300), file.get_file(), line, function]
		mx.lock()
		list.append(s)
		if list.size() > 12: list.pop_front()
		mx.unlock()
	func _log_message(_m: String, _e: bool) -> void: pass
	func snapshot() -> Array:
		mx.lock()
		var a := list.duplicate()
		mx.unlock()
		return a

static var errlog: ErrLog = null

func initBugSpot() -> void:
	if errlog == null:
		errlog = ErrLog.new()
		OS.add_logger(errlog)

func errs() -> Array: return errlog.snapshot() if errlog else []
func bugLoad() -> Array:
	var v = Game.get_item(BKEY, [])
	return v if v is Array else []
func bugStore(list: Array) -> void: Game.set_item(BKEY, list.slice(0, BMAX))
static func bugCode() -> String:
	var A := "ABCDEFGHJKLMNPRSTUVZ23456789"
	var s := ""
	for i in 4: s += A[randi() % A.length()]
	return s
static func fmtT(t: float) -> String:
	var d := Time.get_datetime_dict_from_unix_time(int(t / 1000.0) + int(Time.get_time_zone_from_system().bias) * 60)
	return "%04d-%02d-%02d %02d:%02d" % [d.year, d.month, d.day, d.hour, d.minute]
func zicon(z) -> String: return Game.C.zones.ZONES[z].icon if Game.C.zones.ZONES.has(z) else ""

func bugText(s: Dictionary) -> String:
	var tr = s.get("trail")
	var lines := ["🐞 KĻŪDAS VIETA %s · v%s · %s · saglabāja %s" % [s.id, s.ver, fmtT(float(s.at)), s.by]]
	if str(s.get("note", "")) != "": lines.append("Kas notika: " + str(s.note))
	if tr is Dictionary:
		lines.append("Taka: solis %d/5, savākts %d, uzdevums %s, tilts %s, gājiens %d, šķēršļi %s" % [int(tr.step) + 1, int(tr.c), "pieņemts" if tr.acc else "nav pieņemts", "ir" if tr.get("bridge", false) else "nav", int(tr.run), JSON.stringify(tr.get("ob", []))])
	for p in s.players:
		var cr := (" nes %s" % str(p.carry).trim_prefix("t:")) if p.get("carry") != null else ""
		lines.append("- %s: %s %s x %s y %s z %s virziens %s%s" % [p.name, zicon(p.zone), p.zone, p.x, p.y, p.z, p.h, cr])
	if s.get("errs") is Array and s.errs.size() > 0:
		lines.append("Kļūdas konsolē:")
		for e in s.errs: lines.append("  " + str(e))
	return "\n".join(lines)

var bugPanel := false
func openBugSpot(refresh := false) -> void:
	var build := func(b: Control) -> void:
		var list := bugLoad()
		var host: bool = net.is_host
		b.add_child(UI.p("Redzi kļūdu? Saglabā vietu — tiks pierakstīts, kur stāv visi spēlētāji un cik tālu ir taka. Pēc labojuma varēsiet turpināt tieši no turienes.", 13.0, Color(0.35, 0.35, 0.35)))
		var note := TextEdit.new(); note.placeholder_text = "Kas notika? (nav obligāti)"; note.custom_minimum_size.y = 70 * UI.S
		note.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY; note.add_theme_font_size_override("font_size", int(15 * UI.S))
		b.add_child(note)
		b.add_child(UI.btn("📍 Saglabāt kļūdas vietu", func(): bugSave(note.text.strip_edges())))
		if list.is_empty(): b.add_child(UI.p("Vēl nav saglabātu vietu.", 13.0, Color(0.35, 0.35, 0.35)))
		for s in list:
			var card := VBoxContainer.new()
			card.add_child(UI.p("🐞 %s · %s · v%s · %d sp." % [s.id, fmtT(float(s.at)), s.ver, s.players.size()], 15.0))
			if str(s.get("note", "")) != "": card.add_child(UI.p(str(s.note), 13.0, Color(0.35, 0.35, 0.35)))
			var names := []
			for p in s.players: names.append("%s %s" % [p.name, zicon(p.zone)])
			card.add_child(UI.p(" · ".join(names), 13.0, Color(0.35, 0.35, 0.35)))
			var btns := [UI.btn("📋 Kopēt", func(): bugCopy(s), true)]
			if host: btns.append(UI.btn("▶ Turpināt", func(): hostBugGo(s), true))
			var sid = s.id
			btns.append(UI.btn("🗑", func():
				bugStore(bugLoad().filter(func(x): return x.id != sid)); openBugSpot(true), true))
			card.add_child(UI.row(btns))
			card.add_child(HSeparator.new())
			b.add_child(card)
		if not host: b.add_child(UI.p("Turpināt no vietas var istabas saimnieks.", 13.0, Color(0.35, 0.35, 0.35)))
	if refresh and UI.panelOpen() and bugPanel: UI.refreshPanel(build)
	else:
		bugPanel = true
		UI.showPanel("🐞 Kļūdas vieta", build, func(): bugPanel = false)

func bugCopy(s: Dictionary) -> void:
	var txt := bugText(s)
	DisplayServer.clipboard_set(txt)
	UI.toast("📋 Nokopēts — ielīmē ziņā izstrādātājam", "good")

func bugSave(note: String) -> void:
	var m := {"t": "bugSave", "note": note.left(300), "errs": errs()}
	if net.is_host: hostBugSave(0, m)
	else: net.toHost(m)
	sfx("pick")

func _nameOf(id) -> String:
	var p = hs.profiles.get(id)
	if p is Dictionary and p.get("name") != null: return str(p.name)
	return save.name if int(id) == 0 else "Spēlētājs %s" % str(id)

func hostBugSave(from, m: Dictionary) -> void:
	var players := []
	var r2 := func(v: float) -> float: return snappedf(v, 0.01)
	players.append({"name": save.name, "zone": zone, "x": r2.call(me.pos.x), "y": r2.call(me.pos.y), "z": r2.call(me.pos.z), "h": r2.call(float(me.heading)), "carry": me.carry.k if me.carry != null else null})
	for id in hs.positions:
		var p = hs.positions[id]
		if int(id) == 0 or not (p is Array): continue
		var pr = hs.profiles.get(id)
		players.append({"name": _nameOf(id), "zone": ZONE_IDS[int(p[7])] if p[7] != null else "c", "x": p[0], "y": p[1], "z": p[2], "h": p[3], "carry": pr.get("carry") if pr is Dictionary else null})
	var tr = null
	if hs.get("trail") != null:
		tr = hs.trail.duplicate(true)
		for i in tr.taken.keys():
			var t = tr.taken[i]
			tr.taken[i] = ["" if float(t[1]) < 0 else _nameOf(t[0]), -1 if float(t[1]) < 0 else 1]
	var e := []
	for x in m.get("errs", []): e.append("[%s] %s" % [_nameOf(from), x])
	if int(from) != 0: for x in errs(): e.append("[%s] %s" % [save.name, x])
	var s := {"id": bugCode(), "at": Game.now_ms(), "ver": Game.VERSION, "by": _nameOf(from), "note": m.get("note", ""), "trail": tr, "players": players, "errs": e.slice(-16)}
	net.broadcast({"t": "bugSaved", "s": s}, true)
	onBugSaved(s)

func onBugSaved(s: Dictionary) -> void:
	var list := [s]
	for x in bugLoad(): if x.id != s.id: list.append(x)
	bugStore(list)
	UI.toast("🐞 Kļūdas vieta saglabāta: %s" % s.id, "good", 4000)
	if UI.panelOpen() and bugPanel: openBugSpot(true)

func hostBugGo(s: Dictionary) -> void:
	if hs == null: return
	var nw := Game.now_ms()
	var byName := {save.name: 0}
	for id in hs.profiles:
		var p = hs.profiles[id]
		if int(id) != 0 and p is Dictionary and p.get("name") != null: byName[p.name] = id
	var missing := []
	var carryFor := {}
	if s.get("trail") is Dictionary and hs.get("trail") != null:
		var tr: Dictionary = s.trail.duplicate(true)
		for i in tr.taken.keys():
			var nm = tr.taken[i][0]
			var kind := int(tr.taken[i][1])
			if kind < 0: tr.taken[i] = [0, -1]
			elif byName.has(nm):
				var id = byName[nm]
				tr.taken[i] = [id, nw + CARRY_MS]
				carryFor[id] = {"i": int(i), "step": tr.step}
			else: tr.taken.erase(i)
		for k in tr: hs.trail[k] = tr[k]
		hostTrailSend(null)
	for p in s.players:
		if not byName.has(p.name):
			missing.append(p.name); continue
		var id = byName[p.name]
		var msg := {"t": "bugGo", "p": p, "carry": carryFor.get(id)}
		if int(id) == 0: onBugGo(msg)
		else: net.sendTo(int(id), msg)
	if missing.size() > 0: UI.toast("Nav istabā: " + ", ".join(missing), "", 4000)

func onBugGo(m: Dictionary) -> void:
	var p = m.get("p")
	if not (p is Dictionary) or not Game.C.zones.ZONES.has(p.zone): return
	if me.bus != null: leaveBus()
	if me.ride != null: leaveRide()
	if me.veh != null: exitVehicle()
	if me.inKart: exitKart()
	if me.carry != null and me.carry.get("trail") != null: trailDropCarry(false)
	if UI.panelOpen() and bugPanel: UI.closePanel()
	await teleport(p.zone, Vector2(float(p.x), float(p.z)), float(p.h))
	if zone != p.zone: return
	me.pos = Vector3(float(p.x), maxf(float(p.y), terr.ground_at(float(p.x), float(p.z))), float(p.z))
	me.heading = float(p.h); cam.yaw = float(p.h) + PI
	if m.get("carry") is Dictionary: trailEvent({"k": "take", "by": myId, "i": m.carry.i, "step": m.carry.step})
	elif p.get("carry") == "t:zivs": trailCatch({"x": float(p.x), "z": float(p.z)})
	UI.toast("▶ Turpinām no kļūdas vietas", "good")

func hostBug(from, m) -> bool:
	if m.get("t") != "bugSave": return false
	hostBugSave(from, m)
	return true

func onBugMessage(m) -> bool:
	if m.get("t") == "bugSaved":
		onBugSaved(m.s); return true
	if m.get("t") == "bugGo":
		onBugGo(m); return true
	return false
