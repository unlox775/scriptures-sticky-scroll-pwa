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
| Scroll restore investigation | Done, not fixed | Likely browser scroll restoration applies the old nested reader `scrollTop` after the V3 runway is rebuilt; proposed fix below |
| Build verification | Done | `npm run build` passed on 2026-06-10 |

## Current Findings

- The production reader currently does not disable browser scroll restoration, while `src/scrollerV3Lab.js` already sets `history.scrollRestoration = "manual"`.
- V3 intentionally maps the logical 100,000,000 px runway onto a browser-safe physical canvas and aligns a requested verse after each jump. If the browser later restores a stale nested `scrollTop`, the route/bookmark can be correct while the viewport lands chapters ahead.
- Proposed restore fix: set `history.scrollRestoration = "manual"` during app boot, and on fresh reader open force the browser-owned reader scroller back through the route/bookmark anchor rather than allowing a persisted pixel offset to win. A stronger follow-up would persist only the semantic anchor `{workId, bookId, chapter, verse}` and never persist or trust V3 pixel `scrollTop` across sessions.
- Bookmark deletion preserves an intentionally empty bookmark list instead of recreating the default bookmark on the next load.

## Next Actions

- Defer the scroll restoration behavior change until approved.
