class_name GCore
extends Node3D
## Spēles kodols (web game.js): stāvoklis, ielāde, zemes, cikls, kustība, kamera, draugi, tīkls.
## Mantošanas ķēde aizstāj web „mixins”: GCore → GWorld → GUi → GFarm → GGarden → GActivities → GVehicles → GBus →
## GWinter → GTrail → GSound → GQuality → GBugSpot → Play. Funkcijas, ko kodols izsauc no vēlākiem slāņiem, te ir tukšas.

const ANIM := ["idle", "walk", "run", "jump", "swim", "sit", "pet", "wave", "fish", "ski", "lift", "throw"]
const MUSH_RESPAWN := 120000.0
const EPOCH := 1.7e12
const BOTS := [
	{"name": "Zaķis Zigis 🤖", "animal": "zakis", "fur": "#d9d2c5", "shirt": "#2f6fd6", "kart": "#2a6ae0", "speed": 14.0},
	{"name": "Lapsa Laura 🤖", "animal": "lapsa", "fur": "#e8742a", "shirt": "#2fa84f", "kart": "#2ab04a", "speed": 15.5},
	{"name": "Lācis Lauris 🤖", "animal": "lacis", "fur": "#8b5a2b", "shirt": "#f2c12e", "kart": "#e8c020", "speed": 17.0},
]
const PLAYER_DOT := ["#ff4040", "#40a0ff", "#ffd040", "#c060ff"]
const ZONE_IDS := ["c", "n", "e", "s", "w"]
const FARM := "c"
const FOREST := "e"
const RACE := "w"
const WATER_Y := 0.0
const VILLAGE_Y := 4.0
const TRACK_Y := 3.0
const TRACK_N := 800
const TRACK_WIDTH := 12.0
const ZONE_HALF := 315.0
const CROSS_AT := 3.0
const SPAWN := Vector2(5, 5)

var save: Dictionary
var gameInfo: Dictionary
var net: Net
var roomCode = null
var myId = -1
var mySlot = 0
var timeOffset = 0.0
var remotes = {}            # id → r (vārdnīca)
var profiles = {}           # id → prof
var picked = {}
var berryPicked = {}
var team = null
var race = {"phase": "none", "id": 0}
var myRace = null
var hs = null                # saimnieka stāvoklis
var selectedSeed = null
var npcCooldown = {}
var effects: Array = []
var timers = {"send": 0.0, "action": 0.0, "garden": 0.0, "save": 0.0, "map": 0.0, "cull": 0.0, "vis": 0.0, "berry": 0.0}
var currentAction = null
var ended = false
var zone = "e"
var zoneBusy = false
var me = {}
var avatar: Avatar
var cam = {"yaw": PI * 0.25, "pitch": 0.38, "dist": 7.5}
var camInit = false
var camDistS = 0.0
var camera: Camera3D
var sun: DirectionalLight3D
var env: Environment
var stage: Node3D            # lands + shared things
var terr: Terra
var world: WorldLand         # mežs (e)
var farmW: WorldLand         # sēta (c)
var raceW: WorldLand         # trase (w)
var land_node: Node3D        # aktīvās zemes aina
var scene: Node3D            # meža papildu objekti (sēnes, zvaigznes, tirgus…)
var centerOn = false
var farmOn = false
var raceOn = false
var controls: TouchArea
var loopErrs = {}
var exitWarnT = 0.0
var disconnected = false
var autoRace = null
var bots: Array = []
var weekCheck = 0.0
var hostTimer = 0.0
var farmDirty = false
var Q: Dictionary = {}       # aktīvā grafikas līmeņa iestatījumi (quality)
var sunDir = Env.sun_dir()

func setup(p_save: Dictionary, p_net: Net, code, game_info: Dictionary) -> void:
	save = p_save
	gameInfo = game_info if not game_info.is_empty() else {"id": "", "name": "Pirmā spēle", "at": 0, "keep": {}}
	net = p_net
	roomCode = code
	myId = 0 if net.is_host else -1
	initGarden()

func now() -> float: return Time.get_unix_time_from_system() * 1000.0 + timeOffset

func C(mod: String) -> Dictionary: return Game.C.get(mod, {})

# ======================= Inicializācija =======================
func init_game(progress: Callable) -> void:
	var step = func(f: float, t: String) -> void:
		progress.call(f, t)
		await get_tree().process_frame
	await step.call(0.02, "Gatavojam debesis…")
	stage = Node3D.new(); stage.name = "Stage"; add_child(stage)
	var e = Env.make(self)
	env = e.env; sun = e.sun
	camera = Camera3D.new(); camera.fov = 60; camera.near = 0.2; camera.far = 450; add_child(camera)
	camera.current = true
	await step.call(0.08, "Veidojam mežu…")
	world = WorldLand.new(FOREST)
	await step.call(0.3, "Veidojam sētu un dārzus…")
	farmW = WorldLand.new(FARM)
	buildFarm()
	await step.call(0.5, "Veidojam sacīkšu trasi…")
	raceW = WorldLand.new(RACE)
	await step.call(0.6, "Iestatām grafiku…")
	initQuality()
	await step.call(0.66, "Zīmējam karti…")
	buildMinimap()
	await step.call(0.72, "Gatavojam tavu tēlu…")
	var sz: String = save.zone if Game.C.zones.ZONES.has(save.get("zone")) else FARM
	var b = Terra.zone_bounds(sz)
	var sp = save.get("pos")
	var lw = landWorld(sz)
	var ok: bool = sp is Dictionary and float(sp.x) > b[0] + 5 and float(sp.x) < b[2] - 5 and float(sp.z) > b[1] + 5 and float(sp.z) < b[3] - 5 and (lw == null or lw.get_height(float(sp.x), float(sp.z)) > WATER_Y)
	if not ok:
		sz = FARM; sp = {"x": SPAWN.x, "z": SPAWN.y}
	me = {"pos": Vector3(float(sp.x), 0, float(sp.z)), "vy": 0.0, "heading": 0.0, "onGround": true, "state": "idle", "inKart": false,
		"kart": null, "boost": 0.0, "dizzy": 0.0, "iceCream": 0.0, "waveT": 0.0, "petT": 0.0, "progress": 0.0, "veh": null, "ride": null,
		"bus": null, "ski": null, "lift": null, "carry": null, "throwT": 0.0}
	avatar = Avatar.make(avatarProf())
	stage.add_child(avatar.root)
	avatar.set_name_tag(save.name, Color("#d8ffc8"))
	initActivities()
	initVehicles()
	initBus()
	initTrail()
	initBugSpot()
	await step.call(0.8, "Ejam uz tavu vietu…")
	await switchZone(sz, Vector2(float(sp.x), float(sp.z)), null, step, 0.8)
	controls = UI.touch
	bindHud()
	setupNet()
	updateCoins()
	updateGardenHud()
	await step.call(1.0, "Gatavs!")

func landWorld(id: String) -> WorldLand:
	return world if id == FOREST else farmW if id == FARM else raceW if id == RACE else null

