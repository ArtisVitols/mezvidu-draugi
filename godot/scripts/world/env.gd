class_name Env
extends RefCounted
## Debesis, saule un gaisma (web: Sky saule 38° augstumā, azimuts 140°; ACES → šeit AgX)

static func sun_dir() -> Vector3:
	# THREE setFromSphericalCoords(1, 90°−38°, 140°): x = sin(phi)·sin(theta), y = cos(phi), z = sin(phi)·cos(theta)
	var phi := deg_to_rad(90.0 - 38.0)
	var th := deg_to_rad(140.0)
	return Vector3(sin(phi) * sin(th), cos(phi), sin(phi) * cos(th)).normalized()

static func make(parent: Node) -> Dictionary:
	var we := WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.22, 0.45, 0.82)
	sm.sky_horizon_color = Color(0.68, 0.8, 0.9)
	sm.ground_horizon_color = Color(0.62, 0.72, 0.8)
	sm.ground_bottom_color = Color(0.3, 0.36, 0.3)
	sm.sun_angle_max = 18.0
	sm.sun_curve = 0.08
	sky.sky_material = sm
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.9
	e.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	e.tonemap_mode = Environment.TONE_MAPPER_AGX
	e.tonemap_exposure = 1.0
	e.fog_enabled = true
	e.fog_mode = Environment.FOG_MODE_DEPTH
	e.fog_light_color = Color(0.66, 0.77, 0.86)
	e.fog_depth_begin = 110.0
	e.fog_depth_end = 380.0
	e.fog_sky_affect = 0.0
	we.environment = e
	parent.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.95, 0.86)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 70.0
	sun.shadow_bias = 0.04
	parent.add_child(sun)
	sun.look_at_from_position(sun_dir() * 100.0, Vector3.ZERO, Vector3.UP)
	return {"env": e, "sun": sun, "we": we}
