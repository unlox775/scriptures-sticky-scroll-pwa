# Infinite Scroller Rewrite — Iteration Log

**Prompt slug:** `infinite-scroller`  
**Started:** 2026-05-12  
**Last updated:** 2026-05-13

**Context:** This spec was split out of `20260309-210000_pivot-*` after the fact. Git history shows the scroller rewrite began on May 12 local time (`Working infinite scroller!` commits), so this new pair is dated May 12 as requested. The prompt log was migrated from the already-recorded sections in the older pivot prompt log.

See `20260512-224600_infinite-scroller-PROMPT.txt` for the full migrated prompt history.

## Delivery Summary

### Prompt 1: New infinite scroller debug UI

| Item | Status | Where / Notes |
|------|--------|---------------|
| Isolated scroller lab page | Done | `scroller-lab.html`, built as `docs/scroller-lab.html` |
| Modular infinite scroller | Done | `src/scriptureScroller.js`; jump, prepend, append, unload, cross-book sequence, and telemetry hooks |
| Jacob 2:12 direct URL target | Done | Default route is `#/jacob/2/12`; hash route supports `#/:bookId/:chapter/:verse` |
| 25% verse alignment | Done | `ScriptureScroller.jumpTo()` aligns the requested verse to the 25% viewport guide |
| Split telemetry view | Done | `src/scrollerLab.js` and `src/scrollerLab.css`; metrics, threshold bars, minimap, loaded-window details, event ticker |
| Build verification | Done | `npm run build` passing |

### Prompt 2: Tighten scroller telemetry cockpit

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move jump controls to telemetry side | Done | `scroller-lab.html`; left pane is now reader-only |
| Prevent right-pane page scrolling | Done | `src/scrollerLab.css`; telemetry pane is fixed to viewport with internal ticker scroll |
| Compact telemetry layout | Done | Dense metric/control/minimap/details/event grid replaces roomy card stack |
| Add minimap trigger lines | Done | `src/scrollerLab.js`, `src/scrollerLab.css`; shows viewport, load, and unload thresholds |
| Build verification | Done | `npm run build` passing |

### Prompt 3: Minimap placement and trigger semantics

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move minimap beside top telemetry controls | Done | `scroller-lab.html`, `src/scrollerLab.css`; top dashboard is split into controls/metrics and minimap columns |
| Correct minimap viewport scale | Done | `src/scrollerLab.js`; removed oversized minimum viewport height that overstated the red rectangle |
| Clarify unload trigger visualization | Done | `src/scrollerLab.js`; unload markers now attach to chapter-specific trigger positions instead of moving with viewport |
| Build verification | Done | `npm run build` passing |

### Prompt 4: Next actionable trigger lines and ticker noise

| Item | Status | Where / Notes |
|------|--------|---------------|
| Show only next load/unload minimap triggers | Done | `src/scrollerLab.js`; green load line and red unload line now represent nearest actionable crossing |
| Reduce event ticker height | Done | `src/scrollerLab.css`; ticker uses a smaller fixed bottom region |
| Compress `preload_not_needed` noise | Done | `src/scrollerLab.js`; repeated threshold misses update one rolling counter with top/bottom counts |
| Build verification | Done | `npm run build` passing |

### Prompt 5: Accurate trigger counters and hide anchor noise

| Item | Status | Where / Notes |
|------|--------|---------------|
| Hide anchor-change ticker noise | Done | `src/scrollerLab.js`; anchor changes still update current reference but do not add ticker rows |
| Use engine-owned trigger diagnostics | Done | `src/scriptureScroller.js`; snapshots include load/unload targets, pixel countdowns, and unload gating |
| Show concrete pixel countdowns | Done | `scroller-lab.html`, `src/scrollerLab.js`, `src/scrollerLab.css`; up/down load and unload counters name the affected chapter |
| Prevent false unload lines | Done | Red minimap unload line only appears when loaded count exceeds `maxLoadedChapters`, matching `unloadFarChapters()` |
| Build verification | Done | `npm run build` passing |

### Prompt 6: Unload gate and downward jump bug

