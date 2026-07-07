# Sindicate Story Mode — Status & Roadmap

This is the canonical document for Sindicate's story mode. It leads with **where the
project stands today**, then the **roadmap** for turning a complete prototype into a
shippable game, and finally the **story reference** (premise, chapters, design rules)
and a condensed **implementation history**.

---

## 1. Current Status

**Sindicate story mode is a complete, fully playable, end-to-end prototype.** All 14
planned build stages are finished and verified.

At a glance:

- **Content:** the full authored run — **24 chapters / 120 missions across 4 acts** —
  compiles into playable runtime campaigns.
- **Runtime:** mission primitives, scripted mission actors (route vehicles, escorts,
  squads, protected targets, handoffs), district-state effects (blackouts, reserved
  lanes, checkpoint pressure, service-lane blocks), and a citywide-reactivity model
  are all implemented and tested.
- **Front end:** a dedicated story launcher owns continue/new-story/chapter-select,
  resume, checkpoint restart, manual save/load slots, current-objective display,
  chapter replay, mission scorecards, and a "City Standing" consequence archive.
- **Persistence:** autosave and manual slots share one source of truth, with
  version-walking migration on load.
- **Quality gates (all green):**
  - `validateStoryMode` — structural/reference integrity.
  - Dead-flexibility validation — flags branch declarations no mission reads.
  - `validateStoryBalance` (`STORY_BALANCE_BOUNDS`) — numeric ship gate for economy,
    timings, wanted pressure, escort tolerances, and non-regressing per-act rewards.
- **Tests:** **593 unit tests** (`npx vitest run`) and **213 Playwright e2e tests**
  (`npx playwright test`) pass; typecheck (`npm run typecheck`) and lint
  (`npm run lint`) are clean.

**Honest caveat:** "engineering plan complete" is not the same as "finished game". The
balance gate validates numeric *sanity* (no 50-credit missions, no 9-star demands), not
a hand-tuned *fun* curve, and several whole-product surfaces — audio, onboarding,
options, art, and writing — are still placeholder-level. Section 2 is the backlog that
closes that gap.

### Architecture map

| Area | Key files |
| --- | --- |
| Story authoring types, validation, city-state, authoring helpers | `src/game/story/storyMode.ts` |
| Per-chapter authored content | `src/game/story/*.ts` (one file per chapter) assembled in `src/game/story/storyCampaign.ts` |
| Progression, save keys, branch outcomes | `src/game/story/storyProgress.ts` |
| Mission objective primitives | `src/core/mission.ts` |
| World simulation, district-state effects | `src/core/world.ts`, `src/core/city.ts`, `src/core/pedestrianGraph.ts` |
| Runtime actor logic | `src/game/story/runtimeActors.ts` |
| Scene runtime (spawns, scripts, summaries) | `src/game/scenes/CityScene.ts` |
| Launcher / story UI, save-slot overview | `src/bootstrap.ts`, `src/game/story/storyMissionScorecards.ts` |
| Save state / migration | `src/core/gameState.ts` |
| Regression coverage | `e2e/story-mode.spec.ts`, `e2e/story-authored-missions.spec.ts`, unit `*.test.ts` |

### Entry points

- **Play Sindicate** on the arcade landing page opens the story launcher directly.
- The browser URL also accepts `?story=1` or `?mode=story`.

---

## 2. Roadmap — Further Development

The remaining work is the gap between "complete, tested prototype" and "polished,
shippable product", roughly ordered by player-visible impact. None of these are
blockers for "the planned story mode is done".

### Tier 1 — Highest player-visible impact

- **Audio.** All sounds are still procedural placeholders. Add a small audio bus
  (music + SFX channels, master mute/volume persisted to localStorage), per-scene
  music, and event-driven SFX hooks off the existing mission/world events. Respect a
  "reduced audio" setting.
- **Onboarding / tutorial.** New players are dropped into a top-down city with no
  explanation of controls, wanted level, markers, minimap, or how to start a mission.
  Add a short scripted first-run tutorial (or an optional "how to play" launcher panel)
  covering drive, enter/exit vehicle, start mission, and the wanted/arrest loop.
