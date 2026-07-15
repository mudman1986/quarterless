# Penguins of Tangram — Roadmap v5

## Current status — 2026-07-15

The game is now named **Penguins of Tangram** and has a working Phaser 4 campaign
slice in the arcade launcher:

- **Complete:** storybook visual direction, pure deterministic platformer simulation,
  camera-follow runtime, hazards, enemies, checkpoints, badges, power snack, goal
  completion, lazy loading, character select, six playable classes, five zones,
  progression map, secret routes, bounce pads, completion summaries, and jump-route
  audits.
- **Shipped across the last two updates:** pointer/touch controls for left, right,
  and jump, plus state-driven idle, walk, jump, and powered-up character poses.
  Touch controls are shown during gameplay on coarse-pointer devices and remain
  keyboard-compatible.
- **Shipped in the current expanded slice:** validated local campaign persistence
  (selected class, completed zones, and best run summaries), deterministic
  moving platforms with player carry behavior, keyboard/button pause and resume,
  and lightweight animated feedback for badges, enemies, bounce pads, checkpoints,
  goals, and the power snack.
- **Shipped to finish Phase 5:** managed procedural audio cues for jumps, landings,
  badges, power snacks, boss hits, and completion; plus the Sports Day Relay
  Captain finale with three stomp phases, stun windows, respawn handling, and a
  locked final bell.
- **Shipped in the language slice:** Dutch is the default language, English is
  available from the child-friendly settings panel, and the choice persists
  locally across visits. Authored level text, character profiles, HUD labels,
  Phaser scene labels, and simulation hints are translated without putting
  localization code in the deterministic core.
- **Deliberately deferred:** binary/authored sprite frames remain optional. The
  current procedural art pipeline is faster to diff, has no decode cost, and
  matches the repository's asset policy.

The simulation intentionally stays in `src/core/tangramPlatformer.ts`; Phaser only
renders the scene and forwards keyboard or touch input.

## Goal

Create a new left-to-right 2D platform game for the arcade that captures the readable, playful feel of classic Super Mario platformers while replacing the theme with a custom Tangram primary-school world led by penguin characters and the school's animal classes.

## Recommended Technical Direction

### Engine choice

Use **Phaser 4** for the new game.

### Why Phaser is the best fit here

- The repository already ships Phaser for Sindicate, so the dependency is already present.
- Phaser is better suited than raw canvas for a full platformer with collisions, tilemaps, animation states, parallax backgrounds, camera follow, audio, checkpoints, and level scripting.
- It fits the current arcade architecture where games are lazy-loaded from the landing page.
- It keeps the implementation simpler than building a custom platformer framework on top of canvas.

### Why not raw canvas

- Canvas is fine for small arcade loops like the current mini-games.
- A Mario-style platformer needs more structure: tile collisions, moving platforms, enemy state machines, trigger zones, reusable animations, and content tooling.
- Building those systems from scratch would slow development and make level iteration harder.

### Optional supporting tools

- **Tiled** for level editing and tilemap export.
- **Aseprite** for sprite sheets, frame animation, and tiles.
- **Figma or Inkscape** for UI, signs, and background shapes.
- A lightweight audio workflow for school-bell, playground, and animal-themed sound effects.

## Graphics Plan

### Visual direction

Aim for a **modern storybook platformer** look rather than pixel-perfect retro imitation:

- clean shapes
- bright school-friendly colors
- layered parallax backgrounds
- soft shadows and highlights
- expressive animal character animations
- classroom and playground props that make the world clearly Tangram-themed

### Best way to get good graphics

1. Define a small art bible first:
   - school colors
   - shape language
   - environment motifs
   - animal silhouettes
   - UI tone
2. Build one polished vertical slice instead of producing all art at once.
3. Use modular tilesets and reusable props so one artist can cover more content.
4. Use AI-assisted ideation only for concept exploration if desired, but produce final in-game assets in a consistent handcrafted style.

### Asset buckets

- character sprite sheets
- enemy and NPC sprite sheets
- terrain tilesets
- background layers
- interactive props
- collectible and power-up icons
- UI panels, buttons, and character select art

## What Makes Super Mario Feel Like Super Mario

The game identity comes from a combination of structure, feel, and content:

