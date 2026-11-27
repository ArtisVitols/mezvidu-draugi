extends Node
## 📋 Pastāvīgais žurnāls (autoload CrashLog): viss, kas notiek, tiek uzreiz ierakstīts failā user://zurnals/now.txt
## (katra rinda uzreiz flush — saglabājas arī tad, ja lietotne avarē). Nākamajā palaišanā tas kļūst par „iepriekšējo”
## (glabā 3 iepriekšējās reizes); izvēlnē 📋 Žurnāls to var nokopēt. Raksta: ierīci, kļūdas un brīdinājumus, print,
## ik 2 s stāvokli (zeme, vieta, fps, atmiņa…), skaņas, zemju maiņu, darbības, paneļus.

const DIR := "user://zurnals"
const NOW := DIR + "/now.txt"
const KEEP := 3
const MAX_BYTES := 3 * 1024 * 1024
const END_MARKS := ["[beigas]", "[fonā]"]

var f: FileAccess = null
var mx := Mutex.new()
var busy := false
var t0 := 0
var state_fn: Callable = Callable()   # spēle iestata: atgriež stāvokļa rindu
var tick := 0.0
var frames := 0
var lines := 0

class Catcher extends Logger:
	var owner_log
	func _log_error(function: String, file: String, line: int, code: String, rationale: String, _en: bool, error_type: int, bt: Array[ScriptBacktrace]) -> void:
		var kind := "⚠️ BRĪDINĀJUMS" if error_type == ERROR_TYPE_WARNING else ("❌ ĒNOTĀJS" if error_type == ERROR_TYPE_SHADER else ("❌ SKRIPTS" if error_type == ERROR_TYPE_SCRIPT else "❌ KĻŪDA"))
		var s := "%s %s @ %s:%d %s" % [kind, (rationale if rationale != "" else code).left(400), file.get_file(), line, function]
		for b in bt:
			if b != null and not b.is_empty(): s += "\n    " + b.format().strip_edges().replace("\n", "\n    ").left(1200)
		owner_log.w(s)
	func _log_message(message: String, error: bool) -> void:
		owner_log.w(("❗ " if error else "· ") + message.strip_edges().left(400))

func _init() -> void:
	t0 = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(DIR)
	# rotācija: now → prev1 → prev2 → prev3
	var d := DirAccess.open(DIR)
	if d:
		if FileAccess.file_exists(_prev(KEEP)): d.remove(_prev(KEEP).get_file())
		for i in range(KEEP - 1, 0, -1):
			if FileAccess.file_exists(_prev(i)): d.rename(_prev(i).get_file(), _prev(i + 1).get_file())
		if FileAccess.file_exists(NOW): d.rename(NOW.get_file(), _prev(1).get_file())
	f = FileAccess.open(NOW, FileAccess.WRITE)
	var c := Catcher.new(); c.owner_log = self
	OS.add_logger(c)

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var mi := OS.get_memory_info()
	w("[sākums] Mežvidu Draugi %s · %s %s · %s · %s" % [ProjectSettings.get_setting("application/config/version", "?"), OS.get_name(), OS.get_version(), OS.get_model_name(), Time.get_datetime_string_from_system()])
	w("[ierīce] GPU %s / %s · %s · CPU %s × %d · RAM %d MB (brīva %d MB) · ekrāns %s" % [RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_vendor(),
		RenderingServer.get_video_adapter_api_version(), OS.get_processor_name(), OS.get_processor_count(), int(mi.get("physical", 0)) / 1048576, int(mi.get("available", 0)) / 1048576,
		str(DisplayServer.screen_get_size())])
	var pc := previous_info(1)
	if pc.exists: w("[iepriekšējā reize] %s" % ("beidzās negaidīti (avārija?)" if pc.crashed else "beidzās normāli"))

func _prev(i: int) -> String: return DIR + "/prev%d.txt" % i

## raksta rindu (drīkst saukt no jebkura pavediena)
func w(text: String) -> void:
	if f == null: return
	mx.lock()
	if busy:
		mx.unlock(); return
	busy = true
	var ms := Time.get_ticks_msec() - t0
	f.store_string("%s %6.1f %s\n" % [Time.get_time_string_from_system(), ms / 1000.0, text])
	f.flush()
	lines += 1
	if lines % 200 == 0 and f.get_length() > MAX_BYTES: _shrink()
	busy = false
	mx.unlock()

## pārāk liels fails → paturam pēdējo pusi (sākuma rindas ar ierīci arī)
func _shrink() -> void:
	f.seek(0)
	var all := f.get_as_text()
	var head := all.substr(0, 2000)
	var tail := all.substr(all.length() - MAX_BYTES / 2)
	f = FileAccess.open(NOW, FileAccess.WRITE)
	f.store_string(head + "\n… (vidus izmests, fails bija par lielu) …\n" + tail)
	f.flush()

