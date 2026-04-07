# Module Visibility Story: `domain.routing`

## Mechanism story
`domain.routing` translates between URL hash routes and app state. It restores user state on init/hash change and persists a fallback route in local storage.

## Why this is tricky
- stale URLs can target missing work/book/chapter
- restore path branches (reader/chapters/books/home), so explicit branch logging is required

## Signals to watch
- `route_parse`
- `route_push`
- `route_persist`
- `route_fallback_loaded`
- `route_restore_start`
- `route_restore_resolved`
- `route_restore_fail`

## Healthy sequence
parse -> restore_start -> restore_resolved (single branch)

## Failure cues
- `route_restore_fail` => fallback to home was necessary (stale or invalid route)