| Item | Status | Where / Notes |
|------|--------|---------------|
| Reduce unload chapter floor | Done | `src/scriptureScroller.js`; minimum retained chapters lowered from 9/10 threshold to 5/6 threshold |
| Switch unload distance to viewport pages | Done | `src/scriptureScroller.js`; unload distance is now `2 * viewportHeight` instead of a fixed pixel constant |
| Avoid same-frame down-load/top-unload jump | Done | `src/scriptureScroller.js`; a down append no longer immediately removes an above chapter in the same evaluation frame |
| Disable browser scroll anchoring | Done | `src/scrollerLab.css`; manual scrollTop preservation is the only scroll compensation |
| Update trigger text | Done | `src/scrollerLab.js`; counters describe viewport-page unload rule and smaller chapter floor |
| Build verification | Done | `npm run build` passing |

### Prompt 7: Always show four directional trigger lines

| Item | Status | Where / Notes |
|------|--------|---------------|
| Remove visible unload gate | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`; no more "gated until > N chapters" counters |
| Draw directional trigger lines | Done | `src/scrollerLab.js`; shows load-up, load-down, unload-up, and unload-down lines when matching chapters exist |
| Keep unload from firing during programmatic jump | Done | `src/scriptureScroller.js`; unload waits for real user scroll after jump/initial alignment |
| Build verification | Done | `npm run build` passing |

### Prompt 8: Directional unload and bottom-edge line

| Item | Status | Where / Notes |
|------|--------|---------------|
| Make unload directional | Done | `src/scriptureScroller.js`; scrolling down only unloads above, scrolling up only unloads below |
| Move unload-below marker to viewport bottom crossing | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`; bottom-side unload line now represents the viewport bottom edge |
| Fix boot/load stall | Done | `src/scriptureScroller.js`; frame waits now have timeout fallback and prepend no longer awaits a frame before measuring |
| Build/browser verification | Done | `npm run build` passing; browser refresh reaches ready without boot-time unload spam |

### Prompt 9: First-scroll corruption focus

| Item | Status | Where / Notes |
|------|--------|---------------|
| Identify first-scroll corruption cause | Done | Unload code treated already-far chapters as unloadable on any tiny scroll, instead of requiring threshold crossing |
| Require actual unload threshold crossing | Done | `src/scriptureScroller.js`; unload only fires when previous/current viewport edge crosses the relevant red line |
| Preserve focused scope | Done | No broader UI/heuristic changes beyond the corruption fix |
| Build/browser verification | Done | `npm run build` passing; browser refresh/scroll events no longer unload preloaded chapters immediately |

### Prompt 10: Edge-only unload model

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix crossed unload labels | Done | `src/scriptureScroller.js`; diagnostics now target only first loaded chapter for unload-above and last loaded chapter for unload-below |
| Match engine to diagnostics | Done | `src/scriptureScroller.js`; unload engine only considers the outer loaded edge for the current scroll direction |
| Replace fixed chapter startup | Done | `src/scriptureScroller.js`; jump startup loads by pixel buffer and guarantees adjacent edge chapters instead of a fixed two-chapter radius |
| Fix stale first-scroll baseline | Done | `src/scriptureScroller.js`; `lastScrollTop` is reset after programmatic jump/buffer alignment |
| Build/browser verification | Done | Browser preview shows no false Jacob 2 unload labels at Jacob 2:12; `npm run build` passing |

### Prompt 11: Remove leftover adjacency/loading rules

| Item | Status | Where / Notes |
|------|--------|---------------|
| Remove reflexive adjacent chapter loading | Done | `src/scriptureScroller.js`; jump startup no longer forces one chapter above and below |
| Convert preload threshold to viewport-based distance | Done | `src/scriptureScroller.js`; preload distance is now `preloadViewportPages * viewportHeight` instead of fixed `900px` |
| Align minimap load lines to engine threshold | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; green lines use the same viewport-based threshold as actual load decisions |
| Browser verification | Done | Cache-busted preview at Jacob 2:12 settles with only Jacob 2 loaded; Jacob 1/Jacob 3 no longer load unless threshold distance requires them |

### Prompt 12: Align unload lines with viewport collision edge

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move unload-above visual line | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; unload-above now draws at the viewport-bottom collision point instead of raw `scrollTop` |
| Preserve engine behavior | Done | Display-only correction; actual unload crossing logic remains unchanged |
| Build/browser verification | Done | `npm run build` passing; cache-busted preview boots cleanly at Jacob 2:12 |

### Prompt 13: Move unload-below line up one viewport

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move unload-below visual line | Done | `src/scrollerLab.js`; unload-below now draws at `targetScrollTop` so the red viewport rectangle does not pass over it |
| Preserve engine behavior | Done | Display-only correction; actual unload crossing logic remains unchanged |
| Build verification | Done | `npm run build` passing |

