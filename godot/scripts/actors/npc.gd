class_name Npc
extends RefCounted
## Meža dzīvnieks / mājdzīvnieks (web assets.js buildNPC): animate(dt, moving, speed)
const GAIT := {"stirna": 6.0, "briedis": 7.0, "ezis": 12.0, "mezacuka": 9.0, "starkis": 4.0}
const HOP := {"zakis": true, "vavere": true}

var root: Node3D
var body: Node3D
var legs: Array = []
var knees: Array = []     # [{k, front}]
var type := ""
var hop := false
var gait := 8.0
var phase := randf() * 10.0
var idleT := randf() * 10.0
var baseScale := 1.0

static func make(t: String, baby := false) -> Npc:
	var n := Npc.new()
	n.type = t
	n.hop = HOP.has(t)
	n.gait = GAIT.get(t, 8.0)
	n.root = Avatar.asset(("npcb_" if baby else "npc_") + t).build()
	n.baseScale = n.root.scale.x
	n.body = n.root.find_child("body", true, false)
	for c in n.body.get_children() if n.body else []:
		var nm := str(c.get_meta("n", c.name))
		if nm in ["hip", "foot", "arm", "leg"]:
			n.legs.append(c)
			var kn: Node3D = null
			for cc in c.get_children():
				if str(cc.get_meta("n", cc.name)) == "knee": kn = cc
			if kn: n.knees.append({"k": kn, "front": (c as Node3D).position.z > 0.0})
	return n

func animate(dt: float, moving: bool, speed: float = 1.2) -> void:
	idleT += dt
	if body == null: return
	if moving:
		phase += dt * (9.0 if hop else gait) * minf(1.6, speed / 1.2 + 0.4)
		if hop:
			var p := sin(phase)
			body.position.y = maxf(0.0, p) * 0.3; body.rotation.x = -p * 0.18
			for i in legs.size(): legs[i].rotation.x = (0.5 if i % 2 else -0.4) * p
		else:
			var s := sin(phase)
			for i in legs.size():
				var ph := 0.0 if (i == 0 or i == 3) else PI
				legs[i].rotation.x = sin(phase + ph) * 0.45
			for i in knees.size():
				var ph := 0.0 if (i == 0 or i == 3) else PI
				var c := maxf(0.0, cos(phase + ph))
				knees[i].k.rotation.x = c * 0.7 if knees[i].front else -c * 0.6
			body.position.y = absf(s) * 0.025; body.rotation.x = 0.0
	else:
		body.position.y *= 0.8; body.rotation.x *= 0.85
		body.scale.y = 1.0 + sin(idleT * 2.2) * 0.008
		for l in legs: l.rotation.x *= 0.85
		for kd in knees: kd.k.rotation.x += ((0.05 if kd.front else -0.08) - kd.k.rotation.x) * 0.15
