# Module Visibility Story: `backend.routing`

## Backend abstraction role
This backend module owns route-state semantics independent of visual rendering:
- canonical route representation
- parse/serialize rules
- persistence and restore decisions

It should not own DOM mutation. UI modules decide which panels to render; `backend.routing` decides what route state means and whether it is resolvable.

## Module boundary statement
- **Owns:** route parse/serialize contracts, fallback persistence semantics, restore branch decision state.
- **Does not own:** visual panel rendering, DOM transitions, reader buffer control loops, or install shell behavior.

## Mechanism story
1. Parse incoming hash into normalized route descriptor.
2. Attempt to resolve descriptor against known work/book/chapter state.
3. If resolvable, emit resolved state target for UI orchestration.
4. If not resolvable, emit failure and fall back to home descriptor.
5. Persist route snapshots for resume paths.

## Why this is tricky
- stale URLs from old app versions can reference missing entities
- restore is multi-branch and must be explicit (`reader`, `chapters`, `books`, `home`)
- routing must remain deterministic across refresh and PWA launch contexts

## Scenario walkthrough (exhaustive)

### Scenario A: valid reader route
Input hash: `#/r/book-of-mormon/jacob/5/20`

Expected backend sequence:
1. `route_parse` (details include parsed route object)
2. `route_restore_start`
3. `route_restore_resolved` (target = reader, work/book/chapter/verse refs)

### Scenario B: stale route
Input hash references nonexistent book.

Expected backend sequence:
1. `route_parse`
2. `route_restore_start`
3. `route_restore_fail` (include failing parsed details)
4. `route_restore_resolved` (target = home fallback)

### Scenario C: resume from local storage fallback
1. `route_fallback_loaded`
2. normal parse + restore path

## Signals to watch
- `route_parse`
- `route_push`
- `route_persist`
- `route_fallback_loaded`
- `route_restore_start`
- `route_restore_resolved`
- `route_restore_fail`

## Healthy sequence
Exactly one `route_restore_resolved` per `route_restore_start`; failures must still resolve deterministically to home.

## Failure cues
- repeated `route_restore_fail` for same route => parse contract drift or bad saved routes
- missing `route_restore_resolved` after start => orchestration interruption

## Actionable debug checklist
1. Copy a reader hash and reload app.
2. Confirm parse/start/resolved chain.
3. Edit hash to invalid book id and reload.
4. Confirm `route_restore_fail` then home `route_restore_resolved`.