- **Options / settings menu.** There is no central settings surface. Add one to the
  launcher for audio volumes, key rebinding, difficulty (below), reduced motion, and
  text size, persisted alongside the existing save keys.
- **Human-tuned difficulty curve.** The Stage 14 gate only enforces wide guardrails.
  Real balance needs playtest data: are Act I missions too hard before the economy
  ramps? Is wanted pressure fair on keyboard vs touch? Add an optional difficulty
  setting (e.g. Story / Standard / Hard scaling reward, timers, wanted decay, enemy
  aggression) and tune actual numbers from real play, not just the range validator.

### Tier 2 — Presentation and content polish

- **Art and animation pass.** Replace procedural placeholder sprites/tiles with a
  cohesive style; add vehicle/pedestrian variety, damage states, and simple particle
  feedback (skids, hits, pickups).
- **Narrative / writing polish.** The authored hooks, goals, and payoffs are
  prototype-grade. A dedicated writing pass for voice, consistency, and payoff across
  all 24 chapters would raise the story from "functional" to "engaging".
- **Cutscene / beat presentation.** City-state consequences and branch outcomes are
  surfaced as text lines today. Consider lightweight staged beats (camera moves,
  character portraits) for act openers and finales.

### Tier 3 — Depth, replayability, and reach

- **Endgame / replayability.** New Game+, chapter time-attack or challenge modifiers,
  a per-chapter score/medal system, and a story-wide completion summary give reasons
  to replay beyond branch exploration.
- **Mobile / touch quality pass.** Touch menu and controls exist and are tested, but a
  dedicated pass on ergonomics, HUD scaling, and performance on real mid-range phones
  is needed before calling mobile "supported".
- **Cloud / cross-device saves.** Saves are localStorage-only. Optional export/import
  or account-backed sync would protect long story runs.
- **Localization (i18n).** All strings are inline English. Extract user-facing text to
  a resource layer if non-English reach matters.
- **Telemetry (opt-in).** Lightweight, privacy-respecting completion/drop-off metrics
  would turn future balance passes from guesswork into data.

### Tier 4 — Repo / product loose ends

- **Finish or cut the WIP mini-games.** `Pixel Sprint` and `Void Sweep` are still
  "Work in progress" in the arcade. Either finish them to the bar the other games meet
  or remove them from the lineup.
- **Performance budget in CI.** Long-session performance was hardened by construction,
  but there is no automated frame-time/regression budget. A perf smoke check would
  catch regressions before players do.
- **Parallelize the slow e2e file.** `story-authored-missions.spec.ts` alone is ~5.6m
  of the ~9.4m suite; sharding it would shorten the ship-gate loop.

---

## 3. Story Reference

### Premise

Sindicate story mode follows Rook Vance, a courier and wheelman who comes back to the
city after their sister Nia, a municipal dispatcher, disappears. Nia left behind
fragments of a hidden routing system called the Switchboard, a private network used by
criminal crews, corrupt officials, and logistics companies to steer police response,
ambulance coverage, tow recovery, and street congestion for profit.

At first, Rook is only trying to find Nia. That search pulls them into a city-wide
shadow war over who controls movement itself: who gets delayed, who gets rescued, which
wrecks vanish, which districts burn, and who profits when panic hits the streets. By the
end, Rook is not just exposing one murderer or gang boss — they are dismantling an
entire machine that turns the city into a market of engineered emergencies.

### Core pillars

- The city is the weapon. Roads, bridges, garages, hospitals, tow yards, taxi routes,
  and police patrol lanes matter to the plot.
- Every chapter changes who is using the city better: gangs, corporations, public
  services, or the player.
- Missions escalate from local hustles to district-level sabotage to citywide control
  failure.
- The player should regularly feel like they are learning a new use for familiar
  systems, not replaying the same job with bigger numbers.

### Chapter rhythm

The story is 24 chapters, 5 missions each. Recommended rhythm inside every chapter:

1. Entry mission that teaches the chapter problem.
2. Complication mission that adds pressure or time risk.
3. System mission that uses a different verb or vehicle.
4. Reversal mission where the enemy answers back.
5. Payoff mission that resolves the chapter and points into the next one.

### Mission variety rules