### Prompt 14: Add load/unload hysteresis

| Item | Status | Where / Notes |
|------|--------|---------------|
| Separate load and unload thresholds | Done | `src/scriptureScroller.js`; load now triggers at `1.75` viewports, unload at `2.25` viewports |
| Prevent immediate re-crossing after DOM removal | Done | `src/scriptureScroller.js`; `lastScrollTop` is reset after scrollTop compensation during unload |
| Surface buffer gap in telemetry | Done | `src/scrollerLab.js`; threshold details now show the explicit load/unload gap |
| Build/browser verification | Done | Cache-busted preview boots cleanly at Jacob 2:12; `npm run build` passing |

### Prompt 15: Diagnose unload/reload loop near Jacob 2

| Item | Status | Where / Notes |
|------|--------|---------------|
| Identify loop cause | Done | Top unload adjusted from potentially clamped `scrollTop` after DOM removal, which could jump back into the load-up zone |
| Fix scroll compensation invariant | Done | `src/scriptureScroller.js`; capture pre-removal scroll position and subtract actual removed layout space |
| Add unload debug metrics | Done | `chapter_unloaded` telemetry now includes before/after scroll, removed layout space, and exact adjustment |
| Build verification | Done | `npm run build` passing |

### Prompt 16: Implement unload catch-up

| Item | Status | Where / Notes |
|------|--------|---------------|
| Allow overdue unload cleanup | Done | `src/scriptureScroller.js`; unload now fires if the viewport is already past the edge threshold, not only on the exact crossing frame |
| Keep cleanup edge-only | Done | `src/scriptureScroller.js`; fast downward scroll cleans one top chapter per evaluation, fast upward scroll cleans one bottom chapter |
| Clarify passed threshold state | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; counters now show `passed` instead of reporting no chapter when an unload threshold is behind the viewport |
| Avoid misleading minimap lines | Done | `src/scrollerLab.js`; passed unload thresholds do not draw stale red lines |
| Build verification | Done | `npm run build` passing |

### Prompt 17: Chapter links and auto-scroll controls

| Item | Status | Where / Notes |
|------|--------|---------------|
| Add Gospel Library links | Done | `src/scriptureScroller.js`; each sticky chapter heading includes an external-link arrow using chapter `externalUrl` |
| Add auto-scroll controls | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`, `src/scrollerLab.css`; chapter headers expose an Auto scroll button that opens a speed slider, Start, and Stop bar |
| Preserve scroller behavior | Done | Auto-scroll updates the existing scroll container with `requestAnimationFrame`, so normal load/unload telemetry still drives the window |
| Browser verification | Done | Cache-busted lab page renders the header link/button; Auto scroll panel opens, starts, and stops |
| Build verification | Done | `npm run build` passing |

### Prompt 18: Move auto-scroll to lab header

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move auto-scroll button | Done | `scroller-lab.html`, `src/scrollerLab.js`, `src/scrollerLab.css`; Auto scroll now lives in the main lab header |
| Keep chapter header focused | Done | `src/scriptureScroller.js`; chapter headers now show book, chapter title, and Gospel Library arrow only |
| Simplify auto-scroll panel | Done | `src/scrollerLab.js`; clicking Auto scroll starts immediately, shows speed slider and Stop only, and Stop closes the panel |
| Browser verification | Done | Cache-busted lab page starts/stops auto-scroll from the main header |
| Build verification | Done | `npm run build` passing |

### Prompt 19: Prepare scroller for production transplant

| Item | Status | Where / Notes |
|------|--------|---------------|
| Extract reusable reader styles | Done | `src/scriptureReader.css`; left-reader visuals now live outside the telemetry stylesheet |
| Split auto-scroll controller | Done | `src/autoScrollController.js`; auto-scroll can be mounted with or without the lab telemetry UI |
| Add reader mount adapter | Done | `src/scriptureReaderMount.js`; wraps `ScriptureScroller`, optional auto-scroll, `init`, `jumpTo`, `getSnapshot`, and `destroy` |
| Add production reader entrypoint | Done | `src/scriptureReader.js`; old app can import the reader module without importing the lab harness |
| Keep lab as telemetry harness | Done | `src/scrollerLab.js`; lab now imports the reusable reader entrypoint and owns only controls/telemetry rendering |
| Build verification | Done | `npm run build` passing |

### Prompt 20: Auto-scroll unload and stop behavior

| Item | Status | Where / Notes |
|------|--------|---------------|
| Let auto-scroll trigger unload cleanup | Done | `src/scriptureReaderMount.js`, `src/scriptureScroller.js`; auto-scroll marks scrolling as intentional so edge unloads are no longer gated |
| Toggle active auto-scroll from header button | Done | `src/autoScrollController.js`; clicking Auto scrolling now stops and closes the panel |
| Stop auto-scroll on manual scroll intent | Done | `src/autoScrollController.js`; meaningful wheel, touch drag, or scroll-key input stops auto-scroll |
| Build verification | Done | `npm run build` passing |

### Prompt 21: Replace main app reader with new scroller

| Item | Status | Where / Notes |
|------|--------|---------------|
| Replace production reader engine | Done | `src/services/readerService.js`; main app now mounts `createScriptureReader()` / `ScriptureScroller` instead of the legacy `ReaderEngine` |
| Remove legacy reader implementation | Done | Deleted `src/readerEngine.js`; unit coverage now targets `ScriptureScroller` sequence mapping |
| Wire bookmarks to 25% anchor | Done | `src/scriptureScroller.js`, `src/services/readerService.js`; anchor telemetry now includes work/book/chapter/verse reference for bookmark create/move/auto-follow |
| Keep lab-only UI out of production reader | Done | `index.html`, `src/main.js`, `src/styles.css`; no lab header or 25% guide in the default app reader |
| Reuse new auto-scroll controls | Done | App header Auto scroll button now mounts the reusable controller and speed/Stop bar outside the scroller viewport |
| Browser verification | Done | Main route `#/r/book-of-mormon/jacob/2/12` renders the new scroller; Auto scroll toggles on/off from the header |
| Build verification | Done | `npm run build` passing |
| Test verification | Partial | New scroller unit test passes; full `npm test` still fails existing Node harness async `indexedDB is not defined` failures unrelated to this reader swap |

