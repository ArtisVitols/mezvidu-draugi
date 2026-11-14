# Mežvidu Draugi — notes for Claude

Multiplayer (up to 4) 3D adventure game for **phone browsers**, all UI text in **Latvian**.
Static site: plain HTML + ES modules, no build step. three.js r160 and PeerJS 1.5.4 load from unpkg
(see the importmap in `index.html`).

- Live: https://artisvitols.github.io/mezvidu-draugi/
- Repo: https://github.com/ArtisVitols/mezvidu-draugi (public; GitHub Pages serves `main` / root)

## Release rules (always follow)
1. **Bump the version** in `js/version.js` (`VERSION`, `BUILD_DATE`) before every deploy.
   Semver-ish: minor for features or visual overhauls, patch for small fixes.
   The version shows on the name screen and in the in-game ☰ menu.
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
| `js/version.js` | Version shown in the UI |

## Conventions / gotchas
- Code comments and UI strings are in Latvian; keep it that way.
- Performance matters (phones): use instancing and chunk instanced meshes for frustum culling,
  merge static parts with `optimizeRig`, and cache textures and materials (never create a canvas texture per instance).
  There is a "🎨 Grafika: Augsta/Zema" quality toggle (`world.lowQ`) plus an automatic fps fallback.
- `optimizeRig` keeps `uv` only if every merged geometry has it.
- World generation must stay deterministic (`WORLD_SEED`, seeded `mulberry32`) so every player sees the same world.
  Random visual-only details (canvas textures) may use `Math.random`.
- Don't share object references between host state and client state (clone), as earlier bugs came from that.

## Testing
- Local server: `python3 -m http.server 8765` in the project root.
- Headless Chromium (playwright-core, swiftshader) works for screenshots and logic checks but runs at <1 fps,
  so it can't judge real phone performance. Use `window.__game` to inspect or teleport (`__game.me.pos`, `__game.cam`).
