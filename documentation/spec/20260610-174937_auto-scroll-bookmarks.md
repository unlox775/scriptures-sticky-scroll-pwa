# Auto Scroll And Bookmarks

**Prompt slug:** `auto-scroll-bookmarks`  
**Started:** 2026-06-10  
**Last updated:** 2026-06-10

See `20260610-174937_auto-scroll-bookmarks-PROMPT.txt` for the full prompt history.

## Goals

- Make the active auto-scroll bar span the full reader width, with the speed label on the left and speed value plus stop control on the right.
- Smooth the bookmark sticky marker movement during auto-scroll so it slides rather than jumping.
- Add a confirmed way to delete saved bookmarks.
- Investigate, but do not fix yet, the persisted scroll-position restore bug that reopens too far ahead after reading across chapters.

## Delivery Summary

| Item | Status | Where / Notes |
|------|--------|---------------|
| Auto-scroll full-width controls | Done | `src/autoScrollController.js`, `src/scriptureReader.css`; label stays left, range input stretches, speed value and Stop stay right |
| Bookmark sticky animation | Done | `src/styles.css`; bookmark ribbons transition top/left updates, respecting reduced-motion preferences |
| Bookmark deletion | Done | `src/bookmarks.js`, `src/services/bookmarkService.js`, `src/views/homeView.js`, `src/main.js`; home bookmark rows include a separated delete control with confirmation |
| Scroll restore fix | Done | `src/main.js`; production now disables browser scroll restoration so semantic route/bookmark anchors win over stale pixel `scrollTop` |
| Build verification | Done | `npm run build` passed after scroll restoration fix |

## Current Findings

- The production reader did not disable browser scroll restoration, while `src/scrollerV3Lab.js` already set `history.scrollRestoration = "manual"`.
- V3 intentionally maps the logical 100,000,000 px runway onto a browser-safe physical canvas and aligns a requested verse after each jump. If the browser later restores a stale nested `scrollTop`, the route/bookmark can be correct while the viewport lands chapters ahead.
- Implemented restore fix: set `history.scrollRestoration = "manual"` during production app boot so fresh opens restore from the semantic route/bookmark anchor `{workId, bookId, chapter, verse}` instead of a persisted V3 pixel offset.
- Bookmark deletion preserves an intentionally empty bookmark list instead of recreating the default bookmark on the next load.

## Next Actions

- Monitor on iOS/macOS after a full app close/reopen to confirm no stale nested scroll position is restored.
