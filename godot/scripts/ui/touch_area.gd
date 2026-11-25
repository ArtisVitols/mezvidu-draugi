class_name TouchArea
extends Control
## Vadība (web controls.js): kreisajā pusē (45 %) kursorsviras ar pirkstu, labajā — kameras vilkšana, divi pirksti —
## tālummaiņa. Braucot — pogas ⛽/🛑 un ◀ ▶ (katrai savs pirksts, tāpēc šeit pašu skārienu apstrāde).
## Datorā: WASD/bultiņas, Shift — skriet, atstarpe — lēkt, E/Enter — darbība, peles vilkšana — kamera, ritenis — tuvums.

var move := Vector2.ZERO
var cam_delta := Vector2.ZERO
var zoom_delta := 0.0
var jump_pressed := false
var action_pressed := false
var joy_id := -1
var cam_id = null              # null — neviens; int — pirksts; -2 — pele
var joy_start := Vector2.ZERO
var joy_now := Vector2.ZERO
var cam_last := Vector2.ZERO
var pinch = null
var pointers := {}
var drive := false
var dk := {"gas": {}, "brake": {}, "left": {}, "right": {}}
var steer_v := 0.0
var steer_t := 0
var keys := {}
var enabled := true
const R := 55.0 * 1.7

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	steer_t = Time.get_ticks_msec()

func _drive_btn_at(p: Vector2) -> String:
	if not drive: return ""
	for k in ["gas", "brake", "left", "right"]:
		var c: Control = UI.b.get("btn-" + k)
		if c and c.is_visible_in_tree() and c.get_global_rect().has_point(p): return k
	return ""

func _over_ui(p: Vector2) -> bool:
	if UI.panelOpen(): return true
	for c in UI.hud.find_children("*", "BaseButton", true, false):
		var bc: Control = c
		if bc.is_visible_in_tree() and bc.get_global_rect().has_point(p): return true
	var mm: Control = UI.b.get("minimap")
	if mm and mm.is_visible_in_tree() and mm.get_global_rect().has_point(p): return true
	return false

func _input(e: InputEvent) -> void:
	if not is_visible_in_tree(): return
	if e is InputEventScreenTouch:
		var st := e as InputEventScreenTouch
		if st.pressed: _down(st.index, st.position, false)
		else: _up(st.index)
	elif e is InputEventScreenDrag:
		var sd := e as InputEventScreenDrag
		_move(sd.index, sd.position)
	elif e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: zoom_delta -= 0.5
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: zoom_delta += 0.5
		elif mb.button_index == MOUSE_BUTTON_LEFT and not DisplayServer.is_touchscreen_available():
			if mb.pressed: _down(-2, mb.position, true)
			else: _up(-2)
	elif e is InputEventMouseMotion and not DisplayServer.is_touchscreen_available():
		if pointers.has(-2): _move(-2, (e as InputEventMouseMotion).position)
	elif e is InputEventKey:
		var ke := e as InputEventKey
		if get_viewport().gui_get_focus_owner() is LineEdit: return
		keys[ke.physical_keycode] = ke.pressed
		if ke.pressed and not ke.echo:
			if ke.physical_keycode == KEY_SPACE: jump_pressed = true
			if ke.physical_keycode == KEY_E or ke.physical_keycode == KEY_ENTER: action_pressed = true

func _down(id: int, p: Vector2, mouse: bool) -> void:
	var dbt := _drive_btn_at(p)
	if dbt != "":
		dk[dbt][id] = true
		(UI.b["btn-" + dbt] as Control).modulate = Color(1.25, 1.25, 1.25)
		return
	if _over_ui(p): return
	pointers[id] = p
	var left_side := p.x < get_viewport_rect().size.x * 0.45
	if left_side and joy_id == -1 and not mouse and not drive:
		joy_id = id
		joy_start = p; joy_now = p
		queue_redraw()
	elif cam_id == null:
		cam_id = id
		cam_last = p
	elif joy_id == -1 or not mouse:
		var a = pointers.get(cam_id)
		if a != null: pinch = {"id": id, "dist": (a as Vector2).distance_to(p)}