# ======================= Zemes =======================
## Noņem iepriekšējo zemi un ieliek jauno (web switchZone). step — ielādes progresa funkcija (var būt null).
func switchZone(id: String, pos: Vector2, heading, step = null, f0 := 0.0) -> void:
	var prev = zone
	if fishing: stopFishing()
	if me.carry != null and (id != FARM or prev != FARM): stowCarry()
	if prev != id or land_node == null:
		if prev == "n": leaveWinter()
		if prev == "s": leaveTrail()
		_unload_land(prev)
		zone = id
		await _load_land(id, step, f0)
		if id == "n": enterWinter()
	me.pos = Vector3(pos.x, 0, pos.y)
	me.pos = terr.collide(me.pos, 0.6)
	me.pos.y = terr.ground_at(me.pos.x, me.pos.z)
	me.vy = 0.0; me.onGround = true
	if id == "s" and prev != "s": enterTrail()
	if heading != null:
		me.heading = float(heading); cam.yaw = float(heading) + PI
	camInit = false
	if pet: pet.init = false
	timers.vis = 0.0; timers.send = 0.0; timers.map = 0.0; timers.action = 0.0
	vehicleZoneChanged(heading)
	updateTeamBar()

func _unload_land(id: String) -> void:
	if id == FOREST: unloadForest()
	elif id == FARM: unloadFarm()
	elif id == RACE: unloadRace()
	if land_node and is_instance_valid(land_node): land_node.queue_free()
	land_node = null
	if terr and not terr.is_world: terr.dispose()

func _load_land(id: String, step, f0: float) -> void:
	if step: await step.call(f0 + 0.02, "Veidojam: %s…" % Game.C.zones.ZONES[id].name)
	var names = {"c": "land_farm", "e": "land_forest", "w": "land_race", "n": "land_winter", "s": "land_trail"}
	var ws = WebScene.open(names[id])
	land_node = ws.build(_land_skip(id))
	land_node.name = "Land_" + id
	stage.add_child(land_node)
	if step: await step.call(f0 + 0.1, "Veidojam: %s…" % Game.C.zones.ZONES[id].name)
	if id == FOREST: reloadForest()
	elif id == FARM: loadFarm()
	elif id == RACE: loadRace()
	elif id == "n": terr = WinterLand.new(self); terr.node = land_node
	elif id == "s": terr = TrailLand.new(self); terr.node = land_node
	applyLandQuality()

## kas no izgāztās zemes ainas Godot pusē tiek veidots savādāk (piem., dinamiskas lietas)
func _land_skip(_id: String) -> Callable: return func(d: Dictionary) -> bool: return str(d.get("n", "")) == "skipDyn"

func unloadForest() -> void:
	if not centerOn: return
	centerOn = false
	if fishing: stopFishing()
	if scene and is_instance_valid(scene): scene.queue_free()
	scene = null

func reloadForest() -> void:
	terr = world
	centerOn = true
	scene = Node3D.new(); scene.name = "ForestExtra"; stage.add_child(scene)
	buildForestExtras()
	timers.vis = 0.0; timers.cull = 0.0; timers.berry = 0.0

func loadRace() -> void:
	terr = raceW
	raceOn = true
	timers.vis = 0.0

func unloadRace() -> void:
	raceOn = false
	for bt in bots: if bt and is_instance_valid(bt.kart.root): bt.kart.root.queue_free()
	bots = []

## ielādes ekrāns → cita zeme (web teleport)
func teleport(dest: String, pos: Vector2, heading, busy := false) -> void:
	var Z: Dictionary = Game.C.zones.ZONES[dest]
	if not busy:
		zoneBusy = true
		UI.show_id("zone-sign", false)
		UI.zone_loading(true, "%s %s" % [Z.icon, Z.name])
	var t0 = Time.get_ticks_msec()
	await get_tree().create_timer(0.38).timeout
	await switchZone(dest, pos, heading)
	updateCamera(0.016)
	await get_tree().process_frame
	await get_tree().process_frame
	var wait = maxf(0.0, 0.7 - (Time.get_ticks_msec() - t0) / 1000.0)
	if wait > 0: await get_tree().create_timer(wait).timeout
	UI.zone_loading(false)
	zoneBusy = false
	persist()
	UI.toast("📍 %s %s" % [Z.icon, Z.name], "good")

func travel(dest: String, side: String) -> void:
	zoneBusy = true
	UI.show_id("zone-sign", false)
	var Z: Dictionary = Game.C.zones.ZONES[dest]
	UI.zone_loading(true, "%s %s" % [Z.icon, Z.name])
	sfx("beep")
	var d: Vector2 = Terra.DIRS[side]
	var p: Vector3 = me.pos
	var along = p.x * d.x + p.z * d.y
	var pos = Vector2(p.x - d.x * along - d.x * (ZONE_HALF - 6.0), p.z - d.y * along - d.y * (ZONE_HALF - 6.0))
	teleport(dest, pos, atan2(d.x, d.y), true)

func updateExits(dt: float) -> void:
	exitWarnT = maxf(0.0, exitWarnT - dt)
	if zoneBusy: return
	if me.ride != null:
		UI.show_id("zone-sign", false)
		return
	var p: Vector3 = me.pos
	var H = ZONE_HALF
	var near = null
	for s in Terra.open_sides(zone):
		var al = Terra.along_lat(p.x, p.z, s)
		var lim = H * 3.0 if (zone == "s" and s == "s") else H
		if al.x > lim - 18.0 and (near == null or al.x > near.along): near = {"s": s, "along": al.x}
	if near == null:
		UI.show_id("zone-sign", false)
		return
	var dest = Terra.neighbour(zone, near.s)
	var Z: Dictionary = Game.C.zones.ZONES[dest]
	var txt: String = ("🧭 Ej tālāk, lai pārietu uz: %s %s" if near.along > H - 4.0 else "🧭 Robeža tuvu! Aiz tās — %s %s") % [Z.icon, Z.name]
	UI.set_text("zone-sign", txt)
	UI.show_id("zone-sign", true)
	if near.along > H + CROSS_AT:
		var warn = func(m: String) -> bool:
			if exitWarnT <= 0.0:
				exitWarnT = 4.0
				UI.toast(m)
			return true
		if me.inKart:
			warn.call("🏎️ Ar kartu uz citu zemi nevar — izkāp un ej kājām!")
			return
		if mgIn():
			warn.call("🎲 Spēles laikā nevar aiziet uz citu zemi!")
			return
		if vehicleBlocksExit(warn): return
		travel(dest, near.s)

# ======================= Cikls =======================
func start_game() -> void:
	if net.is_host:
		hs = {"profiles": {}, "positions": {}, "picked": {}, "pickedB": {}, "team": makeTeam(Game.now_ms(), save.weekly), "race": {"phase": "none", "id": 0}, "mg": {"kind": null, "phase": "none"}}
		hostInitVehs()
		hostInitTrail()
	net.toHost({"t": "hello", "prof": myProf(), "weekly": save.weekly})
	UI.hud.visible = true
	UI.toast("Sveiks, %s! Šī ir tava sēta 🏡 — uzar zemi un sēj. Mežs ar sēnēm un tirgu ir austrumos 🌲" % save.name, "good", 6000)
	set_process(true)

func _ready() -> void:
	set_process(false)

