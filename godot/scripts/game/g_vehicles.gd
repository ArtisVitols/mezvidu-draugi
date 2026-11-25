class_name GVehicles
extends GActivities
## Kopīgie transporti (web vehicles.js): 2 mašīnas, 10 velosipēdi, sniega motocikls, roņa laiva.
## Saimnieks zina, kurš ar ko brauc un kur katrs stāv; pasažieri drauga mašīnā.

const VEH_CODE := {"car": 2, "sled": 3, "bike": 5, "boat": 7}
const RIDE_CODE := 4
const CODE_KIND := {2: "car", 3: "sled", 5: "bike", 7: "boat"}
const DRIVE_CODES := {2: true, 3: true, 5: true, 7: true}
const BOAT_Y := -0.12
const BOAT_DRAFT := 0.45
var VDEF = {}
var vehs = {}
var pendingTake = null
var vehPack: Node3D
var vehMeta = {}
var boatShoreT = 0.0
var rackNode: Node3D

func DEF(kind: String) -> Dictionary: return Game.C.vehicles.DEF[kind]

func cleanVeh(d: Dictionary, saved) -> Dictionary:
	var v = {"id": d.id, "kind": d.kind, "color": d.color, "zone": d.zone, "x": float(d.x), "z": float(d.z), "h": float(d.h), "d": -1, "obj": null}
	if saved is Dictionary and Game.C.zones.ZONES.has(saved.get("zone")):
		var bd = Terra.zone_bounds(saved.zone)
		var sx = saved.get("x")
		var sz = saved.get("z")
		if (sx is float or sx is int) and (sz is float or sz is int) and float(sx) > bd[0] - 15 and float(sx) < bd[2] + 15 and float(sz) > bd[1] - 15 and float(sz) < bd[3] + 15:
			if (d.kind != "sled" or saved.zone == "n") and (d.kind != "boat" or saved.zone == "s"):
				v.zone = saved.zone; v.x = float(sx); v.z = float(sz); v.h = float(saved.get("h", d.h))
	return v

static func slopeAt(h: Callable, x: float, z: float, heading: float, len: float, wid: float) -> Dictionary:
	var fx = sin(heading)
	var fz = cos(heading)
	var rx = cos(heading)
	var rz = -sin(heading)
	var at = func(a: float, b: float) -> float: return h.call(x + fx * a + rx * b, z + fz * a + rz * b)
	var fl: float = at.call(len, wid)
	var fr: float = at.call(len, -wid)
	var bl: float = at.call(-len, wid)
	var br: float = at.call(-len, -wid)
	return {"pitch": atan2((fl + fr) - (bl + br), 4.0 * len), "roll": atan2((fl + bl) - (fr + br), 4.0 * wid), "y": (fl + fr + bl + br) / 4.0}

func initVehicles() -> void:
	VDEF = {}
	for d in Game.C.vehicles.VEHICLES: VDEF[d.id] = d
	vehs = {}
	for d in Game.C.vehicles.VEHICLES: vehs[d.id] = cleanVeh(d, null)
	var ws = Avatar.asset("vehicles")
	vehMeta = ws.j.meta if ws and ws.j.get("meta") is Dictionary else {}

func buildForestExtras() -> void:
	super.buildForestExtras()
	_build_rack()

func _build_rack() -> void:
	var rack = Node3D.new()
	var chrome = StandardMaterial3D.new(); chrome.albedo_color = Color("#c9cdd1"); chrome.metallic = 0.95; chrome.roughness = 0.22
	var dark = StandardMaterial3D.new(); dark.albedo_color = Color("#1d1f22"); dark.roughness = 0.7
	var pipe = func(len: float) -> CylinderMesh:
		var c = CylinderMesh.new(); c.top_radius = 0.035; c.bottom_radius = 0.035; c.height = len; c.radial_segments = 8; return c
	var bar = MeshInstance3D.new(); bar.mesh = pipe.call(5.4); bar.material_override = chrome; bar.rotation.x = PI / 2; bar.position = Vector3(0.95, 0.32, 1.875); rack.add_child(bar)
	for i in 4:
		var lp = MeshInstance3D.new(); var tm = TorusMesh.new(); tm.inner_radius = 0.29; tm.outer_radius = 0.35; tm.rings = 16; tm.ring_segments = 6
		lp.mesh = tm; lp.material_override = chrome; lp.rotation = Vector3(PI / 2, 0, 0); lp.position = Vector3(0.95, 0.32, i * 1.25); rack.add_child(lp)
	for zz in [-0.8, 4.55]:
		var leg = MeshInstance3D.new(); leg.mesh = pipe.call(0.34); leg.material_override = chrome; leg.position = Vector3(0.95, 0.17, zz); rack.add_child(leg)
	var post = MeshInstance3D.new(); var pc = CylinderMesh.new(); pc.top_radius = 0.05; pc.bottom_radius = 0.05; pc.height = 1.9; post.mesh = pc; post.material_override = dark
	post.position = Vector3(0.95, 0.95, -1.2); rack.add_child(post)
	var plate = MeshInstance3D.new(); var pm = CylinderMesh.new(); pm.top_radius = 0.34; pm.bottom_radius = 0.34; pm.height = 0.04; plate.mesh = pm
	var bm = StandardMaterial3D.new(); bm.albedo_color = Color("#2f6fd6"); plate.material_override = bm; plate.rotation.z = PI / 2; plate.position = Vector3(0.95, 1.9, -1.2); rack.add_child(plate)
	var sign = float_tag("🚲 Velosipēdi", 40, Color.WHITE); sign.outline_modulate = Color(0.18, 0.43, 0.84, 0.9); sign.outline_size = 22
	sign.position = Vector3(0.95, 2.55, -1.2); rack.add_child(sign)
	var BR: Dictionary = Game.C.world.BIKE_RACK
	rack.position = Vector3(BR.x, world.get_height(BR.x, float(BR.z) + 1.9), BR.z)
	scene.add_child(rack)

