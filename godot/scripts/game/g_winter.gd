class_name GWinter
extends GBus
## ❄️ Ziemas papildinājums (web winter.js Winter): slēpošana, pacēlājs, sniega pikas, ziemas drēbes, draugi slēpo.

const BALL_CD := 0.55
const LIFT := {"x": 42.0, "zB": 62.0, "zT": -238.0, "off": 1.6, "v": 13.0}
const SKI_START := {"x": 36.0, "z": -221.0}
const ARENA := {"x": -170.0, "z": 200.0, "hw": 36.0, "hd": 22.0}
const RACK := {"x": 26.0, "z": 74.0}
var snowStats = {"hits": 0, "hitBy": 0}
var balls: Array = []
var ballCd = 0.0
var ballMesh: SphereMesh
var ballMat: StandardMaterial3D
var fogBase = Vector2(110, 380)

static func inArena(x: float, z: float) -> bool: return absf(x - ARENA.x) < ARENA.hw and absf(z - ARENA.z) < ARENA.hd
func skiStartHeading() -> float: return atan2(-0.3, 1.0)

func enterWinter() -> void:
	avatar.set_winter(true)
	balls = []
	env.fog_light_color = Color("#dce6ef")
	UI.toast("❄️ Ziemas zemē tev ir silta cepure, šalle un dūraiņi!", "good", 3500)

func leaveWinter() -> void:
	avatar.set_winter(false)
	stopSki(true)
	me.lift = null
	setLiftChair(avatar, false)
	for b in balls: if is_instance_valid(b.mesh): b.mesh.queue_free()
	balls = []
	env.fog_light_color = Color(0.66, 0.77, 0.86)
	env.fog_depth_begin = fogBase.x; env.fog_depth_end = fogBase.y
	UI.show_id("snow-hud", false)

func winterFog(amt: float) -> void:
	env.fog_depth_begin = fogBase.x * (1.0 - 0.55 * amt)
	env.fog_depth_end = fogBase.y * (1.0 - 0.5 * amt)

func qualitySnow() -> float: return 1.0

func startSki(from_top: bool) -> void:
	me.ski = {"v": 0.0, "heading": me.heading, "fromTop": from_top, "t0": now(), "crashT": 0.0}
	avatar.set_skis(true)

func stopSki(silent := false) -> void:
	if me.ski == null: return
	me.ski = null
	avatar.set_skis(false)
	avatar.root.rotation.z = 0; avatar.root.rotation.x = 0
	avatar.ski_pose = null
	if not silent: UI.toast("🥾 Slēpes noņemtas")

func updateSki(dt, mv, jump) -> void:
	var sk: Dictionary = me.ski
	var W = terr
	var turn_rate = 2.3 * (0.55 + 0.45 * minf(1.0, 6.0 / maxf(1.0, sk.v)))
	sk.heading -= mv.x * turn_rate * dt
	var dx = sin(sk.heading)
	var dz = cos(sk.heading)
	var e = 1.2
	var gx = (W.get_height(me.pos.x + e, me.pos.z) - W.get_height(me.pos.x - e, me.pos.z)) / (2.0 * e)
	var gz = (W.get_height(me.pos.x, me.pos.z + e) - W.get_height(me.pos.x, me.pos.z - e)) / (2.0 * e)
	var sd = gx * dx + gz * dz
	var acc = -9.8 * sd / sqrt(1.0 + sd * sd)
	acc -= 0.05 * 9.8 + 0.0028 * sk.v * sk.v
	if mv.y > 0.3 and sk.v < 7: acc += 3.2 * mv.y
	if mv.y < -0.3: acc -= 8.0 * -mv.y
	acc -= absf(mv.x) * sk.v * 0.08
	if sk.crashT > 0:
		sk.crashT -= dt; acc = -sk.v * 3.0
	sk.v = clampf(sk.v + acc * dt, 0.0, 27.0)
	me.pos.x += dx * sk.v * dt
	me.pos.z += dz * sk.v * dt
	me.pos = W.collide(me.pos, 0.45)
	if W.hit and sk.v > 7 and sk.crashT <= 0:
		sk.crashT = 1.2; sfx("st_snow", {"vol": 1.0, "rate": 0.8}); sfx("hit", {"vol": 0.5, "rate": 0.7})
		UI.toast("💥 Bums! Uzbrauci virsū šķērslim", "bad", 1800)
		spawnFloat("💫", me.pos)
	var ground = W.get_height(me.pos.x, me.pos.z)
	me.vy -= 24.0 * dt
	me.pos.y += me.vy * dt
	if me.pos.y <= ground:
		me.pos.y = ground; me.vy = 0.0; me.onGround = true
	elif me.onGround and me.vy <= 0 and me.pos.y - ground < 0.5 + sk.v * 0.03:
		me.pos.y = ground; me.vy = 0.0
	else: me.onGround = false
	if jump and me.onGround:
		me.vy = 7.5; me.onGround = false; sfx("jump")
	me.heading = sk.heading
	me.state = "ski"
	var av = avatar
	av.root.position = me.pos
	av.root.rotation_order = EULER_ORDER_YXZ
	av.root.rotation.y = me.heading
	var sl = WinterLand.ski_slope(func(x, z): return W.get_height(x, z), me.pos.x, me.pos.z, me.heading)
	var omega: float = -mv.x * turn_rate
	var lean = clampf(-atan(sk.v * omega / 9.8) * 0.55, -0.42, 0.42)
	var kk = 1.0 - exp(-dt * (9.0 if me.onGround else 3.0))
	av.root.rotation.x = lerpf(av.root.rotation.x, -sl.pitch if me.onGround else -0.05, kk)
	av.root.rotation.z = lerpf(av.root.rotation.z, (sl.roll * 0.7 if me.onGround else 0.0) + lean, kk)
	av.ski_pose = {"down": av.root.rotation.x, "v": sk.v, "brake": maxf(0.0, -mv.y), "air": not me.onGround, "push": mv.y > 0.3 and sk.v < 7}
	if av.shadow: av.shadow.position.y = ground - me.pos.y + 0.03
	av.animate(dt, "ski", sk.v)
	if sk.fromTop and me.pos.z > LIFT.zB - 15 and ground < Terra.GROUND_Y + 4:
		sk.fromTop = false
		var s = (now() - float(sk.t0)) / 1000.0
		sfx("win")
		UI.toast("🏁 Nobrauci no Ziemas kalna! Laiks: %.1f s" % s, "good", 4000)
		stat("skiRuns")
		if save.get("bestSki") == null or s < float(save.bestSki):
			save.bestSki = snappedf(s, 0.1)
			if int(save.stats.get("skiRuns", 0)) > 1: UI.toast("🏆 Jauns rekords: %.1f s!" % s, "good", 3500)

