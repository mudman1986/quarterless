---
name: debugging-performance-issues
description: "Use this skill when debugging runtime slowdown, frame hitches, stutter, jumpy movement, growing frame time, memory leaks, object leaks, fixed-step accumulator issues, autosave stalls, or Phaser performance problems. Triggers on: performance, slow, slower over time, stutter, hitch, jank, jumpy driving, frame time, memory leak."
---

# Debugging Performance Issues

Use a narrow measurement loop before editing. Start from the hottest user-visible symptom and prove which bucket it belongs to: simulation backlog, render/display-list growth, core array growth, serialization/storage stalls, or asset/texture churn.

## Workflow

1. Reproduce or simulate the symptom in the real browser path when possible. For Sindicate, launch through the real story flow so scene state, autosave, panels, and Phaser rendering match production.
2. Add temporary page-side probes with `page.evaluate`, not permanent logging first. Capture `scene.children.list.length`, relevant pool lengths, `world.cars.length`, `world.pedestrians.length`, `world.police.length`, bullets, corpses, explosions, snapshot byte size, and timed calls around `world.tick`, render sync, and persistence.
3. Separate "grows over time" from "constant but too expensive". A flat object count points away from leaks; a growing accumulator or growing serialized snapshot points toward frame pacing or persistence.
4. For fixed-step simulations, inspect both clamps: frame delta must be clamped before gameplay timers, and the accumulator must drop stale backlog after `MAX_SUBSTEPS`. A max-substep cap without backlog discard creates a spiral where every later render keeps doing maximum simulation work.
5. Check blocking browser APIs on timers. `localStorage` writes and `JSON.stringify` are synchronous; if they serialize the full world frequently, measure write duration and snapshot size before changing save cadence or snapshot shape.
6. If a bug is not visible on `main`, compare history in two layers: first find when the broken invariant appeared, then find the later commit that made it observable by adding hitches, heavier per-frame work, larger snapshots, or more display-list pressure.
7. Verify with a focused regression that reproduces the failure mechanically. For accumulator bugs, feed repeated long `deltaMs` values and assert stale backlog stays below one fixed step.
8. Red/green the regression by temporarily reverting the fix, confirming the new test fails for the intended reason, restoring the fix, and confirming it passes.

## Lessons From The Jumpy Driving Bug

- The root cause was not an object leak: scene children and core arrays stayed bounded under forced long runs.
- The real failure was stale fixed-step accumulator debt. Long frames hit `MAX_SUBSTEPS`, but leftover time stayed in `this.accumulator`, so subsequent frames kept spending the maximum simulation budget and rendered large position jumps.
- The bad accumulator invariant already existed before the visible slowdown window; later visual/story/render changes made hitches frequent enough for the latent bug to show up. Do not confuse the trigger commit with the invariant that needs fixing.
- The correct fix was to discard stale accumulator backlog after the substep budget is exhausted. This preserves responsiveness after hitches, tab refocus, autosave stalls, or GC pauses.
- A regression test must assert the accumulator behavior directly; visual smoothness alone is too subjective and too flaky for a stable browser test.