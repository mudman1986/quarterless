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

## Assets & the art decision

Authored art is **procedural / data-driven**: every sprite frame is described as a small table
of drawing ops (rects, circles, ellipses, SVG-style paths) in
[src/game/art/spriteArt.ts](src/game/art/spriteArt.ts) and rasterized once into Phaser
**CanvasTextures** at scene start via `generateGameTextures(scene, keys)`.
[src/game/art/textures.ts](src/game/art/textures.ts) owns the texture keys/frame maps and
exposes `preloadGameTextures(scene)`, which just delegates to the generator. There are **no
binary art assets and no image decode** at launch.

Why this shape (do not regress it):

- **No load-time decode cost.** The previous design shipped hand-written **SVG spritesheets**
  loaded with `this.load.spritesheet(...)`. SVG rasterizes to a bitmap once at load (so it was
  never a per-frame problem), but the **decode is slower than PNG and re-incurred on every
  launch**, because leaving a game calls `game.destroy(true)`, which wipes the texture cache.
  Generating from a data table is effectively instant and needs no network round-trip.
- **Art is diff-able TS data** — reviewable in a PR, editable by AI without a build/export step,
  and free of binary blobs. This suits an AI-managed pixel-art project better than PNG/SVG.
- Frames are drawn with the Canvas 2D API; `path` ops accept raw SVG path `d` strings via
  `new Path2D(...)`, so faithful shapes are cheap to author without an SVG image decode.
- Consolidate frames into as few sheets as possible so sprites batch (fewer texture swaps =
  fewer draw calls). The current 4-sheet layout (vehicles / people / tiles / effects) plus the
  single ammo image is good; keep it that way.
- `buildSheet()`/`buildImage()` guard on `textures.exists(...)`; keep that guard so a
  `scene.restart()` never regenerates textures.
- Every generated `CanvasTexture` sets `FilterMode.NEAREST` for crisp pixel-art scaling — keep
  it in step with `pixelArt: true` in the game config.

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