- left-to-right progression
- precise running and jumping
- readable hazards and enemy patterns
- layered levels with secrets and optional paths
- power-ups that change how the player approaches traversal
- collectible feedback loops
- themed worlds with escalating mechanics
- strong start/end goals for each level
- a memorable playable hero cast
- simple controls with depth from movement timing

## Tangram Theme Translation

| Mario-style element | Purpose in platformer design | Tangram translation |
| --- | --- | --- |
| Mario | Main hero | **Penguin student** as the default lead |
| Luigi / alternate characters | Alternate play styles | Other animal classes as playable students |
| Mushroom Kingdom | Game world identity | **Tangram School campus and dream-playground world** |
| Goombas | Basic walking enemies | Mischievous toy critters, runaway school supplies, or hall monitors in obstacle form |
| Koopas | Patterned enemies with reusable shells | Turtles with defensive behavior and shell-like backpacks |
| Coins | Constant collectible reward | Tangram stars, puzzle pieces, or gold classroom badges |
| Question blocks | Reward discovery | Surprise cubbies, lunch boxes, or classroom crates |
| Brick blocks | Breakable interaction | Stackable foam blocks or cardboard craft boxes |
| Pipes | Transition routes | Slides, tunnels, vents, playground tubes, or classroom passageways |
| Power mushrooms | Basic upgrade | Confidence badge or warm winter fish snack that upgrades the student |
| Fire flower | Ranged attack power | Art-room paint splat ability or snowball launcher for penguins |
| Star | Temporary invincibility | Gold assembly spotlight or superstar sticker rush |
| 1-Up mushroom | Extra life | Gold report card stamp or helper whistle |
| Flagpole | End-of-level goal | School bell tower rope, class banner, or playground finish sign |
| Castle / Bowser level | Big climax | Principal's challenge, giant playground structure, or school festival finale |
| World map | Meta progression | School map with classrooms, yard zones, library, gym, and field-trip areas |
| Platforms | Core traversal | Desks, books, stepping stones, benches, monkey bars, seesaws |
| Moving platforms | Timing challenge | Rolling carts, elevator platforms, floating paper rafts, swing bridges |
| Underground levels | Mood/variety | Storage rooms, boiler spaces, tunnels, under-stage areas |
| Water levels | Movement variation | Splash zones, puddle gardens, aquarium classroom, rainy playground |
| Secret rooms | Exploration reward | Hidden cubbies, library passageways, art closets, rooftop nests |
| Bosses | Pacing payoff | Animal-class champions, giant toy machines, or special event challenge leaders |

## Animal Character Plan

### Playable cast

- **Penguin** - default main character and face of the game
- Crocodile
- Monkey
- Turtle
- Kangaroo
- Lion

### Character-select approach

Add a **character select screen before starting a run**.

### Recommended gameplay model

Keep the full control scheme shared across all characters, then add only light identity differences so content stays manageable:

- Penguin: balanced default
- Crocodile: stronger push / heavier feel
- Monkey: faster climb / agile movement
- Turtle: safer defense / slower acceleration
- Kangaroo: highest jump
- Lion: short burst speed / brave charge identity

Keep hitboxes and base animation structure closely aligned so levels do not need per-character redesign.

## Proposed Game Structure

### Level themes

Start with 3 to 5 themed zones:

1. School Gate Morning Run
2. Playground Adventure
3. Classroom Maze
4. Library and Art Room Secrets
5. Sports Day Finale

### Core loop

1. Choose character
2. Enter level
3. Run, jump, collect, and discover secrets
4. Use character-specific strengths in light ways
5. Reach the end goal
6. Unlock next area, collectibles, or characters

## Implementation Phases

### Phase 1 - Pre-production

- [x] confirm art direction
- [x] choose final game name: **Penguins of Tangram**
- [x] decide on light mechanical differences between playable animals
- [x] define the first vertical-slice level

### Phase 2 - Core platformer foundation

- [x] create Phaser game entry
- [x] implement camera, deterministic player controller, and platform collisions
- [x] add checkpoint, hazard, collectible, and level completion systems
- [x] wire lazy loading into the arcade shell

### Phase 3 - Vertical slice

