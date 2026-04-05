# Scripture PWA Pivot — Iteration Log

**Prompt slug:** `scripture-pwa-pivot`  
**Last updated:** 2026-03-09

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

## Next Actions

1. Review and refine wording/templates for the three documentation artifacts.
2. If approved, implement selected refactors (module toggles, object browser, log filters, tests).
3. Continue iterating from this pivot; append new prompts to the pivot PROMPT log.