func startLift() -> void:
	me.lift = {"s": 0.0}
	setLiftChair(avatar, true)
	sfx("beep")
	UI.toast("🚡 Brauc augšā! Apskaties apkārtni…", "", 2500)

func updateLift(dt) -> void:
	var L: WinterLand = terr
	me.lift.s += LIFT.v * dt
	if me.lift.s >= float(L.lift.len):
		me.lift = null
		setLiftChair(avatar, false)
		me.pos = Vector3(SKI_START.x, 0, SKI_START.z)
		me.pos.y = terr.get_height(me.pos.x, me.pos.z)
		me.heading = skiStartHeading()
		if me.ski == null: startSki(true)
		else: me.ski.fromTop = true
		me.ski.heading = me.heading; me.ski.t0 = now()
		cam.yaw = me.heading + PI
		UI.toast("⛷️ Slēpes kājās! Velc kursorsviru, lai stūrētu, uz leju — bremzē.", "good", 4500)
		return
	var p = L.up_point(me.lift.s)
	me.pos = p - Vector3(0, 0.27, 0)
	me.heading = PI
	me.state = "lift"
	avatar.root.position = me.pos
	avatar.root.rotation.y = me.heading
	if avatar.shadow: avatar.shadow.position.y = terr.get_height(me.pos.x, me.pos.z) - me.pos.y + 0.03
	avatar.animate(dt, "lift", 0.0)

func setLiftChair(av: Avatar, on: bool) -> void:
	var has: bool = av.root.has_meta("liftChair") and is_instance_valid(av.root.get_meta("liftChair"))
	if on and not has:
		var c = Avatar.asset("chair").build()
		c.position = Vector3(0, 0.25, -0.02)
		var ps = Node3D.new(); ps.position = Vector3(0.4, 0.02, 0.04); ps.scale = Vector3.ONE * 0.8; ps.set_meta("n", "pet"); c.add_child(ps)
		av.root.add_child(c)
		av.root.set_meta("liftChair", c)
	elif not on and has:
		(av.root.get_meta("liftChair") as Node).queue_free()
		av.root.remove_meta("liftChair")

