# Tangram Penguin Platformer — Roadmap v3

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

## Current status — Roadmap v2 complete

Roadmap v2 is complete. The five-zone campaign now has persistent campaign and
audio preferences, pause-safe simulation, moving-platform traversal, reduced-motion
rendering, a telegraphed Relay Captain finale, and browser coverage for reload
persistence, pause/resume, boss gating, touch input, reduced motion, and the
largest-zone render loop.

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

- [ ] add a large, discoverable How to play panel with keyboard and touch
  instructions
- [ ] make sound, reduced motion, route notes, and reset behavior understandable
  in the same panel
- [ ] show personal bests as friendly “your best” reminders, never as public
  rankings or pressure
- [ ] confirm campaign reset and keep it local to this device

### Phase 10 — Safe replay and family playtesting

- [ ] keep route notes opt-in, local-only, bounded, and free of identifiers
- [ ] use all-character route audits to protect the easiest age-appropriate path
- [ ] provide replay without locking campaign progress behind a score or timer
- [ ] tune only from measured local playtest summaries; do not add a shortcut or
  new challenge without evidence that children need it

### Phase 11 — Child-safe release maintenance

- [ ] keep large touch targets, readable contrast, reduced-motion behavior, and
  audio unlock fallback covered in production browser checks
- [ ] keep the Phaser vendor chunk isolated and watch the Tangram chunk budget
- [ ] retain deterministic core tests and full browser smoke coverage
- [ ] document that no account, network service, advertising, chat, or tracking
  is required to play

### v3 exit criteria

Roadmap v3 is complete when a first-time child can find the controls, pause,
recover, replay, and reset without adult-only game knowledge; personal progress
stays local; accessibility settings are discoverable; and mobile production
checks remain green. New mechanics are deferred until child playtests show a
clear, age-appropriate need.
