class_name Mats
extends RefCounted
## Materiāli: daži ģenerēti šeideri (maz atšķirīgu šeideru = maz kompilēšanas, Crayfish mācība).
##  std   — rotaļlietas (virsotņu krāsa + CUSTOM0 = raupjums, metāls, mirdzums, vējš), apvienotie (rm), parastie
##          (krāsa/faktūra), daba (vējš pēc augstuma). Varianti: necaurspīdīgs/caurspīdīgs × viena/abas puses.
##  terrain — zeme ar 5 foto slāņiem pēc splat (kā web gfx.js terrainMaterial) + virsotņu krāsa.
## Krāsas: three.js krāsas un virsotņu krāsas jau ir lineāras → uniformām nav source_color.

static var _shaders := {}
static var _terrain_mat: ShaderMaterial
static var _tex_cache := {}

const STD := """
shader_type spatial;
render_mode {MODES};
global uniform float mz_time;
global uniform float mz_wind;
global uniform float mz_rim;
uniform vec4 albedo = vec4(1.0);
uniform vec4 uvx = vec4(1.0, 1.0, 0.0, 0.0);
uniform float rough = 0.8;
uniform float metal = 0.0;
uniform vec3 emit = vec3(0.0);
uniform float wind = 0.0;
uniform float flutter = 0.0;
uniform float alpha_cut = 0.0;
uniform float translucent = 0.0;
#ifdef MZ_TEX
uniform sampler2D tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
#endif
#ifdef MZ_NMAP
uniform sampler2D ntex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float nscale = 1.0;
#endif
varying vec4 pbr;
void vertex() {
	UV = vec2(UV.x * uvx.x + uvx.z, 1.0 - ((1.0 - UV.y) * uvx.y + uvx.w));
	pbr = vec4(rough, metal, 0.0, 0.0);
#ifdef MZ_TOY
	pbr = CUSTOM0;
	if (CUSTOM0.w > 0.0) {
		vec3 wq = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		float ph = wq.x * 0.37 + wq.z * 0.29;
		float gust = 0.65 + 0.35 * sin(mz_time * 0.55 + wq.x * 0.04);
		float k = CUSTOM0.w * mz_wind * gust;
		VERTEX.x += (sin(mz_time * 1.7 + ph) + 0.35 * sin(mz_time * 3.9 + ph * 2.3)) * 0.045 * k;
		VERTEX.z += cos(mz_time * 1.3 + ph * 1.4) * 0.032 * k;
		VERTEX.y += sin(mz_time * 2.3 + ph) * 0.006 * k;
	}
#endif
#ifdef MZ_RM
	pbr = vec4(CUSTOM0.x, CUSTOM0.y, 0.0, 0.0);
#endif
#ifdef MZ_NATURE
	{
		vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		float ph = wp.x * 0.07 + wp.z * 0.05;
		float k = max(0.0, VERTEX.y) * wind;
		float gust = 0.65 + 0.35 * sin(mz_time * 0.35 + wp.x * 0.012);
		VERTEX.x += (sin(mz_time * 1.25 + ph) * 0.7 + sin(mz_time * 2.9 + ph * 2.3) * 0.3) * k * gust;
		VERTEX.z += cos(mz_time * 1.05 + ph * 1.4) * 0.5 * k * gust;
		float f = flutter * gust;
		VERTEX += vec3(sin(mz_time * 7.0 + wp.y * 3.0 + wp.x), sin(mz_time * 6.0 + wp.z * 2.0) * 0.6, cos(mz_time * 6.5 + wp.x * 2.5)) * f * min(1.0, VERTEX.y * 0.3);
	}
#endif
}
void fragment() {
	vec4 a = albedo;
#ifdef MZ_VC
	a.rgb *= COLOR.rgb;
#endif
#ifdef MZ_TEX
	vec4 t = texture(tex, UV);
	a *= t;
#endif
	ALBEDO = a.rgb;
	ROUGHNESS = clamp(pbr.x, 0.04, 1.0);
	METALLIC = clamp(pbr.y, 0.0, 1.0);
	SPECULAR = 0.4;
	vec3 em = emit + a.rgb * (pbr.z + translucent);
	float fr = 1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0);
	em += mix(vec3(1.0), a.rgb, 0.45) * pow(fr, 3.0) * mz_rim * 0.35 * (1.0 - min(pbr.z, 1.0));
	EMISSION = em;
#ifdef MZ_NMAP
	NORMAL_MAP = texture(ntex, UV).rgb;
	NORMAL_MAP_DEPTH = nscale;
#endif
#ifdef MZ_ALPHA
	ALPHA = a.a;
#endif
#ifdef MZ_CUT
	ALPHA = a.a;
	ALPHA_SCISSOR_THRESHOLD = alpha_cut;
#endif
}
"""