func _process(delta: float) -> void:
	if ended or me.is_empty() or controls == null: return
	var dt = minf(0.1, delta)
	if net: net.poll(dt)
	if hs != null:
		hostTimer -= dt
		if hostTimer <= 0.0:
			hostTimer = 0.1
			_guard("host", func(): hostTick())
	_guard("update", func(): update(dt))
	_guard("send", func(): sendPos(dt))

func _guard(name: String, f: Callable) -> void:
	# GDScript nav try/catch — kļūda izdrukājas, bet Callable atgriežas; šeit tikai mērīšanai un vienotam ceļam
	f.call()

func loopError(name: String, e) -> void:
	var key = name + ":" + str(e)
	if loopErrs.has(key) or loopErrs.size() > 50: return
	loopErrs[key] = true
	push_error("Spēles cikla kļūda [%s]: %s" % [name, str(e)])

func update(dt: float) -> void:
	var t = now()
	var ctl = controls
	ctl.set_drive(me.inKart or me.veh != null)
	var mv = ctl.get_move()
	var camIn = ctl.consume_cam()
	var jump = ctl.consume_jump()
	var action = ctl.consume_action()
	if UI.panelOpen() or mgFrozen() or zoneBusy:
		mv = {"x": 0.0, "y": 0.0, "run": false}; jump = false
	if fishing and (Vector2(mv.x, mv.y).length() > 0.3 or jump or me.inKart): stopFishing()
	if me.dizzy > 0:
		me.dizzy -= dt
		var w = sin(t / 300.0) * 0.6
		mv = {"x": mv.x + w * Vector2(mv.x, mv.y).length(), "y": mv.y, "run": false}
	me.iceCream = maxf(0.0, me.iceCream - dt)
	cam.yaw -= camIn.x * 0.0065
	cam.pitch = clampf(cam.pitch + camIn.y * 0.0045, -0.1, 1.25)
	cam.dist = clampf(cam.dist + camIn.z, 3.5, 16.0)
	var steps = mini(3, ceili(dt / 0.034))
	for i in steps:
		if me.bus != null: pass
		elif me.inKart: updateKart(dt / steps, mv)
		elif me.veh != null: updateVehicle(dt / steps, mv)
		elif me.ride != null:
			if i == 0: updateRide(dt)
		elif me.lift != null:
			if i == 0: updateLift(dt)
		elif me.ski != null: updateSki(dt / steps, mv, jump and i == 0)
		else: updateWalk(dt / steps, mv, jump and i == 0)
	updateBus(dt)
	updateCamera(dt)
	updateSound(dt)
	RenderingServer.global_shader_parameter_set("mz_time", fmod(t / 1000.0, 3600.0))
	updateSun(dt)
	updateRemotes(dt)
	timers.vis -= dt
	if timers.vis <= 0.0:
		timers.vis = 0.3
		terr.update_visibility(camera.global_position.x, camera.global_position.z)
	if zone == FOREST:
		updateWorldObjects(dt, t)
		updateActivities(dt, t)
	else:
		updatePets(dt)
		updateMg(dt, t)
		updateFishing(dt, t)
		if not terr.is_world: terr.update(dt, self)
		if zone == "s": updateBoats(dt)
		if zone == "n": updateWinter(dt)
		if zone == FARM: updateFarm(dt)
	updateRace(dt, t)
	updateEffects(dt)
	updateExits(dt)
	timers.action -= dt
	if timers.action <= 0.0:
		timers.action = 0.15
		refreshAction()
	if action: doAction()
	timers.garden -= dt
	if timers.garden <= 0.0:
		timers.garden = 1.0
		if farmDirty and myId >= 0:
			farmDirty = false
			sendProfile()
	timers.map -= dt
	if timers.map <= 0.0:
		timers.map = 0.25
		drawMinimap()
	timers.save -= dt
	save.playTime = float(save.get("playTime", 0.0)) + dt
	if timers.save <= 0.0:
		timers.save = 5.0
		persist()

func sendPos(dt: float) -> void:
	timers.send -= dt
	if timers.send > 0.0 or myId < 0: return
	var iv = 0.05 if (me.inKart or me.veh != null) else 0.1
	timers.send = maxf(timers.send + iv, iv * 0.5)
	var p: Vector3 = me.pos
	var ry: float = me.kart.heading if (me.inKart and me.kart) else (me.veh.heading if me.veh != null else me.heading)
	var r2 = func(v: float) -> float: return roundf((v if is_finite(v) else 0.0) * 100.0) / 100.0
	var veh = 1 if me.inKart else vehCode()
	var ride: Array = rideInfo()
	var vid: String = vehIdInfo()
	net.toHost({"t": "pos", "p": [r2.call(p.x), r2.call(p.y), r2.call(p.z), r2.call(ry), maxi(0, ANIM.find(me.state)), veh, r2.call(float(me.progress)), ZONE_IDS.find(zone), ride[0], ride[1], vid, roundf(now())]})

func persist() -> void:
	if me.is_empty(): return
	if not me.inKart and not zoneBusy:
		save.pos = {"x": snappedf(me.pos.x, 0.1), "z": snappedf(me.pos.z, 0.1)}
		save.zone = zone
	Game.write_save(save)

# ======================= Kustība =======================
func updateWalk(dt: float, mv: Dictionary, jump: bool) -> void:
	var W = terr
	var yaw: float = cam.yaw
	var fx = -sin(yaw)
	var fz = -cos(yaw)
	var rx = cos(yaw)
	var rz = -sin(yaw)
	var dx: float = fx * mv.y + rx * mv.x
	var dz: float = fz * mv.y + rz * mv.x
	var mag = minf(1.0, Vector2(dx, dz).length())
	var ground0 = W.ground_at(me.pos.x, me.pos.z, me.pos.y)
	var swimming: bool = ground0 < WATER_Y - 0.9 and me.pos.y < WATER_Y + 0.3
	var speed: float = mag * 8.5 * (1.3 if mv.run else 1.0)
	if swimming: speed *= 0.55
	if me.iceCream > 0: speed *= 1.45
	if me.dizzy > 0: speed *= 0.7
	if mag > 0.05:
		var ux = dx / mag
		var uz = dz / mag
		var try_move = func(ax: float, az: float) -> bool:
			var nx: float = me.pos.x + ax * speed * dt
			var nz: float = me.pos.z + az * speed * dt
			var nh = W.ground_at(nx, nz, me.pos.y)
			var climb = nh - ground0
			if climb > maxf(0.12, speed * dt * 1.6) and me.onGround and nh > WATER_Y: return false
			me.pos.x = nx; me.pos.z = nz
			return true
		if not try_move.call(ux, uz):
			if not try_move.call(ux, 0.0): try_move.call(0.0, uz)
		me.heading = Game.angle_lerp(me.heading, atan2(ux, uz), 1.0 - exp(-dt * 14.0))
	me.pos = W.collide(me.pos, 0.4)
	if zone == FOREST: me.pos = collideIce(me.pos, 0.4)
	var ground = W.ground_at(me.pos.x, me.pos.z, me.pos.y)
	var deep = ground < WATER_Y - 0.9
	if deep and me.pos.y <= WATER_Y + 0.2:
		me.pos.y = lerpf(me.pos.y, WATER_Y - 0.75, 1.0 - exp(-dt * 6.0))
		me.vy = 0.0; me.onGround = true
		me.state = "swim"
	else:
		me.vy -= 26.0 * dt
		me.pos.y += me.vy * dt
		if me.pos.y <= ground:
			me.pos.y = ground; me.vy = 0.0; me.onGround = true
		elif me.onGround and me.vy <= 0 and me.pos.y - ground < 0.45:
			me.pos.y = ground; me.vy = 0.0
		else: me.onGround = false
		if jump and me.onGround:
			me.vy = 9.5; me.onGround = false; sfx("jump")
		if not me.onGround: me.state = "jump"
		elif me.petT > 0: me.state = "pet"
		elif fishing: me.state = "fish"
		elif me.throwT > 0: me.state = "throw"
		elif me.waveT > 0 and speed < 0.5: me.state = "wave"
		else: me.state = "run" if speed > 6.2 else ("walk" if speed > 0.3 else "idle")
	me.petT -= dt; me.waveT -= dt
	avatar.root.position = me.pos
	avatar.root.rotation.y = me.heading
	if avatar.shadow: avatar.shadow.position.y = (WATER_Y + 0.02 if deep else ground) - me.pos.y + 0.03
	avatar.animate(dt, me.state, speed)

