# Module Visibility Story: `domain.bookmarks`

## Mechanism story
`domain.bookmarks` tracks named bookmark pointers and one-per-day history snapshots. During reading it chooses a follow candidate and updates location only when pace heuristics permit.

## Why this is tricky
- must avoid over-updating when user scrolls fast
- must preserve daily history semantics while still moving current location

## Signals to watch
- `bookmark_store_init`
- `bookmark_create`
- `bookmark_follow_candidate`
- `bookmark_follow_skipped`
- `bookmark_auto_follow_update`
- `bookmark_location_updated`
- `bookmark_history_snapshot`

## Healthy sequence
candidate -> (skip OR auto_follow_update) -> location_updated -> history_snapshot

## Failure cues
- no `bookmark_auto_follow_update` during sustained slow reading => threshold/anchor cadence issue
- location updates without history snapshots => persistence bug
