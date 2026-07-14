# Phaser Skill Refactor Audit

This audit compares every skill in `.github/skills` with the Phaser implementation shipped on the Quarterless GitHub Pages site. It covers Sindicate (`src/game` and `src/games/sindicate`) and Penguins of Tangram (`src/games/penguins-of-tangram`). Pixel Sprint and Void Sweep are vanilla Canvas games and are outside the Phaser-specific review.

## How To Use This Document

Each chapter records the current approach, its meaningful difference from the skill, a `Keep`, `Refactor`, or `Not applicable` decision, the implementation task, and the expected benefit. A difference from a Phaser convenience API is not treated as debt when the project architecture provides a simpler or more testable solution.

All work must preserve these constraints:

1. Gameplay simulation stays deterministic and Phaser-free in `src/core`.
2. Phaser remains lazy-loaded behind individual game entry points.
3. Generated CanvasTextures remain the authored-art format.
4. Steady-state rendering reuses persistent objects.
5. Raw frame deltas are clamped, fixed-step work is capped, and stale backlog is discarded.

## Audit Summary

| Priority | Work item | Skills affected | Why it is justified |
| --- | --- | --- | --- |
| Complete | R1: Move Penguins gameplay to a pure fixed-step simulation | debugging, performance, Arcade Physics | Completed with a Phaser-free simulation core, bounded fixed-step scene adapter, and red/green browser backlog regression. |
| Complete | R2: Publish Penguins power state only on transitions | performance, text | Completed with core transition events and a red/green browser regression covering idle, pickup, and expiry publication. |
| Complete | R3: Reuse Phaser's audio context and clean up procedural nodes | audio | Completed on 2026-07-14 with Phaser-managed context/output routing, active-node cleanup, and red/green unit regressions. |
| Complete | R4: Remove steady-state particle allocations | particles, performance | Completed on 2026-07-14 with in-place survivor updates and array compaction, backed by a red/green browser regression. |
| Complete | R5: Reuse visual-feedback frame state | performance | Completed on 2026-07-14 by reusing pickup identity sets and car history arrays instead of allocating three collections plus pickup key strings per rendered frame. |

The remaining differences are intentional. Every `Keep` decision was revalidated after R3-R5, and none warranted promotion to a refactor. In particular, this audit rejects a speculative rewrite of Sindicate's `Graphics` layers: traffic lights and corpses are state-guarded, touch controls are dirty-key guarded, the minimap is throttled, and only genuinely dynamic feedback is redrawn continuously. No measured evidence supports replacing those layers with many Shape objects.

## Start-Ready Refactor Tasks

### R1. Extract And Fix-Step Penguins Gameplay

**Owners:** `src/games/penguins-of-tangram/index.ts`; new `src/core/tangramPlatformer.ts` and `src/core/tangramPlatformer.test.ts`; `e2e/performance.spec.ts`.

**Status:** Complete.

**Implementation:** `TangramPlatformerState` now owns player physics, collision, enemy patrol and stomps, collectibles, hazards, bounce pads, checkpoints, respawn shielding, simulation-time power/hint expiry, and completion. `PenguinsOfTangramScene` samples input once per rendered frame, latches the jump edge for one substep, runs at 60 Hz with a five-substep cap, discards stale backlog, synchronizes persistent Containers once, and translates core events to HUD, camera, and completion effects. Vitest covers 30/60/120 Hz equivalence, maximum-speed landing, power duration, and invulnerability duration. The browser accumulator test first failed because the scene had no accumulator, then passed after the fixed-step adapter; the existing five-zone campaign and reachability regression also passes.

**Steps:**

