# AI-to-Human Visibility Layer — Scripture Reader PWA

This document defines a practical observability and inspection strategy so a human (and AI assistant) can "tour the factory floor" of this app: see what is happening, where it is happening, and why.

## 1) Objectives and guardrails

- Provide **debug visibility without changing normal user experience**.
- Make instrumentation **module-addressable** (toggle by component/module).
- Keep logs **compact enough to copy into AI chat** while retaining useful detail.
- Preserve performance by default: visibility is **off unless enabled**.
- Enable both:
  - **Human-driven debugging** (UI controls + copy export)
  - **Future AI-driven retrieval** (structured, filterable telemetry)

## 2) Current baseline in this repository

Already present:
- Global developer mode flag in localStorage (`scripture-pwa-dev-mode-v1`).
- Debug drawer with **Storage** and **Logs** panels.
- Persisted log sessions/entries in IndexedDB (`scripture-pwa-logs`).
- Log copy export flow (`Copy logs`) with session selection.
- Route/nav + reader-anchor instrumentation points already emitted.

Current gaps versus target framework:
- No per-module enable/disable matrix (only broad dev-mode behavior).
- No object-browser panels for core domain objects (bookmark/reader/cache views).
- No log filtering by module/component inside the viewer.
- Log schema is message-first, not consistently tagged with module/event contracts.

---

## 3) Visibility control model (target)

### 3.1 Control layers

1. **Layer A — Global visibility mode**
   - Existing developer mode switch remains the top-level gate.
2. **Layer B — Module toggles**
   - Independent toggles for each major front-end component and domain module.
3. **Layer C — Verbosity level**
   - `minimal` (default in dev mode), `standard`, `deep` for selected modules.

### 3.2 Suggested persisted toggle shape

```json
{
  "enabled": true,
  "verbosity": "standard",
  "modules": {
    "ui.homeView": false,
    "ui.booksView": false,
    "ui.chaptersView": false,
    "ui.readerView": true,
    "ui.historyView": false,
    "ui.devDrawer": true,
    "domain.routing": true,
    "domain.dataAccess": false,
    "domain.readerEngine": true,
    "domain.bookmarks": true,
    "domain.logging": true
  }
}
```

Storage recommendation: `localStorage["scripture-pwa-visibility-v1"]`.

---

## 4) Factory tour map: what to log by module

Each section below defines practical event points and expected event frequency to control noise.

### 4.1 Front-end component telemetry

| Module ID | Component | Events to capture | Typical frequency per screen entry | Notes/noise strategy |
| --- | --- | --- | --- | --- |
| `ui.homeView` | Home | `home_render_start`, `home_render_done`, `home_open_work_click`, `home_open_bookmark_click`, `home_view_history_click` | Render events: 1 each; clicks: user-driven | Avoid logging every DOM node built. Keep to user-intent actions and total render ms. |
| `ui.booksView` | Books | `books_render_start`, `books_render_done`, `books_open_book_click` | Render events: 1 each; click: user-driven | Include work id and number of books rendered. |
| `ui.chaptersView` | Chapters | `chapters_render_start`, `chapters_render_done`, `chapters_open_chapter_click` | Render events: 1 each; click: user-driven | Include chapter count; no per-tile logging. |
| `ui.readerView` | Reader | `reader_open_start`, `reader_open_ready`, `reader_anchor_change`, `reader_buffer_expand`, `reader_buffer_trim`, `reader_autoscroll_start`, `reader_autoscroll_stop`, `reader_autoscroll_speed_change` | Open events: 1 each; anchor: high frequency; buffer: low/moderate | Throttle `reader_anchor_change` in standard mode (for example 1 every 500-1000 ms). |
| `ui.historyView` | History | `history_render_start`, `history_render_done` | Usually 1 each | Include bookmark id and number of history rows. |
| `ui.devDrawer` | Debug drawer | `debug_drawer_open`, `debug_tab_change`, `debug_session_select`, `debug_copy_logs` | User-driven | Useful for reconstructing what data was exported. |

### 4.2 Back-end/domain module telemetry

| Module ID | Domain module | Events to capture | Typical frequency | What details matter |
| --- | --- | --- | --- | --- |
| `domain.routing` | Route/state | `route_parse`, `route_restore_start`, `route_restore_resolved`, `route_push`, `route_fallback_loaded` | Low/moderate | Include route string, parsed view, resolved work/book ids, fallback usage. |
| `domain.dataAccess` | Index + book cache | `index_load_start`, `index_load_done`, `book_cache_hit`, `book_cache_miss`, `book_load_gzip_ok`, `book_load_json_fallback`, `book_load_fail` | Moderate while reading new books; low otherwise | Include book id, chapter count, payload size estimate (if cheap), load ms. |
| `domain.readerEngine` | Reader engine | `reader_seq_resolve`, `reader_chapter_load`, `reader_jump_to_location`, `reader_capture_anchor_miss`, `reader_resize_realign`, `reader_buffer_state` | Moderate/high in reading sessions | Keep payload concise: seq, chapter, scrollTop, buffer lengths, velocity bucket. |
| `domain.bookmarks` | Bookmark store | `bookmark_create`, `bookmark_move`, `bookmark_auto_follow_update`, `bookmark_follow_skipped`, `bookmark_history_snapshot` | Low/moderate | Include bookmark id/name, source (`manual`/`scroll`/`auto-scroll`), reference. |
| `domain.logging` | Logging/session store | `log_session_create`, `log_entry_append_fail`, `log_purge_old_sessions`, `log_export_requested` | Low | Avoid recursive over-logging; reserve for warnings/errors and key lifecycle events. |

