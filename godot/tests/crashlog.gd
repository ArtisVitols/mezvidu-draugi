extends Node
## 📋 Žurnāls pēc avārijas (Xvfb, divas palaišanas):
##   1) -- --autotest=crashlog --step=1  → spēle ziemā, iet pa sniegu, tad īsta avārija (OS.crash)
##   2) -- --autotest=crashlog --step=2  → žurnālā ir avārija un pēdējais stāvoklis; izvēlnē poga ar pieskārienu atver paneli, kopē
var fails := 0
func ok(c: bool, what: String) -> void:
	print("[crashlog] %s %s" % ["✅" if c else "❌", what])
	if not c: fails += 1
func frames(n: int) -> void:
	for i in n: await get_tree().process_frame
func touch(p: Vector2, down: bool) -> void:
	var e := InputEventScreenTouch.new(); e.index = 0; e.position = p; e.pressed = down
	Input.parse_input_event(e)
func tap(c: Control) -> void:
	var p := c.get_global_rect().get_center()
	touch(p, true); await get_tree().create_timer(0.12).timeout; touch(p, false); await frames(4)

func _ready() -> void:
	if Game.arg("step") == "1": await step1()
	else: await step2()

func step1() -> void:
	var s: Dictionary = Game.default_save("Žurnāls"); s.name = "Žurnāls"; s.zone = "n"; s.pos = {"x": 0.0, "z": 250.0}
	var net := Net.new(); net.start_offline()
	var g := Play.new(); g.setup(s, net, null, {})
	get_tree().root.add_child.call_deferred(g)
	await get_tree().process_frame
	await g.init_game(func(f, t): pass)
	UI.loading.visible = false
	g.start_game()
	UI.touch.move = Vector2(0, 1)
	await get_tree().create_timer(5.0).timeout
	push_error("pārbaudes kļūda žurnālam")
	print("[crashlog] tūlīt avārija")
	OS.crash("pārbaudes avārija")

func step2() -> void:
	var pi := CrashLog.previous_info(1)
	ok(pi.get("exists", false) and pi.get("crashed", false), "iepriekšējā reize atzīmēta kā avārija (%s)" % str(pi))
	var t := CrashLog.read(1)
	for want in ["[sākums]", "[ierīce] GPU", "[spēle] sākas", "[zeme]", "[stāvoklis]", "zeme n", "virsma snow", "[skaņa] st_snow", "pārbaudes kļūda žurnālam", "tūlīt avārija"]:
		ok(t.contains(want), "žurnālā ir „%s”" % want)
	var m := Menu.new(); add_child(m)
	await frames(5)
	var bt: Button = null
	for c in m.find_children("*", "Button", true, false):
		if (c as Button).text.contains("avarēja"): bt = c
	ok(bt != null, "sākuma ekrānā poga „Iepriekšējā reize avarēja”")
	if bt:
		await tap(bt)
		ok(UI.panelOpen() and UI.panel_title.text.contains("Žurnāls"), "pieskāriens atver 📋 Žurnāls")
		var cp: Button = null
		for c in UI.panel_body.find_children("*", "Button", true, false):
			if (c as Button).text.contains("iepriekšējā reize"): cp = c
		ok(cp != null, "kopēšanas poga")
		if cp:
			DisplayServer.clipboard_set("")
			await tap(cp)
			var clip := DisplayServer.clipboard_get()
			ok(clip.contains("[stāvoklis]") and clip.contains("tūlīt avārija"), "nokopēts starpliktuvē (%d zīmes)" % clip.length())
	print("[crashlog] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
