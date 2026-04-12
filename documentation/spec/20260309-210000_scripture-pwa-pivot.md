# Scripture PWA Pivot — Iteration Log

**Prompt slug:** `scripture-pwa-pivot`  
**Last updated:** 2026-04-12

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

### Prompt 12: AI Modulization Standard alignment + stateful debug resume

| Item | Status | Where / Notes |
|------|--------|---------------|
| Compute full to-do list for standard/code alignment | Done | Added adherence-gap checklist + closure notes in `documentation/recommended-refactors.md` |
| Enforce required module namespace taxonomy (`ui.*` / `backend.*`) | Done | Telemetry module IDs updated in `src/main.js`, `src/readerEngine.js`, `src/services/*`, `src/logger.js`, `src/visibilityConfig.js` |
| Keep compatibility for older `domain.*` visibility config keys | Done | Legacy mapping in `src/visibilityConfig.js` migrates prior module toggles into the new IDs |
| Align reader engine as explicit UI module in runtime instrumentation | Done | Reader emitters now use `ui.readerEngine`; visibility presets and toggles updated |
| Add stateful “last screen” resume on refresh | Done | Added persisted UI session envelope in `src/main.js` (`scripture-pwa-ui-session-v1`) and restore logic in `init()` |
| Add stateful debug drawer persistence (open/closed + active panel tab) | Done | Debug drawer state orchestration + persistence/restore in `src/main.js` (`applyDebugDrawerState`, `setActiveDebugTab`) |
| Persist/restore history view specifically | Done | Added hash route form `#/history/:bookmarkId` in `src/stateRouting.js`, history restore branch in `src/main.js`, and unit coverage |
| Update docs to reflect AI standard alignment and evidence | Done | Updated `documentation/flows-and-parts.md`, `documentation/ai-human-visibility/README.md`, added `documentation/ai-human-visibility/backend-logging.md`, updated `documentation/recommended-refactors.md` |
| Add/extend tests for new state-routing behavior | Done | Added `parseRoute` history-route test in `tests/unit/stateRouting.test.mjs` |

## Next Actions

1. Optional: replace the node-level critical-path integration test with browser-driven Playwright coverage if full UI e2e is required.
2. Optional: configure a secure remote retrieval endpoint/workflow to move `getLogsForAiShare` from manual-copy contract to direct fetch.
3. Continue iterating from this pivot; append new prompts to the pivot PROMPT log.