func hostInitVehs() -> void:
	var saved: Dictionary = save.vehs if save.get("vehs") is Dictionary else {}
	hs.vehs = {}
	for d in Game.C.vehicles.VEHICLES: hs.vehs[d.id] = cleanVeh(d, saved.get(d.id))

func hostVehList() -> Array:
	var out = []
	for v in hs.vehs.values():
		var c: Dictionary = v.duplicate(); c.erase("obj"); out.append(c)
	return out

## transporta modelis: {kind, root, body, wheels, steer, seat, seats, petSpots, wheelR, crank, pedal, oars, shadow}
func makeVehObj(id: String) -> Dictionary:
	if vehPack == null: vehPack = Avatar.asset("vehicles").build()
	var src: Node3D = null
	for c in vehPack.get_children(): if str(c.get_meta("n", "")) == "veh:" + id: src = c
	var root: Node3D = src.duplicate() if src else Node3D.new()
	return _veh_dict(root, vehMeta.get(id, {}), str(VDEF[id].kind))

static func _veh_dict(root: Node3D, meta: Dictionary, kind: String) -> Dictionary:
	var o = {"kind": kind, "root": root, "body": null, "wheels": [], "steer": [], "seat": null, "seats": [], "petSpots": [], "wheelR": float(meta.get("wheelR", 1.0)),
		"crank": null, "pedal": meta.get("pedal"), "oars": [], "shadow": null, "visY": null}
	var seats = {}
	var pets = {}
	for n in root.find_children("*", "Node3D", true, false):
		var nm = str(n.get_meta("n", ""))
		if nm == "body" and o.body == null: o.body = n
		elif nm == "wheel": o.wheels.append(n)
		elif nm == "steer": o.steer.append(n)
		elif nm == "crank": o.crank = n
		elif nm == "oarR" or nm == "oarL": o.oars.append(n)
		elif nm == "shadow": o.shadow = n
		elif nm.begins_with("seat:"): seats[int(nm.substr(5))] = n
		elif nm.begins_with("pet:"): pets[int(nm.substr(4))] = n
	var ks = seats.keys(); ks.sort()
	for k in ks: o.seats.append(seats[k])
	var kp = pets.keys(); kp.sort()
	for k in kp: o.petSpots.append(pets[k])
	o.seat = o.seats[0] if o.seats.size() else root
	if o.body == null: o.body = root
	(o.body as Node3D).rotation_order = EULER_ORDER_YXZ
	return o

func vehObj(id: String):
	var v = vehs.get(id)
	if v == null: return null
	if v.obj == null or not is_instance_valid(v.obj.root): v.obj = makeVehObj(id)
	return v.obj

func applyVehs(l) -> void:
	for nv in (l if l != null else []): applyVeh(nv)

func applyVeh(nv) -> void:
	if not (nv is Dictionary) or not VDEF.has(nv.get("id")): return
	if not vehs.has(nv.id): vehs[nv.id] = cleanVeh(VDEF[nv.id], null)
	var v: Dictionary = vehs[nv.id]
	var was_mine: bool = int(v.d) == myId and me.veh != null and me.veh.id == nv.id
	v.zone = nv.zone; v.x = float(nv.x); v.z = float(nv.z); v.h = float(nv.h); v.d = int(nv.d)
	if int(nv.d) == myId and pendingTake != null and pendingTake.id == nv.id:
		pendingTake = null; enterVehicle(nv.id)
	elif pendingTake != null and pendingTake.id == nv.id and int(nv.d) != myId and int(nv.d) != -1:
		pendingTake = null; UI.toast("%s Ar to jau brauc kāds cits!" % DEF(v.kind).icon, "bad")
	if was_mine and int(nv.d) != myId: exitVehicle(true)
	updateParked()

func updateParked() -> void:
	if vehs.is_empty() or terr == null: return
	for id in vehs:
		var v: Dictionary = vehs[id]
		if int(v.d) != -1: continue
		if v.zone != zone:
			if v.obj != null and is_instance_valid(v.obj.root) and v.obj.root.get_parent(): v.obj.root.get_parent().remove_child(v.obj.root)
			continue
		var o: Dictionary = vehObj(id)
		if o.root.get_parent() != stage:
			if o.root.get_parent(): o.root.get_parent().remove_child(o.root)
			stage.add_child(o.root)
		var D = DEF(v.kind)
		if v.kind == "boat":
			o.root.position = Vector3(v.x, BOAT_Y, v.z); o.root.rotation.y = v.h; o.body.rotation = Vector3.ZERO; o.root.visible = true; o.visY = null
			continue
		var sl = slopeAt(func(x, z): return terr.get_height(x, z), v.x, v.z, v.h, float(D.len), float(D.wid))
		o.root.position = Vector3(v.x, sl.y, v.z)
		o.root.rotation.y = v.h
		o.body.rotation = Vector3(-sl.pitch, 0, sl.roll + (0.12 if v.kind == "bike" else 0.0))
		if o.shadow: o.shadow.position.y = 0.04
		o.root.visible = true
		o.visY = null

