# Scripture PWA Standard Works — Iteration Log

**Prompt slug:** `scripture-pwa-standard-works`  
**Last updated:** 2026-03-09 19:00 UTC

This living spec rolls up every instruction and deliverable from the Scripture Reader PWA effort. See `20260309-184530_scripture-pwa-standard-works-PROMPT.txt` for the full prompt history (chronological, earliest-first).

**Source:** Migrated from brain-graft tracker pair `001-scripture_pwa_standard_works-PROMPT.md` and `001-scripture_pwa_standard_works-TODO.md`. Those files are superseded by this spec; the PROMPT.txt captures the whole agentic process.

## Intake Items (from original TODO)

1. Build a Progressive Web App for reading Church of Jesus Christ of Latter-day Saints standard works.
2. Prioritize Book of Mormon first, then support Old Testament, New Testament, Doctrine and Covenants, Pearl of Great Price.
3. Implement sticky bookmarks with one or more bookmark entries.
4. Implement automatic bookmark following while reading/scrolling, with autosave.
5. Implement bookmark history snapshots by date (daily granularity).
6. Implement infinite scrolling between chapters/books.
7. Add navigation drill-down: scripture collection → book → chapter → reading view.
8. Make chapter selection a tile/grid view (not a long list), with back navigation up each level.
9. Add auto-scroll controls at the top with start/stop and speed slider.
10. Keep a fixed on-screen reading anchor for virtualized scrolling.
11. Preserve the reading anchor at 25% from top during rotation/re-render.
12. Keep healthy preloaded buffer above and below the viewport to avoid stutter.
13. Use structured scripture data from online sources when possible.
14. Store scripture books as separate GZIP payloads in source and cap in-memory thawed books (target: 2 books).
15. If available, show page references and footnote markers/tooltips, with outbound links to Gospel Library app/site.
16. Provide a visual description of layout/modes.

## Integration Status (from original TODO, kept current)

| # | Status | Notes |
|---|--------|-------|
| 1 | DONE | Core PWA scaffold (`index.html`, `src/main.js`, `public/manifest.webmanifest`, `public/sw.js`). |
| 2 | DONE | Standard works in index/data (`scripts/build-scripture-data.mjs`, `public/data/index.json`). |
| 3 | DONE | Multi-bookmark support, active selection (`src/bookmarks.js`, `src/main.js`). |
| 4 | DONE | Auto-follow bookmark during scroll, local autosave (`src/main.js:handleAnchorChange`). |
| 5 | DONE | Daily snapshot history per bookmark (`src/bookmarks.js:updateActiveLocation`). |
| 6 | DONE | Continuous chapter scrolling, cross-book loading (`src/readerEngine.js`). |
| 7 | DONE | Drill-down flow (Home → Books → Chapters → Reader). |
| 8 | DONE | Chapter tiles/grid, back-up navigation (header/home/chapters). |
| 9 | DONE | Top-mounted auto-scroll controls (start/stop/speed). |
| 10 | DONE | Anchor-based reading reference (verse at viewport probe). |
| 11 | DONE | Resize/orientation anchor restoration to 25% viewport (`readerEngine.js:onResize`). |
| 12 | DONE | Prefetch/trim buffer 5–10 screens above/below (`readerEngine.js:ensureBuffer`). |
| 13 | DONE | Structured source: `@bencrowder/scriptures-json`. |
| 14 | DONE | Per-book `.json.gz` assets; runtime cache max 2 books. |
| 15 | PARTIAL | Source lacks footnotes; links to Gospel Library; UI ready for future footnote data. |
| 16 | DONE | Layout modes in `documentation/layout_modes.md`. |

## Delivery Summary (cumulative)

### PWA Shell & Navigation
- Core scaffold, drill-down flow, chapter tile grid.

### Sticky Bookmarks
- Multi-bookmark, auto-follow, daily history.

### Infinite Chapter Scrolling
- Cross-book loading, 25% anchor, resize/orientation preservation, buffer strategy.

### Auto-Scroll, Data Pipeline, Layout Docs
- Top-mounted controls; per-book gzip + LRU cache; `documentation/layout_modes.md`.

### Deployment & Instrumentation (2026-03-09)
- Moved to public repo `unlox775/scriptures-sticky-scroll-pwa`; added as brain-graft submodule.
- `base: '/scriptures-sticky-scroll-pwa/'` for GitHub Pages; relative data paths.
- SW registration uses `import.meta.env.BASE_URL` for subpath correctness.
- AGENTS.md, Makefile, documentation/ (README, architecture, layout_modes), documentation/spec/ with this pair.
- Tracker `001-*` content converted into this spec; PROMPT.txt captures full agentic process.

## Files Considered (No Edit Needed)

- Footnote/page-number rendering data source — upstream dataset intentionally excludes copyrighted footnotes/chapter summaries.

### ✅ Bookmark UX refresh — Delivered 2026-03-09
- **View History**: Per-bookmark history view, one line per day, newest first.
- **Auto-engaging bookmarks**: No "active" concept; when at a location that matches a bookmark and you scroll slowly, that bookmark auto-updates. Bookmarks shown as ribbon tags; tap to open.
- **Reader top bar**: + Add Bookmark (ribbon-plus icon), Auto-scroll button. Auto-scroll expands to second bar with stop/speed. Home and Chapters turn off auto-scroll.

## Next Actions

1. Polish mobile UX and long-session performance — iterate in `20260309-210000_scripture-pwa-pivot-*`.
2. Tune bookmark auto-follow heuristics — iterate in pivot spec.
3. If footnote-capable data becomes available, wire footnote rendering.
