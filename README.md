# Retro Arcade

A static browser arcade for GitHub Pages. The site opens on a lightweight game
selection page, then lazy-loads the selected game so the first page load stays
small.

Current lineup:

- **Sindicate** - the main playable game, now launched through a dedicated story-mode front end.
- **Penguins of Tangram** - a cartoony Phaser platformer with a five-zone school map, light character perks, secrets, checkpoints, and a school-festival finish.
- **Pixel Sprint** - a small canvas runner, **Work in progress**.
- **Void Sweep** - a small canvas shooter, **Work in progress**.

All art, previews, and sounds are original/procedural placeholders. Sindicate is
inspired by the top-down open-city arcade genre, but this project does not use
any Rockstar/GTA copyrighted assets.

## Quick Start

```bash
npm install
npm run dev
```

The dev server serves the arcade at:

```text
http://localhost:5173/quarterless/
```

To build and preview the same static artifact that gets deployed to GitHub
Pages:

```bash
npm run build
npm run preview
```

Preview serves the production build at:

```text
http://127.0.0.1:4173/quarterless/
```

## Current Status

The repo has moved from a single-game page to a small retro arcade shell.

- The root page renders the **Retro Arcade** landing page from [src/bootstrap.ts](src/bootstrap.ts).
- Animated gameplay-style card previews are drawn with canvas in [src/arcade/previews.ts](src/arcade/previews.ts).
- The extra arcade games live in [src/games](src/games) with one folder per game plus a shared catalog; Penguins of Tangram uses Phaser, while Pixel Sprint and Void Sweep use small vanilla canvas loops.
- Sindicate remains the main Phaser game and now opens through a dedicated story launcher instead of a sandbox entry point.
- The authored Sindicate story prototype now spans all 24 planned chapters and 120 missions across four acts, with launcher resume/replay and regression coverage wired against the full run. See [STORY_MODE.md](STORY_MODE.md) for the full status, roadmap, and story reference.
- Story missions now begin from in-world mission markers, keep location and chase targets visible on the minimap, support grouped free-order mission picks across several chapters, and route pause back into the integrated Sindicate launcher instead of an in-game overlay.
- The Sindicate launcher now owns resume, checkpoint restart, manual save/load slots, current-objective presentation, and chapter replay.
- Story mission transitions now use a richer summary card with reward, outcome, duration, collateral, and unlock deltas.
- Playwright smoke tests now verify both the landing page and the Sindicate launch flow, while story-mode browser tests cover current mission types, grouped chapter choices, launcher pause flow, and a full authored-mission regression sweep. Penguins of Tangram also has a campaign gameplay browser test that checks every zone unlock plus jump-route reachability.

Production bundle shape is intentionally split:

- Landing page code and CSS load first.
- Pixel Sprint and Void Sweep are separate tiny lazy chunks.
- Sindicate game code is a separate lazy chunk.
- Phaser is isolated in its own vendor chunk and is not loaded for the landing page.

## Available Scripts

| Script              | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server with hot reload.                       |
| `npm run build`     | Build the static production site into `dist/`.                   |
| `npm run preview`   | Serve the production build locally.                              |
| `npm test`          | Run Vitest in watch mode.                                        |
| `npm run test:run`  | Run Vitest once with coverage.                                   |
| `npm run test:e2e`  | Run the Playwright browser suite against the production preview. |
| `npm run lint`      | Run ESLint.                                                      |
| `npm run typecheck` | Run `tsc --noEmit`.                                              |
| `npm run format`    | Format the codebase with Prettier.                               |

## Architecture

```text
src/
  arcade/        Landing-page styles, animated previews, and shared game types
  core/          Pure Sindicate game logic, tested with Vitest
  game/          Shared Sindicate Phaser internals: scene, rendering, input, audio
  games/         Shared arcade catalog plus one folder per game, including Sindicate
  bootstrap.ts   Arcade landing entry point and lazy game launcher
```

Sindicate and Penguins of Tangram keep a clean split between simulation and rendering:

- [src/core](src/core) contains deterministic TypeScript game logic with no Phaser import, including Penguins player physics, platform collision, enemies, pickups, checkpoints, and simulation timers.
- [src/game](src/game) and the Penguins scene adapt that logic to Phaser rendering, input, HUD, audio, camera effects, and touch controls where supported.
- [e2e](e2e) exercises the built site in a real browser through Playwright, including the Penguins of Tangram campaign map and jump-route audit.

The two work-in-progress games are deliberately lightweight and dependency-free.
They are useful placeholders for the arcade experience without increasing the
initial landing-page cost.

## Testing

The core Sindicate logic is covered by Vitest unit tests next to the source files.
The browser behavior is covered by Playwright against the production build.
Keep Playwright spec top-level imports Node-safe: import pure `src/core/*` modules and literal test data, but avoid `src/game/*` runtime modules that eagerly pull Phaser during test collection.
Story-mode unit coverage also checks that fixed authored mission markers stay on dry drivable tiles in the live city layout, so river-adjacent objectives do not regress back into water.
Live city-render coverage also checks that every NPC-driven car starts on an authoritative road tile, including when merged building blocks remove interior road bands.
The exhaustive live-city nearest-road comparison in the city tests carries its own higher per-test timeout because coverage instrumentation makes that brute-force cross-check materially slower than the rest of the unit suite.
Story-mode Playwright helpers now wait for the Phaser City scene itself to rebuild after launcher transitions and `scene.restart(...)` calls; for save/load assertions, waiting on `window.__game` alone is not a strong enough readiness signal.
The browser performance regressions in [e2e/performance.spec.ts](e2e/performance.spec.ts) verify that both Phaser games drop stale fixed-step accumulator backlog after long frames. Procedural Sindicate tones also release their Web Audio nodes when they end, preventing the active audio registry from growing during long sessions. Penguins coverage verifies that unchanged power state causes no render-frequency hook writes while pickup and expiry update both hook state and the visible HUD.

Recommended local check before pushing:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run test:e2e
```

Note for this Windows/PowerShell setup: run each `npm run ...` command as its own
standalone command. Do not chain npm scripts with `;`, because this environment
can leak trailing shell tokens into npm script arguments.

## Deployment

Deployment is automated through GitHub Actions in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

The deployment pipeline gates GitHub Pages behind the normal verification path:

1. Lint
2. Type-check
3. Unit tests with coverage
4. Production build
5. Playwright browser tests

GitHub Pages serves this repository as a project site under `/quarterless/`, so the
Vite base path is configured in [vite.config.ts](vite.config.ts).

If the repository name changes, update:

- `BASE_PATH` in [vite.config.ts](vite.config.ts)
- Playwright URLs in [playwright.config.ts](playwright.config.ts)
- Any hard-coded `/quarterless/` test navigation in [e2e](e2e)

## Tech Stack

- TypeScript
- Vite
- Phaser 4 for Sindicate and Penguins of Tangram
- Vanilla canvas for Pixel Sprint and Void Sweep
- Vitest with v8 coverage
- Playwright
- ESLint and Prettier
- GitHub Actions and GitHub Pages

## Roadmap

Near-term arcade work:

- Replace the generated canvas previews with recorded or authored gameplay clips if better media is available.
- Promote Pixel Sprint and Void Sweep from placeholders into fuller games, or swap them for stronger game concepts.
- Keep each game lazy-loaded so the landing page remains fast.

Near-term Sindicate work:

- Balance and harden the full 24-chapter story run, then deepen branch consequences and district-state reactivity on top of the now-complete authored campaign.
- Keep gameplay logic in [src/core](src/core) where it can be tested quickly and deterministically.