### Prompt 22: Bookmark ribbon anchoring, header book, route memory

| Item | Status | Where / Notes |
|------|--------|---------------|
| Stabilize bookmark ribbon positioning | Done | `src/views/readerView.js`, `src/styles.css`; ribbons are now placed from the verse screen rect in a sticky overlay beside reader content |
| Update header across book boundaries | Done | `src/main.js`; current work/book state now follows the scroller anchor, so the app header changes from Exodus to Leviticus when crossing books |
| Prevent stale reader route after leaving reader | Done | `src/main.js`; Home/Back destroy the active reader and hidden-reader anchor events are ignored before route updates |
| Build verification | Done | `npm run build` passing |

### Prompt 23: iPhone slow auto-scroll, jitter, bookmark history

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix low-speed auto-scroll on iPhone | Done | `src/autoScrollController.js`; auto-scroll now accumulates fractional scroll position and writes rounded integer pixels |
| Reduce occasional reader jiggle | Done | `src/views/readerView.js`, `src/scriptureScroller.js`; bookmark ribbons update existing DOM nodes and unload triggers get a small epsilon near thresholds |
| Preserve one bookmark history row per local day | Done | `src/bookmarks.js`; history uses local dates, backfills older location-only bookmarks, and updates the current day row |
| Add bookmark history coverage | Done | `tests/unit/bookmarks.test.mjs`; focused assertions pass before the existing async IndexedDB harness failure |
| Build verification | Done | `npm run build` passing |

### Prompt 24: Explicit sticky bookmark follow mode

| Item | Status | Where / Notes |
|------|--------|---------------|
| Stop sticky-follow status flicker | Done | `src/main.js`; sticky-follow updates no longer show the transient moved-bookmark status bar |
| Require explicit follow activation | Done | `src/main.js`, `src/views/readerView.js`; normal chapter/book navigation does not auto-engage sticky follow |
| Auto-enable only from bookmark open | Done | Opening a bookmark from Home sets that bookmark as the active sticky follower |
| Add visible active follow state | Done | `src/styles.css`; active bookmark ribbon is green with a pulsing indicator |
| Gate follow by proximity | Done | `src/main.js`; the active bookmark only moves while it is near the anchor, otherwise waits until the reader scrolls back nearby |
| Build verification | Done | `npm run build` passing |

### Prompt 25: Sticky follow resume and auto-scroll speed persistence

