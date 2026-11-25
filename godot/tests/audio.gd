extends Node
## Skaņas: paraugi, balsis, dzinēja ģenerators: -- --autotest=audio
func _ready() -> void:
	var fails := 0
	print("[audio] paraugi ", Aud.buf.size())
	if Aud.buf.size() < 58: fails += 1
	if not Aud.play("coin"): fails += 1
	Aud.sfx("pick", {"at": Vector2(3, 0)})
	for i in 30:
		Aud.engine("t", "car", 0.5, 0.5, 1.0)
		Aud.loop("amb_birds", "amb_birds", 0.5)
		await get_tree().process_frame
	var e = Aud.engines.get("t")
	print("[audio] dzinējs ", e != null, " cilpa ", Aud.loops.has("amb_birds"))
	if e == null or not Aud.loops.has("amb_birds"): fails += 1
	var vs = load("res://assets/voice/t0_ask.mp3")
	print("[audio] balss ", vs != null, " garums ", vs.get_length() if vs else 0.0)
	if vs == null: fails += 1
	print("[audio] ", "VISS IZDEVĀS" if fails == 0 else "NEIZDEVĀS %d" % fails)
	get_tree().quit()
