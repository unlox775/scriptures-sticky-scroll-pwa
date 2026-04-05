# AI-to-Human Visibility Layer — Scripture Reader PWA

This document is the operational "factory tour" for runtime behavior. It is intentionally narrative-first: each major module explains what it is doing over time, why that is tricky, and how to verify health using concrete events.

## 1) Operating goals

- Give humans and AI assistants a **shared mental model** of mechanism, not only event names.
- Keep logs **structured and filterable** (`module`, `event`, `summary`, `refs`, `metrics`, `details`).
- Preserve normal UX by keeping high-volume diagnostics **dev-mode gated**.
- Make every major path diagnosable from exported logs without emergency instrumentation edits.

## 2) Event envelope contract (implemented)

All new instrumentation follows this shape:

```json
{
  "level": "debug",
  "message": "Reader buffer state evaluated",
  "details": {
    "module": "domain.readerEngine",
    "event": "reader_buffer_state",
    "summary": "Reader buffer state evaluated",
    "refs": { "bookId": "jacob", "chapter": 5 },
    "metrics": { "topBuffer": 4121, "bottomBuffer": -37 },
    "details": { "minLoadedSeq": 57, "maxLoadedSeq": 58 }
  }
}
```

The debug log viewer now renders `module` and `event` badges when present.

## 3) Visibility controls posture

Current:
- Global dev mode (`scripture-pwa-dev-mode-v1`)
- Sessioned logs + copy export
- Structured events for major UI/domain behaviors

Still pending:
- Per-module on/off toggles (beyond dev-mode gate)
- In-view module/level filter controls
- Objects tab for direct runtime object browsing

---

## 4) Module narratives and evidence maps

### 4.1 `domain.readerEngine` (infinite scroller core)

**Mechanism story**  
The reader keeps a moving chapter buffer around the viewport. It continuously measures top and bottom off-screen context and extends or trims content to keep a target range (minimum ~3 screens, maximum ~6 screens) while preserving the user’s visual anchor.

**Why this is tricky**  
- Content height is dynamic (text wrapping, device width, font metrics), so chapter pixel size is unknown until rendered.
- Prepending above the viewport changes document flow; scrollTop must be compensated to avoid apparent jumps.
- Appending and trimming in one pass can oscillate if not guarded.
- Sequence crosses book boundaries inside a work (for example Jacob -> Enos) and must remain seamless.

**Signals to watch**
- `reader_buffer_state` — current thresholds and loaded seq range.
- `reader_chapter_load_attempt|success|failure|skip` — chapter load lifecycle.
- `reader_buffer_blocked` — threshold asked to extend but no seq progress occurred.
- `reader_buffer_trim_skipped` — anti-oscillation guard fired.
- `reader_buffer_boundary` — hit start/end of work while evaluating thresholds.
- `reader_jump_attempt|reader_jump_done` — alignment step around open/jump operations.

**Healthy sequence (example)**  
`reader_open_start` -> `reader_chapter_load_attempt/success` (target + adjacent) -> `reader_jump_done` -> repeated `reader_buffer_state` with occasional `reader_chapter_load_success` near edges, no sustained `reader_buffer_blocked`.

**Failure cues and likely causes**
- Many repeated `reader_chapter_load_attempt` for same seq with `failure` => data fetch/lookup/render problem.
- Repeated `reader_buffer_blocked` same direction/seq => no-progress loop or guard/cooldown preventing advance.
- Frequent `reader_buffer_boundary` at end-of-work is normal only at terminal chapter of the work.

### 4.2 `ui.readerView` (reader interaction shell)

**Mechanism story**  
This module coordinates reader entry/exit and controls that influence engine behavior: open location, auto-scroll start/stop/speed, chapter-change display updates, and header navigation.

**Why this is tricky**  
- UI controls and engine loop are asynchronous.
- Anchor changes can be high-frequency; status updates must be informative without flooding logs.

**Signals to watch**
- `reader_open_start|reader_open_ready`
- `reader_chapter_change`
- `reader_autoscroll_start|stop|speed_change`
- `reader_back_to_chapters|reader_home_click`

**Healthy sequence**  
`reader_open_start` -> `reader_open_ready` -> optional auto-scroll control events -> back/home navigation events.

**Failure cues**
- `reader_open_start` without `reader_open_ready` suggests engine open failure; correlate with `domain.readerEngine` errors.

### 4.3 `domain.bookmarks`

**Mechanism story**  
Bookmarks persist user reading state and maintain one-per-day history snapshots. During reading, the module selects an eligible bookmark to follow and updates it based on reading pace heuristics.

**Why this is tricky**  
- Auto-follow should update during slow reading but avoid thrashing during fast scroll.
- Daily snapshot replacement must preserve “one line per day” semantics.

**Signals to watch**
- `bookmark_store_init`
- `bookmark_create`
- `bookmark_follow_candidate`
- `bookmark_follow_skipped`
- `bookmark_auto_follow_update`
- `bookmark_location_updated`
- `bookmark_history_snapshot`