func throwBall() -> void:
	var t = now()
	if ballCd > t: return
	ballCd = t + BALL_CD * 1000.0
	var yaw: float = cam.yaw
	var fx = -sin(yaw)
	var fz = -cos(yaw)
	me.heading = atan2(fx, fz)
	me.throwT = 0.35
	var o = [me.pos.x + fx * 0.5, me.pos.y + 1.7, me.pos.z + fz * 0.5]
	var lift_v = 4.5 + (0.38 - cam.pitch) * 6.0
	var v = [fx * 18.0, clampf(lift_v, 1.5, 9.0), fz * 18.0]
	spawnBall(o, v, myId)
	net.toHost({"t": "ball", "o": [snappedf(o[0], 0.01), snappedf(o[1], 0.01), snappedf(o[2], 0.01)], "v": [snappedf(v[0], 0.01), snappedf(v[1], 0.01), snappedf(v[2], 0.01)]})
	sfx("throw")

func spawnBall(o: Array, v: Array, by) -> void:
	if ballMesh == null:
		ballMesh = SphereMesh.new(); ballMesh.radius = 0.11; ballMesh.height = 0.22; ballMesh.radial_segments = 10; ballMesh.rings = 8
		ballMat = StandardMaterial3D.new(); ballMat.albedo_color = Color("#f6f9fc"); ballMat.roughness = 0.8
	var m = MeshInstance3D.new(); m.mesh = ballMesh; m.material_override = ballMat
	stage.add_child(m)
	m.global_position = Vector3(float(o[0]), float(o[1]), float(o[2]))
	balls.append({"mesh": m, "v": Vector3(float(v[0]), float(v[1]), float(v[2])), "by": by, "life": 4.0, "bit": false})

func splat(p: Vector3) -> void:
	sfx("squish", {"at": Vector2(p.x, p.z), "vol": 0.9, "rate": 0.8}); sfx("st_snow", {"at": Vector2(p.x, p.z), "vol": 0.7})
	for i in 7:
		var m = MeshInstance3D.new(); m.mesh = ballMesh; m.material_override = ballMat
		m.scale = Vector3.ONE * (0.35 + randf() * 0.3)
		stage.add_child(m); m.global_position = p
		balls.append({"mesh": m, "v": Vector3((randf() - 0.5) * 5.0, 2.0 + randf() * 3.0, (randf() - 0.5) * 5.0), "by": null, "life": 0.6, "bit": true})

func updateBalls(dt: float) -> void:
	if balls.is_empty(): return
	var n = mini(8, ceili(dt / 0.016))
	for k in n: stepBalls(dt / n)

func stepBalls(dt: float) -> void:
	var W = terr
	for i in range(balls.size() - 1, -1, -1):
		var b: Dictionary = balls[i]
		var p: Vector3 = b.mesh.global_position
		b.life -= dt
		b.v.y -= 13.0 * dt
		p += b.v * dt
		b.mesh.global_position = p
		var hit: bool = b.life <= 0
		if not hit and not b.bit:
			if p.y < W.get_height(p.x, p.z) + 0.08: hit = true
			if W is WinterLand:
				for o in (W as WinterLand).obstacles:
					if not hit and p.x > float(o[0]) and p.x < float(o[3]) and p.y > float(o[1]) and p.y < float(o[4]) and p.z > float(o[2]) and p.z < float(o[5]): hit = true
			if not hit and b.by != myId and Vector2(p.x - me.pos.x, p.z - me.pos.z).length() < 0.55 and p.y > me.pos.y + 0.2 and p.y < me.pos.y + 2.1:
				hit = true
				net.toHost({"t": "ballHit", "by": b.by})
				snowStats.hitBy += 1
				var who = remotes.get(b.by)
				UI.toast("❄️ Tev trāpīja %s!" % (who.prof.name if who else "draugs"), "bad", 2000)
				var fl: ColorRect = UI.b["snow-flash"]
				fl.color.a = 0.75
				var tw = fl.create_tween(); tw.tween_property(fl, "color:a", 0.0, 0.6)
			if not hit and b.by == myId and W is WinterLand:
				for tg in (W as WinterLand).targets:
					if Vector2(p.x - float(tg.x), p.z - float(tg.z)).length() < 0.85 and p.y < float(tg.y) + 2.4:
						hit = true; tg.wob = 0.8
						snowStats.hits += 1
						stat("snowHits")
						addCoins(1, true)
						spawnFloat("🎯", Vector3(tg.x, float(tg.y) + 2, tg.z))
				for r in remotes.values():
					if not hit and str(r.zone) == zone and Vector2(p.x - r.pos.x, p.z - r.pos.z).length() < 0.55 and p.y > r.pos.y + 0.2 and p.y < r.pos.y + 2.1: hit = true
			if hit and b.life > 0: splat(p)
		if hit:
			b.mesh.queue_free()
			balls.remove_at(i)

func updateWinter(dt) -> void:
	updateBalls(dt)
	if me.throwT > 0: me.throwT -= dt
	if inArena(me.pos.x, me.pos.z):
		UI.set_text("snow-hud", "❄️ Trāpījumi: %d · Tev trāpīja: %d" % [snowStats.hits, snowStats.hitBy])
		UI.show_id("snow-hud", true)
	else: UI.show_id("snow-hud", false)
	if not avatar.winter: avatar.set_winter(true)

