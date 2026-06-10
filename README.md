# Sindicate

A top-down, **GTA 2-style** browser game built with **TypeScript** and **Phaser 3**,
bundled by **Vite**, developed **test-first (TDD)**, and deployed automatically to
**GitHub Pages**.

> ⚠️ **Assets:** This project uses only original or CC0/public-domain placeholder
> art and audio. It does **not** use any Rockstar/GTA copyrighted assets. "GTA 2-style"
> describes the genre (top-down, open-city, drive-and-shoot arcade), not the IP.

---

## Quick start (build & play locally)

```bash
npm install        # one-time: install dependencies
npm run dev        # start the dev server and open the game in your browser
```

`npm run dev` serves the game at <http://localhost:5173/sindicate/> with hot-module
reload — edit a file and the game updates instantly.

To build and play the exact artifact that gets deployed to GitHub Pages:

```bash
npm run build      # produce the static site in dist/
npm run preview     # serve dist/ at http://127.0.0.1:4173/sindicate/
```

## Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start Vite dev server with HMR and open the browser. |
| `npm run build` | Type-safe production build into `dist/`. |
| `npm run preview` | Serve the production build locally (same as GitHub Pages). |
| `npm test` | Run unit tests in **watch** mode — the TDD inner loop. |
| `npm run test:run` | Run unit tests once with a coverage report. |
| `npm run test:e2e` | Run the Playwright browser smoke test against the build. |
| `npm run lint` | Lint with ESLint. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm run format` | Format the codebase with Prettier. |

## Testing & TDD

Tests are written **alongside the code, test-first**. The key to making a game
testable is the architecture:

- **`src/core/`** — pure, framework-agnostic TypeScript game logic (movement,
  physics, collision, AI, wanted level, missions, score). No Phaser import, fully
  deterministic, **100% unit-tested with Vitest**. A unit test sits next to each
  module (e.g. [src/core/vector.ts](src/core/vector.ts) ↔
  [src/core/vector.test.ts](src/core/vector.test.ts)).
- **`src/game/`** — a thin **Phaser adapter** (scenes, sprites, input wiring,
  rendering). It only draws what `core/` simulates, and is covered by a Playwright
  smoke test ([e2e/smoke.spec.ts](e2e/smoke.spec.ts)).

The TDD loop: write a failing test in `src/core/*.test.ts`, run `npm test`
(watch mode), implement until green, refactor. Coverage on `src/core/` is gated at
80% in CI.

## Deployment (GitHub Pages)

Deployment is automated via GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):

1. On every push and pull request to `main`, the **`test`** job runs lint →
   type-check → unit tests (coverage) → build → E2E smoke test.
2. The **`deploy`** job has `needs: test`, so a deploy **only happens if every test
   passes**, and only on pushes to `main` (not PRs).

### One-time repository setup

1. Push this repository to GitHub with the default branch named `main`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The site will publish at `https://<your-user>.github.io/sindicate/`.

> If you name the repository something other than `sindicate`, update `BASE_PATH`
> in [vite.config.ts](vite.config.ts) and the URLs in
> [playwright.config.ts](playwright.config.ts) and
> [e2e/smoke.spec.ts](e2e/smoke.spec.ts) to match.

## Tech stack

- **Language:** TypeScript
- **Engine:** Phaser 3
- **Bundler / dev server:** Vite
- **Unit tests:** Vitest (+ v8 coverage)
- **E2E tests:** Playwright
- **Lint/format:** ESLint + Prettier
- **CI/CD:** GitHub Actions → GitHub Pages

## Project structure

```
.
├─ src/
│  ├─ core/        # pure game logic (TDD, no engine) + *.test.ts
│  │  ├─ vector.ts entity.ts vehicle.ts collision.ts city.ts world.ts math.ts types.ts
│  │  └─ pedestrianAI.ts policeAI.ts wantedLevel.ts trafficAI.ts
│  └─ game/        # Phaser adapter: scenes, sprites, input, rendering
│     ├─ main.ts
│     ├─ input/KeyboardInput.ts
│     └─ scenes/CityScene.ts
├─ e2e/            # Playwright smoke tests
├─ .github/workflows/deploy.yml
├─ .github/dependabot.yml   # automated dependency updates (7-day min age)
├─ index.html
├─ vite.config.ts  # build + Vitest config (base path lives here)
└─ playwright.config.ts
```

---

## Development plan / roadmap

The game is built in small, independently verifiable and **playable** phases. Each
gameplay phase adds pure logic to `src/core/` **test-first**, then wires it into the
Phaser adapter.

### Phase 0 — Scaffolding & local play loop ✅
TypeScript + Vite + Phaser, Vitest + Playwright, ESLint/Prettier, npm scripts, the
`core/` + `game/` split, a "hello Phaser" scene, and the first unit test. Proves the
local build/play/test loop works.

### Phase 1 — CI/CD pipeline ✅
GitHub Actions workflow with a `test` job and a `deploy` job (`needs: test`) so tests
always gate deployment to GitHub Pages.

Also set up **Dependabot** (`.github/dependabot.yml`) to keep dependencies updated
automatically, covering **every** package ecosystem used by the project (`npm` for
app dependencies and `github-actions` for workflow actions). Every update is held to
a **minimum age of 7 days** via a 7-day cooldown across all semver levels (major,
minor, patch), so brand-new releases are given time to prove stable before a PR is
opened. Updates are **grouped per ecosystem** into a single pull request, and all
GitHub Actions in the workflow are **pinned to full commit SHAs** for supply-chain
safety (Dependabot bumps the SHAs and keeps the version comments accurate).

### Phase 2 — Movement & the city (first playable MVP) ✅
Test-first `core` modules: `entity` (walking), `vehicle` (arcade car physics),
`collision` (circle-vs-rect resolution), `city` (block layout), and the `world`
tick loop. Adapter ([src/game/scenes/CityScene.ts](src/game/scenes/CityScene.ts)):
a tile-based city, a player on foot, camera follow, building collision, and the
ability to enter and drive a car (Arrows/WASD to move, Space to enter/exit).

### Phase 3 — Pedestrians & police ✅
Test-first `pedestrianAI` (wander + flee from threats), `policeAI` (pursuit, speed
scales with wanted level), and the `wantedLevel` heat/star model. Integrated into the
`world`: pedestrians wander and flee the player's car, running one over raises the
wanted level, police spawn from the map corners to pursue, and heat decays over time
(police disperse when clear). The HUD shows the wanted stars.

### Phase 3.5 — A living city & getting busted ✅
Test-first `trafficAI` (NPC cars that follow the road grid, turn at intersections, and
turn back at dead ends). Integrated into the `world`:
- **Bigger map** — the city is now a roomy 60×60 tile grid.
- **Traffic** — cars appear as a mix of **parked** vehicles and ones **driven by NPCs**;
  the player can hijack a moving car, which stops its driver.
- **Police variety** — officers arrive both **on foot** and in **patrol cars**
  (`Police.kind`), with patrol cars faster than officers on foot.
- **Run them over** — a speeding car can mow down officers on foot (extra heat);
  patrol cars are not so easily dealt with.
- **Busted & respawn** — if the police catch the player, the game shows a **BUSTED**
  screen and respawns at the start after a 10s timer or immediately on **Enter**.

### Phase 4 — Combat, missions & score ✅
Test-first `weapon` (pistol, bullets), `health` (player pool), `mission` (objective
state machine), and `score`. Integrated into the `world`:
- **Shooting** — press **F** (or Shift) to fire; bullets travel, stop at buildings,
  and kill pedestrians or police on contact.
- **Score & kills** — eliminating a pedestrian or officer (by gun or by car) scores
  points and counts toward objectives; the high score is kept across runs.
- **Health** — the player has a health pool; a fast car drains it and a lethal hit
  shows the **WASTED** screen (respawn on timer or **Enter**), restoring full health.
- **Mission** — one scripted mission (reach the marked junction, then take out three
  targets) banks a reward on completion.
- **HUD** — wanted stars, health, money (with best), ammo, and the current objective.

### Phase 5 — Polish (stretch)
Audio, an art pass, more missions, and a `localStorage` high score.

### Out of scope (for now)
Multiplayer, mobile/touch controls (keyboard-only MVP), and any backend — the game
is a fully static site.
