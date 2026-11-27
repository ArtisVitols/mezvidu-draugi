extends Node
## 🔊 Skaņas (web audio.js + ui.js sfx): CC0 paraugi no assets/snd (varianti name0..n), skaņas vietā (attālums + stereo),
## cilpas ar mīkstu skaļuma maiņu, sintezēti dzinēji (AudioStreamGenerator), ģenerētas trokšņa cilpas, latviešu balsis.
## Autoload "Aud". Kopnes: Sfx, Amb, Voice (ar limiteri) → Master.

const BASE := "res://assets/snd/"
const VBASE := "res://assets/voice/"
const VOL_KEY := "mezvidi_vol"
const FX_KEY := "mezvidi_vol_fx"
const VOICE_VOL_KEY := "mezvidi_vol_voice"
const VOICE_KEY := "mezvidi_voice"
const MAP := {
	"pick": ["pop", 0.7], "coin": ["coin", 0.8], "star": ["j_star", 0.8], "bad": ["ui_error", 0.7], "jump": ["cloth", 0.4, 1.3],
	"plant": ["leaves", 0.8], "beep": ["ui_select", 0.7], "go": ["ding", 0.9, 1.3], "boost": ["whoosh", 0.8], "pet": ["pluck", 0.8],
	"throw": ["cloth", 0.6, 1.15], "splat": ["squish", 0.8], "win": ["j_win", 0.75],
}
const ENG := {
	"car": {"f0": 36.0, "f1": 120.0, "wave": "saw", "sub": 0.5, "cut0": 420.0, "cutR": 900.0, "cutL": 1500.0, "vol": 0.5, "chug": 0.35},
	"kart": {"f0": 58.0, "f1": 210.0, "wave": "square", "sub": 0.25, "cut0": 800.0, "cutR": 1600.0, "cutL": 2400.0, "vol": 0.32, "chug": 0.25},
	"bus": {"f0": 26.0, "f1": 62.0, "wave": "saw", "sub": 0.7, "cut0": 380.0, "cutR": 400.0, "cutL": 700.0, "vol": 0.6, "chug": 0.5},
}
const SR := 22050.0

var vol := 1.0
var fxVol := 1.0
var voiceVol := 1.3
var vOn := true
var list := {}
var buf := {}            # vārds → [AudioStream]
var loops := {}          # id → {p, g, want, zero}
var engines := {}        # id → dict
var lastPlay := {}
var L := {"x": 0.0, "z": 0.0, "yaw": 0.0}
var pool: Array = []     # brīvie 3D atskaņotāji
var pool2: Array = []    # brīvie 2D atskaņotāji
var vCur: AudioStreamPlayer = null
var vSeq := 0
var listener_node: Node3D = null
var b_sfx := 0
var b_amb := 0
var b_voice := 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var v = Game.get_item(VOL_KEY)
	if v != null: vol = clampf(float(v), 0, 1)
	v = Game.get_item(FX_KEY)
	if v != null: fxVol = clampf(float(v), 0, 1)
	v = Game.get_item(VOICE_VOL_KEY)
	if v != null: voiceVol = clampf(float(v), 0, 2)
	vOn = str(Game.get_item(VOICE_KEY, "1")) != "0"
	_buses()
	var f := FileAccess.open(BASE + "list.json", FileAccess.READ)
	if f: list = JSON.parse_string(f.get_as_text())
	for k in list:
		var n := int(list[k])
		var arr := []
		if n <= 1:
			var s = _load(BASE + k + ".mp3")
			if s: arr.append(s)
		else:
			for i in n:
				var s = _load(BASE + k + str(i) + ".mp3")
				if s: arr.append(s)
		if arr.size() > 0: buf[k] = arr
	buf.skid = [_noise(800, 3000, 1.2, func(t): return 0.75 + 0.25 * sin(t * TAU * 11) * sin(t * TAU * 2.5), 2.2)]
	buf.whirr = [_noise(1800, 5200, 1.0, func(t): return 0.8 + 0.2 * sin(t * TAU * 7))]
	buf.hiss = [_noise(1200, 6500, 1.5, func(t): return 0.85 + 0.15 * sin(t * TAU * 3))]
	buf.air = [_noise(280, 1400, 8.0, func(t): return 0.55 + 0.45 * pow(sin(t * PI / 8.0 * 2.0) * 0.5 + 0.5, 1.5))]
	listener_node = Node3D.new()
	add_child(listener_node)