1. Define Phaser-free input, player, enemy, collectible, checkpoint, power-up, and level-collision state in `src/core/tangramPlatformer.ts`. Export a pure `tickTangramPlatformer(state, input, dt)` operation and event records for presentation effects such as hints, camera shake, collection, respawn, and completion. Do not import from `src/game` or Phaser; pass structurally compatible level and character values into the core.
2. Move gravity, acceleration, drag, enemy patrols, AABB resolution, bounce pads, hazards, stomps, checkpoint activation, power duration, respawn shielding, and goal completion out of `PenguinsOfTangramScene`. Keep Game Objects, camera effects, keyboard sampling, HUD callbacks, and render synchronization in the scene.
3. Add scene constants for a fixed step, maximum substeps, and maximum frame delta. Reset an accumulator in `create()`, sample keyboard input once per render, latch jump-edge input for the first substep, run bounded core ticks, and discard stale debt when the substep cap is reached.
4. Synchronize Containers and visibility from the resulting core state once per rendered frame. Translate core events to `setHint`, camera shake, HUD updates, and completion callbacks after stepping.
5. Add unit tests proving that equivalent input over 30 Hz, 60 Hz, and 120 Hz frame chunking reaches the same state; collisions do not tunnel at the chosen fixed step; power and invulnerability durations consume simulation time; and jump routes remain achievable.
6. Extend `e2e/performance.spec.ts` with a Penguins long-frame accumulator check. Red/green it by temporarily removing backlog discard, confirming failure, restoring it, and confirming success. Run the existing Penguins campaign and smoke tests.

**Acceptance criteria:** no Phaser import under `src/core`; accumulator remains below one fixed step after repeated 250 ms frames; equivalent input streams are frame-cadence independent; existing level reachability and campaign tests pass; `npm run lint` and `npm run typecheck` pass.

**Benefit:** stable movement and collision across devices, recovery after browser hitches, and a headless-testable gameplay model consistent with Sindicate's architecture.

### R2. Make Penguins Power Reporting Transition-Driven

**Owners:** `PenguinsOfTangramScene.updatePowerVisual`, `updateHud`, and `handlePowerSnack` in `src/games/penguins-of-tangram/index.ts`; `e2e/penguins-gameplay.spec.ts` or `e2e/performance.spec.ts`.

**Status:** Complete.

**Implementation:** Power pickup and expiry now arrive as core HUD transition events. Aura position still synchronizes every rendered frame, while launcher hook and DOM HUD publication occur only for state changes. The browser regression observed ten writes over ten idle frames when the old unconditional callback was temporarily restored, then zero idle writes and exactly one write each for pickup and expiry after restoring the fix.

**Steps:**

1. Track the last power state reported to the launcher. Let `updatePowerVisual()` continue positioning the aura every frame, but call `updateHud()`/`onSceneState` only when `isPoweredUp()` changes.
2. Make `updateHud()` record the reported power state so pickup handling and expiry share one publication path. On expiry, update the DOM power label from `Super snack active` to `No power-up` exactly once.
3. Add a browser regression that counts writes to `window.__penguinsOfTangram` during many update calls with unchanged state and asserts no render-frequency publication. Add an expiry assertion for both the hook and visible HUD label.
4. Red/green both assertions against the current unconditional callback before accepting the change.

**Acceptance criteria:** aura motion remains smooth; hook data and HUD text change on pickup and expiry; no hook publication occurs merely because another render frame elapsed.

**Benefit:** removes avoidable per-frame object/array allocation and fixes stale user-visible power status.

### R3. Integrate Procedural SFX With Phaser Audio Lifecycle

**Owners:** `src/game/audio/Sound.ts`, `CityScene.create` and its shutdown handler in `src/game/scenes/CityScene.ts`; new `src/game/audio/Sound.test.ts`.

**Status:** Complete on 2026-07-14.

**Implementation:**

1. `Sound` receives Phaser's Web Audio context and master-gain destination instead of constructing an independent `AudioContext`. Procedural oscillators and the no-binary-assets design are unchanged.
2. `CityScene.create()` supplies the managed output only when Phaser selected `WebAudioSoundManager`; NoAudio and HTML5 Audio retain silent no-op behavior.
3. Active oscillator/gain pairs disconnect when tones end. `destroy()` immediately stops and disconnects remaining tones, clears references, and is safe to call repeatedly from shutdown/restart paths.
4. Phaser now owns autoplay unlock, global mute/volume, pause-on-blur, context closure, and game teardown. The redundant scene input unlock calls were removed.
5. Unit regressions prove that no global `AudioContext` is constructed, tones route through the injected destination, and active nodes stop/disconnect on destroy. Both tests failed against the independent-context implementation and passed after the change.

