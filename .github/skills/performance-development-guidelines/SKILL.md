---
name: performance-development-guidelines
description: "Use this skill when developing Phaser scenes, game loops, simulation ticks, autosave, render synchronization, sprite pools, particles, HUD updates, minimaps, or any code that can affect runtime performance. Triggers on: game loop, update loop, fixed step, accumulator, Phaser performance, sprite pool, autosave, minimap, render sync, per-frame work."
---

# Performance Development Guidelines

Keep the game loop bounded, measurable, and recoverable from hitches. Prefer small, explicit budgets over work that silently grows with play time.

## Required Practices

- Clamp raw frame deltas before they reach gameplay timers or fail-rule countdowns: `dt = Math.min(deltaMs / 1000, MAX_FRAME_DT)`.
- Use fixed-step simulation for core gameplay, cap substeps per rendered frame, and drop stale accumulator backlog when the cap is reached. Never let old time debt carry forever.
- Keep `src/core/*` pure and Phaser-free. Put gameplay rules in core tests; keep `src/game/*` as rendering/input glue.
- Do not create or destroy Phaser game objects in steady-state frame loops. Use persistent pools keyed by stable indices and hide surplus entries with `setVisible(false)`.
- Allocate lazily only when the object can actually become visible, or preallocate intentionally with a measured upper bound. Hidden per-entity overlays still cost memory and display-list traversal.
- Throttle expensive redraws and synchronous work. Minimap redraws, autosaves, storage writes, and full-world serialization should run on deliberate intervals with measured costs.
- Treat `localStorage` as blocking. If a save contains the full world, measure `JSON.stringify` size/time before increasing save cadence or adding more snapshot fields.
- Keep render sync deterministic and bounded: one pass over cars, pedestrians, police, pickups, bullets, explosions, and UI markers; avoid nested scans unless the data size is fixed and small.
- Add focused performance regressions for loop invariants: accumulator stays bounded after long frames, pool sizes do not grow under repeated syncs, and expensive work remains throttled.
- Always red/green new regressions: temporarily remove the fix or guard, confirm failure, restore it, confirm pass.
- When a branch makes a latent performance bug visible, fix the invariant and separately note the trigger commit. Do not rely on reverting visual work to hide a loop that still cannot recover from hitches.

## Review Checklist

- Does this change add any per-frame allocation, `this.add.*`, `new Map`, `JSON.stringify`, broad `filter/map`, or storage write?
- Can a browser hitch, tab refocus, GC pause, or autosave stall make the next frame do unbounded catch-up work?
- Would this change make an existing bad invariant visible by adding steady per-frame work, display-list pressure, texture churn, or synchronous serialization?
- Are object pools hidden/reused rather than appended forever?
- Are all growable arrays either naturally bounded or actively pruned?
- Is the cheapest test asserting the invariant directly instead of relying on a subjective visual symptom?