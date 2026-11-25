extends Node
## Globālie dati un iestatījumi (vēlāk: data.js, save.js)

func arg(name: String, def: String = "") -> String:
	for a in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if a == "--" + name: return "1"
		if a.begins_with("--" + name + "="): return a.substr(name.length() + 3)
	return def