**Acceptance criteria:** one audio context per Phaser game; no procedural tone survives scene shutdown; repeated Sindicate launch/exit does not accumulate contexts or listeners; SFX still fail silently when audio is unavailable.

**Benefit:** predictable browser audio resource use plus Phaser-managed unlock, blur, mute, and teardown without giving up synthesized effects.

### R4. Compact Sindicate Particles In Place

**Owners:** `VisualParticle`, emission methods, and `syncFeedbackParticles` in `src/game/scenes/CityScene.ts`; `e2e/performance.spec.ts`.

**Status:** Complete on 2026-07-14.

**Implementation:**

1. Particle position and velocity are mutable records local to the render layer; `src/core/vector.ts` remains unchanged.
2. `syncFeedbackParticles` updates survivors in place, compacts the existing array with read/write indices, and truncates its length.
3. Allocation remains at emission time. Graphics drawing, lifetimes, drag, colors, and visual ordering are unchanged.
4. The browser regression seeds live and expired particles and verifies survivor, position, and velocity identity plus expiry compaction. It failed against the replacement-object implementation and passed after the change.

**Acceptance criteria:** no replacement array, particle, position, or velocity object is created per live particle per frame; visuals and lifetime behavior are unchanged; particle storage remains bounded.

**Benefit:** lower garbage-collection pressure during collisions and skids with a small, local change.

### R5. Reuse Sindicate Visual-Feedback Frame State

**Owners:** previous-frame feedback state and `syncVisualFeedback` in `src/game/scenes/CityScene.ts`; `e2e/performance.spec.ts`.

**Status:** Complete on 2026-07-14.

**Implementation:**

1. Pickup collection detection now compares object identity using two persistent sets. Live pickup objects retain identity until collection; respawn creates a fresh object, so position/amount string keys are unnecessary.
2. The previous car-health and heading arrays are overwritten and truncated in place after each feedback pass instead of replacing both arrays every rendered frame.
3. Scene creation clears the pickup sets. The existing per-run car-history reset remains separate from the steady-state frame loop.
4. The browser regression captures all three previous-frame collection references across repeated feedback calls and verifies that pickup removal still emits exactly eight burst particles. Before the refactor it reported all three references as replaced; after the refactor all three are retained.

**Acceptance criteria:** `syncVisualFeedback` creates no replacement pickup map or car-history arrays per frame; collected pickups still emit their burst; car hit/skid comparisons retain the same previous-frame semantics; scene restart starts with empty feedback history.

**Benefit:** removes three guaranteed collection allocations per rendered frame and all per-frame pickup key strings from a Sindicate hot path, reducing steady garbage-collection pressure without changing feedback visuals.

## 1. Actions And Utilities (`actions-and-utilities`)

- **Current approach:** Both games use explicit loops where each object has simulation-specific state. Sindicate reconciles persistent arrays keyed by world index; Penguins creates authored level objects individually.
- **Difference from the skill:** There are no `Phaser.Actions` batch operations or generic grid/circle placement actions.
- **Decision:** `Keep`.
- **Implementation task:** None. Do not replace indexed reconciliation with broad batch setters; the objects do not receive uniform updates.
- **Benefit:** The current loops keep world-to-render ownership obvious and avoid an abstraction that cannot express per-entity frames, positions, tints, or visibility.

## 2. Animations (`animations`)

- **Current approach:** Sindicate uses generated CanvasTexture frames and swaps frames on persistent `Image` objects with `cycleFrame`/`effectFrame`. Penguins animates shape Containers through transforms.
- **Difference from the skill:** Neither game creates Phaser `Animation` definitions or uses `Sprite.anims`.
- **Decision:** `Keep`.
- **Implementation task:** None. Retain manual frame selection while animation state is derived from the core and frames live in generated sheets.
- **Benefit:** Avoids Sprite pre-update state, keeps art procedural, and keeps simulation state authoritative and serializable.

## 3. Audio And Sound (`audio-and-sound`)

