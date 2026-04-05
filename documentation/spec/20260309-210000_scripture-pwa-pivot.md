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
| AI-to-human visibility document | Done | `documentation/ai-human-visibility.md` |
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

## Next Actions

1. Capture a fresh dev-mode log run that scrolls Jacob 4 -> Jacob 5 -> Enos 1 and verify `scroll:ensureLoaded:success` and `scroll:ensureBuffer:blocked|boundary` events tell a complete story.
2. If any specific chapter still fails to load, use the new `scroll:ensureLoaded:failure` details (`errorMessage`, `attempts`, and `state`) to identify whether the fault is data fetch, chapter lookup, or DOM render.
3. Use `documentation/AI-Modularization-Standard.md` as the top-level architecture standard when updating `flows-and-parts.md`, `ai-human-visibility.md`, and `recommended-refactors.md`.
4. Continue iterating from this pivot; append every new prompt to the pivot PROMPT log before code edits.