func updateCamera(dt: float) -> void:
	var riding: bool = me.veh != null or me.ride != null or me.bus != null
	if me.inKart or me.ski != null or riding:
		var ride_fast = false
		if me.bus != null: ride_fast = float(myBus().speed) > 1.0
		elif me.veh != null: ride_fast = absf(me.veh.speed) > 1.0
		elif me.ride != null: ride_fast = remoteSpeed(me.ride.driver) > 1.0
		if controls.cam_id == null and (me.inKart or ride_fast or (me.ski != null and me.ski.v > 1.5)):
			var head: float = me.kart.heading if me.inKart else (me.veh.heading if me.veh != null else (me.heading if (me.ride != null or me.bus != null) else me.ski.heading))
			cam.yaw = Game.angle_lerp(cam.yaw, head + PI, 1.0 - exp(-dt * 3.5))
			cam.pitch = lerpf(cam.pitch, 0.3, 1.0 - exp(-dt * 2.0))
	var dist: float = maxf(cam.dist, 8.0) if me.inKart else (maxf(cam.dist, 12.0) if me.bus != null else (maxf(cam.dist, 9.5) if riding else cam.dist))
	var tx: float = me.pos.x
	var ty: float = me.pos.y + 1.5
	var tz: float = me.pos.z
	var cp = cos(cam.pitch)
	var ox = sin(cam.yaw) * cp
	var oy = sin(cam.pitch)
	var oz = cos(cam.yaw) * cp
	var s = 0.15
	while s <= 1.001:
		var d = s * dist
		if terr.get_height(tx + ox * d, tz + oz * d) + 0.5 > ty + oy * d or terr.cam_block(tx + ox * d, ty + oy * d, tz + oz * d):
			dist = maxf(1.8, d * 0.85)
			break
		s += 0.085
	var cx = tx + sin(cam.yaw) * cp * dist
	var cz = tz + cos(cam.yaw) * cp * dist
	var cy = ty + sin(cam.pitch) * dist
	var gh = maxf(terr.get_height(cx, cz), WATER_Y) + 0.6
	if cy < gh: cy = gh
	var ceil_t = terr.ceiling_at(tx, tz)
	if ty < ceil_t: cy = minf(cy, minf(ceil_t, maxf(gh, terr.ceiling_at(cx, cz))))
	var k = 1.0 - exp(-dt * 12.0)
	if (riding or me.inKart) and camInit:
		camDistS = lerpf(camDistS if camDistS > 0 else dist, dist, 1.0 - exp(-dt * 5.0))
		var dd = camDistS
		cx = tx + ox * dd; cz = tz + oz * dd
		cy = maxf(ty + oy * dd, maxf(terr.get_height(cx, cz), WATER_Y) + 0.6)
		if ty < ceil_t: cy = minf(cy, minf(ceil_t, maxf(maxf(terr.get_height(cx, cz), WATER_Y) + 0.6, terr.ceiling_at(cx, cz))))
		camera.global_position = Vector3(cx, cy, cz)
		camera.look_at(Vector3(tx, ty, tz), Vector3.UP)
		return
	camDistS = dist
	if not camInit:
		camera.global_position = Vector3(cx, cy, cz)
		camInit = true
	else:
		camera.global_position = camera.global_position.lerp(Vector3(cx, cy, cz), k)
	if camera.global_position.distance_to(Vector3(tx, ty, tz)) > 0.01:
		camera.look_at(Vector3(tx, ty, tz), Vector3.UP)

func updateSun(_dt: float) -> void:
	var p: Vector3 = me.pos
	var sx = roundf(p.x / 4.0) * 4.0
	var sz = roundf(p.z / 4.0) * 4.0
	sun.global_position = Vector3(sx, p.y, sz) + sunDir * 120.0
	sun.look_at(Vector3(sx, p.y, sz), Vector3.UP)
	autoQuality()

# ======================= Draugi =======================
func updateRemotes(dt: float) -> void:
	var k = 1.0 - exp(-dt * 12.0)
	for r in remotes.values():
		var here: bool = str(r.get("zone", "c")) == zone
		if r.kart: r.kart.root.visible = here
		var prev: Vector3 = r.pos
		if r.buf.size() > 0 and r.off != null:
			var delay = clampf((r.gap if r.gap != null else 100.0) * 1.1 + (r.jit if r.jit != null else 0.0) * 1.3 + 20.0, 80.0, 380.0)
			var nowT = now()
			var want: float = nowT - float(r.off) - delay
			var stp: float = 0.0 if r.rtAt == null else clampf(nowT - float(r.rtAt), 0.0, 1000.0)
			r.rtAt = nowT
			if r.rt == null or absf(want - float(r.rt)) > 700.0: r.rt = want
			else:
				var err: float = want - float(r.rt)
				var lim = stp * (0.12 + clampf((absf(err) - 150.0) / 500.0, 0.0, 0.5))
				r.rt = float(r.rt) + stp + clampf(err * minf(1.0, stp * 0.003), -lim, lim)
			var q = sampleRemote(r, float(r.rt))
			var ks = 1.0 - exp(-dt * 20.0)
			var qp = Vector3(q.x, q.y, q.z)
			if r.pos.distance_squared_to(qp) > 100.0: r.pos = qp
			else: r.pos = r.pos.lerp(qp, ks)
			r.ry = Game.angle_lerp(r.ry, q.ry, ks)
		else:
			r.pos = r.pos.lerp(r.target, k)
			r.ry = Game.angle_lerp(r.ry, r.tRy, k)
		if r.pos.distance_to(r.target) > 40.0: r.pos = r.target
		if r.inKart and r.kart == null and here:
			r.kart = makeKart(kartColorHex(r.prof.get("kartColor", "sarkana")))
			stage.add_child(r.kart.root)
			r.avatar.root.get_parent().remove_child(r.avatar.root)
			r.kart.seat.add_child(r.avatar.root)
			r.avatar.root.position = Vector3.ZERO; r.avatar.root.rotation = Vector3.ZERO
			if r.avatar.shadow: r.avatar.shadow.visible = false
		elif not r.inKart and r.kart != null:
			r.kart.seat.remove_child(r.avatar.root)
			r.kart.root.queue_free()
			r.kart = null
			stage.add_child(r.avatar.root)
			if r.avatar.shadow: r.avatar.shadow.visible = true
		if r.kart == null and vehicleRemote(r, here, prev, dt): pass
		elif r.kart != null:
			r.kart.root.position = r.pos
			r.kart.root.rotation.y = r.ry
			var sp = prev.distance_to(r.pos) / maxf(dt, 0.001)
			for wh in r.kart.wheels: wh.rotation.x += sp * dt / 0.32
			r.avatar.animate(dt, "sit", 0.0)
		else:
			r.avatar.root.position = r.pos
			r.avatar.root.rotation.y = r.ry
			var g = terr.get_height(r.pos.x, r.pos.z)
			if r.avatar.shadow: r.avatar.shadow.position.y = maxf(g, WATER_Y) - r.pos.y + 0.03
			r.avatar.animate(dt, r.anim, minf(12.0, prev.distance_to(r.pos) / maxf(dt, 0.001)))
			winterRemote(r, here)
			if r.anim == "fish" and r.get("rod") == null:
				r.rod = makeRod(); r.rod.position = Vector3(0, 1.0, 0.32); r.avatar.root.add_child(r.rod)
			if r.get("rod") != null: r.rod.visible = r.anim == "fish"
			r.avatar.root.visible = here and (not mgHidden(r.id) or r.pos.distance_to(me.pos) < 30.0)