func _load(path: String):
	if not ResourceLoader.exists(path): return null
	return load(path)

func _buses() -> void:
	var mk := func(nm: String) -> int:
		var i := AudioServer.get_bus_index(nm)
		if i < 0:
			AudioServer.add_bus()
			i = AudioServer.bus_count - 1
			AudioServer.set_bus_name(i, nm)
			AudioServer.set_bus_send(i, "Master")
		return i
	b_sfx = mk.call("Sfx"); b_amb = mk.call("Amb"); b_voice = mk.call("Voice")
	if AudioServer.get_bus_effect_count(b_voice) == 0:
		var lim := AudioEffectHardLimiter.new(); lim.ceiling_db = -1.0
		AudioServer.add_bus_effect(b_voice, lim)
	if AudioServer.get_bus_effect_count(0) == 0:
		var lim2 := AudioEffectHardLimiter.new(); lim2.ceiling_db = -0.5
		AudioServer.add_bus_effect(0, lim2)
	_apply_vol()

func _db(g: float) -> float: return linear_to_db(maxf(g, 0.00001))
func _apply_vol() -> void:
	AudioServer.set_bus_volume_db(0, _db(vol))
	AudioServer.set_bus_volume_db(b_sfx, _db(0.9 * fxVol))
	AudioServer.set_bus_volume_db(b_amb, _db(0.55 * fxVol))
	AudioServer.set_bus_volume_db(b_voice, _db(voiceVol))

## filtrēts troksnis kā cilpa (web noiseBuf)
func _noise(lo: float, hi: float, length: float, amp: Callable, gain := 1.0) -> AudioStreamWAV:
	var n := int(SR * length)
	var d := PackedFloat32Array(); d.resize(n)
	var l1 := 0.0
	var l2 := 0.0
	var h1 := 0.0
	var h2 := 0.0
	var kl := 1.0 - exp(-TAU * hi / SR)
	var kh := 1.0 - exp(-TAU * lo / SR)
	var peak := 0.0
	for i in n:
		var w := randf() * 2.0 - 1.0
		l1 += (w - l1) * kl; l2 += (l1 - l2) * kl; h1 += (l2 - h1) * kh; h2 += (h1 - h2) * kh
		d[i] = (l2 - h2) * float(amp.call(i / SR)) * gain
		peak = maxf(peak, absf(d[i]))
	var F := int(SR * minf(0.2, length / 6.0))
	for i in F:
		var t := float(i) / F
		d[i] = d[i] * t + d[n - F + i] * (1.0 - t)
	var bytes := PackedByteArray(); bytes.resize(n * 2)
	for i in n: bytes.encode_s16(i * 2, int(clampf(d[i] * 0.8 / maxf(peak, 1e-6), -1, 1) * 32000))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS; s.mix_rate = int(SR); s.stereo = false; s.data = bytes
	s.loop_mode = AudioStreamWAV.LOOP_FORWARD; s.loop_begin = 0; s.loop_end = n
	return s

func hasSound(nm: String) -> bool: return buf.has(nm) and buf[nm].size() > 0

## klausītājs = kamera (x, z, yaw kā cam.yaw — kamera skatās uz −sin/−cos)
func setListener(x: float, z: float, yaw: float) -> void:
	L.x = x; L.z = z; L.yaw = yaw

func spatial(x: float, z: float, ref := 6.0, mx := 45.0):
	var dx: float = x - L.x
	var dz: float = z - L.z
	var d := sqrt(dx * dx + dz * dz)
	if d > mx: return null
	var g := minf(1.0, ref / maxf(ref, d)) * (1.0 - maxf(0.0, (d - mx * 0.6) / (mx * 0.4)))
	var rx := cos(L.yaw)
	var rz := -sin(L.yaw)
	var pan := clampf((dx * rx + dz * rz) / d, -0.85, 0.85) if d > 0.5 else 0.0
	return {"g": g, "pan": pan}