**Healthy sequence**
`bookmark_follow_candidate` -> (either) `bookmark_follow_skipped` or `bookmark_auto_follow_update` -> `bookmark_location_updated` -> `bookmark_history_snapshot`.

**Failure cues**
- Candidate exists but no updates over long slow-reading windows => check follow thresholds and anchor cadence.

### 4.4 `domain.dataAccess`

**Mechanism story**  
Loads index metadata and book payloads with cache-first behavior and gzip-first transport. On unsupported/failed gzip path, falls back to JSON.

**Why this is tricky**  
- Capability and network differences cause path branching (gzip vs fallback).
- Cache size limits can hide repeated misses if eviction is too aggressive.

**Signals to watch**
- `index_load_start|done|fail`
- `book_cache_hit|book_cache_miss|book_cache_store`
- `book_load_gzip_ok|book_load_json_fallback|book_load_fail`

**Healthy sequence**
First visit: `book_cache_miss` -> `book_load_gzip_ok` (or fallback) -> `book_cache_store`; subsequent nearby chapter loads trend toward `book_cache_hit`.

**Failure cues**
- Persistent misses on same book in short interval => cache churn/size issue.
- Frequent fallback on capable clients => gzip/decompression path instability.

### 4.5 `domain.routing`

**Mechanism story**  
Parses hash routes, restores app state to matching view, and persists fallback route in local storage so resume is stable in PWA contexts.

**Why this is tricky**  
- Hash can point to stale/missing entities.
- Restore path is multi-branch (reader/chapters/books/home) and can silently degrade to home without clear signals if uninstrumented.

**Signals to watch**
- `route_parse`
- `route_push`
- `route_persist`
- `route_fallback_loaded`
- `route_restore_start|route_restore_resolved|route_restore_fail`

**Healthy sequence**
`route_parse` -> `route_restore_start` -> one `route_restore_resolved` matching intended view.

**Failure cues**
- `route_restore_fail` indicates stale/invalid route or missing entities; app intentionally falls back to home.

### 4.6 `ui.homeView`

**Mechanism story**  
Renders works + bookmark cards and dispatches user intent into drill-down or direct open flows.

**Signals to watch**
- `home_render_done`
- `home_open_work_click`
- `home_open_bookmark_click`
- `home_view_history_click`

### 4.7 `ui.booksView`

**Mechanism story**  
Renders books for selected work and routes book selection to chapter grid.

**Signals to watch**
- `books_render_done`
- `books_open_book_click`
- `books_back_to_home`

### 4.8 `ui.chaptersView`

**Mechanism story**  
Renders chapter tile grid and launches reader at selected chapter.

**Signals to watch**
- `chapters_render_done`
- `chapters_open_chapter_click`
- `chapters_back_to_books`

### 4.9 `ui.historyView`

**Mechanism story**  
Displays one-per-day bookmark history snapshots for audit and recovery.

**Signals to watch**
- `history_render_done`
- `history_back_click`
- `history_back_to_home`

### 4.10 `ui.devDrawer`

**Mechanism story**  
Provides debug surface for logs and storage evidence capture.

**Signals to watch**
- `dev_mode_enabled`
- `debug_drawer_open|debug_drawer_close`
- `debug_tab_change`
- `debug_session_select`
- `debug_copy_logs|debug_copy_logs_failed`

### 4.11 `ui.appShell`

**Mechanism story**  
Bootstraps the app, install prompt behavior, and service worker registration.

**Signals to watch**
- `app_init_start|app_init_complete|app_init_fail`
- `install_prompt_available|install_prompt_accepted|install_ios_instructions_shown`
- `service_worker_registered`

---

## 5) Persisted object visibility strategy (still target)

Humans should inspect key objects directly (not only infer from logs):
- Bookmarks + history
- Route snapshot (hash + parsed + fallback)
- Reader runtime snapshot (anchor + loaded seq range + auto-scroll state)
- Cache snapshot

Recommended future UX: add **Objects** tab in debug drawer with summary rows and expandable raw JSON.

---

## 6) Flow-level verification checklists

### Critical flow: resume and continue reading
Expected evidence chain:
1. `route_fallback_loaded` (if used) + `route_restore_start`
2. `reader_open_start` / `reader_open_ready`
3. `reader_buffer_state` cadence during scroll
4. `bookmark_auto_follow_update` during slow reading

### Secondary flow: drill down to reader
Expected evidence chain:
1. `home_open_work_click`
2. `books_open_book_click`
3. `chapters_open_chapter_click`
4. `reader_open_ready`

### Tertiary flow: diagnostics export
Expected evidence chain:
1. `debug_drawer_open`
2. `debug_session_select`
3. `debug_copy_logs`

---

## 7) Performance and safety rules

- Keep high-frequency diagnostics in dev mode only.
- Prefer concise refs/metrics; avoid full chapter payload logs.
- Instrumentation failure must never block core reading/navigation flows.

This document is intentionally mechanism-first so logs can be interpreted as evidence, not just as raw event inventory.