func vehicleActions(consider, d2) -> void:
	if me.veh != null or me.ride != null or me.ski != null or me.lift != null or me.carry != null: return
	var near = func(d: float, kind: String) -> float: return 0.2 * d / 3.2 if d < (3.2 if kind == "car" else 2.4) else d
	for r in remotes.values():
		if r.vehObj == null or str(r.zone) != zone or r.vehObj.seats.size() < 2: continue
		if Vector2(r.netVel.x, r.netVel.z).length() > 4: continue
		var rr: Dictionary = r
		consider.call(near.call(d2.call(r.pos.x, r.pos.z), r.vehObj.kind), 4.2 if r.vehObj.kind == "car" else 3.2, "%s Braukt līdzi: %s" % [DEF(r.vehObj.kind).icon, r.prof.name], func(): joinRide(rr))
	for id in vehs:
		var v: Dictionary = vehs[id]
		if int(v.d) != -1 or v.zone != zone: continue
		var k: String = v.kind
		var iid: String = id
		if k == "boat":
			var d: float = d2.call(v.x, v.z)
			if boatOk(): consider.call(0.1 if d < 3.6 else d, 3.6, "🚣 Sēsties laivā: %s" % VDEF[id].name, func(): requestVehicle(iid))
			else: consider.call(0.1 if d < 3.6 else d, 3.6, "🦭 Roņa laiva", func(): UI.toast("🦭 Šī ir Roņa Viļņuka laiva — vispirms aprunājies ar viņu pludmalē!"))
			continue
		consider.call(near.call(d2.call(v.x, v.z), k), 4.2 if k == "car" else (2.6 if k == "bike" else 3.2), "%s %s: %s" % [DEF(k).icon, "Braukt" if k == "bike" else "Sēsties", VDEF[id].name], func(): requestVehicle(iid))

func requestVehicle(id: String) -> void:
	var v = vehs.get(id)
	if v == null or int(v.d) != -1 or me.veh != null: return
	pendingTake = {"id": id, "t": Time.get_ticks_msec()}
	net.toHost({"t": "vehTake", "id": id})
	get_tree().create_timer(4.0).timeout.connect(func():
		if pendingTake != null and pendingTake.id == id:
			pendingTake = null; UI.toast("Neizdevās iekāpt — mēģini vēlreiz"))

func _show_ride_buttons(on: bool) -> void:
	UI.show_id("btn-exit-kart", on)
	UI.show_id("btn-jump", not on)

func enterVehicle(id: String) -> void:
	var v = vehs.get(id)
	if v == null or me.veh != null or me.inKart or me.ride != null: return
	if fishing != null: stopFishing()
	var obj: Dictionary = vehObj(id)
	var kind: String = v.kind
	if obj.root.get_parent() != stage:
		if obj.root.get_parent(): obj.root.get_parent().remove_child(obj.root)
		stage.add_child(obj.root)
	obj.root.visible = true
	me.veh = {"id": id, "kind": kind, "obj": obj, "speed": 0.0, "heading": float(v.h), "steer": 0.0, "vy": 0.0, "air": false, "visY": null, "bumpT": 0.0, "thr": 0.0}
	if kind == "sled": stat("sledRides")
	me.pos = Vector3(v.x, WATER_Y if kind == "boat" else terr.get_height(v.x, v.z), v.z)
	avatar.root.get_parent().remove_child(avatar.root)
	obj.seat.add_child(avatar.root)
	avatar.root.position = Vector3.ZERO; avatar.root.rotation = Vector3.ZERO
	if avatar.shadow: avatar.shadow.visible = false
	me.state = "sit"
	cam.yaw = float(v.h) + PI
	_show_ride_buttons(true)
	sfx({"bike": "bike_bell", "sled": "st_snow", "boat": "splash_s"}.get(kind, "car_door"), {"vol": 0.7})
	if kind == "boat":
		me.vy = 0.0
		UI.toast("🚣 Airē ar ⛽, atpakaļ — 🛑, stūrē ar ◀ ▶. Laiva brauc tikai pa ūdeni — pie krasta izkāp!" if (trail != null and trail.get("boat", false)) else "🚣 Tu esi laivā! Airē ar ⛽, stūrē ar ◀ ▶ un brauc uz 🦭 piestātni starp bojām!", "good", 5000)
		return
	var msg = {"car": "🚙 Kreisajā pusē ⛽ gāze un 🛑 bremze/atpakaļgaita, labajā ◀ ▶ stūre. Pa grants ceļu var aizbraukt uz citām zemēm!",
		"bike": "🚲 Min pedāļus ar ⛽, bremzē ar 🛑, stūrē ar ◀ ▶. Groziņā var braukt tavs mājdzīvnieks!"}.get(kind, "🛷 Sniega motocikls brauc pa visu sniegu un kalnos! Kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre.")
	UI.toast(msg, "good", 5000)