## stereo: 2D atskaņotājs uz kopnes ar paneli nav; tāpēc panoramēšanai lietojam AudioStreamPlayer3D bez attāluma vājinājuma,
## novietotu pa kreisi/labi no klausītāja (skaļumu rēķinām paši)
func _player3d() -> AudioStreamPlayer3D:
	for p in pool: if not p.playing: return p
	if pool.size() >= 24: return pool[0]
	var p := AudioStreamPlayer3D.new()
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED; p.max_distance = 0.0; p.panning_strength = 1.0; p.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
	p.unit_size = 10.0
	listener_node.add_child(p)
	pool.append(p)
	return p
func _player2d() -> AudioStreamPlayer:
	for p in pool2: if not p.playing: return p
	if pool2.size() >= 24: return pool2[0]
	var p := AudioStreamPlayer.new()
	add_child(p)
	pool2.append(p)
	return p

func _cam() -> Camera3D: return get_viewport().get_camera_3d() if get_viewport() else null
## novieto 3D atskaņotāju kameras telpā: pan −1..1 → pa kreisi/labi
func _place(p: Node3D, pan: float) -> void:
	var c := _cam()
	if c == null: return
	var xf := c.global_transform
	p.global_position = xf.origin + xf.basis.x * pan * 4.0 - xf.basis.z * 4.0 * sqrt(maxf(0.0, 1.0 - pan * pan))

## atskaņo īsu skaņu; opts: vol, rate, jit, pan, at (Vector2 x,z), gap (ms), delay (s), ref, max
func play(nm: String, opts := {}) -> bool:
	if vol <= 0 or not hasSound(nm): return false
	var now := Time.get_ticks_msec()
	var gap: float = opts.get("gap", 40.0)
	if lastPlay.has(nm) and now - int(lastPlay[nm]) < gap: return true
	lastPlay[nm] = now
	var g: float = opts.get("vol", 1.0)
	var pan: float = opts.get("pan", 0.0)
	var at = opts.get("at")
	if at != null:
		var s = spatial(at.x, at.y, float(opts.get("ref", 6.0)), float(opts.get("max", 45.0)))
		if s == null: return true
		g *= s.g; pan = s.pan
	if g < 0.01: return true
	var arr: Array = buf[nm]
	var jit: float = opts.get("jit", 0.06)
	var rate: float = float(opts.get("rate", 1.0)) * (1.0 + (randf() * 2.0 - 1.0) * jit)
	var delay: float = opts.get("delay", 0.0)
	var stream = arr[randi() % arr.size()]
	if delay > 0:
		get_tree().create_timer(delay).timeout.connect(func(): _start(stream, g, rate, pan, opts.get("bus", "Sfx")))
	else: _start(stream, g, rate, pan, opts.get("bus", "Sfx"))
	return true

func _start(stream, g: float, rate: float, pan: float, bus: String) -> void:
	CrashLog.w("[skaņa] %s %.2f" % [stream.resource_path.get_file() if stream is Resource else "?", rate])
	if absf(pan) > 0.05 and _cam() != null:
		var p := _player3d()
		p.stream = stream; p.volume_db = _db(g); p.pitch_scale = maxf(0.05, rate); p.bus = bus
		_place(p, pan)
		p.play()
	else:
		var p := _player2d()
		p.stream = stream; p.volume_db = _db(g); p.pitch_scale = maxf(0.05, rate); p.bus = bus
		p.play()

## ui.js sfx: kartē vecos nosaukumus uz paraugiem
func sfx(nm: String, opts := {}) -> void:
	if MAP.has(nm):
		var m: Array = MAP[nm]
		var o := {"vol": m[1], "rate": m[2] if m.size() > 2 else 1.0}
		for k in opts: o[k] = opts[k]
		if opts.has("vol"): o.vol = float(opts.vol) * 1.0
		play(m[0], o)
	else: play(nm, opts)