static func shader(defs: Array, double: bool, blend: bool) -> Shader:
	var key := ",".join(defs) + ("|d" if double else "") + ("|b" if blend else "")
	if _shaders.has(key): return _shaders[key]
	var modes := ["cull_disabled" if double else "cull_back"]
	if blend: modes.append("depth_draw_opaque")
	var code := ""
	for dname in defs: code += "#define MZ_%s\n" % dname
	if blend: code += "#define MZ_ALPHA\n"
	var body: String = STD.replace("{MODES}", ", ".join(modes))
	# #define rindas pēc shader_type
	var lines := body.strip_edges().split("\n", false, 2)
	var sh := Shader.new()
	sh.code = lines[0] + "\n" + lines[1] + "\n" + code + lines[2]
	_shaders[key] = sh
	return sh

## Web materiāla apraksts → Godot materiāls. hint: "splat" (zeme), "toy" (pbr virsotnēs), "rm".
static func from_web(d: Dictionary, ws, hint: String = "") -> Material:
	var ud: Dictionary = d.get("ud") if d.get("ud") is Dictionary else {}
	var ck: String = str(d.get("ck", ""))
	if hint == "splat": return terrain()
	var defs: Array = []
	var vc: bool = d.get("vc", false)
	if vc: defs.append("VC")
	var toy: bool = ud.get("mzToy", false) or ck.begins_with("mztoy") or hint == "toy"
	if toy: defs.append("TOY")
	elif hint == "rm": defs.append("RM")
	var nat := ck.begins_with("nat")
	if nat: defs.append("NATURE")
	var map_i: int = int(d.get("map", -1))
	var t: Texture2D = ws.tex(map_i) if map_i >= 0 else null
	if t: defs.append("TEX")
	var nm_i: int = int(d.get("normalMap", -1))
	var nt: Texture2D = ws.tex(nm_i) if nm_i >= 0 else null
	if nt: defs.append("NMAP")
	var at: float = float(d.get("at", 0.0))
	if at > 0.0: defs.append("CUT")
	var blend: bool = d.get("tr", false) and float(d.get("op", 1.0)) < 0.999 or (d.get("tr", false) and at <= 0.0 and t != null)
	var double: bool = int(d.get("side", 0)) == 2
	var m := ShaderMaterial.new()
	m.shader = shader(defs, double, blend)
	var c: Array = d.get("color") if d.get("color") is Array else [1, 1, 1]
	m.set_shader_parameter("albedo", Color(float(c[0]), float(c[1]), float(c[2]), float(d.get("op", 1.0))))
	m.set_shader_parameter("rough", float(d.get("rough", 0.8)) if d.get("rough") != null else 0.8)
	m.set_shader_parameter("metal", float(d.get("metal", 0.0)) if d.get("metal") != null else 0.0)
	var e = d.get("emissive")
	if e is Array:
		var ei: float = float(d.get("ei", 1.0))
		m.set_shader_parameter("emit", Vector3(float(e[0]), float(e[1]), float(e[2])) * ei)
	if d.type == "MeshBasicMaterial":
		# neapgaismots: viss krāsa kā mirdzums
		m.set_shader_parameter("emit", Vector3(float(c[0]), float(c[1]), float(c[2])) * 0.9)
		m.set_shader_parameter("rough", 1.0)
	if t:
		m.set_shader_parameter("tex", t)
		var td: Dictionary = ws.j.texs[map_i]
		var rep: Array = td.get("rep", [1, 1]); var off: Array = td.get("off", [0, 0])
		m.set_shader_parameter("uvx", Vector4(float(rep[0]), float(rep[1]), float(off[0]), float(off[1])))
	if nt:
		m.set_shader_parameter("ntex", nt)
		var ns: Array = d.get("ns", [1, 1])
		m.set_shader_parameter("nscale", float(ns[0]))
	if at > 0.0: m.set_shader_parameter("alpha_cut", at)
	if nat:
		# nat<vējš>_<plīvošana>_<normāles>_<caurspīdība>
		var p := ck.substr(3).split("_")
		if p.size() >= 4:
			m.set_shader_parameter("wind", float(p[0]))
			m.set_shader_parameter("flutter", float(p[1]))
			m.set_shader_parameter("translucent", float(p[3]))
	if int(d.get("ro", 0)) != 0: m.render_priority = clampi(int(d.get("ro", 0)), -128, 127)
	return m