To avoid repetition across 120+ missions, the campaign deliberately rotates its
pressures.

Rotate by **pressure type**: time (hard/soft/staggered clocks, pursuit catch-up),
damage (fragile vehicle/cargo/passenger, preserve disguise), route (checkpoints, closed
roads, floodwater, blackout intersections, chokepoints), detection (tailing, low-profile
driving, disguise rules, no civilian kills), territory (defend a corridor, hold a
building, keep a route open, escort through crossfire), prioritization (which target to
save, which convoy to chase, which witness matters).

Rotate by **mission fantasy**: courier run, interception, tail and identify, rescue and
extraction, siege defense, convoy attack, convoy protection, disguise infiltration,
multi-stop setup, constrained vehicle theft, sabotage and timed escape, rescue under
live city hazards, district-scale traversal ordeal, broadcast/upload holdout.

Rotate by **ending feel**: clean getaway, last-second delivery, survive until
reinforcements, public reveal, target capture, structural destruction, district
liberation.

### Design notes for future content

When authoring or revising missions, each should include: one-sentence narrative hook,
one primary success condition, one secondary pressure that changes how the player
solves it, one clear failure state, and one payoff that visibly changes the next
mission.

### Chapter breakdown

#### Act I — Find The Missing Dispatcher

**Chapter 1 — Dead Drop District.** Rook returns to the waterfront, learns Nia was
moving evidence, and finds someone already cleaning her trail.

1. Night Ferry Run — soft-onboarding route drive under escalating patrol attention.
2. Burned Locker — reach three lockers before cleanup crews, escape a wanted spike.
3. Wreck Before Dawn — cause a controlled crash to block a cleanup van, take its cargo.
4. False Ambulance — intercept a fake ambulance before it reaches the chop garage.
5. Last Call At Pier 9 — assault the pier office, retrieve the dispatch badge, survive.

**Chapter 2 — Spare Parts Gospel.** The trail points to independent tow operators.

1. Yard Talk — steal a tow truck, do one legit recovery, return before it's flagged.
2. Hook Chain — recover two wrecks before a rival yard, under race pressure.
3. The Empty Shell — escort a stripped sedan of hidden documents; cargo weakens on hits.
4. Crusher Feed — infiltrate a scrap plant, trigger machinery, escape ramming drivers.
5. Towline Oath — defend the yard during a night raid, chase raiders to their contact.

**Chapter 3 — Static On The Hospital Band.** Missing ambulance routes and lost patients.

1. Cold Intake — timed rescue of an injured witness to a safe clinic.
2. Flatline Gap — plant relay beacons in four dead radio zones under growing heat.
3. Clean Sheets — low-combat infiltration to photograph falsified transfer records.
4. Crash Cart — race a damaged ambulance while preserving enough health to save the patient.
5. Ward 6 Exit — escort a nurse hacker out as roads close one by one.

**Chapter 4 — Meter Running.** Taxi logs show Nia moved informants under the radar.

1. Ghost Fare — narrative taxi suspense; strange drop-offs reveal you're being tested.
2. Double Booking — two overlapping fares; **branching** choice changes the ambush.
3. Red Light Choir — stealth-tail a radio host, steal a tape in plain sight.
4. Meter Burn — run contraband through checkpoints; clean driving lowers suspicion.
5. Farewell Signal — protective escape with a dying dispatcher and Nia's next clue.

**Chapter 5 — Precinct Ashes.** Corrupt police rent response delays to the highest bidder.

1. Badge Borrower — disguise-based access; scan caches before the plate is reported.
2. Suspect Carousel — frame a lieutenant, survive the wider-than-planned crackdown.
3. Lockup Blackout — sabotage power, enter, free a prisoner who knows Nia's route.
4. Riot Route — hold a corridor open for civilians against police and gangs.
5. Hard Copy — layered records-room raid; escape a precinct-wide dragnet (closes Act I).

**Chapter 6 — The Switchboard Name.** The ledger names the network and its power blocs.