func exitVehicle(forced = false) -> void:
	var v = me.veh
	if v == null: return
	v.obj.seat.remove_child(avatar.root)
	stage.add_child(avatar.root)
	if avatar.shadow: avatar.shadow.visible = true
	avatar.root.rotation = Vector3(0, me.heading, 0)
	var h: float = v.heading
	var side = Vector2(cos(h), -sin(h))
	var st = vehs.get(v.id)
	var r2 = func(x: float) -> float: return roundf(x * 100.0) / 100.0
	if st != null:
		st.zone = zone; st.x = r2.call(me.pos.x); st.z = r2.call(me.pos.z); st.h = r2.call(h)
		if not forced: st.d = -1
	if not forced: net.toHost({"t": "vehDrop", "id": v.id, "zone": zone, "x": r2.call(me.pos.x), "z": r2.call(me.pos.z), "h": r2.call(h)})
	var out: float = float(DEF(v.kind).radius) + 0.6
	me.pos.x += side.x * out; me.pos.z += side.y * out
	if terr.has_method("reset_lp"): terr.reset_lp()
	me.pos = terr.collide(me.pos, 0.4)
	me.pos.y = terr.ground_at(me.pos.x, me.pos.z) + 0.3
	if v.kind == "boat":
		me.pos.y = maxf(me.pos.y, WATER_Y - 0.75); me.vy = 0.0; sfx("splash_s", {"vol": 0.6})
	me.heading = h
	me.veh = null; me.state = "idle"
	avatar.pedal = null
	_show_ride_buttons(false)
	updateParked()

func updateVehicle(dt, mv) -> void:
	if me.veh.kind == "boat":
		updateBoat(dt, mv)
		return
	var v: Dictionary = me.veh
	var D = DEF(v.kind)
	var T = terr
	var H = func(x: float, z: float) -> float: return T.get_height(x, z)
	var ground: float = H.call(me.pos.x, me.pos.z)
	var on_road: bool = T.road_dist(me.pos.x, me.pos.z) < 4.2
	var snow = zone == "n"
	var in_water: bool = T.is_world and ground < WATER_Y - 0.4 and zone != FARM
	var mx: float = float(D.road) if on_road else (float(D.snowOff) if snow else float(D.off))
	if in_water: mx = 3.0
	if me.iceCream > 0: mx *= 1.08
	var sl = slopeAt(H, me.pos.x, me.pos.z, v.heading, float(D.len), float(D.wid))
	if not v.air:
		var thr: float = mv.y
		v.thr = thr
		if thr > 0.1: v.speed += float(D.accel) * thr * dt * (2.0 if v.speed < 0 else 1.0)
		elif thr < -0.1: v.speed -= (float(D.brake) if v.speed > 0.5 else float(D.accel) * 0.6) * -thr * dt
		else: v.speed *= 1.0 - (0.6 if (snow and v.kind == "sled") else (0.7 if v.kind == "bike" else 1.1)) * dt
		v.speed -= 9.8 * sin(sl.pitch) * (0.45 if v.kind == "sled" else 0.6) * dt
		if v.speed > mx: v.speed = lerpf(v.speed, mx, 1.0 - exp(-dt * 2.5))
		v.speed = clampf(v.speed, -3.0 if v.kind == "bike" else -6.0, 30.0)
		v.steer = lerpf(v.steer, -mv.x, 1.0 - exp(-dt * 8.0))
		v.heading += v.steer * float(D.turn) * clampf(v.speed / 4.0, -1.0, 1.0) * (1.0 - minf(0.45, absf(v.speed) / 50.0)) * dt
	var ox: float = me.pos.x
	var oz: float = me.pos.z
	me.pos.x += sin(v.heading) * v.speed * dt
	me.pos.z += cos(v.heading) * v.speed * dt
	me.pos = T.collide(me.pos, float(D.radius))
	if T.hit:
		var moved = Vector2(me.pos.x - ox, me.pos.z - oz).length() / maxf(dt, 1e-4)
		var want = absf(v.speed)
		if moved < want * 0.6:
			if want > 6 and not (v.bumpT > 0):
				sfx("hit", {"vol": 0.9, "rate": 0.8}); spawnFloat("💥", me.pos); v.bumpT = 1.0
			v.speed = signf(v.speed) * maxf(minf(want, 2.5), want * 0.6)
	v.bumpT -= dt
	if zone == FOREST: me.pos = collideIce(me.pos, float(D.radius))
	var sl2 = slopeAt(H, me.pos.x, me.pos.z, v.heading, float(D.len), float(D.wid))
	var g2: float = WATER_Y - 0.35 if in_water else sl2.y
	var sdt = maxf(dt, 1e-3)
	if v.air:
		v.vy -= 20.0 * dt
		me.pos.y += v.vy * dt
		if me.pos.y <= g2:
			if v.vy < -6: sfx("hit", {"vol": 0.6, "rate": 0.7})
			me.pos.y = g2; v.vy = 0.0; v.air = false
	else:
		var gv: float = (g2 - me.pos.y) / sdt
		if v.kind == "sled" and absf(v.speed) > 9 and gv < v.vy - 20.0 * dt - 4.0:
			v.air = true; v.vy -= 20.0 * dt; me.pos.y += v.vy * dt
		else:
			me.pos.y = g2; v.vy = lerpf(v.vy, gv, 0.5)
	var o: Dictionary = v.obj
	v.visY = me.pos.y if v.visY == null else lerpf(float(v.visY), me.pos.y, 1.0 - exp(-dt * 14.0))
	if not v.air: v.visY = maxf(float(v.visY), me.pos.y - 0.005)
	o.root.position = Vector3(me.pos.x, float(v.visY) + (0.03 if v.kind == "bike" else 0.0), me.pos.z)
	o.root.rotation.y = v.heading
	var k = 1.0 - exp(-dt * (2.0 if v.air else 6.0))
	var lean: float = (-v.steer * minf(1.0, absf(v.speed) / 6.0) * 0.3) if v.kind == "bike" else (-v.steer * minf(1.0, absf(v.speed) / 15.0) * 0.05)
	o.body.rotation.x = lerpf(o.body.rotation.x, -0.12 if v.air else -sl2.pitch, k)
	o.body.rotation.z = lerpf(o.body.rotation.z, (0.0 if (v.air or v.kind == "bike") else sl2.roll) + lean, k)
	for w in o.wheels: w.rotation.x += v.speed * dt / o.wheelR
	if o.crank: o.crank.rotation.x += v.speed * dt / o.wheelR * 0.45
	avatar.pedal = ({"cy": o.pedal.cy, "cz": o.pedal.cz, "r": o.pedal.r, "a": o.crank.rotation.x} if (o.pedal != null and o.crank) else null)
	for s in o.steer: s.rotation.y = v.steer * (0.35 if v.kind == "bike" else 0.45)
	if o.shadow: o.shadow.position.y = g2 - float(v.visY) + 0.04
	me.heading = v.heading
	me.state = "sit"
	avatar.animate(dt, "bike" if v.kind == "bike" else "sit", absf(v.speed))
	avatar.head.rotation.y = -v.steer * 0.35