- **Current approach:** `src/game/audio/Sound.ts` synthesizes short tones through Phaser's Web Audio context and master-gain destination. `CityScene` creates the helper per scene run and destroys active nodes on shutdown.
- **Difference from the skill:** The effects remain procedurally synthesized instead of loaded sound assets, but context ownership, unlock, mute/volume, blur behavior, and teardown now follow Phaser's SoundManager lifecycle.
- **Decision:** `Keep` after completing R3.
- **Implementation task:** None. Preserve synthesis and managed output routing unless future music or decoded assets justify Phaser sound instances.
- **Benefit:** One managed audio backend per game and reliable cleanup across the launcher's repeated destroy/recreate lifecycle.

## 4. Cameras (`cameras`)

- **Current approach:** Sindicate sets bounds, follows a focus object, snaps across map wrapping, and uses pan/zoom for story presentation. Penguins follows the player and shakes on respawn.
- **Difference from the skill:** None material; these are direct uses of Camera and camera effects.
- **Decision:** `Keep`.
- **Implementation task:** None. Keep gameplay positions in simulation and camera effects in scenes.
- **Benefit:** Smooth presentation without moving gameplay authority into camera callbacks or tweens.

## 5. Curves And Paths (`curves-and-paths`)

- **Current approach:** Movement uses core vectors, authored route targets, and direct simulation positions. No object follows a Phaser Curve or Path.
- **Difference from the skill:** The games do not use `Path`, Bezier/spline classes, or `PathFollower`.
- **Decision:** `Not applicable`.
- **Implementation task:** None. Adopt a Phaser path only for a future render-only effect; do not use one to drive core actors.
- **Benefit:** Routes remain deterministic, serializable, and testable without Phaser.

## 6. Data Manager (`data-manager`)

- **Current approach:** World, campaign, and save state use typed core records. The Phaser registry only stores the launcher exit callback.
- **Difference from the skill:** Game Objects and scenes do not use `setData`/`getData` for gameplay state.
- **Decision:** `Keep`.
- **Implementation task:** None. Do not duplicate core state in Phaser DataManagers.
- **Benefit:** A single typed source of truth and no event/listener layer between simulation and tests.

## 7. Debugging Performance Issues (`debugging-performance-issues`)

- **Current approach:** Both games have clamped, bounded fixed-step loops and direct stale-backlog regressions. Sindicate also uses pooled render objects, throttled minimap/save work, in-place particle compaction, and reusable visual-feedback history. Penguins synchronizes persistent Containers from pure core state and publishes launcher state on transitions.
- **Difference from the skill:** No unresolved correctness or allocation gap remains in the audited paths.
- **Decision:** `Keep` after completing R1, R2, R4, and R5.
- **Implementation task:** None. Continue using page-side probes before and after future hot-loop changes; do not claim frame-time savings without measurements.
- **Benefit:** Mechanical hitch recovery and bounded hot-loop allocation in both Phaser games.

## 8. Events System (`events-system`)

- **Current approach:** `CityScene` removes keyboard, pointer, resize, and window listeners on shutdown; `TouchInput.destroy()` removes all pointer listeners. Penguins removes its window key listener from `GameRuntime.stop()`.
- **Difference from the skill:** Launcher communication mostly uses typed callbacks rather than custom Phaser events.
- **Decision:** `Keep`.
- **Implementation task:** None for event ownership. R2 changes callback frequency, not the event architecture.
- **Benefit:** Listener lifetimes are explicit and callbacks remain easier to type and test than a global event bus.

## 9. Filters And Post-FX (`filters-and-postfx`)

- **Current approach:** Lighting, night color, aura, and feedback are composed from ordinary Images, Graphics, alpha, tint, and blend modes.
- **Difference from the skill:** No Phaser 4 Filters are enabled.
- **Decision:** `Keep`.
- **Implementation task:** None. Add a filter only for a concrete visual requirement and profile its WebGL passes on target devices.
- **Benefit:** Predictable rendering cost and compatibility with the current flat procedural-art direction.

## 10. Game Object Components (`game-object-components`)

- **Current approach:** Both games use component methods such as `setPosition`, `setScale`, `setRotation`, `setDepth`, `setVisible`, `setTint`, `setAlpha`, and `setScrollFactor` on persistent objects.
- **Difference from the skill:** Advanced lighting, masks, per-corner alpha, and custom render steps are unused because no current effect needs them.
- **Decision:** `Keep`.
- **Implementation task:** None.
- **Benefit:** Uses the smallest component surface needed while retaining idiomatic chainable Phaser updates.

