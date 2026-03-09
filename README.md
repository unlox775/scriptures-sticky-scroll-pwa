# Scripture Reader PWA

## Project Description
Progressive Web App focused on scripture reading with sticky bookmarks, automatic bookmark following while you read, and continuous infinite chapter scrolling. The app is optimized for Book of Mormon-first workflows and also supports all standard works represented in the dataset.

## Goals
- Provide a smooth scripture reading PWA with install/offline support.
- Support two navigation patterns:
  - Drill-down browsing (collection -> book -> chapter).
  - Continuous reading (infinite chapter scrolling).
- Deliver sticky bookmark behavior:
  - Multiple bookmarks.
  - Auto-follow active bookmark while reading.
  - Daily bookmark history snapshots.
- Keep runtime memory bounded by loading at most two decompressed books at a time.

## Deployment (GitHub Pages)
- Build outputs to `docs/`; enable GitHub Pages to serve from the `docs` folder.
- Uses `base: './'` and relative asset paths for correct loading when deployed.

## Definition of Done
- App runs locally as a PWA (`npm run dev` / `npm run build`).
- Structured standard works data is generated from upstream JSON and stored per-book as `.json.gz` plus `.json`.
- Home mode, browse mode, chapter tile mode, and reader mode all function.
- Reader mode supports:
  - Infinite chapter loading.
  - 25%-from-top reading anchor tracking.
  - Orientation/resize anchor preservation.
  - Top-mounted auto-scroll controls (start/stop/speed).
- Bookmark persistence and daily history are stored locally.

## Setup Instructions
1. Install dependencies:
   - `npm install`
2. Build scripture data artifacts:
   - `npm run build:data`
3. Start development server:
   - `npm run dev`

## Usage Instructions
1. Open the app and choose a scripture collection from Home.
2. Drill into a book and chapter (chapter tiles).
3. Read in continuous mode; as you scroll, the active bookmark auto-follows.
4. Use the top auto-scroll controls to start/stop and adjust reading speed.
5. Return Home to view bookmark chronology snapshots by date.

## Data Sources
- Scripture dataset: [`@bencrowder/scriptures-json`](https://github.com/bcbooks/scriptures-json)
  - Includes Book of Mormon, Old Testament, New Testament, Doctrine and Covenants, and Pearl of Great Price.
  - Upstream notes state that copyrighted footnotes/chapter summaries are not included.

## Notes
- Runtime book cache uses an LRU strategy with `maxBooks = 2` to cap decompressed payloads in memory.
- Current data source does not include official footnote payloads; the UI is structured to support optional future footnote rendering if a suitable source is added.
- External chapter links open the corresponding chapter in Church study pages for deeper reference workflows.

## Layout Modes
See [`docs/layout_modes.md`](docs/layout_modes.md) for a visual mode-by-mode layout description.