func updateBoat(dt: float, mv: Dictionary) -> void:
	var v: Dictionary = me.veh
	var D = DEF("boat")
	var T = terr
	var thr: float = mv.y
	v.thr = thr
	if thr > 0.1: v.speed += float(D.accel) * thr * dt
	elif thr < -0.1: v.speed -= (float(D.brake) if v.speed > 0.3 else float(D.accel) * 0.7) * -thr * dt
	else: v.speed *= 1.0 - 0.55 * dt
	v.speed = clampf(v.speed, -2.4, float(D.road))
	v.steer = lerpf(v.steer, -mv.x, 1.0 - exp(-dt * 5.0))
	v.heading += v.steer * float(D.turn) * (0.45 + 0.55 * minf(1.0, absf(v.speed) / 3.0)) * (-1.0 if v.speed < -0.2 else 1.0) * dt
	var ox: float = me.pos.x
	var oz: float = me.pos.z
	var dir = -1.0 if v.speed < 0 else 1.0
	me.pos.x += sin(v.heading) * v.speed * dt
	me.pos.z += cos(v.heading) * v.speed * dt
	me.pos = T.collide(me.pos, float(D.radius))
	var deep = func(x: float, z: float) -> bool: return T.get_height(x, z) < WATER_Y - BOAT_DRAFT
	var fx: float = me.pos.x + sin(v.heading) * float(D.len) * dir
	var fz: float = me.pos.z + cos(v.heading) * float(D.len) * dir
	if not deep.call(me.pos.x, me.pos.z) or not deep.call(fx, fz):
		me.pos.x = ox; me.pos.z = oz
		if absf(v.speed) > 1.2 and not (v.bumpT > 0):
			sfx("splash_s", {"vol": 0.5, "rate": 0.8}); v.bumpT = 1.5
			if not (boatShoreT > Time.get_ticks_msec()):
				boatShoreT = Time.get_ticks_msec() + 8000
				UI.toast("🏖️ Te ir sekls — laiva tālāk netiek. Izkāp ar pogu vai brauc atpakaļ!")
		v.speed = 0.0
	v.bumpT -= dt
	me.pos.y = WATER_Y
	me.vy = 0.0
	boatPose(v.obj, me.pos.x, me.pos.z, v.heading, absf(v.speed), v.steer, dt, Time.get_ticks_msec() / 1000.0, absf(thr) > 0.1 or absf(v.steer) > 0.3)
	me.heading = v.heading
	me.state = "sit"
	avatar.pedal = null
	avatar.animate(dt, "sit", 0.0)

func boatPose(o: Dictionary, x: float, z: float, h: float, sp: float, steer: float, dt: float, t: float, rowing: bool) -> void:
	o.root.position = Vector3(x, BOAT_Y + sin(t * 1.7 + x * 0.3) * 0.035, z)
	o.root.rotation.y = h
	o.body.rotation.x = sin(t * 1.3 + z * 0.2) * 0.025 - minf(0.04, sp * 0.006)
	o.body.rotation.z = sin(t * 1.1) * 0.03 - steer * minf(1.0, sp / 4.0) * 0.05
	o.rowT = float(o.get("rowT", 0.0)) + dt * ((2.6 + sp * 0.35) if (rowing or sp > 0.4) else 0.0)
	var ph: float = o.rowT
	var was: float = float(o.get("rowS", 0.0))
	var nw = sin(ph)
	for oar in o.oars:
		var s = -1.0 if str(oar.get_meta("n", "")) == "oarR" else 1.0
		oar.rotation.y = s * sin(ph) * 0.5
		oar.rotation.z = s * (cos(ph) * 0.14 + 0.02)
	if rowing and was < 0 and nw >= 0 and absf(x - me.pos.x) < 30 and absf(z - me.pos.z) < 30:
		sfx("splash_s", {"vol": 0.18, "rate": 1.2 + randf() * 0.2, "at": Vector2(x, z)})
	o.rowS = nw

