class_name GSound
extends GBugSpot
## 🔊 Pastāvīgās skaņas (web sound.js): soļi pēc virsmas, vide pēc zemes, ūdens/purvs/ugunskurs, dzinēji, velosipēds, slēpes, autobusi.

const STEP := 0.78
var sndLast = null
var sndT := 0.0
var sndWater := 0.0
var sndSwamp := 0.0
var sndCamp = null
var clickT := 0.0

func _rd(x: float, z: float) -> float:
	if terr == null: return 99.0
	return float(terr.road_dist(x, z))

func surfaceAt(x: float, z: float, y: float) -> String:
	if terr == null: return "grass"
	if zone == "n": return "stone" if _rd(x, z) < 2.6 else "snow"
	if y > terr.get_height(x, z) + 0.25: return "wood"
	if terr.is_water(x, z): return "water"
	if zone == FARM and x == me.pos.x and z == me.pos.z:
		for H in yardHouses: if H.inside: return "wood"
	if _rd(x, z) < 2.6: return "stone"
	if zone == RACE and terr is WorldLand and terr.track_dist(x, z) < 6: return "stone"
	return "grass"

func stepSound(surf: String, at, v: float) -> void:
	if surf == "water": Aud.play("splash_s", {"vol": v * 0.35, "rate": 1.3, "at": at, "gap": 120.0})
	else: Aud.play("st_" + surf, {"vol": v * (0.75 if surf == "snow" else (0.6 if surf == "wood" else 0.5)), "at": at, "jit": 0.08, "gap": 120.0})