## 11. Game Setup And Config (`game-setup-and-config`)

- **Current approach:** Both launchers use `Phaser.AUTO`, `RESIZE`, centering, and `powerPreference: 'high-performance'`. Sindicate enables `pixelArt`; Penguins uses resolution-independent Shape objects.
- **Difference from the skill:** Penguins supplies nominal 960 by 540 dimensions but deliberately lets `RESIZE` follow its host rather than letterboxing with `FIT`.
- **Decision:** `Keep`.
- **Implementation task:** None. Do not switch scale modes without a product requirement and desktop/mobile screenshot evidence.
- **Benefit:** Each game fills the launcher while Sindicate retains crisp nearest-neighbor pixel art.

## 12. Geometry And Math (`geometry-and-math`)

- **Current approach:** Sindicate uses pure `Vec2` and collision helpers under `src/core`. Penguins currently uses local `Rect`, clamp, intersection, and jump-audit helpers.
- **Difference from the skill:** Gameplay math does not use Phaser `Vector2` or `Geom` classes.
- **Decision:** `Keep` for the API choice. R1 separately moves Penguins gameplay math into core.
- **Implementation task:** Do not replace pure records with Phaser geometry. During R1, move the local gameplay helpers into the new pure core module and unit-test them.
- **Benefit:** Headless tests and no Phaser dependency in simulation code.

## 13. Graphics And Shapes (`graphics-and-shapes`)

- **Current approach:** Static city detail is drawn once. Traffic lights redraw only when their axis changes, corpses only when their signature changes, touch controls only when their key is dirty, and the minimap on an interval. Dynamic particles redraw every frame. Penguins uses individual Shape objects inside Containers.
- **Difference from the skill:** Sindicate favors a few composite Graphics objects over many independent Shape objects.
- **Decision:** `Keep`.
- **Implementation task:** None. Retain existing guards. Profile before considering a Graphics-to-Shapes rewrite; R4 addresses the proven allocation issue without changing rendering primitives.
- **Benefit:** Low display-list count and no dirty-flag synchronization risk for a speculative optimization.

## 14. Groups And Containers (`groups-and-containers`)

- **Current approach:** Sindicate uses stable indexed arrays as render pools and a few Containers for composite lights. Penguins extensively uses shallow Containers for characters, enemies, pickups, and landmarks.
- **Difference from the skill:** No Phaser Groups manage pooling.
- **Decision:** `Keep`.
- **Implementation task:** None. The simulation, not a Group's active/dead state, owns entity lifetime.
- **Benefit:** Direct index correspondence with world arrays and appropriate inherited transforms for composite shape art.

## 15. Input: Keyboard, Mouse, And Touch (`input-keyboard-mouse-touch`)

- **Current approach:** Sindicate polls a keyboard adapter, merges multi-pointer touch controls, and uses interactive UI where needed. Penguins polls configured movement keys. Listener cleanup is explicit.
- **Difference from the skill:** Penguins has no touch or gamepad control path, and neither game needs drag/drop.
- **Decision:** `Keep` for the current control scope.
- **Implementation task:** None as a refactor. Treat Penguins touch/gamepad support as a separate product feature with its own UX and tests.
- **Benefit:** Avoids conflating new input features with cleanup of the existing implementation.

## 16. Loading Assets (`loading-assets`)

- **Current approach:** `preloadGameTextures()` delegates to procedural CanvasTexture generation. Penguins creates Shapes directly. No binary images, atlases, JSON maps, or audio files are queued.
- **Difference from the skill:** The Phaser Loader is intentionally not used for authored art.
- **Decision:** `Keep`.
- **Implementation task:** None. Preserve texture-existence guards and nearest filtering.
- **Benefit:** No network/decode path on launch, diffable art data, and consolidated sheets for batching.

## 17. Particles (`particles`)

