class_name Grass
extends RefCounted
## Blīva zāle ap spēlētāju (web world.js grassMesh): 26 000 kušķu, ko GPU novieto pēc reljefa augstuma un zemes krāsas
## tekstūrām (512², 760 m). Kušķi „aptinas” 84 m flīzē ap centru; blīvumu maina grafikas līmenis; arumos zāle neaug.

const R := 512
const SIZE := 760.0
const HALF := 380.0
const COUNT := 26000
const TILE := 84.0

const SHADER := """
shader_type spatial;
render_mode cull_disabled, world_vertex_coords, depth_draw_opaque;
global uniform float mz_time;
uniform vec2 center = vec2(0.0);
uniform float grassR = 1.0;
uniform sampler2D htex : filter_linear, repeat_disable;
uniform sampler2D gtex : source_color, filter_linear, repeat_disable;
uniform sampler2D blade : source_color, filter_linear_mipmap, repeat_disable;
varying vec3 vg;
void vertex() {
	vec4 o = INSTANCE_CUSTOM;
	vec2 gp = o.xy + {TILE} * floor((center - o.xy) / {TILE} + 0.5);
	vec2 tuv = (gp + {HALF}) / {SIZE};
	float gh = texture(htex, tuv).r;
	vec4 gc = texture(gtex, tuv);
	float gd = length(gp - center) / ({TILE} * 0.5 * grassR);
	float gs = o.w * smoothstep(0.12, 0.45, gc.a) * (1.0 - smoothstep(0.45, 1.0, gd));
	float keep = 1.0 - 0.55 * smoothstep(0.3, 0.85, gd);
	gs *= step(fract(o.z * 5.731), keep) * (1.0 + 0.4 * (1.0 - keep));
	// pie pašas kameras stiebrus noslēpj (citādi zema kamera redz milzu zāli priekšā)
	vec3 camp = INV_VIEW_MATRIX[3].xyz;
	gs *= smoothstep(1.0, 2.6, distance(vec3(gp.x, gh, gp.y), camp));
	vec3 p = VERTEX;
	float cs = cos(o.z), sn = sin(o.z);
	p.xz = mat2(vec2(cs, sn), vec2(-sn, cs)) * p.xz;
	p *= vec3(gs, gs * (0.75 + 0.5 * gc.a), gs);
	float wk = VERTEX.y * 0.32;
	float ph = gp.x * 0.11 + gp.y * 0.07;
	float gust = 0.6 + 0.4 * sin(mz_time * 0.35 + gp.x * 0.012);
	p.x += (sin(mz_time * 1.6 + ph) * 0.7 + sin(mz_time * 3.7 + ph * 2.7) * 0.3) * wk * gust;
	p.z += cos(mz_time * 1.3 + ph * 1.2) * 0.45 * wk * gust;
	VERTEX = p + vec3(gp.x, gh - 0.04, gp.y);
	NORMAL = vec3(0.0, 1.0, 0.0);
	vg = gc.rgb * (1.1 + 0.25 * fract(o.z * 3.7));
}
void fragment() {
	vec4 t = texture(blade, UV);
	ALBEDO = t.rgb * vg;
	ALPHA = t.a;
	ALPHA_SCISSOR_THRESHOLD = 0.45;
	ROUGHNESS = 1.0;
	SPECULAR = 0.1;
}
"""

static var _mesh: ArrayMesh = null
static var _buf: PackedFloat32Array
static var _shader: Shader = null

var mm: MultiMesh
var mat: ShaderMaterial
var gimg: Image
var gtex: ImageTexture
var alpha0: PackedByteArray
var holed: PackedInt32Array = PackedInt32Array()
var node: MultiMeshInstance3D = null

