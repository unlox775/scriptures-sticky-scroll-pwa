# Module Visibility Story: `ui.historyView` (Front-end UI module)

## Module type and boundary
- **Type:** Front-end UI module
- **Owns:** Rendering and interaction flow for one-bookmark history inspection.
- **Does not own:** History persistence rules, history compaction logic, bookmark write operations (backend ownership).

## Mechanism story
`ui.historyView` is a read-focused diagnostic/inspection page for a bookmark’s daily snapshots. It takes already-computed history records and turns them into a human timeline that can be audited quickly.

The module must consistently reflect:
- which bookmark history is being viewed,
- how many days are represented,
- and a clear route back to normal navigation.

## Why this is tricky
- It depends on backend compaction semantics (one-per-day); if UI misunderstands this it can mislead user expectations.
- It should be lightweight and deterministic even when history grows.
- It must not mutate history while rendering.

## Step-by-step scenario walkthrough
1. User taps **View History** from Home for bookmark `Daily Reading`.
2. UI module receives the bookmark object and asks backend bookmark module for `getHistoryOnePerDay(bookmark)`.
3. UI renders lines in newest-first order and shows the active bookmark title.
4. User taps back button in history panel; UI transitions back to Home.

## Signals to watch (and where they appear in the story)
- `home_view_history_click` (trigger from Home into History)
- `history_render_done` (history list rendered with row count)
- `history_back_click` (in-panel back interaction)
- `history_back_to_home` (global navigation return to home)

## Healthy sequence example
`home_view_history_click` -> `history_render_done` -> `history_back_click` -> `history_back_to_home`

## Failure cues and interpretation
- Click event with no render event => failed transition or render interruption.
- Render event with zero rows when bookmark has known history => backend history data mismatch.
- Repeated render events without user action => unintended rerender loop.

## Actionable debug checklist
1. From Home, tap **View History** on a bookmark and confirm `home_view_history_click`.
2. Confirm one `history_render_done` with expected row count and bookmark reference.
3. Tap in-panel back and confirm `history_back_click`.
4. Confirm global return event `history_back_to_home`.