func updateSound(dt) -> void:
	if camera == null: return
	Aud.setListener(camera.global_position.x, camera.global_position.z, float(cam.yaw))
	var z: String = zone
	if zoneBusy:
		Aud.stopAllLoops(); return
	# --- soļi ---
	var walking: bool = me.veh == null and me.ride == null and me.bus == null and not me.inKart and me.lift == null and me.ski == null
	if walking and me.onGround:
		if sndLast == null: sndLast = {"x": me.pos.x, "z": me.pos.z, "acc": 0.0}
		var d := Vector2(me.pos.x - sndLast.x, me.pos.z - sndLast.z).length()
		sndLast.x = me.pos.x; sndLast.z = me.pos.z
		if d < 3:
			sndLast.acc += d
			if sndLast.acc >= (STEP * 1.35 if me.state == "run" else STEP):
				sndLast.acc = 0.0; stepSound(surfaceAt(me.pos.x, me.pos.z, me.pos.y), null, 1.0)
	elif sndLast != null:
		sndLast.x = me.pos.x; sndLast.z = me.pos.z
	for r in remotes.values():
		if str(r.zone) != z or int(r.vehCode) != 0: continue
		var rp: Vector3 = r.pos
		if r.get("sndLast") == null: r.sndLast = {"x": rp.x, "z": rp.z, "acc": 0.0}
		var lp: Dictionary = r.sndLast
		var dd := Vector2(rp.x - me.pos.x, rp.z - me.pos.z).length()
		var d := Vector2(rp.x - lp.x, rp.z - lp.z).length()
		lp.x = rp.x; lp.z = rp.z
		if dd > 22 or d > 3 or not (r.anim == "walk" or r.anim == "run"): continue
		lp.acc += d
		if lp.acc >= (STEP * 1.35 if r.anim == "run" else STEP):
			lp.acc = 0.0; stepSound(surfaceAt(rp.x, rp.z, rp.y), Vector2(rp.x, rp.z), 0.8)
	# --- vide ---
	var amb = terr.ambience(me.pos.x, me.pos.z) if (z == "s" and terr is TrailLand) else null
	var birds: float = amb.birds if amb != null else (0.55 if z == FOREST else (0.45 if z == FARM else (0.25 if z == RACE else 0.0)))
	var wind: float = amb.wind if amb != null else (0.55 if z == "n" else (0.45 if z == "s" else 0.08))
	Aud.loop("amb_birds", "amb_birds", birds)
	Aud.loop("amb_wind", "amb_wind", wind)
	Aud.loop("air", "air", 0.28 if z == "n" else (amb.wind * 0.4 if amb != null else 0.0))
	sndT -= dt
	if sndT <= 0:
		sndT = 0.5
		var w := 0.0
		if terr != null and z != "n":
			for i in 8:
				var a := i / 8.0 * TAU
				for R in [6.0, 14.0]:
					if terr.is_water(me.pos.x + cos(a) * R, me.pos.z + sin(a) * R): w += 0.1 if R == 6.0 else 0.05
		sndWater = minf(0.6, w)
		sndSwamp = 0.0; sndCamp = null
		if z == FOREST and centerOn:
			for p in world.d.places:
				if p.id == "purvs": sndSwamp = maxf(0.0, 1.0 - Vector2(float(p.x) - me.pos.x, float(p.z) - me.pos.z).length() / 60.0)
				if p.id == "nometne": sndCamp = p
	Aud.loop("amb_river", "amb_river", sndWater)
	Aud.loop("amb_crickets", "amb_crickets", sndSwamp * 0.6)
	if sndSwamp > 0.3 and randf() < dt * 0.25: Aud.play("frog", {"vol": 0.5 * sndSwamp, "jit": 0.15})
	if sndCamp != null: Aud.loopAt("fire", "fire", float(sndCamp.x), float(sndCamp.z), 0.9, 4.0, 28.0)
	else: Aud.loop("fire", "fire", 0.0)
	if birds > 0 and randf() < dt * 0.05: Aud.play("chirp", {"vol": 0.25, "jit": 0.2, "pan": randf() * 1.4 - 0.7})
	# --- transports ---
	var kart := 0.0
	var kartR := 0.0
	var kartL := 0.0
	var car := 0.0
	var carR := 0.0
	var carL := 0.0
	var whirr := 0.0
	var hiss := 0.0
	var skid := 0.0
	var coast := 0.0
	if me.inKart and me.kart != null:
		var K = me.kart
		var v := absf(float(K.speed))
		var thr := maxf(0.0, float(K.get("thr", 0.0)))
		kart = 1.0; kartR = minf(1.25, v / 24.0) + (0.15 if K.boost > 0 else 0.0); kartL = maxf(thr, 1.0 if K.boost > 0 else 0.0)
		skid = minf(0.45, absf(float(K.get("steer", 0.0))) * maxf(0.0, (v - 12.0) / 14.0) * 0.45) + (0.3 if (K.get("wall", false) and v > 5) else 0.0)
	elif me.veh != null:
		var V = me.veh
		var v := absf(float(V.get("speed", 0.0)))
		var thr := maxf(0.0, float(V.get("thr", 0.0)))
		match V.kind:
			"car":
				car = 1.0; carR = minf(1.2, v / 26.0); carL = maxf(thr, 0.15)
			"bike":
				whirr = minf(0.5, v / 12.0); coast = v
			"sled": hiss = minf(0.7, v / 12.0)
			"boat": hiss = minf(0.22, v / 20.0)
	elif me.ride != null:
		var drv = me.ride.driver
		var v := remoteSpeed(drv)
		var d = remotes.get(drv)
		if d != null:
			match int(d.vehCode):
				2:
					car = 0.9; carR = minf(1.2, v / 26.0); carL = 0.4
				3: hiss = minf(0.6, v / 12.0)
				5: whirr = minf(0.4, v / 12.0)
				7: hiss = minf(0.2, v / 20.0)
	if me.ski != null: hiss = maxf(hiss, minf(0.75, float(me.ski.get("v", 0.0)) / 14.0))
	Aud.engine("my_kart", "kart", kartR, kartL, kart)
	Aud.engine("my_car", "car", carR, carL, car)
	Aud.loop("skid", "skid", skid, 1.0, "sfx")
	Aud.loop("whirr", "whirr", whirr, 0.7 + minf(0.8, coast / 14.0), "sfx")
	Aud.loop("hiss", "hiss", hiss, 0.8 + hiss * 0.5, "sfx")
	if me.veh != null and me.veh.kind == "bike" and coast > 2 and not (float(me.veh.get("thr", 0.0)) > 0.1):
		clickT -= dt * coast
		if clickT <= 0:
			clickT = 0.55; Aud.play("tick", {"vol": 0.12, "rate": 1.6, "jit": 0.05, "gap": 30.0})
	for B in buses:
		var on: bool = B.get("vis", false) and B.get("speed") != null
		var mine: bool = me.bus != null and int(me.bus.get("b", 0)) == int(B.k)
		var rpm := minf(1.0, float(B.get("speed", 0.0) if B.get("speed") != null else 0.0) / 14.0)
		var st = B.get("st")
		var load := 0.1 if (st is Dictionary and int(st.get("stop", -1)) >= 0) else 0.5
		var at = Vector2(B.lx, B.lz) if (on and not mine) else null
		Aud.engine("bus%d" % int(B.k), "bus", rpm, load, (0.7 if mine else 1.0) if on else 0.0, at)
		var open: bool = float(B.get("door", 0.0)) > 0.5
		if on and B.get("sndOpen") != null and open != B.sndOpen:
			var at2 = null if mine else Vector2(B.lx, B.lz)
			Aud.play("bus_door", {"vol": 0.8, "at": at2, "rate": 1.0 if open else 0.9})
			if open: Aud.play("ding", {"vol": 0.5, "at": at2, "delay": 0.3})
		B.sndOpen = open
	for r in remotes.values():
		var here: bool = str(r.zone) == z
		var v := remoteSpeed(r.id) if here else 0.0
		var rp: Vector3 = r.pos
		var at = Vector2(rp.x, rp.z) if here else null
		var vc := int(r.vehCode)
		Aud.engine("rk%s" % str(r.id), "kart", minf(1.2, v / 24.0), 0.6, 1.0 if (here and (vc == 1 or r.inKart)) else 0.0, at)
		Aud.engine("rc%s" % str(r.id), "car", minf(1.2, v / 26.0), 0.5, 1.0 if (here and vc == 2) else 0.0, at)
		var dd := Vector2(rp.x - camera.global_position.x, rp.z - camera.global_position.z).length() if here else 99.0
		Aud.loop("rw%s" % str(r.id), "whirr", maxf(0.0, 1.0 - dd / 25.0) * minf(0.4, v / 12.0) if (here and vc == 5) else 0.0, 1.0, "sfx")
		Aud.loop("rh%s" % str(r.id), "hiss", maxf(0.0, 1.0 - dd / 30.0) * minf(0.5, v / 12.0) if (here and vc == 3) else 0.0, 1.0, "sfx")