1. Dead Letter Branch — navigation puzzle in a burning post office on a hard clock.
2. Relay Theft — hijack switch hardware, pick a safehouse route under pursuit density.
3. Blue Map Room — capture a planner alive and keep them alive through questioning.
4. Four Minute Silence — survive a blackout district where all guidance fails at once.
5. Name In The Static — upload stolen hardware and defend the transmitter to decrypt.

#### Act II — Court The City's Middle Powers

**Chapter 7 — Freight Union Morning.** The dock freight union hates the Switchboard.

1. Union Test Run — move three trailers across the harbor without losing them.
2. Picket Line Breaker — clear blockers while protecting non-combatant workers.
3. Harbor Echo — set-piece fight across a moving ferry convoy for customs tags.
4. Crane Jam — trap an enemy convoy with dock cranes, escape the collapsing yard.
5. The Long Manifest — escort the union leader through a rolling ambush (first ally bloc).

**Chapter 8 — Neon Couriers.** Racers and couriers move faster than official systems.

1. Signal Sprint — race where map knowledge beats top speed.
2. Drop Stack — five timed drops; each delivery changes the next stop's police pattern.
3. Blind Corner — smuggle a passenger off-camera; low-surveillance routes over short ones.
4. Rival Tape — ram a data-bike crew, recover the cassette, reach a decoder.
5. Lamps Out — hit festival power vans in the right order to move unseen.

**Chapter 9 — Glass Towers, Empty Floors.** Corporate staged accidents to flip districts.

1. Tenant Warning — deliver eviction evidence under security harassment.
2. Window Tax — steal maintenance keys, then plant charges on generator nodes.
3. Lobby Flood — misdirection; trigger panic in one tower to draw a broker from another.
4. Fire Sale Run — keep a box truck of forged deeds under a damage threshold.
5. Vacancy Notice — storm a half-built tower floor by floor for the transaction archive.

**Chapter 10 — Saints Of The Side Street.** A neighborhood aid network covers the abandoned.

1. Soup Line Watch — protect a mobile kitchen route without destroying the van.
2. Siren Swap — precision handoff from a marked ambulance to an unmarked clinic van.
3. Half Block Safehouse — sequential rescue of residents as roads collapse behind you.
4. Medicine Debt — collect stolen pharmaceuticals; some surrender, some spring traps.
5. Quiet Chapel — hold a church clinic during a raid, evacuate doctors through the cemetery.

**Chapter 11 — Broadcast Teeth.** A pirate radio network can expose the Switchboard.

1. Antenna Climb — reach three hilltop repeaters under sniper and vehicle pressure.
2. Open Mic Trap — deliver bait intel, then shape the ambush site before the target arrives.
3. Jingle Bomb — disable a propaganda van without destroying the audio master.
4. Studio Sweep — identify the mole among staffers mid-broadcast and capture them.
5. Citywide Readout — defend the transmitter while evidence plays and factions converge.

**Chapter 12 — Debt Collection Weather.** Loan sharks trap blocks in damage cycles.

1. Missed Payment — short interception to rescue a shop owner from enforcers.
2. Three Stores Down — collect testimony, keep each witness alive to the rendezvous.
3. Ledger Heat — steal the collector's car, hit checkpoints to copy data before it self-locks.
4. Storm Drain Exit — smuggle witnesses through maintenance roads as patrols tighten.
5. Rain Of Receipts — crash a debt auction, kill the bosses, burn the archive (closes Act II).

#### Act III — Expose The Machine

**Chapter 13 — Civic Shield.** The private security contractor is the Switchboard's muscle.

1. Training Day — infiltrate a proving route by staying inside patrol formation.
2. Panic Demo — disable planted triggers before a staged mall panic.
3. Armor Column — split an armored convoy using traffic lights and blockers.
4. Contract Burn — steal the roster of who is paid to arrive late, early, or never.
5. Black Badge Mile — escape a shoot-on-sight district by endurance and routing.

**Chapter 14 — The Missing Shift.** Nia's dispatcher allies vanished the same night.

1. Clock-In Ghosts — investigative scavenger hunt before cleaners torch the apartments.
2. Switch Room Bait — restore a dispatch room, wait, and capture whoever comes to kill it.
3. Voiceprint Chase — triangulate a spoofed caller and ram their escape route closed.
4. Union Tunnel — corridor survival escort of rescued dispatchers, attacked from both ends.
5. Shift Ledger — the roster office reveals Nia was moved under a false death certificate.

