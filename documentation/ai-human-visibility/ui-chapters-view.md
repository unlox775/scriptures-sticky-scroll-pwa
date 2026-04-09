# Module Visibility Story: `ui.chaptersView`

## 1) Module classification

- **Module type:** UI module
- **Purpose:** chapter selection surface between book selection and reader session start
- **Depends on backend modules:** `backend.routing` (route writing), `backend.dataAccess` (indirectly through available chapter counts)

## 2) Mechanism story

`ui.chaptersView` renders a chapter grid for the selected book and turns user taps into reader-start intents. It does not own reading logic; it is the launch surface that produces deterministic navigation intent and context (`workId`, `bookId`, `chapter`).

## 3) Why this is tricky

- It must render quickly for books with large chapter counts while keeping tile interactions deterministic.
- It must preserve route coherence so refresh/deep-link expectations remain consistent.
- It must hand off exact chapter intent to reader start without mixing concerns (UI should not perform reader buffer mechanics).

## 4) End-to-end scenario walkthrough

### Scenario: user chooses Alma 32 from chapter grid

1. User is in `ui.booksView`, taps Alma.
2. `ui.chaptersView` renders tiles `1..63`.
3. User taps tile `32`.
4. UI emits intent event and calls reader-open flow with `{workId, bookId, chapter: 32, verse: 1}`.
5. Control passes to `ui.readerView` + `ui.readerEngine`.

## 5) Signals to watch (with interpretation)

- `chapters_render_done`
  - Confirms chapter grid rendered for selected book.
  - Key metrics: chapterCount, elapsedMs.
- `chapters_open_chapter_click`
  - Confirms user intent to open specific chapter.
  - Key refs: workId, bookId, chapter.
- `chapters_back_to_books`
  - Confirms navigation reversal to `ui.booksView`.

## 6) Healthy sequence example

`chapters_render_done` -> `chapters_open_chapter_click` -> `reader_open_start` (from `ui.readerView`) -> `reader_open_ready`.

## 7) Failure cues and likely causes

- Missing `chapters_open_chapter_click` after user tap:
  - likely event-binding/render mismatch on tiles.
- `chapters_open_chapter_click` appears, but no downstream `reader_open_start`:
  - handoff failure in orchestration.
- `chapters_render_done` absent or delayed heavily:
  - rendering performance issue or missing book/chapter metadata.

## 8) Actionable debug checklist

1. Open a work and book with high chapter count.
2. Confirm `chapters_render_done` with expected chapterCount.
3. Tap a chapter tile and confirm `chapters_open_chapter_click` carries correct chapter number.
4. Confirm downstream reader open events occur immediately after click event.
