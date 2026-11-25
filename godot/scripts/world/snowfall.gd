class_name Snowfall
extends MultiMeshInstance3D
## ❄️ Sniegputenis ap kameru (web winter.js GPU sniegs): katra pārsliņa ir četrstūris, ko novieto un kustina
## virsotņu ēnotājs pēc laika — kastē 70 × 40 × 70 m ap kameru, kas „aptinas”. Nav daļiņu sistēmas.

const COUNT := 2600
const SHADER := """
shader_type spatial;
render_mode unshaded, cull_disabled, skip_vertex_transform, blend_mix, depth_draw_never, shadows_disabled, fog_disabled;
global uniform float mz_time;
const vec3 BOX = vec3(70.0, 40.0, 70.0);
varying float va;
void vertex() {
	vec4 o = INSTANCE_CUSTOM;
	vec3 camp = INV_VIEW_MATRIX[3].xyz + vec3(0.0, 8.0, 0.0);
	float v = 1.6 + o.w;
	float t = mod(mz_time, 4000.0);
	vec3 p = o.xyz * BOX + vec3(0.15 * v * t + sin(t * 0.7 + o.w * 9.0) * 0.6, -v * t, 0.05 * v * t + cos(t * 0.5 + o.x * 13.0) * 0.6);
	p = camp + (fract((p - camp) / BOX + 0.5) - 0.5) * BOX;
	vec3 vc = (VIEW_MATRIX * vec4(p, 1.0)).xyz;
	float sz = 0.1 * (0.5 + 0.7 * fract(o.w * 7.3));
	VERTEX = vc + vec3(VERTEX.xy * sz, 0.0);
	// tuvu kamerai un kastes malās izgaist
	float d = length(vc);
	va = 0.9 * smoothstep(0.4, 1.2, d) * (1.0 - smoothstep(28.0, 36.0, d));
}
void fragment() {
	float r = length(UV - 0.5) * 2.0;
	ALBEDO = vec3(1.0);
	ALPHA = va * (1.0 - smoothstep(0.6, 1.0, r));
}
"""
static var _shader: Shader = null

func _init() -> void:
	name = "Snowfall"
	if _shader == null:
		_shader = Shader.new(); _shader.code = SHADER
	var mat := ShaderMaterial.new(); mat.shader = _shader
	var qm := QuadMesh.new(); qm.size = Vector2(1, 1)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_custom_data = true
	mm.mesh = qm
	mm.instance_count = COUNT
	var rnd := Game.mulberry32(7331)
	var b := PackedFloat32Array(); b.resize(COUNT * 16)
	for i in COUNT:
		var k := i * 16
		b[k] = 1.0; b[k + 5] = 1.0; b[k + 10] = 1.0
		b[k + 12] = float(rnd.call()); b[k + 13] = float(rnd.call()); b[k + 14] = float(rnd.call()); b[k + 15] = float(rnd.call())
	mm.buffer = b
	mm.visible_instance_count = 0
	multimesh = mm
	material_override = mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# pārsliņas ēnotājs liek ap kameru — robežas nedrīkst izgriezt
	custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))

## a — 0..1 sniega stiprums (0 = nesnieg)
func set_amount(a: float) -> void:
	var n := roundi(COUNT * clampf(a, 0.0, 1.0))
	if a > 0.0: n = maxi(n, roundi(COUNT * 0.05))
	multimesh.visible_instance_count = n
	visible = n > 0