func _process(dt: float) -> void:
	frames += 1
	tick -= dt
	if tick > 0: return
	tick = 2.0
	var s := "[stāvoklis] kadrs %d fps %d · RAM %d MB · video %d MB · objekti %d · mezgli %d · zīm. %d" % [frames, Engine.get_frames_per_second(),
		OS.get_static_memory_usage() / 1048576, int(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)) / 1048576,
		int(Performance.get_monitor(Performance.OBJECT_COUNT)), int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))]
	if state_fn.is_valid():
		var e = state_fn.call()
		if e != null and str(e) != "": s += " · " + str(e)
	w(s)

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED: w("[fonā] lietotne aizvērta/paslēpta")
		NOTIFICATION_APPLICATION_RESUMED: w("[atpakaļ] lietotne atkal atvērta")
		NOTIFICATION_WM_CLOSE_REQUEST, NOTIFICATION_WM_GO_BACK_REQUEST: w("[beigas] aizvēršana")
		NOTIFICATION_APPLICATION_FOCUS_OUT: w("[fokuss prom]")
		NOTIFICATION_OS_MEMORY_WARNING: w("⚠️ [atmiņa] sistēma brīdina: maz atmiņas")

func _exit_tree() -> void: w("[beigas] lietotne beidz darbu")

func mark_end() -> void: w("[beigas] iziet no spēles")

# ---------- lasīšana (📋 Žurnāls) ----------
func path_of(i: int) -> String: return NOW if i == 0 else _prev(i)

func read(i: int) -> String:
	if i == 0:
		mx.lock()
		f.flush()
		mx.unlock()
	var r := FileAccess.open(path_of(i), FileAccess.READ)
	return r.get_as_text() if r else ""

## {exists, crashed, start, last, lines, size}
func previous_info(i: int) -> Dictionary:
	var p := path_of(i)
	if not FileAccess.file_exists(p): return {"exists": false}
	var txt := read(i)
	var ls := txt.strip_edges().split("\n")
	var last := ls[ls.size() - 1] if ls.size() else ""
	var crashed := true
	for m in END_MARKS: if last.contains(m): crashed = false
	var start := ""
	for l in ls:
		if l.contains("[sākums]"):
			start = l.get_slice("·", 3).strip_edges() if l.get_slice_count("·") > 3 else l.left(8)
			break
	return {"exists": true, "crashed": crashed, "start": start, "last": last.left(8), "lines": ls.size(), "size": txt.length()}

## teksts kopēšanai: pēdējās n rindas (+ ierīces rindas sākumā)
func copy_text(i: int, n := 4000) -> String:
	var ls := read(i).split("\n")
	if ls.size() <= n: return "\n".join(ls)
	return "\n".join(ls.slice(0, 3)) + "\n… (%d rindas izlaistas) …\n" % (ls.size() - n) + "\n".join(ls.slice(ls.size() - n))

## 📋 panelis (izvēlnē un spēles ☰ izvēlnē)
func open_panel() -> void:
	UI.showPanel("📋 Žurnāls", func(b: Control) -> void:
		b.add_child(UI.p("Lietotne visu laiku pieraksta, kas notiek. Ja tā avarē — atver to vēlreiz, nāc šeit un nokopē iepriekšējās reizes žurnālu, tad ielīmē to ziņā.", 14.0))
		for i in range(1, KEEP + 1):
			var pi := previous_info(i)
			if not pi.exists: continue
			var nm := "Iepriekšējā reize" if i == 1 else "%d. reizi atpakaļ" % i
			var st := ("⚠️ beidzās negaidīti (avārija?)" if pi.crashed else "✅ beidzās normāli")
			b.add_child(UI.h3("%s · %s" % [nm, pi.start]))
			b.add_child(UI.p("%s · %d rindas · pēdējā %s" % [st, pi.lines, pi.last], 13.0))
			var ii := i
			b.add_child(UI.btn("📋 Kopēt (%s)" % nm.to_lower(), func():
				DisplayServer.clipboard_set(copy_text(ii))
				UI.toast("📋 Nokopēts! Ielīmē to ziņā.", "good"), i != 1))
		b.add_child(UI.h3("Šī reize"))
		b.add_child(UI.btn("📋 Kopēt šīs reizes žurnālu", func():
			DisplayServer.clipboard_set(copy_text(0))
			UI.toast("📋 Nokopēts!", "good"), true))
		var lp := previous_info(1)
		if lp.exists:
			b.add_child(UI.h3("Iepriekšējās reizes beigas"))
			var ls := read(1).strip_edges().split("\n")
			var t := UI.p("\n".join(ls.slice(maxi(0, ls.size() - 25))), 11.0, Color(0.3, 0.3, 0.3))
			t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			b.add_child(t))
