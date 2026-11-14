# Mežvidu Draugi — notes for Claude

Multiplayer (up to 4) 3D adventure game for **phone browsers**, all UI text in **Latvian**.
Static site: plain HTML + ES modules, no build step. Photo textures in `assets/` (CC0). three.js r160 and PeerJS 1.5.4 load from unpkg
(see the importmap in `index.html`).

- Live: https://artisvitols.github.io/mezvidu-draugi/
- Repo: https://github.com/ArtisVitols/mezvidu-draugi (public; GitHub Pages serves `main` / root)

## Release rules (always follow)
1. **Bump the version** before every deploy with `node tools/bump-version.mjs X.Y.Z`
   (minor for features or visual overhauls, patch for small fixes). The script updates `js/version.js`
   and adds `?v=X.Y.Z` to every relative import and to the `index.html` script/css links, so phones load new files
   instead of cached ones. Never hand-edit those `?v=` tags, and give new modules imports in the same
   `from './x.js?v=…'` form. All imports of one module must use the same URL, or it loads twice.
   The version shows on the name screen and in the in-game ☰ menu. On start, `main.js` fetches `js/version.js`
   with no-store and reloads with `?v=<new>` if the server has a newer version than the cached page.
2. Add an entry to `CHANGELOG.md`.
3. Commit, push to `main`, then wait until Pages serves the new files, e.g.
   `curl -s https://artisvitols.github.io/mezvidu-draugi/js/version.js`.
4. **Always tell the user the deployed version number** in the final message.
5. Keep `README.md` (Latvian, player-facing) up to date when features change.

## Files
| File | What |
|---|---|
| `index.html` | All screens and HUD markup, importmap |
| `css/style.css` | Mobile layout, safe areas |
| `js/main.js` | Menu flow (name → character → room), character preview, launches `Game` |
| `js/game.js` | `Game`: renderer/sky/lights, player movement, karts, race, shops, quests, host logic, net messages |
| `js/world.js` | Procedural terrain (`WORLD_SEED`), water, track, village houses, trees, GPU grass field, rocks, flowers, reeds, clouds, mushroom/star/NPC spawn points |
| `js/characters.js` | Player animals (rigged, pose-blended animation), hats, NPC forest animals, kart, vendor carts, mushrooms, stars, crops; `optimizeRig` merges meshes per material |
| `js/util.js` | Text sprites, cached materials, `natureMaterial` (wind shader), procedural canvas textures (leaves, needles, grass, fur, cloth, stone) |
| `js/net.js` | PeerJS wrapper. Host is authoritative; peer ID prefix `mezvidu-draugi-lv-v1-` + 5-char room code |
| `js/save.js` | localStorage saves per player name (`mezvidi_save_v1_<name>`) |
| `js/data.js` | Game data: animals, crops, mushrooms, hats, quests, NPC types |
| `js/places.js` | Special places (tower, camp, swamp, ruins, pier): deterministic site search before the height grid, terrain flattening (`placeHeight`), models, walkable platforms, berry bush spots |
| `js/props.js` | Berry bushes (cloned templates), garden decorations + `DECOR_SPOTS`, fishing rod, bobber |
| `js/activities.js` | `Activities` mixin on `Game.prototype`: fishing, berries, pets, decor, discovery, treasure, tag/hide-and-seek (host-run), weekly team goal |
| `js/gfx.js` | Realistic graphics: photo terrain material (5-layer `sampler2DArray` splat), HDRI environment, water shader upgrade, `PlanarReflection`, `PostFX` (AO, bloom, ACES + grading) |
| `assets/` | Poly Haven CC0 textures (`tex/*_c.jpg` albedo 1024, `*_n.jpg` normal 512) and `sky.hdr` (256×128) |
| `TODO.md` | Planned next ideas (graphics points 5–6, places not built yet) |
| `js/version.js` | Version shown in the UI |
| `tools/bump-version.mjs` | Sets the version and cache-busting `?v=` tags |

## World size & rendering budget
- `SIZE` 960 m terrain, `SEG` 384 (2.5 m cells), playable circle `PLAY_RADIUS` 420 m (edge rises into hills from `EDGE`).
- Terrain is 8×8 tiles with normals from the global height grid.
- Trees are grouped into `LOD_CH` (80 m) chunks in `world.lodChunks`. Near chunks (<100 m) show full instanced trees;
  far chunks show impostors: crossed quads textured from an atlas rendered at startup by `makeImpostorAtlas`
  (needs `world.build(scene, renderer)`).
- Small details (rocks, flowers, reeds, lilies) use `world.chunked(...)` with a max view distance.
- `world.updateVisibility(camX, camZ)` runs every 0.3 s from the game loop.
- Grass is a GPU field around the player, sampling height and ground-colour textures.
- Special places come from `findPlaces` in the `World` constructor (needs `computeHeight`, runs before `computeHeights`).
  `world.groundAt(x, z, y)` = terrain or a platform (pier, tower top, swamp boardwalk); player walking uses it.
  Trees, rocks and mushrooms skip `inPlace(...)` areas.
- Quality (`mezvidi_quality`): `high` = photo textures + reflection + PostFX; `mid` = photo textures only; `low` = old look.
  With PostFX the scene renders into a HalfFloat MSAA target, so tone mapping/sRGB happen in the PostFX composite shader.
  If fps < 32 the game first disables PostFX + reflection, then the older pixel-ratio/shadow fallbacks apply.
- Terrain splat weights come from `world.splatAt()` (forest, sand, dirt, rock; meadow = remainder) as a `splat` vertex attribute.
- Layer 1 = small details (grass field, flowers, rocks) that the water reflection camera skips; the main camera enables layer 1.
- Minimap: `mapBase` is a canvas of the whole world; the HUD minimap shows ~130 m around the player, and tapping it opens the full map.

## Conventions / gotchas
- Code comments and UI strings are in Latvian; keep it that way.
- Performance matters (phones): use instancing and chunk instanced meshes for frustum culling,
  merge static parts with `optimizeRig`, and cache textures and materials (never create a canvas texture per instance).
  There is a "🎨 Grafika: Augsta/Zema" quality toggle (`world.lowQ`) plus an automatic fps fallback.
- `optimizeRig` keeps `uv` only if every merged geometry has it.
- World generation must stay deterministic (`WORLD_SEED`, seeded `mulberry32`) so every player sees the same world.
  Random visual-only details (canvas textures) may use `Math.random`.
- Don't share object references between host state and client state (clone), as earlier bugs came from that.
- Host-authoritative shared things: mushroom/berry picks (`pick`/`pickB`), weekly team goal (`teamAdd`, merged by max
  from each player's `save.weekly` on `hello`), mini-games (`mgStart`, `hostMgTick`). Unknown messages fall through to
  `hostActivity` / `onActivityMessage` in `activities.js`.
- `ANIM` order in `game.js` is the network encoding of animation states; only append to it.

## Testing
- Local server: `python3 -m http.server 8765` in the project root.
- Headless Chromium (playwright-core, swiftshader) works for screenshots and logic checks but runs at <1 fps,
  so it can't judge real phone performance. Use `window.__game` to inspect or teleport (`__game.me.pos`, `__game.cam`).