- **Current approach:** Sindicate stores small custom visual particles and draws lines/circles to one Graphics object. Emission is event-driven; `syncFeedbackParticles` mutates survivors and compacts the existing array in place.
- **Difference from the skill:** It does not use `ParticleEmitter` pooling, but the custom updater now has no replacement array, particle, position, or velocity allocation per live particle per frame.
- **Decision:** `Keep` after completing R4.
- **Implementation task:** None. Keep custom effects unless measured particle counts or richer emitter requirements justify Phaser's emitter.
- **Benefit:** Less garbage collection while preserving exact visual behavior and a single display-list object.

## 18. Performance Development Guidelines (`performance-development-guidelines`)

- **Current approach:** Sindicate follows the skill's fixed-step, backlog, pool, minimap, autosave, HUD, in-place particle-update, and reusable frame-state guidance. Penguins now runs pure gameplay at a bounded 60 Hz fixed step, drops stale debt, reuses render objects, and publishes HUD/hook state only on transitions.
- **Difference from the skill:** None requiring further work at current scale.
- **Decision:** `Keep` after completing R1 and R2.
- **Implementation task:** None. Preserve the fixed-step/core boundary and transition-driven publication.
- **Benefit:** Frame-cadence-independent gameplay and demonstrably bounded per-frame work.

## 19. Arcade Physics (`physics-arcade`)

- **Current approach:** Both games use deterministic pure-core movement and collision logic. Penguins retains its small explicit AABB platform model under `src/core/tangramPlatformer.ts`.
- **Difference from the skill:** Neither game enables Arcade Physics; Phaser bodies are not gameplay authority.
- **Decision:** `Keep` after completing R1.
- **Implementation task:** None. Preserve the pure-core collision model unless future mechanics require a measured change.
- **Benefit:** Meets repository architecture and deterministic-test requirements that an Arcade Physics migration would not satisfy.

## 20. Matter Physics (`physics-matter`)

- **Current approach:** Neither game uses rigid bodies, constraints, sensors, composites, or Matter world configuration.
- **Difference from the skill:** Matter is absent.
- **Decision:** `Not applicable`.
- **Implementation task:** None. The games do not require constraint-based rigid-body simulation.
- **Benefit:** Avoids a heavier physics engine and a second source of gameplay state.

## 21. Render Textures (`render-textures`)

- **Current approach:** Procedural art is rasterized once into CanvasTextures. The minimap and transient feedback remain direct Graphics objects.
- **Difference from the skill:** There is no `RenderTexture`/`DynamicTexture` command-buffer composition or snapshot workflow.
- **Decision:** `Keep`.
- **Implementation task:** None. Use a RenderTexture only if a future feature needs a reusable composited texture or capture surface.
- **Benefit:** The existing paths are simpler: generated art is cached as textures, while frequently changing overlays render directly.

## 22. Scale And Responsive Design (`scale-and-responsive`)

- **Current approach:** Both games use `RESIZE`. Sindicate responds to ScaleManager resize events, recalculates camera zoom/HUD layout, and removes the listener on shutdown. Penguins camera bounds/follow adapt to the resized canvas.
- **Difference from the skill:** The games choose full-host resizing rather than `FIT` letterboxing.
- **Decision:** `Keep`.
- **Implementation task:** None. Continue desktop and mobile viewport checks when changing fixed-format controls or HUD.
- **Benefit:** Uses all launcher space and keeps custom HUD/camera layout under game control.

## 23. Scenes (`scenes`)

- **Current approach:** `CityScene` uses `init`, `preload`, `create`, `update`, restart data, and shutdown cleanup. Penguins constructs one scene per level and destroys the Phaser game when returning to DOM overlays.
- **Difference from the skill:** Penguins uses launcher-managed DOM states rather than parallel Phaser scenes for character selection, map, and completion.
- **Decision:** `Keep`.
- **Implementation task:** None. R3 now makes procedural audio follow the existing shutdown lifecycle.
- **Benefit:** Phaser exists only during gameplay, keeping menus lightweight and game teardown explicit.

## 24. Sprites And Images (`sprites-and-images`)

