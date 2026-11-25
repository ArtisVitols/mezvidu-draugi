# Mežvidu Draugi — Godot Android port (branch `godot-android`)

Port of the web game (repo root, `js/`) to a Godot 4.7.2 Android app. **Work only on branch `godot-android`; never merge into main.**
Guide: `~/PROJECTS/Clay/godot-port-guide/index.html`. Reference Godot project: `~/PROJECTS/Clay/crayfish` (branch `android-next`).

## User decisions (2026-11-25)
- 100 % the same functions/features as the web game, remade beautifully; **only add** on top (e.g. manual graphics settings next to Auto).
- Multiplayer: **same Wi-Fi only**, Godot ENet; host phone = server; room code found by LAN UDP broadcast, manual IP fallback.
  (The public PeerJS server drops non-browser clients — tested; user chose LAN.) No cross-play with the browser.
- Deliver only the finished app; final message = download link from a **GitHub release on this branch** (public repo).
- Saves start fresh in the app. Package `lv.artis.mezvidi`, own keystore (`~/.android_keys/mezvidi-release.keystore`,
  passwords via env `GODOT_ANDROID_KEYSTORE_RELEASE_*`, never in the repo).
- UI text and code comments in Latvian (like the web game).

## How the port works
1. **Export from the running web game** (exact same worlds/models): `tools/export/` (repo root). Needs the web server
   (`python3 -m http.server 8765` in repo root) and playwright-core (scratchpad `pw/node_modules`, symlinked).
   - `dump.js` `dumpObject(root)` → three.js object tree → `godot/web/<name>.json + .bin` (nodes, geometry attributes incl.
     custom `splat`/`pbr`/`sway`/`rm`/skin, materials incl. `customProgramCacheKey` (`ck`), canvas textures as PNG).
   - `dumpData(obj)` → plain data (typed arrays → bin) → `godot/web/data/<name>.json + .bin`.
   - `node tools/export/export.mjs lands|data|assets [names]`. Generated files are git-ignored: re-run before building.
2. **Godot loads them**: `scripts/core/web_scene.gd` (`WebScene.open(name).build()`; CCW→CW winding, UV v flip,
   InstancedMesh → MultiMesh, SkinnedMesh → Skeleton3D + Skin driven by `BoneSync` from the bone Node3D groups, so
   animation code rotates groups like the web code). `scripts/core/mats.gd` (`Mats`): generated `std` shader variants
   (TOY pbr+sway, RM, NATURE wind, VC, TEX, NMAP, CUT, ALPHA × cull) and the 5-layer photo `terrain` shader (port of gfx.js).
   Global shader uniforms `mz_time`, `mz_wind`, `mz_rim`.
3. **Gameplay logic is hand-ported** from `js/*.js` into GDScript (same names where possible). Mixins become child nodes.

## Animals' colours
Animal vertex colours are affine in the fur and shirt colour (linear space): export each species with
(fur 0, shirt 0), (fur 1, shirt 0), (fur 0, shirt 1) → per vertex c = b + (f1 − b)·fur + (s1 − b)·shirt.

## Commands
```
G=~/tools/godot/godot
$G --headless --path godot --import
DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 $G --path godot --resolution 1280x720 -- --autotest=landshot --land=forest --view=x,y,z,tx,ty,tz --out=/path.png
```
Xvfb: `X=~/tools/xvfb/root; LD_LIBRARY_PATH=$X/usr/lib/x86_64-linux-gnu $X/usr/bin/Xvfb :99 -screen 0 1600x900x24 -xkbdir $X/usr/share/X11/xkb -nolisten tcp &`
Tests: `godot/tests/<name>.gd`, run with `-- --autotest=<name>`; excluded from export.

## Progress
- [x] Project skeleton, exporter, loader, materials, forest renders (2026-11-25)
- [ ] Export all lands (c farm yard, e, w, n winter, s trail) + data
- [ ] Export assets (animals ×3 colour bases, hats, wear, NPCs, vehicles, props, crops, trees, decor…)
- [ ] Core: Game autoload (data.js, save.js), land loading, player movement/camera/controls, HUD
- [ ] Systems: farm, garden, activities, vehicles, bus, winter, trail, wildlife, bugspot, race, minigames, shops, map, bag
- [ ] Net (ENet LAN), audio + voices, quality (auto + manual), perf log, Android export, release