## cilpa: izsauc katru kadru; gain 0 kādu laiku → apstājas
func loop(id: String, nm: String, gain: float, rate := 1.0, bus := "amb") -> void:
	var l = loops.get(id)
	if l == null:
		if gain <= 0.001 or vol <= 0 or not hasSound(nm): return
		CrashLog.w("[skaņa] cilpa %s" % nm)
		var p := AudioStreamPlayer.new()
		var st = buf[nm][0]
		if st is AudioStreamMP3:
			st = st.duplicate(); st.loop = true
		p.stream = st; p.bus = "Sfx" if bus == "sfx" else "Amb"; p.volume_db = -80.0
		add_child(p)
		p.play(randf() * st.get_length())
		l = {"p": p, "g": 0.0, "want": 0.0, "rate": rate, "zero": 0}
		loops[id] = l
	l.want = maxf(0.0, gain); l.rate = rate
	if gain <= 0.001:
		if l.zero == 0: l.zero = Time.get_ticks_msec()
		if Time.get_ticks_msec() - int(l.zero) > 1500:
			l.p.queue_free(); loops.erase(id)
	else: l.zero = 0

func loopAt(id: String, nm: String, x: float, z: float, gain := 1.0, ref := 4.0, mx := 30.0) -> void:
	var s = spatial(x, z, ref, mx)
	loop(id, nm, gain * s.g if s != null else 0.0, 1.0)

func stopAllLoops() -> void:
	for l in loops.values(): l.p.queue_free()
	loops.clear()
	for e in engines.values(): e.p.queue_free()
	engines.clear()

# ---------- sintezēti dzinēji ----------
func _make_engine(kind: String) -> Dictionary:
	CrashLog.w("[skaņa] dzinējs %s" % kind)
	var gen := AudioStreamGenerator.new(); gen.mix_rate = SR; gen.buffer_length = 0.12
	var p := AudioStreamPlayer3D.new()
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED; p.max_distance = 0.0; p.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_DISABLED
	p.stream = gen; p.bus = "Sfx"
	listener_node.add_child(p)
	p.play()
	return {"E": ENG[kind], "p": p, "pb": p.get_stream_playback(), "ph1": 0.0, "ph2": 0.0, "phl": 0.0, "f": float(ENG[kind].f0), "ft": float(ENG[kind].f0),
		"cut": float(ENG[kind].cut0), "cutT": float(ENG[kind].cut0), "g": 0.0, "gT": 0.0, "pan": 0.0, "lp": 0.0, "hp": 0.0, "hpx": 0.0, "zero": 0}

## engine(id, 'car'|'kart'|'bus', rpm, load, gain, at?) — katru kadru
func engine(id: String, kind: String, rpm: float, load: float, gain: float, at = null) -> void:
	var e = engines.get(id)
	var g := gain
	var pan := 0.0
	if at != null:
		var s = spatial(at.x, at.y, 7.0, 70.0)
		g = gain * s.g if s != null else 0.0
		pan = s.pan if s != null else 0.0
	if vol <= 0: g = 0.0
	if e == null:
		if g <= 0.001: return
		e = _make_engine(kind); engines[id] = e
	var E: Dictionary = e.E
	var r := clampf(rpm, 0.0, 1.3)
	var l := clampf(load, 0.0, 1.0)
	e.ft = float(E.f0) + (float(E.f1) - float(E.f0)) * r
	e.cutT = float(E.cut0) + float(E.cutR) * r + float(E.cutL) * l
	e.gT = g * float(E.vol) * (0.75 + 0.25 * l)
	e.pan = pan
	_place(e.p, pan)
	_fill(e)
	if g <= 0.001:
		if e.zero == 0: e.zero = Time.get_ticks_msec()
		if Time.get_ticks_msec() - int(e.zero) > 1500:
			e.p.queue_free(); engines.erase(id)
	else: e.zero = 0