func sampleRemote(r: Dictionary, rt: float) -> Dictionary:
	var b: Array = r.buf
	var n = b.size()
	var i = n - 1
	while i > 0 and float(b[i].t) > rt: i -= 1
	if i > 2:
		b = b.slice(i - 2)
		r.buf = b
		i = 2
	var a: Dictionary = b[i]
	if rt <= float(a.t) or i == b.size() - 1:
		if rt > float(a.t) and i > 0:
			var p: Dictionary = b[i - 1]
			var span: float = float(a.t) - float(p.t)
			var ex = minf(rt - float(a.t), 220.0)
			if span > 0.0 and span < 500.0:
				var f = ex / span
				return {"x": a.x + (a.x - p.x) * f, "y": a.y + (a.y - p.y) * f, "z": a.z + (a.z - p.z) * f, "ry": a.ry}
		return {"x": a.x, "y": a.y, "z": a.z, "ry": a.ry}
	var c: Dictionary = b[i + 1]
	var f2 = clampf((rt - float(a.t)) / maxf(1.0, float(c.t) - float(a.t)), 0.0, 1.0)
	return {"x": lerpf(a.x, c.x, f2), "y": lerpf(a.y, c.y, f2), "z": lerpf(a.z, c.z, f2), "ry": Game.angle_lerp(a.ry, c.ry, f2)}

func applyProfile(id: int, prof: Dictionary) -> void:
	profiles[id] = prof
	if id == myId:
		if mySlot != int(prof.slot) and not slotTaken(mySlot, id):
			renderFarm(mySlot, null); setGardenSign(mySlot, null)
		mySlot = int(prof.slot)
		renderLandBorder()
		setGardenSign(mySlot, prof.name)
		renderFarm(mySlot, prof.get("farm"))
		renderDecor(mySlot, prof.get("decor"))
		return
	var r = remotes.get(id)
	var wear: Dictionary = prof.get("wear", {}) if prof.get("wear") is Dictionary else {}
	var appearance = "%s|%s|%s|%s" % [prof.get("animal"), prof.get("fur"), prof.get("shirt"), str(wear.get("top", ""))]
	if r == null:
		r = {"id": id, "prof": prof, "pos": Vector3(SPAWN.x, VILLAGE_Y, SPAWN.y), "target": Vector3(SPAWN.x, VILLAGE_Y, SPAWN.y), "ry": 0.0, "tRy": 0.0,
			"anim": "idle", "inKart": false, "kart": null, "progress": 0.0, "seen": false, "buf": [], "off": null, "gap": null, "jit": null,
			"rt": null, "rtAt": null, "netVel": Vector3.ZERO, "zone": "c", "vehCode": 0, "rideDriver": -1, "rideSeat": 0, "vehId": "",
			"avatar": null, "appearance": "", "carryK": null, "rod": null, "pet": null, "vehObj": null}
		remotes[id] = r
		updateRoomButton()
	elif int(r.prof.slot) != int(prof.slot) and not slotTaken(int(r.prof.slot), id):
		renderFarm(int(r.prof.slot), null)
		renderDecor(int(r.prof.slot), null)
		setGardenSign(int(r.prof.slot), null)
	if r.appearance != appearance:
		if r.avatar and is_instance_valid(r.avatar.root): r.avatar.root.queue_free()
		r.avatar = Avatar.make(prof)
		r.carryK = "__"
		r.avatar.set_name_tag(str(prof.name), Color.WHITE)
		r.rod = null
		if r.kart: r.kart.seat.add_child(r.avatar.root)
		else: stage.add_child(r.avatar.root)
		r.appearance = appearance
	elif r.prof.get("hat") != prof.get("hat"): r.avatar.set_hat(prof.get("hat"))
	if r.kart and r.prof.get("kartColor") != prof.get("kartColor"): setKartColor3D(r.kart, kartColorHex(prof.get("kartColor", "sarkana")))
	r.avatar.set_wear(wear)
	var ck = prof.get("carry")
	if r.carryK != ck:
		r.carryK = ck
		r.avatar.set_carry(carryModel(str(ck)) if ck != null else null)
	r.prof = prof
	setGardenSign(int(prof.slot), prof.name)
	renderFarm(int(prof.slot), prof.get("farm"))
	renderDecor(int(prof.slot), prof.get("decor"))

func slotTaken(slot: int, id: int) -> bool:
	for pid in profiles:
		if pid != id and int(profiles[pid].get("slot", -1)) == slot: return true
	return false

func removeRemote(id: int) -> void:
	var r = remotes.get(id)
	if r == null: return
	if r.avatar and is_instance_valid(r.avatar.root): r.avatar.root.queue_free()
	if r.kart: r.kart.root.queue_free()
	removeRemoteVehicle(r)
	if r.get("pet") != null and is_instance_valid(r.pet.model.root): r.pet.model.root.queue_free()
	renderFarm(int(r.prof.slot), null)
	renderDecor(int(r.prof.slot), null)
	setGardenSign(int(r.prof.slot), null)
	remotes.erase(id)
	profiles.erase(id)
	updateRoomButton()

func sendProfile() -> void:
	var prof = myProf()
	var p2 = prof.duplicate(); p2.slot = mySlot
	applyProfile(myId, p2)
	net.toHost({"t": "prof", "prof": prof})

func remoteSpeed(id) -> float:
	var r = remotes.get(id)
	return Vector2(r.netVel.x, r.netVel.z).length() if r != null else 0.0

func kartColorHex(id) -> String:
	for kc in Game.D.KART_COLORS:
		if kc.id == id: return kc.color
	return Game.D.KART_COLORS[0].color

func myProf() -> Dictionary:
	var s = save
	return {"name": s.name, "animal": s.animal, "fur": s.fur, "shirt": s.shirt, "hat": s.hat, "wear": (s.wear as Dictionary).duplicate(),
		"kartColor": s.kartColor, "farm": farmView(), "pet": s.get("pet"), "decor": decorView(), "carry": me.carry.k if (not me.is_empty() and me.carry != null) else null}

