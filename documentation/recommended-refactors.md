# Recommended Refactors — To Realize Flows + Visibility Framework

This document translates the goals from:
- `documentation/flows-and-parts.md`
- `documentation/ai-human-visibility.md`

into concrete refactors for this repository. It is intentionally implementation-focused and ordered for iterative delivery.

## 1) High-value structural refactors

### R1. Introduce explicit module boundary layer (service contracts)
- **Current state:** `main.js` directly orchestrates most domain calls and view rendering.
- **Refactor:** Create service adapters (for example under `src/services/`) for:
  - `navigationService`
  - `readerService`
  - `bookmarkService`
  - `visibilityService`
- **Goal:** Front-end components and view orchestration call stable service contracts instead of reaching into domain internals ad hoc.
- **Why this matters:** Makes contracts explicit, easier to test, and aligns with your “module interfaces must not be violated” requirement.

### R2. Separate view rendering from domain orchestration
- **Current state:** `main.js` intermixes HTML construction, event wiring, and domain behavior.
- **Refactor:** Extract view modules:
  - `views/homeView.js`
  - `views/booksView.js`
  - `views/chaptersView.js`
  - `views/readerView.js`
  - `views/historyView.js`
- **Goal:** Keep each view focused on rendering + local event mapping; route domain actions through services.
- **Why this matters:** Improves maintainability and clarifies front-end component ownership in critical-path docs.

### R3. Define canonical domain event schema
- **Current state:** Logging messages are useful but inconsistent in event identity/shape.
- **Refactor:** Introduce a shared telemetry envelope utility:
  - `module`, `event`, `summary`, `metrics`, `refs`, `details`.
- **Goal:** Every emitted diagnostic event is machine-filterable and human-readable.
- **Why this matters:** Enables reliable AI log interpretation and better human debugging.

## 2) Visibility framework refactors

### R4. Add per-module instrumentation toggles
- **Current state:** Dev mode exists as a global switch.
- **Refactor:** Add a persisted visibility config (for example `scripture-pwa-visibility-v1`) and helper APIs:
  - `isVisibilityEnabled(moduleId)`
  - `getVisibilityVerbosity(moduleId)`
  - `setModuleVisibility(moduleId, enabled)`
- **Goal:** Turn instrumentation on/off by module and tune detail level.
- **Why this matters:** Controls noise/performance and supports targeted debugging tours.

### R5. Extend debug drawer with “Objects” tab
- **Current state:** Debug drawer includes Storage and Logs only.
- **Refactor:** Add object-browser panel exposing:
  - bookmarks + history snapshots
  - current route/parsed route/fallback route
  - reader runtime state snapshot
  - book cache snapshot
- **Goal:** Allow humans to inspect key persisted/runtime objects directly.
- **Why this matters:** “Show me what is flowing through the system” becomes concrete, not inferred.

### R6. Add log filtering controls in viewer
- **Current state:** Session navigation exists; filtering is limited.
- **Refactor:** Add:
  - module filter chips/checklist
  - level filters
  - text search
  - “copy visible subset” action
- **Goal:** Let humans reduce noise after capture without losing source data.
- **Why this matters:** Practical usability for large sessions and AI context limits.

### R7. Add explicit high-frequency throttling policy
- **Current state:** Some debug logs can be high volume during reading.
- **Refactor:** Build a reusable throttle/sampler utility for frequent events (`anchor`, buffer diagnostics, auto-scroll ticks).
- **Goal:** Preserve signal while avoiding log floods and performance drag.
- **Why this matters:** Visibility must not destabilize the user experience.

## 3) Critical-path reliability refactors

### R8. Add end-to-end “master critical path” test
- **Current state:** Flow is implemented but no single automated assertion of the primary value path is documented as code.
- **Refactor:** Add e2e test (Playwright or equivalent) for:
  1. open app
  2. open bookmark
  3. verify reader reference/anchor updates while scrolling
  4. verify bookmark update behavior under slow scroll
  5. reload and confirm restoration
- **Goal:** Guarantee the app’s core promise survives future changes.
- **Why this matters:** This is the single highest-value regression guard.