- [x] ship a polished first Tangram level
- [x] add state-driven procedural idle, walk, jump, and powered-up animation
- [ ] replace procedural poses with authored sprite frames if the art pipeline needs them
- [x] add enemy movement and stomp handling
- [x] add one power-up and secret routes

### Phase 4 - Character expansion

- [x] add remaining playable animal classes
- [x] add character select
- [x] tune minor per-character movement traits

### Phase 5 - Content expansion

- [x] build additional level themes
- [x] add progression map
- [x] add bounce pads and themed set dressing
- [x] add responsive touch controls
- [x] persist campaign progress between visits
- [x] add deterministic moving platforms and player carry behavior
- [x] add pause/resume UX without advancing simulation while paused
- [x] add animated feedback for interactive world objects
- [x] add managed procedural audio feedback
- [x] add a boss/finale set piece

## Name Options

- **Tangram Penguin Quest**
- **Penguins of Tangram**
- **Tangram Penguin Dash**
- **Penguin Playground: Tangram**
- **Tangram Polar Adventure**
- **Tangram Penguin Trail**
- **The Tangram Penguins**
- **Penguin Paths of Tangram**

## Current status — Roadmap v3 complete

Roadmap v2 is complete. The five-zone campaign now has persistent campaign and
audio preferences, pause-safe simulation, moving-platform traversal, reduced-motion
rendering, a telegraphed Relay Captain finale, and browser coverage for reload
persistence, pause/resume, boss gating, touch input, reduced motion, and the
largest-zone render loop.

Roadmap v3 is also complete. The child-first release now includes a discoverable
How to play and settings panel, large touch controls, local personal-best
reminders, opt-in bounded route notes, confirmed campaign reset, and restart from
the beginning of the current level. Checkpoint respawns are derived from their
supporting platforms, and authored-data tests prevent unsupported checkpoints
from returning a child to a fall-respawn loop.

- **Controls:** Arrow keys or WASD move; Space or Up jumps; P or Escape pauses.
- **Accessibility:** coarse-pointer buttons mirror keyboard controls; reduced-motion
  preferences remove bobbing, rotation, and camera shake.
- **Persistence:** the selected class, completion records, best runs, and sound
  preference use local storage. Clear `penguins-of-tangram.progress` to reset the
  campaign.
- **Content validation:** all six character profiles have route-reachability
  coverage and authored moving-platform/boss bounds checks. No optional finale
  shortcut was added because there is no replay telemetry showing a need for it.
- **Art decision:** authored sprite frames remain deferred; procedural Canvas
  textures stay the measured, diffable, no-decode path.

## Roadmap v3 — child-first release

### Re-evaluation

The v2 release-hardening pass is finished. Because Tangram is for children ages
4–10, v3 prioritizes safe, readable, low-pressure play over leaderboards,
complex menus, social features, or extra systems. A child should understand the
next action from the screen, recover quickly from a mistake, and never need an
account or network connection.

### Phase 9 — Friendly play UX

- [x] add a large, discoverable How to play panel with keyboard and touch
  instructions
- [x] make sound, reduced motion, route notes, and reset behavior understandable
  in the same panel
- [x] show personal bests as friendly “your best” reminders, never as public
  rankings or pressure
- [x] confirm campaign reset and keep it local to this device

### Phase 10 — Safe replay and family playtesting

- [x] keep route notes opt-in, local-only, bounded, and free of identifiers
- [x] use all-character route audits to protect the easiest age-appropriate path
- [x] provide replay without locking campaign progress behind a score or timer
- [x] tune only from measured local playtest summaries; do not add a shortcut or
  new challenge without evidence that children need it
- [x] restart the current level from its authored beginning without clearing
  campaign progress
- [x] keep every checkpoint grounded on authored platform geometry

### Phase 11 — Child-safe release maintenance

- [x] keep large touch targets, readable contrast, reduced-motion behavior, and
  audio unlock fallback covered in production browser checks
- [x] keep the Phaser vendor chunk isolated and watch the Tangram chunk budget
- [x] retain deterministic core tests and full browser smoke coverage
- [x] document that no account, network service, advertising, chat, or tracking
  is required to play

### v3 exit criteria