func avatarProf() -> Dictionary:
	return {"animal": save.animal, "fur": save.fur, "shirt": save.shirt, "hat": save.hat, "wear": save.get("wear", {})}

# ======================= Tīkls =======================
func setupNet() -> void:
	net.onMessage = func(m): onMessage(m)
	net.onHostMessage = func(from, m): hostHandle(from, m)
	net.onPeerLeave = func(id): hostPeerLeave(id)
	net.onDisconnect = func(why): onDisconnected(why)
	net.onStatus = func(txt): if not ended: UI.toast(txt, "good" if str(txt).begins_with("✅") else "", 3500)
	net.onReconnect = func(): onReconnected()

func onReconnected() -> void:
	if me.veh != null: exitVehicle(true)
	if me.ride != null: leaveRide()
	if me.carry != null and me.carry.get("trail") != null: trailDropCarry(false)
	for id in remotes.keys(): removeRemote(id)
	profiles.clear()
	net.toHost({"t": "hello", "prof": myProf(), "weekly": save.weekly, "slot": mySlot})

func onDisconnected(why) -> void:
	if ended or disconnected: return
	disconnected = true
	persist()
	UI.showPanel("Savienojums pārtrūka", func(b: Control) -> void:
		b.add_child(UI.p("%s. Tavs progress ir saglabāts. 💾" % str(why)))
		b.add_child(UI.btn("Uz sākumu", func(): quit())), func(): quit())

func hostHandle(from: int, m: Dictionary) -> void:
	if hs == null: return
	var nowm = Game.now_ms()
	match str(m.get("t", "")):
		"gq":
			net.sendTo(from, {"t": "gi", "g": gameInfo.duplicate(true)})
		"hello":
			for oid in hs.profiles.keys():
				if oid != from and oid != 0 and m.get("prof") is Dictionary and hs.profiles[oid].name == m.prof.name: net.dropPeer(oid)
			var used = {}
			for pv in hs.profiles.values(): used[int(pv.slot)] = true
			var slot = 0
			while used.has(slot): slot += 1
			if m.get("slot") != null and int(m.slot) >= 0 and int(m.slot) < 4 and not used.has(int(m.slot)): slot = int(m.slot)
			var prof: Dictionary = (m.prof as Dictionary).duplicate(true); prof.slot = slot
			hs.profiles[from] = prof
			hostMergeWeekly(m.get("weekly"))
			var plist = []
			for id in hs.profiles: plist.append([id, hs.profiles[id]])
			net.sendTo(from, {"t": "welcome", "id": from, "now": nowm, "profiles": plist, "picked": hs.picked, "pickedB": hs.pickedB, "team": hs.team, "race": hs.race, "mg": hs.mg, "vehs": hostVehList(), "trail": hs.get("trail")})
			net.broadcast({"t": "join", "id": from, "prof": prof})
			net.broadcast({"t": "team", "team": hs.team})
		"pos":
			if not (m.get("p") is Array): return
			hs.positions[from] = m.p
			hostVehPos(from, m.p)
			var msg = {"t": "s", "l": [[from] + m.p]}
			for id in net.conns:
				if id != from: net.sendTo(id, msg)
			if from != 0: onMessage(msg)
		"vehTake", "vehDrop": hostVeh(from, m)
		"gift":
			if m.get("to") == from or not hs.profiles.has(m.get("to")):
				net.sendTo(from, {"t": "giftBack", "g": m.g})
				return
			var p = hs.profiles.get(from)
			net.sendTo(int(m.to), {"t": "gift", "from": from, "name": p.name if p else "?", "g": m.g})
		"prof":
			var old = hs.profiles.get(from)
			if old == null: return
			var prof2: Dictionary = (m.prof as Dictionary).duplicate(true); prof2.slot = old.slot
			hs.profiles[from] = prof2
			net.broadcast({"t": "prof", "id": from, "prof": prof2})
		"pick":
			var id = int(m.get("id", -1))
			if id < 0 or id >= world.d.mushrooms.size() or float(hs.picked.get(str(id), 0)) > nowm: return
			hs.picked[str(id)] = nowm + MUSH_RESPAWN
			net.broadcast({"t": "picked", "id": id, "until": hs.picked[str(id)], "by": from})
		"emote": net.broadcast({"t": "emote", "id": from, "text": str(m.get("text", "")).substr(0, 30)})
		"water": net.broadcast({"t": "water", "owner": m.get("owner"), "plot": m.get("plot"), "by": from})
		"raceReq":
			var r: Dictionary = hs.race
			if r.phase == "none" or r.phase == "done":
				hs.race = {"phase": "lobby", "id": int(r.get("id", 0)) + 1, "startAt": nowm + 12000, "racers": [from], "bots": 0, "results": []}
			elif r.phase == "lobby":
				if not r.racers.has(from) and r.racers.size() < 4: r.racers.append(from)
			else:
				net.sendTo(from, {"t": "toast", "text": "Sacīkstes jau notiek — pagaidi nākamās! ⏳"})
				return
			net.broadcast({"t": "race", "race": hs.race})
		"raceLeave":
			var r: Dictionary = hs.race
			if not r.has("racers") or not r.racers.has(from): return
			r.racers.erase(from)
			if r.phase == "lobby" and r.racers.is_empty(): hs.race = {"phase": "none", "id": r.id}
			net.broadcast({"t": "race", "race": hs.race})
		"raceFinish":
			var r: Dictionary = hs.race
			if r.phase != "run" or not r.racers.has(from): return
			for x in r.results: if x.get("id") == from: return
			var p = hs.profiles.get(from)
			r.results.append({"id": from, "name": p.name if p else "?", "time": maxf(1000.0, float(m.get("time", 0)))})
			net.broadcast({"t": "race", "race": r})
		_: hostActivity(from, m)

func hostPeerLeave(id: int) -> void:
	hs.profiles.erase(id)
	hs.positions.erase(id)
	hostVehLeave(id)
	hostTrailLeave(id)
	if hs.race.has("racers") and hs.race.racers.has(id):
		hs.race.racers.erase(id)
		if hs.race.phase == "lobby" and hs.race.racers.is_empty(): hs.race = {"phase": "none", "id": hs.race.id}
		net.broadcast({"t": "race", "race": hs.race})
	net.broadcast({"t": "leave", "id": id})

func botTime(botIdx: int, gridSlot: int) -> float:
	var back = (6 + floori(gridSlot / 2.0) * 5) * float(raceW.d.trackLen) / TRACK_N
	return (Game.D.RACE_LAPS * float(raceW.d.trackLen) + back) / float(BOTS[botIdx].speed) * 1000.0