### R9. Add contract tests for domain modules
- **Current state:** Domain behaviors are coupled in runtime orchestration.
- **Refactor:** Add targeted tests for:
  - `BookmarkStore.getBookmarkToFollow` (ordering + edge cases)
  - `stateRouting.parseRoute/stateToRoute` round-trip
  - `BookCache` eviction order
  - reader buffer invariants (where feasible)
- **Goal:** Protect module-level interfaces and semantics.
- **Why this matters:** Keeps module contracts stable as the app evolves.

## 4) Optional but high-leverage refactors

### R10. Introduce lightweight runtime metrics snapshots
- **Refactor:** Periodically publish compact counters/timers:
  - average anchor update interval
  - cache hit rate
  - chapter load duration percentiles (rough buckets)
- **Goal:** Improve diagnosis of performance regressions over long sessions.

### R11. Add visibility profile presets
- **Refactor:** Provide one-tap presets:
  - `Reader performance`
  - `Bookmark correctness`
  - `Navigation restore`
- **Goal:** Quickly enable the right module toggles for common debug jobs.

### R12. Prepare AI retrieval channel for logs (future-facing)
- **Refactor:** Define an optional export endpoint or signed-share workflow for log sessions.
- **Goal:** Allow AI tools to fetch logs directly when security model permits.
- **Why this matters:** Reduces manual copy/paste burden while preserving user control.

## 5) Suggested execution order

1. **R3 + R4** (schema + module toggles)
2. **R6 + R7** (filtering + throttling)
3. **R5** (object browser)
4. **R8 + R9** (critical-path + contract tests)
5. **R1 + R2** (structural modularization)
6. **R10–R12** (advanced enhancements)

This order improves observability discipline early, then locks reliability, then performs deeper structural decomposition.

## 6) Definition of done for this refactor program

- Module boundaries are explicit and contract-driven.
- Critical and secondary flows are test-backed.
- Visibility can be enabled by module without UI behavior changes.
- Humans can inspect key objects and filtered logs in-app.
- AI-consumable log exports are structured and bounded.

## 7) Completion status (implemented)

All refactors R1–R12 in this document are now implemented in this repository.

### Completed items by refactor id

| Refactor | Status | Implementation notes |
| --- | --- | --- |
| **R1** | ✅ Done | Added service contract layer in `src/services/` (`navigationService`, `readerService`, `bookmarkService`, `visibilityService`), and `main.js` now orchestrates through these boundaries. |
| **R2** | ✅ Done | Extracted view modules in `src/views/` (`homeView`, `booksView`, `chaptersView`, `readerView`, `historyView`) and moved rendering/event mapping out of monolithic inline templates. |
| **R3** | ✅ Done | Added canonical telemetry envelope via `src/telemetry.js` and normalized persistence in `src/logger.js` + `src/loggerDB.js` with `module/event/summary/metrics/refs/details`. |
| **R4** | ✅ Done | Added persisted per-module visibility controls (`scripture-pwa-visibility-v1`) in `src/visibilityConfig.js` with required helpers, surfaced through `visibilityService`. |
| **R5** | ✅ Done | Extended debug drawer with **Objects** tab in `index.html` + `src/main.js` object browser (bookmarks/history, route snapshot, reader runtime snapshot, cache snapshot). |
| **R6** | ✅ Done | Added in-view log filtering (module chips, level filters, text search) and **Copy visible** action in debug drawer logs UI. |
| **R7** | ✅ Done | Added explicit throttle/sampler utility in `src/eventSampler.js`; high-frequency telemetry points use throttling (anchor changes, buffer diagnostics, auto-scroll ticks). |
| **R8** | ✅ Done | Added master critical-path regression test at `tests/e2e/master-critical-path.test.mjs` and wired `npm test`. |
| **R9** | ✅ Done | Added contract tests for bookmarks, route round-trip, book cache LRU, and reader invariants in `tests/unit/*.test.mjs`. |
| **R10** | ✅ Done | Added runtime metrics snapshots in `src/runtimeMetrics.js` and surfaced metrics in reader/object diagnostics. |
| **R11** | ✅ Done | Added one-tap visibility presets (`Reader performance`, `Bookmark correctness`, `Navigation restore`) in visibility config + debug UI. |
| **R12** | ✅ Done | Added future-facing AI retrieval export contract (`getLogsForAiShare`) and debug drawer action (`Copy AI-share`). |