**Chapter 15 — Low Water Mark.** The utility board steers panic with floods and outages.

1. Valve Street — reach four flood-control points before enemy crews open them.
2. Cable Snare — drag down surveillance cables with a heavy truck under fire.
3. Dry Route — escort evacuees through rising water where navigation is the enemy.
4. Pump House Red — hold a pump station through staged restarts that open new attack lanes.
5. Breakwater File — extract Nia's location from a utility foreman through pressure.

**Chapter 16 — The Garden District Lie.** Wealthy blocks buy diverted emergency cover.

1. White Curb Tour — pose as valet transport to mark hidden panic bunkers.
2. Garden Party Crash — cut arrival routes to force guests into the identifiable street.
3. Silver Plate Run — steal a caterer's van of guest records, keep the disguise.
4. Iron Gate — open three estate gates for protest convoys and hold the corridors.
5. Glass Lawns — stylized hunt of the district patron through ornamental roads.

**Chapter 17 — Blue Light Auction.** Police response priority is sold in secret.

1. Bid Card — steal an invitation and arrive without raising heat.
2. Table Service — work the room as staff, tag the buyers' escape cars.
3. Closing Bell — a fake bomb scare empties the venue; capture the auctioneer and ledger.
4. Car Park Scramble — chase five buyers, decide which two matter before the rest vanish.
5. Priority Zero — broadcast the ledger while surviving a police shutdown.

**Chapter 18 — Bone White Morning.** Rook locates where witnesses were moved.

1. Quarry Wake — fragile-stealth recon of an industrial yard.
2. Freight Coffin — intercept a sealed truck intact; discover live captives.
3. Split Convoy — separate decoys from the real transport by thinking, not racing.
4. The Lower Bays — evacuation triage of survivors cell by cell.
5. Nia's Voice — recover Nia's message naming the four leaders; she's alive and moving (ends Act III).

#### Act IV — Break The Four Pillars

**Chapter 19 — The Broker.** First pillar: logistics and wreck monetization.

1. Invoice Run — hijack billing vans of destruction claims for union auditors.
2. Empty Chassis — spot which stripped-car shell hides the broker's archive.
3. Yard Fire Drill — false alarms at three scrapyards to thin the broker's crews.
4. Counterweight — pin the armored limo with heavy equipment, fight the response.
5. Ledgers In The Furnace — burn the accounting vault escaping a live plant.

**Chapter 20 — The Commissioner.** Second pillar: the police commissioner sells selective law.

1. Honor Guard — blend into a motorcade to reach the protected route.
2. Patrol Leak — plant evidence in command cars so rank-and-file see the corruption.
3. Holding Pattern — trap the commissioner in a traffic box of stolen buses and wrecks.
4. Blue Divide — escort defecting officers out as loyalists seal junctions.
5. Open Channel — force a radio confession while surviving the last loyal teams
   (**city-state reactive** finale that re-skins from accumulated faction standing).

**Chapter 21 — The Developer.** Third pillar: engineered blight and collapse.

1. Model Unit — infiltrate a show home for hidden redevelopment maps.
2. Controlled Demolition — cut explosive sequence lines in the right order.
3. Dust Run — race a school bus out of a collapse corridor.
4. Permit Office — steal demolition approvals before they are digitally voided.
5. Foundation Crack — bring down the flagship tower and escape the plaza panic.

**Chapter 22 — The Minister Of Care.** Fourth pillar: weaponized ambulance scarcity.

1. Short Supply — reclaim stolen medicine caches from fake clinics.
2. Bed Count — escort a whistleblower doctor across two hot zones (health + condition).
3. Intake Refusal — breach and hold a locked emergency entrance for fleeing civilians.
4. White Hallway — target identification among mixed guards and frightened staff.
5. Name The Dead — upload hidden casualty records as the facility locks down.

**Chapter 23 — City Without Permission.** The wounded Board tries to shut the city down.

