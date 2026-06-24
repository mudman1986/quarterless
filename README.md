# Retro Arcade

A static browser arcade for GitHub Pages. The site opens on a lightweight game
selection page, then lazy-loads the selected game so the first page load stays
small.

Current lineup:

- **Sindicate** - the main playable game, a top-down open-city arcade sandbox.
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
- The two new mini games live in [src/games](src/games) and use small vanilla canvas loops.
- Sindicate remains the main Phaser game and loads only after choosing it from the landing page.
- Playwright smoke tests now verify both the landing page and the Sindicate launch flow.

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
  game/          Sindicate Phaser adapter: scene, rendering, input, audio
  games/         Lightweight extra arcade games
  bootstrap.ts   Arcade landing entry point and lazy game launcher
```

Sindicate keeps a clean split between simulation and rendering:

- [src/core](src/core) contains deterministic TypeScript game logic with no Phaser import.
- [src/game](src/game) adapts that logic to Phaser rendering, input, HUD, audio, and touch controls.
- [e2e](e2e) exercises the built site in a real browser through Playwright.

The two work-in-progress games are deliberately lightweight and dependency-free.
They are useful placeholders for the arcade experience without increasing the
initial landing-page cost.

## Testing

The core Sindicate logic is covered by Vitest unit tests next to the source files.
The browser behavior is covered by Playwright against the production build.

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
- Phaser 4 for Sindicate
- Vanilla canvas for the two work-in-progress mini games
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

- Continue expanding the city sandbox, missions, service-vehicle jobs, touch controls, and browser regression coverage.
- Keep gameplay logic in [src/core](src/core) where it can be tested quickly and deterministically.