| Item | Status | Where / Notes |
|------|--------|---------------|
| Persist auto-scroll speed | Done | `src/autoScrollController.js`; slider speed is saved to localStorage and reused next time |
| Improve sticky-follow resume | Done | `src/main.js`; larger resume radius with a smaller maximum per-update jump makes follow resume easily nearby without jumping too far |
| Auto-disable stale follow | Done | `src/main.js`; an active sticky bookmark turns off after 5 minutes continuously out of range |
| Activate follow after manual move | Done | `src/main.js`; moving a bookmark to the current reader location makes it the active sticky follower |
| Build verification | Done | `npm run build` passing |

### Prompt 26: Split scroller work into its own dated spec pair

| Item | Status | Where / Notes |
|------|--------|---------------|
| Create dedicated infinite-scroller spec pair | Done | `20260512-224600_infinite-scroller.md` and `20260512-224600_infinite-scroller-PROMPT.txt` |
| Migrate recorded prompts | Done | Old pivot Prompts 12–37 were copied here as Prompts 1–26 |
| Trim old pivot spec | Done | `20260309-210000_pivot-*` now points to this spec for the scroller rewrite |

### Prompt 27: Loosen sticky-follow and lower default auto-scroll speed

| Item | Status | Where / Notes |
|------|--------|---------------|
| Lower default auto-scroll speed | Done | `src/autoScrollController.js`, `src/scriptureReaderMount.js`, `src/services/readerService.js`; default speed is now 20 px/sec when no saved user speed exists |
| Make sticky-follow more forgiving | Done | `src/main.js`; resume and max-update verse windows are roughly 4.5x larger, allowing the active bookmark to keep following from farther off screen |
| Allow faster sticky-follow reading | Done | `src/main.js`; slow-reading velocity gate is increased by about 25% |

### Prompt 28: Sticky-follow resume diagnostics and debug log UX

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix stuck sticky-follow resume | Done | `src/main.js`; when an active bookmark returns to update range, stale velocity samples are cleared so slow reading can immediately resume follow |
| Add sticky-follow decision logs | Done | `src/main.js`; follow resume/update/skip/auto-disable decisions emit explicit reasons and threshold metrics |
| Surface scroller telemetry in debug logs | Done | `src/services/readerService.js`, `src/visibilityConfig.js`; production infinite-scroller events have a dedicated `domain.infiniteScroller` visibility module |
| Compact debug log view | Done | `src/main.js`, `src/styles.css`; logs render newest-first as compact strings and collapse repeated consecutive events with `xN` badges |

### Prompt 29: Logging enablement and auto-scroll stop investigation

| Item | Status | Where / Notes |
|------|--------|---------------|
| Make logging enablement less confusing | Done | `src/services/visibilityService.js`, `src/main.js`; checking any module now enables global logging and bumps verbosity to standard |
| Prevent false auto-scroll stop at loaded DOM bottom | Done | `src/autoScrollController.js`, `src/scriptureReaderMount.js`, `src/scriptureScroller.js`; auto-scroll only stops at the actual work end and asks the scroller to load when pinned to the loaded bottom |
| Add auto-scroll stop diagnostics | Done | `src/scriptureScroller.js`; stop events include reason, current anchor, bottom distance, loaded count, pending loads, and work-continuation state |
| Browser verification | Done | Tested the local app at `#/r/old-testament/ex/28/33`; auto-scroll at 80 px/sec stayed active crossing into Exodus 29 with no console errors |
| Build verification | Done | `npm run build` passing |

### Prompt 30: Skip-ahead unload regression and integration test

| Item | Status | Where / Notes |
|------|--------|---------------|
| Harden top-unload scroll compensation | Done | `src/scriptureScroller.js`; unload now restores a real remaining anchor element after removing the offscreen chapter |
| Add focused unload regression coverage | Done | `tests/unit/readerEngine.test.mjs`; verifies visible anchor position survives an unload-above operation |
| Add browser regression scaffold | Done | `playwright.config.mjs`, `tests/playwright/scroller-unload.spec.mjs`, `src/scrollerLab.js`; test drives the Alma 36 scenario through the lab debug hook |
| Playwright execution | Deferred | Browser install was paused per user request; test is written for manual/local run with `npm run test:e2e` |

### Prompt 31: Serialize scroller load/unload mutations