1. Grid Slip — reconnect three neighborhoods with stolen utility trucks.
2. No Green Lights — cross the whole map in a synchronized signal blackout.
3. Human Chain — a convoy that must outmaneuver, not outfight, the enemy.
4. The Empty Broadcast — narrative reversal; the Board seeds a fake confession.
5. Hold Until Morning — final long-form survival defense before the finale.

**Chapter 24 — Dawn Through Concrete.** Rook rescues Nia and destroys the core.

1. Breach Window — reach the facility through ally-opened access routes.
2. Live Wire — high-stakes moving escort as Nia unlocks blast doors.
3. Failsafe Fleet — stop three destruction convoys by priority and attack style.
4. Heartbeat Zero — final layered-hazard defense while Nia uploads the evidence.
5. First Light Exit — escape, choose how to release the data, drive into a changed city
   (leaves room for post-story free play and future content).

---

## 4. Implementation History

The story mode was built in 14 gated stages, base-first: contracts and save model
before content, and each stage's failure modes understood and covered before widening
the surface. All stages are **complete**. Detailed per-defect notes and gotchas live in
repository memory; this is the condensed record.

| Stage | Focus | Outcome |
| --- | --- | --- |
| 0 | Lock core contracts | Versioned `StoryMode`/chapter/mission/actor types, stable save keys, `validateStoryMode`, walk-forward save migration. |
| 1 | Mission objective primitives | 11 objective kinds in `mission.ts`; shared story/sandbox progress; `'failed'` status + `failMission`/`isFailed`. |
| 2 | World & actor runtime | Route/escort/squad actors, protected targets, handoffs via staged actor rosters, district-state effects, `despawnStoryActor`. Fixed: foot NPCs walking into water (`isWaterAt` guard). |
| 3 | Progression & recovery | Save/load, replay, branch carry-forward, failure/chapter restarts. Fixed: chapter-complete run wipe, silent Load-button no-op. |
| 4 | Observability | Mission summaries from live world deltas, stage-shift panels, branch-variant surfacing. Fixed: silent time-limit failures. |
| 5 | Vertical slice | Dead Drop District fully scripted as the reference chapter. |
| 6 | Content pipeline | Reusable authoring helpers (escort, protected-vehicle, wanted-pressure, vehicle-route, squad); grouped/variant authoring; stage-transition validation. |
| 7 | Scale out | Carried the prototype to the full 24-chapter / 120-mission run. |
| 8 | Bespoke encounter depth | Multi-phase set pieces (Crane Jam, Lobby Flood, Quiet Chapel); branch leads carry across chapters; actor reuse across advances. |
| 9 | Presentation & surfacing | Launcher run facts, dense scorecards, system tags, compact result surfacing. |
| 10 | Harden the base | Tested spawn-placement guarantees, off-screen road-snapped spawns, bounded navigation/dispatch scans, despawn/reuse churn correctness, fail-safe fallbacks. |
| 11 | Coverage & cut dead flexibility | Per-chapter distinctive-system regressions (Ch. 7–12), objective/actor/fail-rule exhaustion test, unused-branch validation. |
| 12 | Author Act III & IV | Chapters 13–24 authored on the stable base within tested encounter patterns. |
| 13 | Citywide reactivity | Typed `StoryCityEffect[]` across district/faction/service axes; accumulated `StoryCityState`; variants gate on city-state thresholds; "City Standing" surfacing. |
| 14 | Balance & ship gate | `validateStoryBalance` + `STORY_BALANCE_BOUNDS`; non-regressing per-act economy; final quality gates green; no dead surfaces to cut. |

### Post-completion hardening note

A retrospective audit found that every claimed outcome was functionally present, but a
recurring class of defects surfaced *after* stages were marked complete — actors
spawning on top of the player, navigation stalls resolving off-map actors, foot NPCs
walking into the river. Their shared root was declaring the runtime base done without
adversarial coverage of spawn placement, navigation edge cases, and performance under
scale. Stages 10 and 11 closed that class (unit + Playwright regressions for spawn
safety, bounded scans, churn correctness, and per-chapter distinctive-system coverage)
before Act III authoring widened the surface. **Lesson carried forward:** after any
fix, run the full suite — not just the new targeted test — and drive the real UI flow
rather than calling scene/store APIs directly.
