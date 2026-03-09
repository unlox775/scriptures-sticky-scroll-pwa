# Scripture PWA Initial Spec — Historical

**Prompt slug:** `scripture-pwa-initial`  
**Last updated:** 2026-03-09

This spec captures the initial intake from the original prompt that generated the whole app. Refinements (Prompts 1–8): `20260309-200000_scripture-pwa-interface-refinements-*`. Current work (pivot): `20260309-210000_scripture-pwa-pivot-*`.

See `20260309-120000_scripture-pwa-initial-PROMPT.txt` for the raw prompt.

## Intake Items (from original TODO)

1. Build a Progressive Web App for reading Church of Jesus Christ of Latter-day Saints standard works.
2. Prioritize Book of Mormon first, then Old Testament, New Testament, Doctrine and Covenants, Pearl of Great Price.
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
14. Store scripture books as separate GZIP payloads; cap in-memory thawed books (target: 2).
15. If available, show page references and footnote markers/tooltips, with outbound links to Gospel Library.
16. Provide a visual description of layout/modes.

## Integration Status (from original build)

| # | Status | Notes |
|---|--------|-------|
| 1–16 | DONE | See `20260309-184530_scripture-pwa-standard-works.md` for cumulative delivery. |