| Item | Status | Where / Notes |
|------|--------|---------------|
| Serialize window mutations | Done | `src/scriptureScroller.js`; each evaluation pass performs at most one append/prepend/unload |
| Add settle window between mutations | Done | `src/scriptureScroller.js`; threshold re-checks defer during a 450 ms load/unload settle window |
| Add settle diagnostics | Done | `src/scriptureScroller.js`; emits `window_mutation_settling` and `window_evaluation_deferred` events |
| Build verification | Done | `npm run build` passing |
| Focused test verification | Done | `node --test tests/unit/readerEngine.test.mjs` passing |

### Prompt 32: Remaining Alma jump and lab ticker dedupe

| Item | Status | Where / Notes |
|------|--------|---------------|
| Prevent unload-above from skipping forward | Done | `src/scriptureScroller.js`; anchor compensation is clamped so removing content above can never increase `scrollTop` |
| Add regression for forward scroll clamp | Done | `tests/unit/readerEngine.test.mjs`; verifies top unload never advances the viewport |
| Generalize lab ticker dedupe | Done | `src/scrollerLab.js`; repeated adjacent event+summary rows now collapse to `xN`, including `window_evaluation_deferred` |
| Build verification | Done | `npm run build` passing |
| Focused test verification | Done | `node --test tests/unit/readerEngine.test.mjs` passing |

### Prompt 33: Playwright lab route mismatch

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix Playwright lab navigation | Done | `tests/playwright/scroller-unload.spec.mjs`; uses a relative lab URL so the configured GitHub Pages base path is preserved |
| Keep dev server readiness aligned to deployed base | Done | `playwright.config.mjs`; web server readiness still checks `/scriptures-sticky-scroll-pwa/scroller-lab.html` |
| Focused test verification | Done | `node --test tests/unit/readerEngine.test.mjs` passing |

### Prompt 34: Video repro still skips Alma 36 to 37

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix sticky-heading anchor trap | Done | `src/scriptureScroller.js`; unload preservation now anchors only to real verse nodes, not sticky chapter headings |
| Strengthen browser regression | Done | `tests/playwright/scroller-unload.spec.mjs`; every scroll step must remain in Alma 36 and under verse 31 |
| Add sticky-heading unit regression | Done | `tests/unit/readerEngine.test.mjs`; proves a sticky heading is ignored in favor of the verse anchor |
| Playwright execution | Deferred | Sandbox still cannot launch Chromium; test is ready for local `npm run test:e2e` |
| Build verification | Done | `npm run build` passing |
| Focused test verification | Done | `node --test tests/unit/readerEngine.test.mjs` passing |

### Prompt 35: Playwright catches Alma 37 transition

| Item | Status | Where / Notes |
|------|--------|---------------|
| Refine browser regression assertion | Done | `tests/playwright/scroller-unload.spec.mjs`; entering Alma 37 is allowed only after reaching late Alma 36, so normal chapter completion does not fail |
| Coalesce alternating preload noise | Done | `src/scrollerLab.js`; top/bottom `preload_not_needed` events share one ticker row with combined counts |
| Build verification | Done | `npm run build` passing |
| Focused test verification | Done | `node --test tests/unit/readerEngine.test.mjs` passing |

### Prompt 39: Generated artifact cleanup

| Item | Status | Where / Notes |
|------|--------|---------------|
| Add one-command artifact cleanup | Done | `scripts/clean-artifacts.mjs`, `package.json`; `npm run clean:artifacts` removes Playwright/debug artifacts without one-by-one delete prompts |
| Cleanup coverage | Done | Removes `documentation/debug-frames`, `playwright-report`, and `test-results`; reports `removed` or `skip` for each path |

### Prompt 38/40: Bookmark ribbon auto-scroll lag follow-up

| Item | Status | Where / Notes |
|------|--------|---------------|
| Acknowledge missed prompt | Done | Prompt 38 asked for the auto-scrolling bookmark ribbon lag to be fixed; this was not completed before Prompt 39 cleanup work |
| Reduce first-line coverage | Done | `src/views/readerView.js`; ribbon anchor is moved higher relative to the verse line so it does not ride over the first line during motion |
| Update ribbons during auto-scroll frames | Done | `src/scriptureReaderMount.js`, `src/services/readerService.js`, `src/main.js`; bookmark ribbons rerender from the auto-scroll animation callback instead of waiting for a later scroll event |

## Next Actions

1. Exercise the integrated reader on iPhone Safari and tune remaining touch momentum behavior.
2. Optional: add browser-driven checks for direct URL alignment, bookmark move/create, sticky-follow activation, and cross-book scrolling.
3. Continue scroller/reader iterations in this spec pair.