func _fill(e: Dictionary) -> void:
	var pb: AudioStreamGeneratorPlayback = e.pb
	if pb == null: return
	var n := pb.get_frames_available()
	if n <= 0: return
	var E: Dictionary = e.E
	var saw: bool = E.wave == "saw"
	var sub: float = E.sub
	var chug: float = E.chug
	var kf := 1.0 / SR
	var kh := 1.0 - exp(-TAU * 110.0 / SR)
	var f: float = e.f
	var cut: float = e.cut
	var gg: float = e.g
	var ph1: float = e.ph1
	var ph2: float = e.ph2
	var phl: float = e.phl
	var lp: float = e.lp
	var hp: float = e.hp
	var buf2 := PackedVector2Array(); buf2.resize(n)
	var sf := 1.0 - exp(-kf / 0.06)
	var sg := 1.0 - exp(-kf / 0.12)
	for i in n:
		f += (float(e.ft) - f) * sf; cut += (float(e.cutT) - cut) * sf; gg += (float(e.gT) - gg) * sg
		ph1 = fmod(ph1 + f * kf, 1.0); ph2 = fmod(ph2 + f * 0.5 * kf, 1.0); phl = fmod(phl + f * 0.25 * kf, 1.0)
		var o1 := (ph1 * 2.0 - 1.0) if saw else (1.0 if ph1 < 0.5 else -1.0)
		var o2 := 1.0 if ph2 < 0.5 else -1.0
		var am := 1.0 + chug * sin(phl * TAU)
		var x := tanh((o1 + o2 * sub) * am * 2.2)
		var kl := 1.0 - exp(-TAU * cut / SR)
		lp += (x - lp) * kl
		hp += (lp - hp) * kh
		var y := (lp - hp) * gg
		buf2[i] = Vector2(y, y)
	pb.push_buffer(buf2)
	e.f = f; e.cut = cut; e.g = gg; e.ph1 = ph1; e.ph2 = ph2; e.phl = phl; e.lp = lp; e.hp = hp

func _process(dt: float) -> void:
	for id in loops:
		var l: Dictionary = loops[id]
		l.g += (float(l.want) - float(l.g)) * minf(1.0, dt / 0.25)
		l.p.volume_db = _db(l.g)
		l.p.pitch_scale = maxf(0.05, lerpf(l.p.pitch_scale, float(l.rate), minf(1.0, dt / 0.08)))
	# dzinēji arī tad, ja kāds kadrs nav izsaukts
	for e in engines.values(): _fill(e)

# ---------- skaļumi ----------
func getVolume() -> float: return vol
func setVolume(v: float) -> void:
	vol = clampf(v, 0, 1); Game.set_item(VOL_KEY, vol); _apply_vol()
func getFxVolume() -> float: return fxVol
func setFxVolume(v: float) -> void:
	fxVol = clampf(v, 0, 1); Game.set_item(FX_KEY, fxVol); _apply_vol()
func getVoiceVolume() -> float: return voiceVol
func setVoiceVolume(v: float) -> void:
	voiceVol = clampf(v, 0, 2); Game.set_item(VOICE_VOL_KEY, voiceVol); _apply_vol()

# ---------- balsis ----------
func voiceOn() -> bool: return vOn
func setVoiceOn(on: bool) -> void:
	vOn = on; Game.set_item(VOICE_KEY, "1" if on else "0")
	if not on: stopVoice()
func stopVoice() -> void:
	vSeq += 1
	if vCur and is_instance_valid(vCur): vCur.stop()
func voice(id: String, opts := {}) -> void:
	if not vOn or vol <= 0: return
	if not opts.get("keep", false): stopVoice()
	var path := VBASE + id + ".mp3"
	if not ResourceLoader.exists(path): return
	var seq := vSeq
	var g: float = opts.get("vol", 1.0)
	var pan := 0.0
	var at = opts.get("at")
	if at != null:
		var s = spatial(at.x, at.y, 10.0, 60.0)
		if s == null: return
		g *= s.g; pan = s.pan * 0.5
	var delay: float = opts.get("delay", 0.0)
	if delay > 0:
		await get_tree().create_timer(delay).timeout
		if seq != vSeq: return
	var stream = load(path)
	if vCur == null or not is_instance_valid(vCur):
		vCur = AudioStreamPlayer.new(); vCur.bus = "Voice"; add_child(vCur)
	vCur.stream = stream; vCur.volume_db = _db(g)
	vCur.play()