---

## 5) Persisted-object visibility strategy

Humans should be able to inspect core objects directly in-app, not only infer from logs.

### 5.1 Object families to expose

1. **Bookmarks**
   - Simplified list: name, current reference, updatedAt, history-day count.
   - Detail action: "View raw JSON".
2. **Bookmark history entries**
   - Simplified list grouped by bookmark and day.
   - Detail action: "View raw JSON" per entry.
3. **Route state snapshot**
   - Current hash, parsed route descriptor, storage fallback value.
   - Detail action: "View raw JSON".
4. **Reader runtime snapshot**
   - Current anchor, loaded seq range, loaded chapter count, auto-scroll state/speed.
   - Detail action: "View raw JSON".
5. **Book cache snapshot**
   - Cached keys, recency order, max cache size.
   - Detail action: "View raw JSON".
6. **Log session catalog**
   - Session startedAt, entry count, last timestamp.
   - Detail action: "View raw JSON" (session metadata + entries preview).

### 5.2 Debug drawer layout recommendation

- Add third tab: **Objects** (beside Storage and Logs).
- Objects tab sections:
  1. Bookmarks
  2. Reader runtime
  3. Route/runtime state
  4. Cache state
- Every row has:
  - compact summary card
  - `View JSON` action to reveal raw object in expandable `<pre>` panel.

This keeps mobile ergonomics intact while preserving full transparency on demand.

---

## 6) Log viewer strategy

### 6.1 Required viewer capabilities

- Session selection (already present).
- Module filter chips / checklist (show/hide by module id).
- Level filter (`debug/info/warn/error`).
- Free text search (message/details).
- Collapsible details payload.
- Copy options:
  - `Copy visible` (filtered subset)
  - `Copy full session` (bounded max entries)

### 6.2 Event envelope contract (recommended)

Use one structured envelope so logs are machine-readable and human-readable:

```json
{
  "timestamp": 1712345678901,
  "sessionId": "session-1712345678",
  "level": "info",
  "module": "domain.readerEngine",
  "event": "reader_jump_to_location",
  "summary": "Aligned target verse to 25% viewport",
  "metrics": { "durationMs": 12, "scrollTopBefore": 1020, "scrollTopAfter": 1338 },
  "refs": { "workId": "book-of-mormon", "bookId": "1-ne", "chapter": 4, "verse": 1 },
  "details": { "seq": 3, "align": 0.25 }
}
```

Key benefit: easy filtering, lower ambiguity, better AI ingestion.

---

## 7) Performance and safety rules for visibility mode

- Default production behavior: module instrumentation disabled.
- In developer mode:
  - enable only low-cost events by default;
  - require explicit opt-in for high-frequency events.
- Throttle and sample high-volume streams:
  - anchor changes and scroll diagnostics should use time-based throttles.
- Do not log full chapter payloads or entire book payloads by default.
- Redact/omit fields not needed for diagnosis.

---

## 8) Flow-by-flow visibility checklist

### Critical flow (Resume and continue reading)
- Must see: route restore -> reader open -> anchor updates -> bookmark auto-follow updates.
- Required modules: `domain.routing`, `ui.readerView`, `domain.readerEngine`, `domain.bookmarks`.

### Secondary flow (Drill-down to reader)
- Must see: home click -> books render -> chapter selection -> reader open ready.
- Required modules: `ui.homeView`, `ui.booksView`, `ui.chaptersView`, `domain.routing`, `domain.readerEngine`.

### Tertiary flow (Bookmark management/history)
- Must see: bookmark create/move -> daily snapshot write -> history render/open.
- Required modules: `domain.bookmarks`, `ui.historyView`, `ui.homeView`.

---

## 9) Implementation status snapshot (today)

- **Implemented now**
  - Dev mode gate, log persistence, session browsing, copy export, baseline debug drawer.
- **Partially implemented**
  - Reader and navigation logs exist but are not fully normalized to module/event contracts.
- **Not implemented yet**
  - Per-module visibility toggles, object browser tab, in-view log filtering controls.

This document intentionally defines the target visibility discipline so future changes remain consistent.
