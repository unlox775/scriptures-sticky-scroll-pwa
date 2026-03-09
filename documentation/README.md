# Scripture Reader PWA — Documentation Hub

This directory contains technical documentation for the Scripture Reader PWA. Start with `layout_modes.md` for a visual description of each mode, then `architecture.md` for the technical design.

## Project Status — Traffic Light

| Feature | Status | Notes |
| --- | --- | --- |
| Installable PWA shell | 🟩 Ready | Scaffolding, manifest, service worker; GitHub Pages deployment with base path. |
| Drill-down navigation | 🟩 Ready | Home → collection → book → chapter tiles → reader. |
| Infinite chapter scrolling | 🟩 Ready | Cross-book chapter loading, 25% reading anchor, resize/orientation preservation. |
| Sticky bookmarks | 🟩 Ready | Multiple bookmarks, active selection, auto-follow while scrolling. |
| Daily bookmark history | 🟩 Ready | Per-bookmark chronology snapshots persisted locally. |
| Auto-scroll controls | 🟩 Ready | Top-mounted start/stop and speed slider. |
| LRU book cache (max 2) | 🟩 Ready | Per-book gzip assets; runtime cache caps decompressed books. |
| Footnote/page references | 🟨 Partial | Current data source lacks official footnotes; links out to Gospel Library. |
| Spec + prompt logging | 🟩 Ready | `documentation/spec/` entries; prompt transcripts stored alongside. |

## Current Focus

- Continue polishing mobile UX and long-session performance.
- Tune bookmark auto-follow heuristics for variable scroll speeds.
- If a footnote-capable data source becomes available, wire footnote rendering.

## Layout Modes

See `layout_modes.md` for visual descriptions of Home, Browse Books, Chapter Tile Grid, and Reader modes.

## Specs

Refer to `documentation/spec/` for iteration-by-iteration breakdowns and prompt transcripts.