func updateBoats(dt) -> void:
	if vehs.is_empty() or zone != "s": return
	var t = Time.get_ticks_msec() / 1000.0
	for id in vehs:
		var v: Dictionary = vehs[id]
		if v.kind != "boat" or int(v.d) != -1 or v.zone != "s" or v.obj == null or v.obj.root.get_parent() == null: continue
		boatPose(v.obj, v.x, v.z, v.h, 0.0, 0.0, dt, t, false)

func vehicleBlocksExit(warn) -> bool:
	if me.veh != null and me.veh.kind == "boat":
		warn.call("🚣 Laiva peld tikai jūrā!"); return true
	if me.veh != null and me.veh.kind == "sled":
		warn.call("🛷 Sniega motocikls brauc tikai pa sniegu — izkāp un ej kājām vai ņem mašīnu!"); return true
	return false

func vehicleZoneChanged(heading) -> void:
	var v = me.veh
	if v != null:
		if heading != null: v.heading = float(heading)
		v.vy = 0.0; v.air = false; v.visY = null; v.speed = minf(v.speed, 8.0)
		if v.kind == "car": stat("carTrips")
		var st = vehs.get(v.id)
		if st != null: st.zone = zone
		if v.obj.root.get_parent() != stage:
			if v.obj.root.get_parent(): v.obj.root.get_parent().remove_child(v.obj.root)
			stage.add_child(v.obj.root)
	updateParked()

func vehCode() -> int:
	if me.bus != null: return int(Game.C.bus.BUS_CODE)
	if me.veh != null: return int(VEH_CODE[me.veh.kind])
	if me.ride != null: return RIDE_CODE
	return 0
func vehIdInfo() -> String: return str(me.veh.id) if me.veh != null else ""
func rideInfo() -> Array:
	if me.ride != null: return [me.ride.driver, me.ride.seat]
	if me.bus != null: return [-1, me.bus.net]
	return [-1, 0]

func takenSeats(driver_id: int, except_id: int) -> Dictionary:
	var t = {0: true}
	for r in remotes.values():
		if r.id != except_id and int(r.vehCode) == RIDE_CODE and int(r.rideDriver) == driver_id: t[int(r.rideSeat)] = true
	if except_id != myId and me.ride != null and int(me.ride.driver) == driver_id: t[int(me.ride.seat)] = true
	return t

func joinRide(r: Dictionary) -> void:
	if me.veh != null or me.inKart or me.ride != null or r.vehObj == null: return
	var taken = takenSeats(r.id, myId)
	var seat = -1
	for i in r.vehObj.seats.size():
		if not taken.has(i):
			seat = i; break
	if seat < 0:
		UI.toast("%s Nav brīvu vietu — visas aizņemtas!" % DEF(r.vehObj.kind).icon, "bad"); return
	if fishing != null: stopFishing()
	me.ride = {"driver": r.id, "seat": seat, "kind": r.vehObj.kind}
	if avatar.shadow: avatar.shadow.visible = false
	me.state = "sit"
	_show_ride_buttons(true)
	sfx("car_door", {"vol": 0.7})
	UI.toast("%s Brauc līdzi: %s! Vada %s, tu vari skatīties apkārt." % [DEF(r.vehObj.kind).icon, r.prof.name, r.prof.name], "good", 4000)

func leaveRide(msg = null) -> void:
	var R = me.ride
	if R == null: return
	me.ride = null
	if avatar.root.get_parent(): avatar.root.get_parent().remove_child(avatar.root)
	stage.add_child(avatar.root)
	avatar.root.rotation = Vector3(0, me.heading, 0)
	if avatar.shadow: avatar.shadow.visible = true
	var side = 1.0 if int(R.seat) % 2 == 0 else -1.0
	var h: float = me.heading
	me.pos.x += cos(h) * 2.3 * side; me.pos.z -= sin(h) * 2.3 * side
	if terr.has_method("reset_lp"): terr.reset_lp()
	me.pos = terr.collide(me.pos, 0.4)
	me.pos.y = terr.ground_at(me.pos.x, me.pos.z) + 0.3
	if R.kind == "boat":
		me.pos.y = maxf(me.pos.y, WATER_Y - 0.75); me.vy = 0.0
	avatar.root.position = me.pos
	me.state = "idle"
	_show_ride_buttons(false)
	if msg != null: UI.toast(str(msg))

func updateRide(dt) -> void:
	var R: Dictionary = me.ride
	var r = remotes.get(R.driver)
	if r == null or not DRIVE_CODES.has(int(r.vehCode)):
		leaveRide("🚶 Vadītājs izkāpa — tu arī izkāpi"); return
	var rz: String = str(r.zone)
	if rz != zone:
		if not zoneBusy:
			var side = ""
			for sd in ["n", "e", "s", "w"]: if Terra.neighbour(zone, sd) == rz: side = sd
			if side != "": travel(rz, side)
			else: leaveRide()
		return
	for o in remotes.values():
		if int(o.vehCode) == RIDE_CODE and int(o.rideDriver) == int(R.driver) and int(o.rideSeat) == int(R.seat) and int(o.id) < myId:
			var taken = takenSeats(R.driver, myId)
			var n: int = r.vehObj.seats.size() if r.vehObj != null else 2
			var free = -1
			for i in range(1, n):
				if not taken.has(i):
					free = i; break
			if free < 0:
				leaveRide("Mašīnā vairs nav vietas"); return
			R.seat = free
	me.pos = r.pos
	me.heading = r.ry
	me.vy = 0.0; me.onGround = true
	var seat_obj = r.vehObj.seats[int(R.seat)] if (r.vehObj != null and int(R.seat) < r.vehObj.seats.size()) else null
	if seat_obj != null and avatar.root.get_parent() != seat_obj:
		avatar.root.get_parent().remove_child(avatar.root)
		seat_obj.add_child(avatar.root)
		avatar.root.position = Vector3.ZERO; avatar.root.rotation = Vector3.ZERO
	me.state = "sit"
	avatar.animate(dt, "sit", 0.0)

