# Scripture PWA Pivot — Iteration Log

**Prompt slug:** `scripture-pwa-pivot`  
**Last updated:** 2026-04-05

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
| AI-to-human visibility document | Done | `documentation/ai-human-visibility/README.md` + per-module docs |
| Visibility strategy by module | Done | Front-end and domain telemetry points with noise guidance |
| Persisted object visibility strategy | Done | Object-browser approach and JSON drill-down guidance |
| Recommended refactors document | Done | `documentation/recommended-refactors.md` |
| Refactor plan mapped to visibility + flow goals | Done | Ordered refactors with rationale and execution sequence |

### Prompt 3: Reader stalls near Jacob; improve load behavior + diagnostics

| Item | Status | Where / Notes |
|------|--------|---------------|
| Prevent append-then-immediate-trim oscillation in one buffer pass | Done | `src/readerEngine.js` `ensureBuffer()` now tracks newly appended/prepended seqs and skips trimming those in the same pass |
| Add explicit load attempt/success/failure diagnostics | Done | `src/readerEngine.js` `ensureLoaded()` logs `attempt`, `success`, `failure`, and `skip` states with seq/book/chapter context |
| Add retry guard for repeated failing loads | Done | `src/readerEngine.js` uses `failedLoads` cooldown + `inFlightLoads` dedupe to avoid hot-loop retries and duplicate concurrent loads |
| Log boundary conditions and blocked progress with scroll state | Done | `src/readerEngine.js` logs `ensureBuffer:boundary` and `ensureBuffer:blocked` with `scrollTop`, viewport, loaded seq range, and refs |
| Keep open/jump robust when target chapter fails to load | Done | `open()` and `jumpToLocation()` now validate target chapter load and throw explicit errors if the target cannot be loaded |

### Prompt 4: Add AI-Modularization standard document as-is

| Item | Status | Where / Notes |
|------|--------|---------------|
| Add `AI-Modularization-Standard.md` to docs unchanged from prompt content | Done | `documentation/AI-Modularization-Standard.md` |
| Append prompt transcript before edits per collaboration rule | Done | `documentation/spec/20260309-210000_scripture-pwa-pivot-PROMPT.txt` |

### Prompt 5: Narrative-first visibility + story-aligned instrumentation

| Item | Status | Where / Notes |
|------|--------|---------------|
| Upgrade standard to require per-module mechanism narratives (not table-only event inventories) | Done | `documentation/AI-Modularization-Standard.md` now includes mechanism-story requirement, required subsection shape, and infinite-scroller example expectations |
| Rewrite visibility doc with module-by-module mechanism story, tricky dynamics, healthy sequences, and failure cues | Done | `documentation/ai-human-visibility/README.md` + module files |
| Implement structured log envelope helper (`module`, `event`, `summary`, `refs`, `metrics`, `details`) | Done | `src/logger.js` `logEvent()` |
| Align reader engine telemetry to narrative control-loop events | Done | `src/readerEngine.js` emits `reader_buffer_state`, `reader_chapter_load_*`, `reader_buffer_*`, `reader_jump_*`, `reader_capture_anchor_miss`, etc. |
| Align UI/domain telemetry across app shell, routing, bookmarks, data access, and debug drawer | Done | `src/main.js`, `src/data.js`, `src/bookmarks.js`, `src/stateRouting.js` |
| Improve log viewer readability for structured events | Done | `src/main.js` log rendering adds module/event badges when present |
| Add adherence scoring framing in refactor doc | Done | `documentation/recommended-refactors.md` section 0 with Yes/Partial/No evidence matrix |

### Prompt 6: Convert visibility to folder + deep module scenarios

| Item | Status | Where / Notes |
|------|--------|---------------|
| Convert AI-to-human visibility from single file to subfolder with module-level docs | Done | `documentation/ai-human-visibility/` |
| Add visibility folder README with contract and module index | Done | `documentation/ai-human-visibility/README.md` |
| Add in-depth reader-engine scenario walkthrough with concrete chapter/viewport/buffer examples | Done | `documentation/ai-human-visibility/domain-reader-engine.md` |
| Add per-module visibility stories for UI and domain modules | Done | `documentation/ai-human-visibility/*.md` (11 module files + README) |
| Add threshold crossing and chunk geometry events for reader control loop | Done | `src/readerEngine.js` emits `reader_buffer_threshold_crossed`, `reader_chapter_load_success` metrics (`chapterPixelHeight`, `verseCount`), and `reader_chunk_trimmed` (`removedHeight`) |
| Update standard and refactor docs to reference folder-based visibility corpus | Done | `documentation/AI-Modularization-Standard.md`, `documentation/recommended-refactors.md` |

## Next Actions

1. Capture a fresh dev-mode log run that scrolls Jacob 4 -> Jacob 5 -> Enos 1 and verify `scroll:ensureLoaded:success` and `scroll:ensureBuffer:blocked|boundary` events tell a complete story.
2. If any specific chapter still fails to load, use the new `scroll:ensureLoaded:failure` details (`errorMessage`, `attempts`, and `state`) to identify whether the fault is data fetch, chapter lookup, or DOM render.
3. Use `documentation/AI-Modularization-Standard.md` as the top-level architecture standard when updating `flows-and-parts.md`, `documentation/ai-human-visibility/`, and `recommended-refactors.md`.
4. Continue iterating from this pivot; append every new prompt to the pivot PROMPT log before code edits.