func _move(id: int, p: Vector2) -> void:
	if not pointers.has(id): return
	pointers[id] = p
	if id == joy_id:
		var d := p - joy_start
		if d.length() > R: d = d * (R / d.length())
		move = Vector2(d.x / R, -d.y / R)
		joy_now = joy_start + d
		queue_redraw()
	elif pinch != null and (id == pinch.id or id == cam_id):
		var a = pointers.get(cam_id)
		var bb = pointers.get(pinch.id)
		if a != null and bb != null:
			var dd: float = (a as Vector2).distance_to(bb)
			zoom_delta -= (dd - float(pinch.dist)) * 0.03 / 1.7
			pinch.dist = dd
	elif id == cam_id:
		cam_delta += (p - cam_last) / 1.7
		cam_last = p

func _up(id: int) -> void:
	for k in dk:
		if dk[k].erase(id) and dk[k].is_empty(): (UI.b["btn-" + k] as Control).modulate = Color.WHITE
	pointers.erase(id)
	if id == joy_id: reset_joy()
	if cam_id != null and id == cam_id:
		cam_id = null; pinch = null
	if pinch != null and id == pinch.id: pinch = null

func reset_joy() -> void:
	joy_id = -1
	move = Vector2.ZERO
	queue_redraw()

func _draw() -> void:
	if joy_id == -1: return
	draw_circle(joy_start, R * 1.05, Color(1, 1, 1, 0.18))
	draw_arc(joy_start, R * 1.05, 0, TAU, 48, Color(1, 1, 1, 0.5), 3.0, true)
	draw_circle(joy_now, R * 0.45, Color(1, 1, 1, 0.7))

func set_drive(on: bool) -> void:
	if drive == on: return
	drive = on
	if on: reset_joy()
	else: clear_drive()
	UI.set_driving(on)

func clear_drive() -> void:
	for k in dk:
		dk[k].clear()
		if UI.b.has("btn-" + k): (UI.b["btn-" + k] as Control).modulate = Color.WHITE
	steer_v = 0.0

func _k(code: int) -> bool: return keys.get(code, false)

## {x, y, run}
func get_move() -> Dictionary:
	var x := move.x
	var y := move.y
	var now := Time.get_ticks_msec()
	var dt := minf(0.1, (now - steer_t) / 1000.0)
	steer_t = now
	if drive:
		y = (1.0 if not dk.gas.is_empty() else 0.0) - (1.0 if not dk.brake.is_empty() else 0.0)
		var want := (1.0 if not dk.right.is_empty() else 0.0) - (1.0 if not dk.left.is_empty() else 0.0)
		var rate := 8.0 if want == 0.0 else (9.0 if signf(want) != signf(steer_v) else 4.5)
		steer_v += clampf(want - steer_v, -rate * dt, rate * dt)
		x = steer_v
	if _k(KEY_W) or _k(KEY_UP): y += 1.0
	if _k(KEY_S) or _k(KEY_DOWN): y -= 1.0
	if _k(KEY_A) or _k(KEY_LEFT): x -= 1.0
	if _k(KEY_D) or _k(KEY_RIGHT): x += 1.0
	var l := Vector2(x, y).length()
	if l > 1.0:
		x /= l; y /= l
	return {"x": x, "y": y, "run": _k(KEY_SHIFT)}

func consume_cam() -> Vector3:
	var d := Vector3(cam_delta.x, cam_delta.y, zoom_delta)
	cam_delta = Vector2.ZERO; zoom_delta = 0.0
	return d

func consume_jump() -> bool:
	var j := jump_pressed
	jump_pressed = false
	return j

func consume_action() -> bool:
	var a := action_pressed
	action_pressed = false
	return a
