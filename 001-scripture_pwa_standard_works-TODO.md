**Superseded by:** `documentation/spec/20260309-184530_scripture-pwa-standard-works.md` — intake items and integration status live there; this tracker is retained for reference only.

## Intake Items

1. Build a Progressive Web App for reading Church of Jesus Christ of Latter-day Saints standard works.
2. Prioritize Book of Mormon first, then support Old Testament, New Testament, Doctrine and Covenants, Pearl of Great Price.
3. Implement sticky bookmarks with one or more bookmark entries.
4. Implement automatic bookmark following while reading/scrolling, with autosave.
5. Implement bookmark history snapshots by date (daily granularity).
6. Implement infinite scrolling between chapters/books.
7. Add navigation drill-down: scripture collection -> book -> chapter -> reading view.
8. Make chapter selection a tile/grid view (not a long list), with back navigation up each level.
9. Add auto-scroll controls at the top with start/stop and speed slider.
10. Keep a fixed on-screen reading anchor for virtualized scrolling.
11. Preserve the reading anchor at 25% from top during rotation/re-render.
12. Keep healthy preloaded buffer above and below the viewport to avoid stutter.
13. Use structured scripture data from online sources when possible.
14. Store scripture books as separate GZIP payloads in source and cap in-memory thawed books (target: 2 books).
15. If available, show page references and footnote markers/tooltips, with outbound links to Gospel Library app/site.
16. Provide a visual description of layout/modes.

## Integration Status

1. Status: DONE — Core PWA scaffold implemented (`index.html`, `src/main.js`, `public/manifest.webmanifest`, `public/sw.js`).
2. Status: DONE — Standard works included in generated index/data (`scripts/build-scripture-data.mjs`, `public/data/index.json`) with Book of Mormon working first.
3. Status: DONE — Multi-bookmark support with active selection (`src/bookmarks.js`, `src/main.js`).
4. Status: DONE — Auto-follow bookmark updates during reading scroll with local autosave (`src/main.js:handleAnchorChange`).
5. Status: DONE — Daily snapshot history persisted per bookmark (`src/bookmarks.js:updateActiveLocation`).
6. Status: DONE — Continuous chapter scrolling and cross-book chapter loading in reader engine (`src/readerEngine.js`).
7. Status: DONE — Drill-down flow implemented (`Home -> Books -> Chapters -> Reader`) in `src/main.js`.
8. Status: DONE — Chapter tiles/grid and back-up navigation via header/home/chapters controls (`src/main.js`, `src/styles.css`).
9. Status: DONE — Top-mounted auto-scroll controls with start/stop/speed (`index.html`, `src/main.js`).
10. Status: DONE — Anchor-based reading reference tracking (verse at viewport probe) in `src/readerEngine.js`.
11. Status: DONE — Resize/orientation anchor restoration to 25% viewport (`src/readerEngine.js:onResize` + `jumpToLocation`).
12. Status: DONE — Prefetch and trim strategy keeps 5–10 screens buffer above/below (`src/readerEngine.js:ensureBuffer`).
13. Status: DONE — Structured online source selected and integrated (`@bencrowder/scriptures-json`; see README/Data Sources).
14. Status: DONE — Per-book `.json.gz` assets generated and runtime cache capped to two thawed books (`scripts/build-scripture-data.mjs`, `src/data.js`).
15. Status: PARTIAL — Current source lacks official footnotes/page numbers; app links each chapter to Gospel Library and leaves room for future footnote enrichment (`src/readerEngine.js`, `README.md`).
16. Status: DONE — Mode-by-mode layout visuals documented (`documentation/layout_modes.md`).

## Files to Update

- App scaffold and UI: `index.html`, `src/*`, `public/*`
- Data pipeline: `scripts/build-scripture-data.mjs`
- Docs: `README.md`, `documentation/layout_modes.md`

## Files Considered (No Edit Needed)

- Footnote/page-number rendering data source
  - Rationale: Upstream dataset intentionally excludes copyrighted footnotes/chapter summaries.

## Restructure Recommendations

- None this session.
