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
Always run tests without sound: `--audio-driver Dummy` (main.gd also mutes the master bus for `--autotest`/`--autosolo`/`--mute`).
Full check before a release: `compile farm drive bus winter trail audio glyphs full`, `buttons` (Xvfb: every button with real touch events) (headless; `full` with `--shots=dir` under Xvfb for screenshots),
`menu`, `winterwalk`, `zonemem`, `crashlog` (Xvfb), and the two-process tests `lan` and `lanfull` (start `--role=host`, then `--role=join` [--ip=127.0.0.1]).
`glyphs` checks every character in scripts/data exists in the bundled fonts (system font fallback is off, like on a phone).
Exported-pack check: `--export-pack Android x.pck`, then `godot --main-pack x.pck -- --autosolo=Name --shot=out.png`.

## Progress
- [x] Project skeleton, exporter, loader, materials, forest renders (2026-11-25)
- [x] Export all lands (c farm yard, e, w, n winter, s trail) + data
- [x] Export assets (animals ×3 colour bases, hats, wear, NPCs, vehicles, props, crops, trees, decor, trail items, wildlife)
- [x] Core: Game autoload (data.js, save.js), land loading, player movement/camera/controls, HUD
- [x] Systems: farm, garden, activities, vehicles, bus, winter, trail, wildlife, bugspot, race, minigames, shops, map, bag
- [x] Audio (autoload `Aud`, scripts/core/audio.gd) + sound layer (g_sound.gd); quality Auto + manual extras (g_quality.gd); start menu (scripts/ui/menu.gd) — menu not yet run-tested
- Chain: … GWinter → GTrail → GBugSpot → GSound → GQuality → Play
- [x] Menu test, 2-process LAN test (`--autotest=lan --role=host|join [--ip=]`), grass field (scripts/world/grass.gd), team-bar placement, Android export
- [x] Released **android-2.0.0** (2026-11-25): GitHub release on this branch, asset `MezviduDraugi-2.0.0.apk`
- [x] 2.0.1: full app test (`full`, `lanfull`, `glyphs`), fixes: panel rebuild freeing the pressed button, missing glyphs (DejaVu symbol subset), grass hidden right at the camera
- [x] 2.0.2 (user feedback): a phone tap = emulated mouse click THEN the touch event; HUD buttons fired on press and the touch then hit the
  panel backdrop → panels closed at once (bag, menu, settings tile, map). Fix: HUD panel buttons act on release (`UI.press`, only jump/action on
  press), backdrop closes only on a full click outside the box ≥ 350 ms after opening, minimap + prize card react to full mouse clicks only.
  Test `buttons` (fails on the old code). Grass 70 % lower (0.15 m) and denser (`grass.gd` 60 000 tufts in 50 m, 2 quads); low levels thin less.
  Ground textures now mipmapped + VRAM-compressed; non-photo terrain uses each layer's 1×1 mip colour (was nearly black).
- [x] 2.0.3: the app crashed in the winter land on the phone — the snowfall was the only `GPUParticles3D` (crashes on some Android GPUs
  in Compatibility). Now `scripts/world/snowfall.gd` (MultiMesh, the vertex shader moves the flakes around the camera). Never use GPUParticles.
  Test `zonemem` (Xvfb: walks over the border into winter and between lands, memory). **Fixed download link** from 2.0.3 on (see below).
- [ ] Winter crash NOT solved by 2.0.3: user says it crashes when walking on snow, not on the road (only code difference: the
  `st_snow` footstep sound; desktop can't reproduce — `winterwalk` test passes, sounds decode fine). User refused adb.
- [x] 2.0.4: **📋 crash log** (autoload `CrashLog`, scripts/core/crashlog.gd, first autoload): every line flushed to `user://zurnals/now.txt`,
  rotated to prev1..3 on start; device/GPU, all errors/warnings/prints (Logger), state line every 2 s (`crashState()` in g_quality.gd),
  sounds, land changes, actions, panels, toasts, quality. Unclean end = last line without `[beigas]`/`[fonā]`. Start screen button
  (highlighted „⚠️ Iepriekšējā reize avarēja”) + ☰ tile 📋 Žurnāls → copy to clipboard. Test `crashlog` (Xvfb, `--step=1` crashes with
  OS.crash, then `--step=2`). **When the user pastes a log: read the last lines before the end to find the crash.**
- Ideas next: real-phone performance check (user feedback), planar water reflection, horizon skirt, smaller APK (compress land bins)

## Android build
Keystore `~/.android_keys/mezvidi-release.keystore` (alias `mezvidi`), password in `~/.android_keys/mezvidi-release.pass` (outside the repo).
```
cd godot; P=$(cat ~/.android_keys/mezvidi-release.pass)
GODOT_ANDROID_KEYSTORE_RELEASE_PATH=~/.android_keys/mezvidi-release.keystore GODOT_ANDROID_KEYSTORE_RELEASE_USER=mezvidi \
GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD=$P ~/tools/godot/godot --headless --path . --export-release Android ../build/MezviduDraugi-<ver>.apk
```
**Release = always the same link** (user wish): tag `android` (moved to the new commit each time), asset `MezviduDraugi.apk`:
`git tag -f android && git push -f origin android`, `gh release upload android build/MezviduDraugi.apk --clobber`, update the release title/notes
with the version. Link: https://github.com/ArtisVitols/mezvidu-draugi/releases/download/android/MezviduDraugi.apk
Before building: re-export web data (`tools/export/export.mjs lands` — land_*.bin/json are git-ignored).