func hostTick() -> void:
	var nowm = Game.now_ms()
	hostMgTick(nowm)
	hostTrailTick(nowm)
	if nowm - weekCheck > 10000:
		weekCheck = nowm
		var nt = makeTeam(nowm, null)
		if nt.w != hs.team.w:
			hs.team = nt
			net.broadcast({"t": "team", "team": hs.team})
	hostVehSave()
	var r: Dictionary = hs.race
	if r.phase == "lobby" and nowm >= float(r.startAt) - 4000:
		r.phase = "run"
		r.bots = maxi(0, mini(BOTS.size(), 4 - r.racers.size()))
		net.broadcast({"t": "race", "race": r})
	elif r.phase == "run":
		var humans_done = true
		for id in r.racers:
			var f = false
			for x in r.results: if x.get("id") == id: f = true
			if not f: humans_done = false
		var max_bot = 0.0
		for bi in int(r.bots): max_bot = maxf(max_bot, botTime(bi, r.racers.size() + bi))
		var timeout: float = float(r.startAt) + maxf(max_bot, 60000.0) + 30000.0
		if (humans_done and nowm > float(r.startAt)) or nowm > timeout:
			var final: Array = []
			for x in r.results: final.append(x.duplicate())
			for bi in int(r.bots): final.append({"bot": bi, "name": BOTS[bi].name, "time": botTime(bi, r.racers.size() + bi)})
			final.sort_custom(func(a, b2): return float(a.time) < float(b2.time))
			for id in r.racers:
				var f = false
				for x in r.results: if x.get("id") == id: f = true
				if not f:
					var p = hs.profiles.get(id)
					final.append({"id": id, "name": p.name if p else "?", "time": null})
			r.phase = "done"; r.final = final; r.endAt = nowm
			net.broadcast({"t": "race", "race": r})
	elif r.phase == "done" and nowm > float(r.endAt) + 10000:
		hs.race = {"phase": "none", "id": r.id}
		net.broadcast({"t": "race", "race": hs.race})

func onMessage(m: Dictionary) -> void:
	match str(m.get("t", "")):
		"welcome":
			myId = int(m.id)
			timeOffset = 0.0 if net.is_host else float(m.now) - Game.now_ms()
			for e in m.profiles: applyProfile(int(e[0]), e[1])
			picked = (m.get("picked", {}) as Dictionary).duplicate()
			berryPicked = (m.get("pickedB", {}) as Dictionary).duplicate()
			onTeam(m.team)
			onRace(m.race)
			if m.get("mg") != null: onMg(m.mg)
			applyVehs(m.get("vehs", []))
			if m.get("trail") != null: onTrail(m.trail, null)
		"veh": applyVeh(m.v)
		"gift": onGift(m)
		"giftBack": onGift({"g": m.g, "back": true})
		"join":
			if int(m.id) == myId: return
			applyProfile(int(m.id), m.prof)
			UI.toast("👋 %s pievienojās spēlei!" % m.prof.name, "good")
			sfx("beep")
		"leave":
			var r = remotes.get(int(m.id))
			if r != null:
				UI.toast("%s aizgāja no spēles" % r.prof.name)
				removeRemote(int(m.id))
		"prof": applyProfile(int(m.id), m.prof)
		"s": _on_positions(m.l)
		"picked":
			picked[str(m.id)] = m.until
			if int(m.by) == myId:
				var mu: Dictionary = world.d.mushrooms[int(m.id)]
				var def: Dictionary = Game.D.MUSHROOMS[mu.type]
				if def.get("poison", false):
					me.dizzy = 6.0
					sfx("bad")
					UI.toast("🤢 Fui! Mušmire ir indīga — galva griežas! Tās neēd!", "bad", 3500)
				else:
					addItem(mu.type)
					stat("mushrooms")
					sfx("pick")
					UI.toast("🍄 Atradi: %s!" % def.name)
					spawnFloat("🍄", me.pos)
		"emote": showEmote(int(m.id), str(m.text))
		"water": onFarmWater(m)
		"race": onRace(m.race)
		"toast": UI.toast(str(m.text))
		_: onActivityMessage(m)

func _on_positions(l: Array) -> void:
	var nowL = now()
	for e in l:
		if int(e[0]) == myId: continue
		var r = remotes.get(int(e[0]))
		if r == null: continue
		var z: String = ZONE_IDS[int(e[8]) if e[8] != null else 0]
		var zone_changed: bool = r.seen and r.zone != z
		if zone_changed: UI.toast("🧭 %s devās uz: %s %s" % [r.prof.name, Game.C.zones.ZONES[z].icon, Game.C.zones.ZONES[z].name])
		r.zone = z
		var st = e[12] if e.size() > 12 else null
		if zone_changed or not r.seen:
			r.buf = []; r.gap = null; r.jit = null; r.rt = null
		if st is float or st is int:
			var stf = float(st)
			var off = nowL - stf
			if r.off == null or off < float(r.off): r.off = off
			else: r.off = float(r.off) + (off - float(r.off)) * 0.02
			var late: float = off - float(r.off)
			r.jit = late if r.jit == null else lerpf(float(r.jit), late, 0.25 if late > float(r.jit) else 0.01)
			var last = r.buf[-1] if r.buf.size() > 0 else null
			if last != null and stf < float(last.t) - 1500.0:
				r.buf = []; r.gap = null; r.jit = null; r.off = off; r.rt = null; last = null
			if last == null or stf > float(last.t):
				if last != null: r.gap = stf - float(last.t) if r.gap == null else lerpf(float(r.gap), minf(400.0, stf - float(last.t)), 0.15)
				r.buf.append({"t": stf, "x": float(e[1]), "y": float(e[2]), "z": float(e[3]), "ry": float(e[4])})
				if r.buf.size() > 60: r.buf = r.buf.slice(r.buf.size() - 60)
				var n: int = r.buf.size()
				if n >= 2:
					var a: Dictionary = r.buf[n - 2]
					var c: Dictionary = r.buf[n - 1]
					var it = maxf(0.02, (float(c.t) - float(a.t)) / 1000.0)
					if Vector2(c.x - a.x, c.z - a.z).length() / it > 60.0: r.netVel = Vector3.ZERO
					else: r.netVel = Vector3((c.x - a.x) / it, (c.y - a.y) / it, (c.z - a.z) / it)
		r.target = Vector3(float(e[1]), float(e[2]), float(e[3]))
		r.tRy = float(e[4]); r.anim = ANIM[int(e[5])] if int(e[5]) < ANIM.size() else "idle"
		r.inKart = int(e[6]) == 1; r.vehCode = int(e[6])
		r.rideDriver = -1 if e[9] == null else int(e[9]); r.rideSeat = int(e[10]) if e[10] != null else 0
		r.progress = float(e[7]) if e[7] != null else 0.0
		r.vehId = e[11] if e[11] is String else ""
		if not r.seen or zone_changed:
			r.pos = r.target; r.ry = r.tRy; r.seen = true

# ======================= Mazi palīgi =======================
func updateRoomButton() -> void:
	var n = 1 + remotes.size()
	UI.set_text("btn-room", "🌲 Viens" if net.offline else "👥 %d/4 · %s" % [n, str(roomCode)])

func updateCoins() -> void: UI.set_text("coins", "🪙 %d" % int(save.coins))

func updateTeamBar() -> void:
	if zone == "s" and trail != null:
		UI.set_text("team-bar", trailBarText())
		return
	if team == null: return
	var done: bool = float(team.c) >= float(team.target)
	UI.set_text("team-bar", "🤝 Nedēļas mērķis: %s%s %d/%d" % ["🏆" if done else "", weeklyIcon(), mini(int(team.c), int(team.target)), int(team.target)])