func vehicleRemote(r, here, prev, dt) -> bool:
	if busRemote(r, here, dt): return true
	var kind = CODE_KIND.get(int(r.vehCode))
	var vid = r.vehId if (kind != null and str(r.vehId) != "" and vehs.has(r.vehId)) else null
	if r.get("lastVid") != null and r.lastVid != vid:
		var old = vehs.get(r.lastVid)
		if old != null and int(old.d) == int(r.id):
			old.d = -1; old.zone = str(r.zone); old.x = r.pos.x; old.z = r.pos.z; old.h = r.ry
		r.lastVid = null
	if r.vehObj != null and (vid == null or r.vehObj != vehs[vid].obj or not here):
		if not (me.veh != null and me.veh.obj == r.vehObj) and r.vehObj.root.get_parent(): r.vehObj.root.get_parent().remove_child(r.vehObj.root)
		r.vehObj = null
		updateParked()
	if vid != null: r.lastVid = vid
	if int(r.vehCode) == RIDE_CODE and here:
		var car = null
		if int(r.rideDriver) == myId: car = me.veh.obj if me.veh != null else null
		else:
			var d = remotes.get(int(r.rideDriver))
			car = d.vehObj if d != null else null
		var seat_obj = car.seats[int(r.rideSeat)] if (car != null and int(r.rideSeat) < car.seats.size()) else null
		if seat_obj != null:
			if r.avatar.root.get_parent() != seat_obj:
				r.avatar.root.get_parent().remove_child(r.avatar.root)
				seat_obj.add_child(r.avatar.root)
				r.avatar.root.position = Vector3.ZERO; r.avatar.root.rotation = Vector3.ZERO
			if r.avatar.shadow: r.avatar.shadow.visible = false
			r.avatar.root.visible = true
			r.avatar.animate(dt, "sit", 0.0)
			winterRemote(r, here)
			return true
	if vid == null:
		if r.kart == null and r.avatar.root.get_parent() != stage:
			r.avatar.root.get_parent().remove_child(r.avatar.root)
			stage.add_child(r.avatar.root)
			if r.avatar.shadow: r.avatar.shadow.visible = true
			r.avatar.root.rotation = Vector3(0, r.ry, 0)
		return false
	var st: Dictionary = vehs[vid]
	st.d = r.id; st.zone = str(r.zone)
	if not here:
		r.avatar.root.visible = false
		return true
	if r.vehObj == null:
		r.vehObj = vehObj(vid)
		if r.vehObj.root.get_parent() != stage:
			if r.vehObj.root.get_parent(): r.vehObj.root.get_parent().remove_child(r.vehObj.root)
			stage.add_child(r.vehObj.root)
		r.vehObj.root.visible = true
		r.vehObj.visY = null
	if r.avatar.root.get_parent() != r.vehObj.seat:
		r.avatar.root.get_parent().remove_child(r.avatar.root)
		r.vehObj.seat.add_child(r.avatar.root)
		r.avatar.root.position = Vector3.ZERO; r.avatar.root.rotation = Vector3.ZERO
		if r.avatar.shadow: r.avatar.shadow.visible = false
	r.avatar.root.visible = true
	var o: Dictionary = r.vehObj
	var H = func(x: float, z: float) -> float: return terr.get_height(x, z)
	if kind == "boat":
		var sp = prev.distance_to(r.pos) / maxf(dt, 0.001)
		var dh: float = r.ry - (r.ry if r.get("prevRy") == null else float(r.prevRy))
		dh = atan2(sin(dh), cos(dh)); r.prevRy = r.ry
		r.steerS = lerpf(float(r.get("steerS", 0.0)), clampf(dh / maxf(dt, 1e-3), -1.0, 1.0), 1.0 - exp(-dt * 6.0))
		boatPose(o, r.pos.x, r.pos.z, r.ry, sp, r.steerS, dt, Time.get_ticks_msec() / 1000.0, sp > 0.3 or absf(r.steerS) > 0.2)
		r.avatar.pedal = null
		r.avatar.animate(dt, "sit", 0.0)
		return true
	var D = DEF(kind)
	var sl = slopeAt(H, r.pos.x, r.pos.z, r.ry, float(D.len), float(D.wid))
	var ty: float = maxf(sl.y, r.pos.y) if kind == "sled" else sl.y
	o.visY = ty if o.visY == null else lerpf(float(o.visY), ty, 1.0 - exp(-dt * 14.0))
	o.visY = maxf(float(o.visY), ty - 0.005)
	o.root.position = Vector3(r.pos.x, float(o.visY) + (0.03 if kind == "bike" else 0.0), r.pos.z)
	o.root.rotation.y = r.ry
	var k = 1.0 - exp(-dt * 6.0)
	var dh2: float = r.ry - (r.ry if r.get("prevRy") == null else float(r.prevRy))
	dh2 = atan2(sin(dh2), cos(dh2))
	r.prevRy = r.ry
	var sp2 = prev.distance_to(r.pos) / maxf(dt, 0.001)
	var steer = clampf(dh2 / maxf(dt, 1e-3) / maxf(1.0, sp2 * 0.3), -1.0, 1.0)
	r.steerS = lerpf(float(r.get("steerS", 0.0)), steer, 1.0 - exp(-dt * 6.0))
	var lean: float = (-r.steerS * minf(1.0, sp2 / 6.0) * 0.3) if kind == "bike" else 0.0
	o.body.rotation.x = lerpf(o.body.rotation.x, -sl.pitch, k)
	o.body.rotation.z = lerpf(o.body.rotation.z, (0.0 if kind == "bike" else sl.roll) + lean, k)
	for w in o.wheels: w.rotation.x += sp2 * dt / o.wheelR
	if o.crank: o.crank.rotation.x += sp2 * dt / o.wheelR * 0.45
	r.avatar.pedal = ({"cy": o.pedal.cy, "cz": o.pedal.cz, "r": o.pedal.r, "a": o.crank.rotation.x} if (o.pedal != null and o.crank) else null)
	for s in o.steer: s.rotation.y = r.steerS * 0.35
	if o.shadow: o.shadow.position.y = sl.y - float(o.visY) + 0.04
	r.avatar.animate(dt, "bike" if kind == "bike" else "sit", sp2)
	winterRemote(r, here)
	return true