# ---------- zeme ----------
const TER := """
shader_type spatial;
render_mode cull_back;
uniform sampler2D a0 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a1 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a2 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a3 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D a4 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n0 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n1 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n2 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n3 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n4 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float photo = 1.0;
varying vec3 wpos;
varying vec3 wnor;
varying vec4 spl;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnor = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	spl = clamp(CUSTOM0, 0.0, 1.0);
}
vec3 lay(sampler2D t, vec2 p, float sc) {
	vec2 uv = p * sc;
	vec3 a = texture(t, uv).rgb;
	vec2 uv2 = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * uv * 0.23 + vec2(0.37, 0.11);
	vec3 b = texture(t, uv2).rgb;
	return mix(a, b, 0.42);
}
void fragment() {
	float w0 = max(0.0, 1.0 - spl.x - spl.y - spl.z - spl.w);
	float w[5] = float[5](w0, spl.x, spl.y, spl.z, spl.w);
	vec2 p = wpos.xz;
	vec3 al[5];
	al[0] = w[0] > 0.015 ? lay(a0, p, 0.09) : vec3(0.0);
	al[1] = w[1] > 0.015 ? lay(a1, p, 0.28) * vec3(0.62, 0.62, 0.5) : vec3(0.0);
	al[2] = w[2] > 0.015 ? lay(a2, p, 0.22) : vec3(0.0);
	al[3] = w[3] > 0.015 ? lay(a3, p, 0.20) * vec3(0.85, 0.85, 0.8) : vec3(0.0);
	al[4] = w[4] > 0.015 ? lay(a4, p, 0.14) * 1.15 : vec3(0.0);
	float ma = 0.0;
	float hg[5];
	for (int i = 0; i < 5; i++) { hg[i] = dot(al[i], vec3(0.6)); ma = max(ma, hg[i] + w[i]); }
	float tw[5];
	float tot = 0.0;
	vec3 alb = vec3(0.0);
	for (int i = 0; i < 5; i++) { tw[i] = w[i] > 0.015 ? max(hg[i] + w[i] - ma + 0.22, 0.0) : 0.0; tot += tw[i]; alb += al[i] * tw[i]; }
	alb /= max(tot, 1e-4);
	vec3 vc = COLOR.rgb;
	float snow = smoothstep(0.6, 0.78, min(vc.r, min(vc.g, vc.b)));
	vec3 col = alb * mix(vec3(1.0), vc * 3.6, 0.32);
	col = mix(col, vec3(0.93, 0.95, 0.98), snow);
	col = mix(vc * 1.05, col, photo);
	ALBEDO = col;
	ROUGHNESS = 0.93;
	SPECULAR = 0.25;
	vec3 nt = vec3(0.0);
	if (tw[0] > 0.0) nt += (texture(n0, p * 0.09).xyz * 2.0 - 1.0) * tw[0];
	if (tw[1] > 0.0) nt += (texture(n1, p * 0.28).xyz * 2.0 - 1.0) * tw[1];
	if (tw[2] > 0.0) nt += (texture(n2, p * 0.22).xyz * 2.0 - 1.0) * tw[2];
	if (tw[3] > 0.0) nt += (texture(n3, p * 0.20).xyz * 2.0 - 1.0) * tw[3];
	if (tw[4] > 0.0) nt += (texture(n4, p * 0.14).xyz * 2.0 - 1.0) * tw[4];
	nt /= max(tot, 1e-4);
	nt.xy *= 1.1 * photo;
	vec3 N = normalize(wnor);
	vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
	vec3 B = cross(T, N);
	vec3 wn = normalize(T * nt.x + B * nt.y + N * max(nt.z, 0.2));
	NORMAL = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);
}
"""

static func terrain() -> ShaderMaterial:
	if _terrain_mat: return _terrain_mat
	var sh := Shader.new()
	sh.code = TER
	var m := ShaderMaterial.new()
	m.shader = sh
	var L := ["meadow", "forest", "sand", "dirt", "rock"]
	for i in 5:
		m.set_shader_parameter("a%d" % i, load("res://assets/tex/%s_c.jpg" % L[i]))
		m.set_shader_parameter("n%d" % i, load("res://assets/tex/%s_n.jpg" % L[i]))
	_terrain_mat = m
	return m