func winterActions():
	var W = terr
	var p: Vector3 = me.pos
	var t = now()
	if me.lift != null: return {"label": "🚡 Brauc augšā…", "fn": func(): pass}
	var d2 = func(x: float, z: float) -> float: return Vector2(x - p.x, z - p.z).length()
	if inArena(p.x, p.z) and me.ski == null: return {"label": "❄️ Mest piku", "fn": func(): throwBall()}
	if d2.call(LIFT.x, LIFT.zB) < 7: return {"label": "🚡 Braukt ar pacēlāju", "fn": func(): startLift()}
	if me.ski != null:
		if me.ski.v < 2.5: return {"label": "🥾 Noņemt slēpes", "fn": func(): stopSki()}
		return null
	if d2.call(RACK.x, RACK.z) < 4: return {"label": "⛷️ Uzlikt slēpes", "fn": func():
		startSki(false); UI.toast("⛷️ Slēpes kājās! Ar pacēlāju uz kalna un lejā!", "good")}
	if W is WinterLand:
		for dd in (W as WinterLand).deer:
			if not dd.model.root.visible or d2.call(dd.x, dd.z) > 3: continue
			if float(npcCooldown.get("b%d" % dd.id, 0)) > t: continue
			var ddd: Dictionary = dd
			return {"label": "🤗 Paglaudīt: Ziemeļbriedis", "fn": func():
				npcCooldown["b%d" % ddd.id] = t + 15000.0
				me.petT = 1.2; me.heading = atan2(ddd.x - p.x, ddd.z - p.z)
				spawnFloat("❤️", Vector3(ddd.x, W.get_height(ddd.x, ddd.z), ddd.z))
				sfx("pet"); stat("petted"); stat("reindeer")
				UI.toast("🦌 Ziemeļbriedis priecīgi nopūšas tvaika mākonīti!")}
	return null

func winterRemote(r, here) -> void:
	var w: bool = here and zone == "n"
	if r.avatar.winter != w: r.avatar.set_winter(w)
	var ski: bool = w and r.anim == "ski"
	r.avatar.set_skis(ski)
	setLiftChair(r.avatar, w and r.anim == "lift")
	var R: Node3D = r.avatar.root
	if ski:
		var nw = Time.get_ticks_msec()
		var dt = minf(0.1, (nw - float(r.get("skiT", nw))) / 1000.0)
		if dt <= 0: dt = 0.016
		var sp: float = Vector2(r.pos.x - r.skiP.x, r.pos.z - r.skiP.z).length() / dt if r.get("skiP") != null else 0.0
		var dy: float = r.ry - (r.ry if r.get("skiRy") == null else float(r.skiRy))
		dy = atan2(sin(dy), cos(dy))
		r.skiT = nw; r.skiRy = r.ry; r.skiP = r.pos
		var sl = WinterLand.ski_slope(func(x, z): return terr.get_height(x, z), r.pos.x, r.pos.z, r.ry)
		var lean = clampf(-atan(sp * (dy / dt) / 9.8) * 0.55, -0.42, 0.42)
		var k = 1.0 - exp(-dt * 8.0)
		R.rotation_order = EULER_ORDER_YXZ
		R.rotation.x = lerpf(R.rotation.x, -sl.pitch, k)
		R.rotation.z = lerpf(R.rotation.z, sl.roll * 0.85 + lean, k)
		r.avatar.ski_pose = {"down": R.rotation.x, "v": sp, "brake": 0.0, "air": false, "push": false}
	elif R.rotation.x != 0 or R.rotation.z != 0:
		R.rotation.x = 0; R.rotation.z = 0; r.avatar.ski_pose = null

func hostWinter(from, m) -> void:
	if m.t == "ball" and m.get("o") is Array and m.get("v") is Array:
		net.broadcast({"t": "ball", "by": from, "o": (m.o as Array).slice(0, 3), "v": (m.v as Array).slice(0, 3)})
	elif m.t == "ballHit": net.broadcast({"t": "ballHit", "by": m.get("by"), "target": from})

func onWinterMessage(m) -> void:
	if m.t == "ball":
		if m.by != myId and zone == "n": spawnBall(m.o, m.v, m.by)
	elif m.t == "ballHit":
		if m.by == myId and m.target != myId:
			snowStats.hits += 1
			stat("snowHits")
			var r = remotes.get(m.target)
			sfx("coin")
			UI.toast("🎯 Trāpīji: %s!" % (r.prof.name if r else "draugam"), "good", 1800)
