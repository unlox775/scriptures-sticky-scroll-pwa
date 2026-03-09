# Scripture Reader PWA – Architecture

## 1. System Overview

- **Goal**: A Progressive Web App for reading LDS standard works with sticky bookmarks, automatic bookmark following while reading, and continuous infinite chapter scrolling.
- **Key principles**: Keep runtime memory bounded (max 2 decompressed books), preserve a stable reading anchor during virtualization/resize, and support both drill-down navigation and infinite scroll.

## 2. Modules & Responsibilities

- **`main.js`** (Entry point)
  - Renders Home, Books, Chapters, and Reader views.
  - Handles navigation (drill-down, back, home).
  - Coordinates bookmark selection, auto-scroll controls, and anchor-change callbacks.
  - Wires install prompt and service worker registration.

- **`bookmarks.js`**
  - Persists bookmarks and daily history in localStorage.
  - Tracks active bookmark; updates location on scroll when following is enabled.
  - Daily snapshots: one entry per bookmark per day.

- **`data.js`**
  - `loadIndex()` fetches `public/data/index.json` (works/books metadata).
  - `BookCache`: LRU cache (max 2 books) for decompressed book payloads.
  - Prefers `.json.gz` with `DecompressionStream`; falls back to `.json`.

- **`readerEngine.js`**
  - Renders chapters in a virtualized scroll container.
  - Tracks verse at 25% viewport as reading anchor; corrects scroll on DOM changes.
  - Handles orientation/resize: re-positions same reference to 25% from top.
  - Prefetches and trims chapters (5–10 screens above/below).
  - Integrates with auto-scroll loop and bookmark-follow callback.

## 3. Data Flow

1. **Startup**: Load index.json → show Home (collections + bookmarks).
2. **Drill-down**: User selects collection → book → chapter → Reader.
3. **Reader**: Load book via BookCache, render chapter DOM, track anchor.
4. **Scroll / chapter change**: Emit `anchorChange` → update active bookmark → persist.
5. **Auto-scroll**: Timer-driven scroll; same anchor tracking applies.

## 4. Scripture Data

- Source: `@bencrowder/scriptures-json`.
- Build: `scripts/build-scripture-data.mjs` produces `public/data/index.json` plus per-book `public/data/books/<work>/<book>.json` and `.json.gz`.
- Index includes `pathJson`, `pathGz` for each book; runtime uses relative paths for GitHub Pages.

## 5. PWA & Build

- Vite project; `build.outDir = 'docs'`; `base: '/scriptures-sticky-scroll-pwa/'` for GitHub Pages.
- Manifest and SW in `public/`; static assets copied to `docs/`.
- Service worker: basic caching for shell and data.

## 6. Layout Modes

See `layout_modes.md` for Home, Browse Books, Chapter Tiles, and Reader visuals.
