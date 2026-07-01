# Tangram Penguin Platformer Plan

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

- confirm art direction
- choose final game name
- decide whether playable animals have cosmetic or light mechanical differences
- define the first vertical-slice level

### Phase 2 - Core platformer foundation

- create Phaser game entry
- implement camera, physics, player controller, and tile collisions
- add checkpoint, hazard, collectible, and level completion systems
- wire lazy loading into the arcade shell

### Phase 3 - Vertical slice

- ship one polished Tangram level
- include penguin as the first fully animated playable character
- add one or two enemy types
- add one power-up and one secret route

### Phase 4 - Character expansion

- add remaining playable animal classes
- add character select
- tune minor per-character movement traits

### Phase 5 - Content expansion

- build additional level themes
- add progression map
- add more environmental mechanics and set-piece moments

## Name Options

- **Tangram Penguin Quest**
- **Penguins of Tangram**
- **Tangram Penguin Dash**
- **Penguin Playground: Tangram**
- **Tangram Polar Adventure**
- **Tangram Penguin Trail**
- **The Tangram Penguins**
- **Penguin Paths of Tangram**

## Recommended Starting Point

Start with **Penguins of Tangram** or **Tangram Penguin Quest** as the leading name candidates, and build a single polished Phaser vertical slice around:

- penguin default hero
- one playable alternative animal
- one playground-themed level
- collectibles, checkpoints, one power-up, and one end-of-level goal

## Feedback Needed Before Implementation

Please confirm:

1. which game name you prefer
2. whether you want light gameplay differences between animal characters or mostly cosmetic choice
3. whether the visual style should lean more storybook, more cartoony, or more classic pixel art
4. whether I should start implementation with a single polished level and character-select flow