func removeRemoteVehicle(r) -> void:
	if r.vehObj != null:
		if r.vehObj.root.get_parent(): r.vehObj.root.get_parent().remove_child(r.vehObj.root)
		r.vehObj = null

func vehMarkers() -> Array:
	var out = []
	for id in vehs:
		var v: Dictionary = vehs[id]
		var z: String = v.zone
		var x: float = v.x
		var zz: float = v.z
		if int(v.d) == myId and me.veh != null and me.veh.id == id:
			z = zone; x = me.pos.x; zz = me.pos.z
		elif int(v.d) != -1:
			var r = remotes.get(int(v.d))
			if r != null:
				z = str(r.zone); x = r.pos.x; zz = r.pos.z
		out.append({"id": id, "kind": v.kind, "color": v.color, "zone": z, "x": x, "z": zz, "driven": int(v.d) != -1})
	return out

# ---------- saimnieka puse ----------
func hostVeh(from, m) -> void:
	var v = hs.vehs.get(m.get("id")) if hs.get("vehs") != null else null
	if v == null: return
	if m.t == "vehTake":
		if int(v.d) != -1 and hs.profiles.has(int(v.d)) and int(v.d) != from:
			net.sendTo(from, {"t": "veh", "v": _vcopy(v)}); return
		if v.kind == "boat" and not hostBoatOk():
			net.sendTo(from, {"t": "veh", "v": _vcopy(v)}); return
		for o in hs.vehs.values():
			if int(o.d) == from and o != v:
				o.d = -1; net.broadcast({"t": "veh", "v": _vcopy(o)})
		v.d = from
	elif m.t == "vehDrop":
		if int(v.d) != from: return
		v.d = -1
		if Game.C.zones.ZONES.has(m.get("zone")) and (m.get("x") is float or m.get("x") is int) and (v.kind != "boat" or m.zone == "s"):
			v.zone = m.zone; v.x = float(m.x); v.z = float(m.z); v.h = float(m.get("h", v.h))
		hostBoatCheck(v)
		if v.kind == "boat" and not hostBoatOk(): hostBoatPark(v)
	vehDirty = true
	net.broadcast({"t": "veh", "v": _vcopy(v)})

func _vcopy(v: Dictionary) -> Dictionary:
	var c = v.duplicate(); c.erase("obj"); return c

var vehDirty = false
func hostVehPos(from, p) -> void:
	if hs.get("vehs") == null or p.size() < 11: return
	var id = p[10]
	var v = hs.vehs.get(id) if id is String and id != "" else null
	if v == null or int(v.d) != from or not DRIVE_CODES.has(int(p[5])): return
	v.zone = ZONE_IDS[int(p[7]) if p[7] != null else 0]; v.x = float(p[0]); v.z = float(p[2]); v.h = float(p[3])
	vehDirty = true
	hostBoatCheck(v)

func hostVehLeave(id) -> void:
	if hs.get("vehs") == null: return
	for v in hs.vehs.values():
		if int(v.d) == id:
			v.d = -1; vehDirty = true; net.broadcast({"t": "veh", "v": _vcopy(v)})

func hostVehSave() -> void:
	if not vehDirty or hs == null or hs.get("vehs") == null: return
	vehDirty = false
	var out = {}
	for v in hs.vehs.values(): out[v.id] = {"zone": v.zone, "x": roundf(float(v.x) * 100) / 100, "z": roundf(float(v.z) * 100) / 100, "h": roundf(float(v.h) * 100) / 100}
	save.vehs = out

# tukšas (vēlākie slāņi)
func busRemote(_r, _here, _dt) -> bool: return false
func boatOk(_tr = null) -> bool: return false
func hostBoatOk() -> bool: return false
func hostBoatCheck(_v) -> void: pass
func hostBoatPark(_v) -> void: pass
