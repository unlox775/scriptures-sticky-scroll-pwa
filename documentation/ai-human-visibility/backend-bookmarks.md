# Module Visibility Story: `backend.bookmarks`

## Module type and boundary
- **Type:** Backend module
- **Owns:** bookmark state transitions, active bookmark semantics, follow-candidate selection, and daily history snapshot persistence.
- **Does not own:** viewport geometry, scroll thresholds, DOM rendering, or UI composition.

## Mechanism story
`backend.bookmarks` is the bookmark state machine and persistence layer. It owns:

- bookmark creation and active bookmark selection
- bookmark location updates and source attribution (`manual`, `scroll`, `auto-scroll`)
- one-entry-per-day history snapshots
- follow-candidate selection for auto-follow

It does not own viewport probing, pixel thresholds, or scroll rendering.

## Why this is tricky
- follow-candidate selection depends on location ordering, not simple ID matching
- update frequency must be bounded by front-end pacing policies
- daily history replacement must preserve one-per-day semantics

## End-to-end scenario walkthrough

### Scenario A: Manual bookmark move in reader
1. UI chooses bookmark and location, then calls backend update.
2. Backend writes location, updates `updatedAt`, updates/replaces daily history item.
3. UI reflects updated status.

Expected event chain:
`bookmark_location_updated` -> `bookmark_history_snapshot`

### Scenario B: Auto-follow update during slow reading
1. UI asks backend for follow candidate at current anchor.
2. Backend returns nearest eligible bookmark at-or-before location.
3. UI heuristics allow update; backend persists movement.

Expected event chain:
`bookmark_follow_candidate` -> `bookmark_auto_follow_update` -> `bookmark_location_updated` -> `bookmark_history_snapshot`

Cadence guidance:
- `bookmark_follow_candidate` and `bookmark_follow_skipped` are intentionally debounced/sampled in the UI orchestrator (standard ~2s throttle with sampling) so logs stay readable while continuously scrolling.
- Treat these as periodic state hints, not frame-level traces.

## Signals to watch
- `bookmark_store_init`
- `bookmark_create`
- `bookmark_active_set`
- `bookmark_follow_candidate`
- `bookmark_follow_skipped`
- `bookmark_auto_follow_update`
- `bookmark_location_updated`
- `bookmark_history_snapshot`

## Healthy sequence examples
- Create flow: `bookmark_create` then first `bookmark_location_updated`.
- Follow flow: candidate appears repeatedly while scrolling; updates only when UI thresholds allow.
- In healthy deep runs, follow candidate/skip telemetry should remain low-frequency (single-digit events per 10 seconds), not a frame-by-frame stream.

## Failure cues and interpretation
- repeated candidates but never updates during slow reading => likely UI heuristic too strict
- updates without history snapshots => history persistence regression
- unexpected source tags on updates => orchestration mismatch

## Actionable debug checklist
1. Create bookmark in reader and verify `bookmark_create`.
2. Move bookmark manually and verify `bookmark_location_updated` + `bookmark_history_snapshot`.
3. Scroll slowly and verify candidate/update cadence.
4. Confirm sources are expected (`manual` vs `scroll` vs `auto-scroll`).