Roadmap v3 is complete: a first-time child can find the controls, pause, recover,
replay, and reset without adult-only game knowledge; personal progress stays
local; accessibility settings are discoverable; and mobile production checks
remain green. New mechanics remain deferred until child playtests show a clear,
age-appropriate need.

## Roadmap v4 — measured child play (complete)

### Re-evaluation

V3 established the safe, local, low-pressure foundation. V4 shipped the smallest
measured-play loop: a welcoming opening route, readable instructions, opt-in
bounded local notes, and production checks for the child-safe replay path. No
account, network service, advertising, chat, leaderboard, or tracking system is
needed.

### Phase 12 — First-play clarity

- [x] provide a first-play route hint that names movement, jumping, and the goal
- [x] teach movement and jumping through the first level's existing spaces
- [x] replace confusing labels, hints, or button wording with child-readable text
- [x] keep the first successful route finishable without collecting every badge
- [x] add focused core, data, persistence, and browser regression tests

### Phase 13 — Gentle difficulty tuning

- [x] record bounded opt-in attempts, falls, duration, and checkpoint use by zone
- [x] keep the existing age-appropriate jumps, hazards, and checkpoint spacing
- [x] preserve multiple characters and the easiest reachable route
- [x] keep mistakes recoverable without lives, punishment, or progress loss
- [x] retain route audits for every playable character

### Phase 14 — Content polish

- [x] improve feedback for badges, goals, checkpoints, hazards, and boss warnings
- [x] make each zone's visual landmark and next destination obvious
- [x] defer authored variations until playtests show repetition
- [x] keep procedural art and audio unless authored replacements measurably improve
  clarity or performance
- [x] avoid new mechanics unless an observed problem cannot be solved by tuning

### Phase 15 — Family-ready release

- [x] verify keyboard, touch, reduced motion, audio mute, pause, restart, and reset
  with production browser checks
- [x] keep settings and reset understandable to an adult without making them
  required for a child to play
- [x] document the local-only data boundary and the opt-in playtest summary
- [x] keep the Phaser vendor chunk isolated and the Tangram chunk within budget
- [x] retain full deterministic core, authored-data, and browser regression suites

### v4 exit criteria

Roadmap v4 is complete: the opening route explains the controls, can be finished
without bonus badges, falls remain recoverable, local notes are opt-in and
bounded, and accessibility, privacy, performance, and regression checks remain
green. Real supervised observations are the next input, not a reason to add
speculative systems.

## Roadmap v5 — supervised playtest findings

### Re-evaluation

V4 now records just enough local evidence to guide a short adult-supervised
playtest. V5 should turn those observations into small content edits, then stop.
The game remains a quiet, local activity for ages 4–10; no online analytics or
competitive layer is justified.

### Phase 19 — Language access

- [x] default new players to Dutch while preserving English as an option
- [x] persist and validate the language choice with the existing version-1 save
- [x] expose the language switch in the existing How to play/settings panel
- [x] translate authored routes, character choices, HUD, overlays, and dynamic
  child-facing feedback
- [x] cover Dutch default, English switching, and language persistence in tests

### Phase 16 — Observe and listen

- [ ] run short first-play sessions with children across the 4–10 age range
- [ ] record only where a child hesitates, asks for help, or chooses to replay
- [ ] review local route notes with an adult and discard them after review
- [ ] write down no names, accounts, faces, voice recordings, or identifiers

### Phase 17 — Tune the smallest friction

- [ ] fix the most common control, label, or route confusion first
- [ ] adjust one authored value at a time and rerun route audits
- [ ] preserve the zero-pressure opening route and all recovery behavior
- [ ] add a mechanic only when tuning cannot solve the observed problem

### Phase 18 — Confirm the family release

- [ ] repeat keyboard, touch, reduced-motion, audio, pause, restart, reset, and
  checkpoint checks after playtest edits
- [ ] keep local persistence bounded and backward-compatible
- [ ] keep the Phaser vendor split and Tangram performance budgets green
- [ ] update this roadmap with findings instead of adding a speculative v6 system

### v5 exit criteria

Roadmap v5 is complete when supervised observations have produced either a small,
tested improvement or clear evidence that no change is needed, and the full
child-safe regression suite remains green. New mechanics, online services, and
competitive features remain out of scope without a separate product decision.