- **Current approach:** Sindicate uses `Image` for generated texture frames and updates texture/frame explicitly. Penguins uses Shapes and Containers.
- **Difference from the skill:** There are no Sprite animation-state objects.
- **Decision:** `Keep`.
- **Implementation task:** None. Introduce Sprite only when a future object genuinely needs AnimationState.
- **Benefit:** Avoids per-frame Sprite pre-update overhead across large persistent pools.

## 25. Text And BitmapText (`text-and-bitmaptext`)

- **Current approach:** Sindicate uses Phaser Text with change guards and state-driven story updates. Penguins uses mostly static Phaser labels plus a transition-driven DOM HUD callback; pickup and expiry each update the visible power label exactly once.
- **Difference from the skill:** BitmapText remains unnecessary at current update rates.
- **Decision:** `Keep` after completing R2.
- **Implementation task:** None. Keep the transition trigger and existing text choices.
- **Benefit:** Correct visible status and transition-only updates without new assets.

## 26. Tilemaps (`tilemaps`)

- **Current approach:** Sindicate builds a procedural city and Penguins builds authored platforms from rectangles.
- **Difference from the skill:** Neither game loads Tiled JSON or creates Tilemap layers.
- **Decision:** `Not applicable`.
- **Implementation task:** None. A migration would replace working procedural/data-driven level systems without solving a current problem.
- **Benefit:** Retains diffable TypeScript level data and custom city generation.

## 27. Time And Timers (`time-and-timers`)

- **Current approach:** Visual pulses use `this.time.now`; gameplay durations in both games use fixed-step core time. Penguins stores remaining power, hint, and invulnerability durations in its pure simulation state.
- **Difference from the skill:** There are no `TimerEvent` or `delayedCall` callbacks.
- **Decision:** `Keep` after completing R1.
- **Implementation task:** Do not convert gameplay deadlines to Phaser TimerEvents; keep them deterministic and serializable in core state.
- **Benefit:** Timers remain serializable/testable and cannot outlive their gameplay state through callback ownership mistakes.

## 28. Tweens (`tweens`)

- **Current approach:** Sindicate uses tweens for story panel and camera presentation, killing conflicting target tweens before starting replacements. Gameplay entity movement is simulation-driven. Penguins uses no tweens.
- **Difference from the skill:** Tween usage is deliberately narrow rather than a general movement system.
- **Decision:** `Keep`.
- **Implementation task:** None.
- **Benefit:** Smooth presentation without split ownership of gameplay transforms or non-serializable movement state.

## 29. Phaser 3 To 4 Migration (`v3-to-v4-migration`)

- **Current approach:** The code uses Phaser 4 configuration, generated CanvasTextures, standard objects, and current tint/component APIs.
- **Difference from the skill:** No migration remains. Searches found no custom pipelines, `setTintFill`, legacy masks, `Geom.Point`, removed Mesh/Plane use, or other reviewed Phaser 3 patterns.
- **Decision:** `Keep`.
- **Implementation task:** None. Continue checking the migration list when copying older Phaser examples.
- **Benefit:** Avoids churn in a codebase already using the current API surface.

## 30. Phaser 4 New Features (`v4-new-features`)

- **Current approach:** Standard Images, Shapes, Containers, Graphics, and CanvasTextures handle both games. No GPU layers, filters, CaptureFrame, Gradient, or Noise objects are used.
- **Difference from the skill:** New v4 render features are available but not adopted without a workload that benefits from them.
- **Decision:** `Keep`.
- **Implementation task:** None. Profile before considering `SpriteGPULayer`; current moving object counts, multiple generated sheets, dynamic visibility, and per-entity frames do not match its static, very-large-batch strengths.
- **Benefit:** Avoids premature migration to APIs with texture and buffer-update constraints while standard Phaser batching is sufficient.

## Completion Checklist

- Read every `.github/skills/*/SKILL.md`: complete.
- One numbered chapter per skill directory: complete.
- Compare both Phaser game implementations: complete.
- Record intentional differences and concrete benefits: complete.
- Provide start-ready tasks only where evidence supports work: complete.
- R1-R5 implementation tasks: complete with focused regression coverage and demonstrated red/green checks.
- Final validation: run `npm run test:run`, `npm run test:e2e`, `npm run lint`, and `npm run typecheck` after documentation updates.