func addCoins(n: int, silent := false) -> void:
	save.coins = int(save.coins) + n
	updateCoins()
	if not silent and n > 0: sfx("coin")

func addItem(k: String, n: int = 1) -> void: save.inv[k] = int(save.inv.get(k, 0)) + n

func stat(name: String, n: int = 1) -> void:
	save.stats[name] = int(save.stats.get(name, 0)) + n
	if team != null and name == team.stat and myId >= 0: net.toHost({"t": "teamAdd", "n": n, "w": team.w})
	checkQuests()

func checkQuests() -> void:
	for q in Game.D.QUESTS:
		if save.quests.get(q.id, false): continue
		if int(save.stats.get(q.stat, 0)) >= int(q.need):
			save.quests[q.id] = true
			addCoins(int(q.reward), true)
			sfx("j_quest"); voice("q_done", {"delay": 0.7})
			UI.toast("📜 Uzdevums izpildīts: %s! +%d🪙" % [q.text, int(q.reward)], "good", 4000)

func quit() -> void:
	persist()
	Game.flush()
	ended = true
	if net: net.close()
	get_tree().reload_current_scene()

func findZoneAction():
	var p: Vector3 = me.pos
	if fishing: return fishButton()
	if zone == "n":
		var w = winterActions()
		if w != null: return w
	var best = null
	var bd = [1e9]
	var holder = [null]
	var consider = func(d: float, mx: float, label: String, fn: Callable) -> void:
		if d < mx and d < bd[0]:
			bd[0] = d
			holder[0] = {"label": label, "fn": fn}
	var d2 = func(x: float, z: float) -> float: return Vector2(x - p.x, z - p.z).length()
	var t = now()
	if pet and not pet.get("inCar", false) and not (float(get_meta("petCd", 0.0)) > t):
		consider.call(d2.call(pet.x, pet.z) + 1.2, 2.6, "🤗 Paglaudīt: %s" % Game.D.PETS[pet.id].name, func(): petMyPet())
	if zone == FARM: farmActions(consider, d2)
	if zone == "s": trailActions(consider, d2)
	if zone == RACE:
		var ks: Dictionary = raceW.d.kartSpot
		consider.call(d2.call(ks.x, ks.z), 3.5, "🏎️ Sēsties kartā", func(): enterKart(null))
	vehicleActions(consider, d2)
	busActions(consider, d2)
	best = holder[0]
	return best

# ======================= Tukšas funkcijas (aizstāj vēlākie slāņi) =======================
var fishing = null
var mg = {}
var pet = null
var trail = null
func initGarden() -> void: pass
func buildFarm() -> void: pass
func loadFarm() -> void: terr = farmW
func unloadFarm() -> void: pass
func initQuality() -> void: pass
func applyLandQuality() -> void: pass
func autoQuality() -> void: pass
func buildMinimap() -> void: pass
func drawMinimap() -> void: pass
func initActivities() -> void: pass
func initVehicles() -> void: pass
func initBus() -> void: pass
func initTrail() -> void: pass
func initBugSpot() -> void: pass
func bindHud() -> void: pass
func updateGardenHud() -> void: pass
func buildForestExtras() -> void: pass
func stopFishing() -> void: pass
func stowCarry() -> void: pass
func leaveWinter() -> void: pass
func enterWinter() -> void: pass
func leaveTrail() -> void: pass
func enterTrail() -> void: pass
func vehicleZoneChanged(_h) -> void: pass
func mgIn() -> bool: return false
func mgFrozen() -> bool: return false
func mgHidden(_id) -> bool: return false
func vehicleBlocksExit(_warn) -> bool: return false
func makeTeam(nowm: float, _weekly) -> Dictionary: return {"w": 0, "c": 0, "target": 1, "stat": ""}
func hostInitVehs() -> void: pass
func hostInitTrail() -> void: pass
func updateKart(_dt, _mv) -> void: pass
func updateVehicle(_dt, _mv) -> void: pass
func updateRide(_dt) -> void: pass
func updateLift(_dt) -> void: pass
func updateSki(_dt, _mv, _jump) -> void: pass
func updateBus(_dt) -> void: pass
func updateSound(_dt) -> void: pass
func updateWorldObjects(_dt, _t) -> void: pass
func updateActivities(_dt, _t) -> void: pass
func updatePets(_dt) -> void: pass
func updateMg(_dt, _t) -> void: pass
func updateFishing(_dt, _t) -> void: pass
func updateBoats(_dt) -> void: pass
func updateWinter(_dt) -> void: pass
func updateFarm(_dt) -> void: pass
func updateRace(_dt, _t) -> void: pass
func updateEffects(_dt) -> void: pass
func refreshAction() -> void: pass
func doAction() -> void: pass
func sfx(_name, _opts = {}) -> void: pass
func voice(_id, _opts = {}) -> void: pass
func stopVoice() -> void: pass
func myBus() -> Dictionary: return {"speed": 0.0}
func vehCode() -> int: return 0
func rideInfo() -> Array: return [-1, 0]
func vehIdInfo() -> String: return ""
func collideIce(pos: Vector3, _r) -> Vector3: return pos
func makeKart(_color) -> Dictionary: return {}
func setKartColor3D(_kart, _color) -> void: pass
func vehicleRemote(_r, _here, _prev, _dt) -> bool: return false
func winterRemote(_r, _here) -> void: pass
func makeRod() -> Node3D: return Node3D.new()
func renderFarm(_slot, _farm) -> void: pass
func setGardenSign(_slot, _name) -> void: pass
func renderLandBorder() -> void: pass
func renderDecor(_slot, _decor) -> void: pass
func carryModel(_k) -> Node3D: return null
func removeRemoteVehicle(_r) -> void: pass
func farmView(): return null
func decorView(): return null
func exitVehicle(_forced = false) -> void: pass
func leaveRide(_msg = null) -> void: pass
func trailDropCarry(_x) -> void: pass
func hostMergeWeekly(_w) -> void: pass
func hostVehList() -> Array: return []
func hostVehPos(_from, _p) -> void: pass
func hostVeh(_from, _m) -> void: pass
func hostActivity(_from, _m) -> void: pass
func hostVehLeave(_id) -> void: pass
func hostTrailLeave(_id) -> void: pass
func hostMgTick(_now) -> void: pass
func hostTrailTick(_now) -> void: pass
func hostVehSave() -> void: pass
func onTeam(_t) -> void: pass
func onRace(_r) -> void: pass
func onMg(_m, _f = null) -> void: pass
func applyVehs(_l) -> void: pass
func applyVeh(_v) -> void: pass
func onTrail(_tr, _ev) -> void: pass
func onGift(_m) -> void: pass
func showEmote(_id, _text) -> void: pass
func onFarmWater(_m) -> void: pass
func onActivityMessage(_m) -> void: pass
func spawnFloat(_text, _pos) -> void: pass
func trailBarText() -> String: return ""
func weeklyIcon() -> String: return ""
func fishButton(): return null
func winterActions(): return null
func petMyPet() -> void: pass
func farmActions(_c, _d) -> void: pass
func trailActions(_c, _d) -> void: pass
func vehicleActions(_c, _d) -> void: pass
func busActions(_c, _d) -> void: pass
func enterKart(_spot) -> void: pass
