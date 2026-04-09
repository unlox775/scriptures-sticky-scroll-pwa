# Module Visibility Story: `ui.homeView`

## 0) Module type and boundary
- **Type:** UI module
- **Owns:** Home screen rendering, click wiring for work/bookmark/history entry intents, and UI handoff to downstream modules.
- **Does not own:** Route parsing rules, book payload loading strategy, bookmark persistence semantics, or reader-engine buffer mechanics.

## 1) Mechanism story
`ui.homeView` is the launch surface for two parallel intents:

1. Scripture structure drill-down (work -> book -> chapter -> reader)
2. Bookmark-first resume workflow (open existing bookmark or inspect history)

On each render, this module synthesizes two data sets (works list + bookmark cards), maps them to click targets, and routes each click into the next UI module without directly handling reading buffer mechanics.

## 2) Why this is tricky
- It is a mixed intent screen: discovery + resume + history.
- It must remain deterministic after refresh/route restoration.
- It is the first impression surface, so stale bookmark metadata or missing click wiring creates immediate trust loss.

## 3) Scenario walkthrough

### Scenario A: User chooses a work (discovery path)
1. Home renders with works and bookmarks.
2. User taps "Book of Mormon".
3. `ui.homeView` dispatches to books view transition.
4. Downstream routing and books rendering modules take over.

Expected events:
- `home_render_done`
- `home_open_work_click`
- then `books_render_done` (from next module)

### Scenario B: User chooses bookmark resume
1. Home renders bookmark cards with latest references.
2. User taps bookmark "Open".
3. `ui.homeView` dispatches reader open with bookmark location.
4. `ui.readerView` and `ui.readerEngine` perform open, load, jump, and buffer work.

Expected events:
- `home_render_done`
- `home_open_bookmark_click`
- then `reader_open_start` / `reader_open_ready`

### Scenario C: User opens bookmark history
1. User taps "View History" on a bookmark.
2. Home dispatches to history view with selected bookmark id.
3. `ui.historyView` renders one-entry-per-day timeline.

Expected events:
- `home_view_history_click`
- then `history_render_done`

## 4) Signals to watch
- `home_render_done`
  - verify counts (`works`, `bookmarks`) and render elapsed time in dev logs
- `home_open_work_click`
- `home_open_bookmark_click`
- `home_view_history_click`

## 5) Healthy sequence
`home_render_done` appears once per entry, followed by exactly one click event per user action, then handoff events from the target module.

## 6) Failure cues and interpretation
- Missing `home_render_done` after init => app-shell/route restore issue upstream.
- Click occurs in UI but no matching click event => event listener binding regression.
- `home_open_bookmark_click` without downstream reader open events => routing/reader orchestration failure.

## 7) Actionable debug checklist
1. Load app fresh and verify `home_render_done`.
2. Tap a work; verify `home_open_work_click` then `books_render_done`.
3. Return home, tap bookmark open; verify `home_open_bookmark_click` then reader open events.
4. Tap history; verify `home_view_history_click` then `history_render_done`.
