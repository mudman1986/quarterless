# Copilot instructions — Quarterless retro arcade

A static, GitHub-Pages browser arcade (Vite + TypeScript). The landing page lazy-loads
individual games. The flagship game **Sindicate** is a top-down open-city game built on
**Phaser 4**; **Penguins of Tangram** is a Phaser platformer; the rest are tiny vanilla
canvas games.

## Architecture rules (do not break these)

- **Simulation lives in `src/core/*` and never imports Phaser.** These modules are pure,
  deterministic, and unit-tested in Node with Vitest. Keep game logic (physics, AI,
  missions, wanted level, health, scoring) here so it stays headless-testable.
- **Phaser only appears in `src/game/*` and `src/games/*`.** These are lazy-loaded chunks;
  Phaser is isolated in its own vendor chunk and must not be pulled into the landing page.
- The scene layer (`src/game/scenes/CityScene.ts`) reads from `core` each frame and renders;
  it should not own gameplay rules.
- Story content lives in `src/game/story/*`. Note `deadDropDistrict.ts` is misleadingly
  named — it holds all authored chapters. `storyMode.test.ts` asserts exact chapter/mission
  counts; bump them when adding content.

## Simulation / render loop conventions

- `World.tick()` runs on a **fixed-step accumulator** (`FIXED_STEP` / `MAX_SUBSTEPS`).
- **Always clamp the frame delta** before feeding time into per-frame logic: use
  `dt = Math.min(deltaMs / 1000, MAX_FRAME_DT)`. Unclamped deltas after a tab refocus or GC
  pause have caused instant mission failures and one-frame lethal speed spikes. Never pass a
  raw Phaser `deltaMs` into timers or fail-rule countdowns.
- Sprites use **persistent pools** keyed by index (`carSprites`, `pedSprites`, …). Reuse and
  `setVisible(false)` surplus entries; do not create/destroy game objects every frame.
- Throttle expensive redraws (e.g. the minimap redraws on an interval, not every frame).

## Phaser 4 guidance

This project is on Phaser `^4.2`. Domain skills live in `.github/skills/<topic>/SKILL.md` —
read the relevant one before non-trivial Phaser work (game-setup, sprites, tilemaps,
physics-arcade, filters-and-postfx, tweens, etc.).

- Standard game objects (Sprite, Image, Text, Group, Tilemap, Container) and Arcade/Matter
  physics carry over from v3 with minimal changes.
- v4 breaking changes to watch for: custom WebGL **pipelines → render nodes**;
  **FX & Masks → the unified Filters system**; `setTintFill()` → `setTint()` + `setTintMode()`;
  `Geom.Point` → `Vector2`; `Math.TAU` is now `PI * 2`; Mesh/Plane removed. Enabling lighting
  is now `sprite.setLighting(true)` instead of `setPipeline('Light2D')`.
- For scenes with very large numbers of moving objects or huge tilemaps, prefer the v4
  GPU objects (`SpriteGPULayer`, `TilemapGPULayer`) over thousands of individual sprites.
- `pixelArt: true` in the game config **automatically** sets `antialias: false`,
  `antialiasGL: false`, and `roundPixels: true`. Do not fight it with manual smoothing.
- Set `render: { powerPreference: 'high-performance' }` in the game config to request the
  discrete GPU where available.

## Assets & the SVG decision

Authored art currently ships as hand-written **SVG spritesheets** loaded via
`this.load.spritesheet(key, url, { frameWidth, frameHeight })` in
`src/game/art/textures.ts`.

- **SVG textures are rasterized to a bitmap once at load** — they cost the same as PNG at
  render time. SVGs are *not* a per-frame performance problem.
- The real cost is **load-time decode** (SVG decodes slower than PNG) and it is re-incurred on
  every game launch, because navigating out of a game calls `game.destroy(true)`, which wipes
  the texture cache.
- For a **pixel-art** game (`shape-rendering="crispEdges"`), SVG offers **no runtime benefit**
  over PNG — it is rasterized anyway. Prefer **PNG spritesheets** or the v4 **PCT atlas**
  (typically 90–95% smaller than JSON atlases) for production to cut load time.
- Keep the SVGs as the *authoring source* if you like them, but rasterize/export to PNG at
  build time rather than shipping raw SVG to the loader.
- Consolidate frames into as few sheets as possible so sprites batch (fewer texture swaps =
  fewer draw calls). The current 4-sheet layout (vehicles / people / tiles / effects) is good;
  keep it that way.
- `preloadGameTextures()` guards every load with `textures.exists(...)`; keep that guard so a
  `scene.restart()` never re-decodes assets.

## Testing & verification (required before declaring work done)

- Unit tests: `npm test` (watch) / `npm run test:run` (once, with coverage) — Vitest against
  `src/core/*` and other pure modules.
- Browser tests: `npm run test:e2e` — Playwright against the production preview.
- **Always run `npm run lint` and `npm run typecheck` as final steps.**
- **Regression tests must be red/green verified**: temporarily revert the fix, confirm the new
  test fails, restore the fix, confirm it passes. A test that never went red proves nothing.
  Also sanity-check that any threshold/tick-budget in the test is achievable before trusting it.
- Test hooks: `window.__game` (Phaser game), `window.__arcadeGame.triggerGameOver(score?)`,
  `window.__penguinsOfTangram`. After launcher transitions or `scene.restart(...)`, wait for
  the scene to rebuild (`world`/`hud` present) — `window.__game` alone is too early.

## Housekeeping

- **Update the docs (`README.md`, `STORY_MODE.md`) as part of any change that affects them.**
- Don't add speculative abstractions or features beyond what's asked; the pure-core /
  thin-render split is deliberate — keep it lean.