## w — WorldLand (dati grassData + _extra.grassH)
func _init(w) -> void:
	var gd = w.d.get("grassData")
	var gh = w.d.get("_extra", {}).get("grassH")
	if not (gd is PackedByteArray) or not (gh is PackedFloat32Array): return
	var himg := Image.create_from_data(R, R, false, Image.FORMAT_RF, gh.to_byte_array())
	gimg = Image.create_from_data(R, R, false, Image.FORMAT_RGBA8, gd)
	alpha0 = PackedByteArray(); alpha0.resize(R * R)
	for i in R * R: alpha0[i] = gd[i * 4 + 3]
	gtex = ImageTexture.create_from_image(gimg)
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SHADER.replace("{TILE}", "%.1f" % TILE).replace("{HALF}", "%.1f" % HALF).replace("{SIZE}", "%.1f" % SIZE)
	mat = ShaderMaterial.new(); mat.shader = _shader
	mat.set_shader_parameter("htex", ImageTexture.create_from_image(himg))
	mat.set_shader_parameter("gtex", gtex)
	mat.set_shader_parameter("blade", load("res://assets/tex/grass_blades.png"))
	mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_custom_data = true
	mm.mesh = _blades()
	mm.instance_count = COUNT
	mm.buffer = _buffer(int(w.d.get("seed", 1)))
	mm.custom_aabb = AABB(Vector3(-HALF, -50, -HALF), Vector3(SIZE, 150, SIZE))

func ok() -> bool: return mm != null

## 3 krustoti četrstūri 0,75 × 0,5 m (normāle uz augšu, kā web)
static func _blades() -> ArrayMesh:
	if _mesh: return _mesh
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in 3:
		var a := k * PI / 3.0
		var dx := Vector3(cos(a), 0, -sin(a)) * 0.375
		var q := [[-dx, 0.0, 0.0, 1.0], [dx, 0.0, 1.0, 1.0], [dx, 0.5, 1.0, 0.0], [-dx, 0.5, 0.0, 0.0]]
		for idx in [0, 1, 2, 0, 2, 3]:
			var v: Array = q[idx]
			st.set_normal(Vector3.UP); st.set_uv(Vector2(v[2], v[3]))
			st.add_vertex(v[0] + Vector3(0, v[1], 0))
	_mesh = st.commit()
	return _mesh

## katram kušķim identitātes matrica + aOff (x, z flīzē, pagrieziens, mērogs) — deterministiski
static func _buffer(seed: int) -> PackedFloat32Array:
	var rnd := Game.mulberry32(seed + 62)
	var b := PackedFloat32Array(); b.resize(COUNT * 16)
	for i in COUNT:
		var o := i * 16
		b[o] = 1.0; b[o + 5] = 1.0; b[o + 10] = 1.0
		b[o + 12] = float(rnd.call()) * TILE; b[o + 13] = float(rnd.call()) * TILE
		b[o + 14] = float(rnd.call()) * 6.28; b[o + 15] = 0.7 + float(rnd.call()) * 0.7
	return b

func attach(parent: Node3D) -> void:
	if not ok(): return
	node = MultiMeshInstance3D.new(); node.name = "Grass"
	node.multimesh = mm; node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.layers = 2   # sīkumi (kā web 1. slānis)
	parent.add_child(node)

func update(x: float, z: float) -> void:
	if mat: mat.set_shader_parameter("center", Vector2(x, z))

func set_quality(dens: float, r: float) -> void:
	if not ok(): return
	mm.visible_instance_count = roundi(COUNT * dens) if dens > 0 else 0
	mat.set_shader_parameter("grassR", r)

## uzartajos lauciņos zāles nav (tiles — [[ix, iz], …] pasaules flīzes)
func set_holes(tiles: Array, tile_size: float) -> void:
	if not ok(): return
	var data := gimg.get_data()
	for k in holed: data[k * 4 + 3] = alpha0[k]
	holed = PackedInt32Array()
	var cell := SIZE / R
	for e in tiles:
		var i0 := floori((int(e[0]) * tile_size + HALF) / cell)
		var i1 := floori(((int(e[0]) + 1) * tile_size + HALF) / cell)
		var j0 := floori((int(e[1]) * tile_size + HALF) / cell)
		var j1 := floori(((int(e[1]) + 1) * tile_size + HALF) / cell)
		for j in range(j0, j1 + 1):
			for i in range(i0, i1 + 1):
				if i < 0 or j < 0 or i >= R or j >= R: continue
				var k := j * R + i
				data[k * 4 + 3] = 0; holed.append(k)
	gimg.set_data(R, R, false, Image.FORMAT_RGBA8, data)
	gtex.update(gimg)
