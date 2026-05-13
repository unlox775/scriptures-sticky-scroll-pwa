# Scripture PWA Pivot — Iteration Log

**Prompt slug:** `scripture-pwa-pivot`  
**Last updated:** 2026-05-13

**Context:** The interface-refinements work (Prompts 1–8 in `20260309-200000_scripture-pwa-interface-refinements-*`) was not making sufficient progress. This spec marks a fresh start from Prompt 9 of that series. Update this spec from here forward.

See `20260309-210000_scripture-pwa-pivot-PROMPT.txt` for the full prompt history.

## Delivery Summary

### Prompt 1: URL/state, layout, reader bubble, scroller, debug mode

| Item | Status | Where / Notes |
|------|--------|---------------|
| Hash-based routing (#/w, #/b, #/r) | Done | `stateRouting.js`, `main.js` |
| localStorage fallback for PWA | Done | `saveRouteToStorage`, `loadRouteFromStorage` |
| Layout padding (content not smashed) | Done | Panel padding |
| Reader full-bleed, no bubble | Done | `reader-scroller` border/radius removed |
| jumpToLocation fix | Done | Double rAF in `readerEngine.js` |
| Auto-scroll bar only when active | Done | `autoScrollPanel[hidden]` |
| Developer mode easter egg | Done | Top-left tap, bug icon, drawer |
| Storage explorer + Logs | Done | `wireDeveloperMode()` |
| Logger + copy JSON | Done | `logger.js`, `getLogsForCopy()` |

### Prompt 2: Flows/parts, AI-human visibility, recommended refactors docs

| Item | Status | Where / Notes |
|------|--------|---------------|
| Flows and parts document | Done | `documentation/flows-and-parts.md` |
| Critical + secondary + tertiary paths | Done | Numbered story-style flow sections with front-end and back-end/domain mapping |
| Parts catalog (front-end + back-end modules) | Done | Includes high-level API contracts and core model objects |
| AI-to-human visibility document | Done | `documentation/ai-human-visibility.md` |
| Visibility strategy by module | Done | Front-end and domain telemetry points with noise guidance |
| Persisted object visibility strategy | Done | Object-browser approach and JSON drill-down guidance |
| Recommended refactors document | Done | `documentation/recommended-refactors.md` |
| Refactor plan mapped to visibility + flow goals | Done | Ordered refactors with rationale and execution sequence |

### Prompt 3: Complete all recommended refactors (R1–R12)

| Item | Status | Where / Notes |
|------|--------|---------------|
| R1 service boundary layer | Done | `src/services/navigationService.js`, `src/services/readerService.js`, `src/services/bookmarkService.js`, `src/services/visibilityService.js` |
| R2 extracted view modules | Done | `src/views/homeView.js`, `src/views/booksView.js`, `src/views/chaptersView.js`, `src/views/readerView.js`, `src/views/historyView.js` |
| R3 canonical event schema | Done | `src/telemetry.js`, normalized log persistence in `src/logger.js` + `src/loggerDB.js` |
| R4 per-module visibility toggles | Done | `src/visibilityConfig.js`, visibility controls surfaced in debug drawer |
| R5 debug drawer Objects tab | Done | `index.html` + `src/main.js` object browser for bookmarks/route/runtime/cache |
| R6 log filtering controls | Done | module/level/search filtering + visible count + copy visible in debug logs panel |
| R7 high-frequency throttling policy | Done | `src/eventSampler.js` and throttled emissions for anchor/buffer/auto-scroll telemetry |
| R8 master critical-path test | Done | `tests/e2e/master-critical-path.test.mjs` |
| R9 domain contract tests | Done | `tests/unit/bookmarks.test.mjs`, `tests/unit/stateRouting.test.mjs`, `tests/unit/bookCache.test.mjs`, `tests/unit/readerEngine.test.mjs` |
| R10 runtime metrics snapshots | Done | `src/runtimeMetrics.js`, surfaced via reader service and Objects panel |
| R11 visibility profile presets | Done | Presets in `src/visibilityConfig.js` + selectable preset UI |
| R12 AI retrieval log channel prep | Done | `getLogsForAiShare()` in `src/logger.js` + "Copy AI-share" action in debug drawer |
| Build/test verification | Done | `npm test` and `npm run build` passing |

### Prompt 12: New infinite scroller debug UI

| Item | Status | Where / Notes |
|------|--------|---------------|
| Isolated scroller lab page | Done | `scroller-lab.html`, built as `docs/scroller-lab.html` |
| Modular infinite scroller | Done | `src/scriptureScroller.js`; jump, prepend, append, unload, cross-book sequence, and telemetry hooks |
| Jacob 2:12 direct URL target | Done | Default route is `#/jacob/2/12`; hash route supports `#/:bookId/:chapter/:verse` |
| 25% verse alignment | Done | `ScriptureScroller.jumpTo()` aligns the requested verse to the 25% viewport guide |
| Split telemetry view | Done | `src/scrollerLab.js` and `src/scrollerLab.css`; metrics, threshold bars, minimap, loaded-window details, event ticker |
| Build verification | Done | `npm run build` passing |

### Prompt 13: Tighten scroller telemetry cockpit

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move jump controls to telemetry side | Done | `scroller-lab.html`; left pane is now reader-only |
| Prevent right-pane page scrolling | Done | `src/scrollerLab.css`; telemetry pane is fixed to viewport with internal ticker scroll |
| Compact telemetry layout | Done | Dense metric/control/minimap/details/event grid replaces roomy card stack |
| Add minimap trigger lines | Done | `src/scrollerLab.js`, `src/scrollerLab.css`; shows viewport, load, and unload thresholds |
| Build verification | Done | `npm run build` passing |

### Prompt 14: Minimap placement and trigger semantics

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move minimap beside top telemetry controls | Done | `scroller-lab.html`, `src/scrollerLab.css`; top dashboard is split into controls/metrics and minimap columns |
| Correct minimap viewport scale | Done | `src/scrollerLab.js`; removed oversized minimum viewport height that overstated the red rectangle |
| Clarify unload trigger visualization | Done | `src/scrollerLab.js`; unload markers now attach to chapter-specific trigger positions instead of moving with viewport |
| Build verification | Done | `npm run build` passing |

### Prompt 15: Next actionable trigger lines and ticker noise

| Item | Status | Where / Notes |
|------|--------|---------------|
| Show only next load/unload minimap triggers | Done | `src/scrollerLab.js`; green load line and red unload line now represent nearest actionable crossing |
| Reduce event ticker height | Done | `src/scrollerLab.css`; ticker uses a smaller fixed bottom region |
| Compress `preload_not_needed` noise | Done | `src/scrollerLab.js`; repeated threshold misses update one rolling counter with top/bottom counts |
| Build verification | Done | `npm run build` passing |

### Prompt 16: Accurate trigger counters and hide anchor noise

| Item | Status | Where / Notes |
|------|--------|---------------|
| Hide anchor-change ticker noise | Done | `src/scrollerLab.js`; anchor changes still update current reference but do not add ticker rows |
| Use engine-owned trigger diagnostics | Done | `src/scriptureScroller.js`; snapshots include load/unload targets, pixel countdowns, and unload gating |
| Show concrete pixel countdowns | Done | `scroller-lab.html`, `src/scrollerLab.js`, `src/scrollerLab.css`; up/down load and unload counters name the affected chapter |
| Prevent false unload lines | Done | Red minimap unload line only appears when loaded count exceeds `maxLoadedChapters`, matching `unloadFarChapters()` |
| Build verification | Done | `npm run build` passing |

### Prompt 17: Unload gate and downward jump bug

| Item | Status | Where / Notes |
|------|--------|---------------|
| Reduce unload chapter floor | Done | `src/scriptureScroller.js`; minimum retained chapters lowered from 9/10 threshold to 5/6 threshold |
| Switch unload distance to viewport pages | Done | `src/scriptureScroller.js`; unload distance is now `2 * viewportHeight` instead of a fixed pixel constant |
| Avoid same-frame down-load/top-unload jump | Done | `src/scriptureScroller.js`; a down append no longer immediately removes an above chapter in the same evaluation frame |
| Disable browser scroll anchoring | Done | `src/scrollerLab.css`; manual scrollTop preservation is the only scroll compensation |
| Update trigger text | Done | `src/scrollerLab.js`; counters describe viewport-page unload rule and smaller chapter floor |
| Build verification | Done | `npm run build` passing |

### Prompt 18: Always show four directional trigger lines

| Item | Status | Where / Notes |
|------|--------|---------------|
| Remove visible unload gate | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`; no more "gated until > N chapters" counters |
| Draw directional trigger lines | Done | `src/scrollerLab.js`; shows load-up, load-down, unload-up, and unload-down lines when matching chapters exist |
| Keep unload from firing during programmatic jump | Done | `src/scriptureScroller.js`; unload waits for real user scroll after jump/initial alignment |
| Build verification | Done | `npm run build` passing |

### Prompt 19: Directional unload and bottom-edge line

| Item | Status | Where / Notes |
|------|--------|---------------|
| Make unload directional | Done | `src/scriptureScroller.js`; scrolling down only unloads above, scrolling up only unloads below |
| Move unload-below marker to viewport bottom crossing | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`; bottom-side unload line now represents the viewport bottom edge |
| Fix boot/load stall | Done | `src/scriptureScroller.js`; frame waits now have timeout fallback and prepend no longer awaits a frame before measuring |
| Build/browser verification | Done | `npm run build` passing; browser refresh reaches ready without boot-time unload spam |

### Prompt 20: First-scroll corruption focus

| Item | Status | Where / Notes |
|------|--------|---------------|
| Identify first-scroll corruption cause | Done | Unload code treated already-far chapters as unloadable on any tiny scroll, instead of requiring threshold crossing |
| Require actual unload threshold crossing | Done | `src/scriptureScroller.js`; unload only fires when previous/current viewport edge crosses the relevant red line |
| Preserve focused scope | Done | No broader UI/heuristic changes beyond the corruption fix |
| Build/browser verification | Done | `npm run build` passing; browser refresh/scroll events no longer unload preloaded chapters immediately |

### Prompt 21: Edge-only unload model

| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix crossed unload labels | Done | `src/scriptureScroller.js`; diagnostics now target only first loaded chapter for unload-above and last loaded chapter for unload-below |
| Match engine to diagnostics | Done | `src/scriptureScroller.js`; unload engine only considers the outer loaded edge for the current scroll direction |
| Replace fixed chapter startup | Done | `src/scriptureScroller.js`; jump startup loads by pixel buffer and guarantees adjacent edge chapters instead of a fixed two-chapter radius |
| Fix stale first-scroll baseline | Done | `src/scriptureScroller.js`; `lastScrollTop` is reset after programmatic jump/buffer alignment |
| Build/browser verification | Done | Browser preview shows no false Jacob 2 unload labels at Jacob 2:12; `npm run build` passing |

### Prompt 22: Remove leftover adjacency/loading rules

| Item | Status | Where / Notes |
|------|--------|---------------|
| Remove reflexive adjacent chapter loading | Done | `src/scriptureScroller.js`; jump startup no longer forces one chapter above and below |
| Convert preload threshold to viewport-based distance | Done | `src/scriptureScroller.js`; preload distance is now `preloadViewportPages * viewportHeight` instead of fixed `900px` |
| Align minimap load lines to engine threshold | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; green lines use the same viewport-based threshold as actual load decisions |
| Browser verification | Done | Cache-busted preview at Jacob 2:12 settles with only Jacob 2 loaded; Jacob 1/Jacob 3 no longer load unless threshold distance requires them |

### Prompt 23: Align unload lines with viewport collision edge

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move unload-above visual line | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; unload-above now draws at the viewport-bottom collision point instead of raw `scrollTop` |
| Preserve engine behavior | Done | Display-only correction; actual unload crossing logic remains unchanged |
| Build/browser verification | Done | `npm run build` passing; cache-busted preview boots cleanly at Jacob 2:12 |

### Prompt 24: Move unload-below line up one viewport

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move unload-below visual line | Done | `src/scrollerLab.js`; unload-below now draws at `targetScrollTop` so the red viewport rectangle does not pass over it |
| Preserve engine behavior | Done | Display-only correction; actual unload crossing logic remains unchanged |
| Build verification | Done | `npm run build` passing |

### Prompt 25: Add load/unload hysteresis

| Item | Status | Where / Notes |
|------|--------|---------------|
| Separate load and unload thresholds | Done | `src/scriptureScroller.js`; load now triggers at `1.75` viewports, unload at `2.25` viewports |
| Prevent immediate re-crossing after DOM removal | Done | `src/scriptureScroller.js`; `lastScrollTop` is reset after scrollTop compensation during unload |
| Surface buffer gap in telemetry | Done | `src/scrollerLab.js`; threshold details now show the explicit load/unload gap |
| Build/browser verification | Done | Cache-busted preview boots cleanly at Jacob 2:12; `npm run build` passing |

### Prompt 26: Diagnose unload/reload loop near Jacob 2

| Item | Status | Where / Notes |
|------|--------|---------------|
| Identify loop cause | Done | Top unload adjusted from potentially clamped `scrollTop` after DOM removal, which could jump back into the load-up zone |
| Fix scroll compensation invariant | Done | `src/scriptureScroller.js`; capture pre-removal scroll position and subtract actual removed layout space |
| Add unload debug metrics | Done | `chapter_unloaded` telemetry now includes before/after scroll, removed layout space, and exact adjustment |
| Build verification | Done | `npm run build` passing |

### Prompt 27: Implement unload catch-up

| Item | Status | Where / Notes |
|------|--------|---------------|
| Allow overdue unload cleanup | Done | `src/scriptureScroller.js`; unload now fires if the viewport is already past the edge threshold, not only on the exact crossing frame |
| Keep cleanup edge-only | Done | `src/scriptureScroller.js`; fast downward scroll cleans one top chapter per evaluation, fast upward scroll cleans one bottom chapter |
| Clarify passed threshold state | Done | `src/scriptureScroller.js` and `src/scrollerLab.js`; counters now show `passed` instead of reporting no chapter when an unload threshold is behind the viewport |
| Avoid misleading minimap lines | Done | `src/scrollerLab.js`; passed unload thresholds do not draw stale red lines |
| Build verification | Done | `npm run build` passing |

### Prompt 28: Chapter links and auto-scroll controls

| Item | Status | Where / Notes |
|------|--------|---------------|
| Add Gospel Library links | Done | `src/scriptureScroller.js`; each sticky chapter heading includes an external-link arrow using chapter `externalUrl` |
| Add auto-scroll controls | Done | `src/scriptureScroller.js`, `src/scrollerLab.js`, `src/scrollerLab.css`; chapter headers expose an Auto scroll button that opens a speed slider, Start, and Stop bar |
| Preserve scroller behavior | Done | Auto-scroll updates the existing scroll container with `requestAnimationFrame`, so normal load/unload telemetry still drives the window |
| Browser verification | Done | Cache-busted lab page renders the header link/button; Auto scroll panel opens, starts, and stops |
| Build verification | Done | `npm run build` passing |

### Prompt 29: Move auto-scroll to lab header

| Item | Status | Where / Notes |
|------|--------|---------------|
| Move auto-scroll button | Done | `scroller-lab.html`, `src/scrollerLab.js`, `src/scrollerLab.css`; Auto scroll now lives in the main lab header |
| Keep chapter header focused | Done | `src/scriptureScroller.js`; chapter headers now show book, chapter title, and Gospel Library arrow only |
| Simplify auto-scroll panel | Done | `src/scrollerLab.js`; clicking Auto scroll starts immediately, shows speed slider and Stop only, and Stop closes the panel |
| Browser verification | Done | Cache-busted lab page starts/stops auto-scroll from the main header |
| Build verification | Done | `npm run build` passing |

### Prompt 30: Prepare scroller for production transplant

| Item | Status | Where / Notes |
|------|--------|---------------|
| Extract reusable reader styles | Done | `src/scriptureReader.css`; left-reader visuals now live outside the telemetry stylesheet |
| Split auto-scroll controller | Done | `src/autoScrollController.js`; auto-scroll can be mounted with or without the lab telemetry UI |
| Add reader mount adapter | Done | `src/scriptureReaderMount.js`; wraps `ScriptureScroller`, optional auto-scroll, `init`, `jumpTo`, `getSnapshot`, and `destroy` |
| Add production reader entrypoint | Done | `src/scriptureReader.js`; old app can import the reader module without importing the lab harness |
| Keep lab as telemetry harness | Done | `src/scrollerLab.js`; lab now imports the reusable reader entrypoint and owns only controls/telemetry rendering |
| Build verification | Done | `npm run build` passing |

## Next Actions

1. Mount `createScriptureReader()` inside the traditional app reader pane and wire existing navigation state to `jumpTo()`.
2. Exercise the scroller lab on iPhone Safari and tune preload/unload distances for touch momentum scrolling.
3. Optional: add browser-driven checks for direct URL alignment and cross-book boundary scrolling.
4. Continue iterating from this pivot; append new prompts to the pivot PROMPT log.
