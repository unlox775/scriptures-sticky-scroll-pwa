# Module Visibility Story: `ui.booksView`

## Module type and boundary
- **Type:** UI module
- **Owns:** visual rendering of book cards for one selected work, click handlers, and view-level navigation actions.
- **Does not own:** route parsing semantics, scripture payload fetching strategy, bookmark persistence, or reader buffer logic.

## Mechanism story
`ui.booksView` is the second browse stage after Home. It takes one selected work and renders the complete book list for that work. It is responsible for:

- mapping work metadata into visible book cards
- preserving navigation continuity when the user goes back/home
- emitting explicit intent events when user selects a book

This module should stay UI-focused: DOM creation, event listeners, and UI transitions. It should not own scripture data fetch policies or bookmark mutation rules.

## Why this is tricky
- It is easy for this view to become \"just a render function\" with no diagnostic depth; that makes branch-specific bugs hard to explain.
- Route state must remain coherent with UI transitions (`#/w/:workId` -> `#/b/:workId/:bookId`) or restore logic becomes ambiguous.
- When work context is invalid/missing, fallback behavior must be explicit (not silent) so humans understand why they landed elsewhere.

## Signals to watch
- `books_render_done`
- `books_open_book_click`
- `books_back_to_home`

## Scenario walkthrough (concrete)
1. User is on Home and taps \"Book of Mormon\" (`home_open_work_click` in prior module).
2. App enters Books view and renders all Book of Mormon books.
3. `books_render_done` emits with:
   - `refs.workId = "book-of-mormon"`
   - `metrics.books = 15`
   - `metrics.elapsedMs` render time
4. User taps \"1 Nephi\" card.
5. `books_open_book_click` emits with:
   - `refs.workId = "book-of-mormon"`
   - `refs.bookId = "1-ne"`
6. App transitions to chapter tile view (`ui.chaptersView` takes over).

## Healthy sequence example
`books_render_done` -> zero or more user dwell time -> `books_open_book_click` OR `books_back_to_home`

## Failure cues and interpretation
- Missing `books_render_done`: render path failed or view never mounted.
- `books_open_book_click` with no chapters-view transition: navigation orchestration issue.
- Repeated immediate return to home with no user action: likely invalid work context fallback.

## Actionable debug checklist
1. Open Home, choose a work.
2. Verify one `books_render_done` for the selected work.
3. Tap one book and verify `books_open_book_click` refs match selection.
4. Tap back from books and verify `books_back_to_home`.
