# Flows and Parts — Scripture Reader PWA

This document defines the user-critical flows and the major system parts (front-end components and back-end/domain modules) using a shared, stable vocabulary.

## Scope and intent

- Focus on the paths that provide the most user value.
- Describe major components and modules only (not button-level detail).
- Keep environmental plumbing distinct from domain modules.
- Provide a single language that both humans and AI agents can reuse.

## Ubiquitous language (core nouns)

- **Work**: A standard-work collection (for example, Book of Mormon).
- **Book**: A book within a work (for example, 1 Nephi).
- **Chapter**: A numbered chapter inside a book.
- **Verse Anchor**: The verse near 25% viewport height used as the reading reference.
- **Bookmark**: Named pointer to a location, with daily history snapshots.
- **Reader Session**: Continuous reading context in the reader viewport.
- **Log Session**: Persisted telemetry stream for one app runtime.

---

## 1) Critical user flows

### 1.1 Critical flow: Resume and continue reading from bookmark

1. **Open Home and restore context.**  
   The app opens to Home (`homeView`) and restores route state from hash/local storage. The user sees works and existing bookmarks. This validates shell startup plus route orchestration and makes “continue reading now” possible without extra navigation.

2. **Select an existing bookmark.**  
   From Home bookmark cards, the user taps **Open**. Front-end transitions into Reader mode. Back-end modules coordinate safe location normalization (work/book/chapter/verse) and route persistence so deep links and refresh continue from the same context.

3. **Initialize reader engine and chapter window.**  
   `ReaderEngine` loads target chapter plus neighboring chapters, creates a virtualized window, and positions the verse near 25% viewport height. The user lands directly in context while the app preserves smooth scrolling and bounded memory.

4. **Track live reading anchor during scroll.**  
   As the user scrolls, the reader publishes anchor updates (reference + velocity + timestamp). UI status and route hash update continuously. This connects visible motion with domain state so current reading position is always explicit and recoverable.

5. **Auto-follow the correct bookmark when pace is slow enough.**  
   Bookmark logic selects the nearest bookmark at-or-before the current location and updates it when velocity thresholds allow. This produces low-friction progression while preventing noisy updates during rapid navigation or scanning behavior.

6. **Maintain continuity across buffer growth and trim.**  
   When nearing buffer edges, reader loads additional chapters and trims distant ones while correcting scroll offset. The user experiences continuous reading across chapter boundaries, and the system retains a stable anchor with controlled DOM/memory growth.

7. **Optionally use auto-scroll and keep updates coherent.**  
   User starts auto-scroll from the reader controls. The same anchor and auto-follow pipeline stays active, so manual and automated reading paths share one domain behavior and one telemetry story.

**Primary front-end components touched:** `homeView`, `readerView`, auto-scroll panel, bookmark ribbons/status.  
**Primary back-end/domain modules touched:** Routing/state (`stateRouting` + navigation coordinator), `ReaderEngine`, `BookmarkStore`, data access (`loadIndex` + `BookCache`), telemetry logger.

---

### 1.2 Secondary flow: Drill-down browse to a new reading entry point

1. **Choose a work from Home.**  
   The user taps a work card on Home (`homeView`). The app switches to Books view (`booksView`) and writes `#/w/:workId` route state. This confirms the top-level collection hierarchy and keeps navigation addressable.

2. **Choose a book from Books view.**  
   The user taps a book card in `booksView`. The app transitions to Chapters view (`chaptersView`) and writes `#/b/:workId/:bookId`. The flow turns broad discovery into concrete reading scope with explicit URL state.

3. **Choose a chapter tile.**  
   In `chaptersView`, the user taps a chapter tile. The app opens Reader at verse 1 for that chapter and updates route to `#/r/:workId/:bookId/:chapter/:verse`. This forms the canonical “start reading from structure” flow.

4. **Begin continuous reading across chapter boundaries.**  
   Reader loads nearby chapters and keeps continuity while scrolling, identical to the critical flow internals. The user can now continue normally, including bookmark movement, auto-follow, and auto-scroll if desired.

**Primary front-end components touched:** `homeView`, `booksView`, `chaptersView`, `readerView`.  
**Primary back-end/domain modules touched:** Routing/state, `ReaderEngine`, data access (`BookCache`), telemetry logger.

---

### 1.3 Tertiary flow: Manage bookmark lifecycle and history

1. **Create a bookmark in reader context.**  
   While in `readerView`, the user taps add-bookmark and names it. Bookmark store creates a persistent bookmark record and can immediately attach current location. This enables multiple reading plans without leaving the main reading experience.

2. **Move an existing bookmark to current location.**  
   User invokes move-bookmark. If multiple bookmarks exist, a picker lets the user choose target bookmark. Bookmark store updates location and persists the daily snapshot, capturing intentional repositioning with a clear source marker.

3. **Review one-line-per-day history from Home.**  
   Back on Home, user opens **View History** for a bookmark. `historyView` shows daily entries newest-first. This supports review and accountability while keeping historical detail compact and easy to scan on mobile.

4. **Reopen bookmark from history-oriented workflow.**  
   User taps bookmark **Open** to return into `readerView`. System reuses the same reader initialization and route persistence pipeline, ensuring that bookmark management and actual reading remain one connected domain lifecycle.

**Primary front-end components touched:** `readerView`, bookmark picker overlay, `homeView`, `historyView`.  
**Primary back-end/domain modules touched:** `BookmarkStore`, routing/state, `ReaderEngine`, telemetry logger.

---

## 2) Parts catalog (front-end + back-end/domain)

### 2.1 Major front-end components

| Component | Responsibility | Key subparts | Back-end/domain modules it uses |
| --- | --- | --- | --- |
| **App Shell/Header** | Global navigation, install entry, context title | home/back buttons, install button, reader action buttons | Routing/state, bookmark lifecycle, reader session |
| **Home View (`homeView`)** | Entry page for works and bookmarks | works grid, bookmark list, history/open actions | Data access (index), bookmark lifecycle, routing/state |
| **Books View (`booksView`)** | Book selection within a work | book cards grid | Routing/state |
| **Chapters View (`chaptersView`)** | Chapter entry point selection | chapter tile grid | Routing/state |
| **Reader View (`readerView`)** | Primary reading surface | scroller/content, ribbons overlay, status, auto-scroll panel | Reader session engine, bookmark lifecycle, routing/state, data access |
| **History View (`historyView`)** | Daily bookmark history display | history line list, back control | Bookmark lifecycle |
| **Developer Drawer (`devDrawer`)** | Debug storage/log inspection and copy export | storage tab, logs tab, session selector, copy logs | Telemetry logger/session store, localStorage inspector |

### 2.2 Back-end/domain modules (non-environmental)

#### A) Navigation and Route State Module
- **Files:** `src/stateRouting.js` + route orchestration in `src/main.js`
- **Domain role:** Converts UI state to stable route, restores UI state from route, and persists fallback route state.
- **Main contract (high-level):**
  - `stateToRoute(state)` -> canonical hash route
  - `parseRoute(hash)` -> parsed route descriptor
  - `pushRoute(route)` -> writes hash via history
  - `saveRouteToStorage(route)` / `loadRouteFromStorage()` -> fallback state
- **Primary model objects:** Route descriptor (`view`, `workId`, `bookId`, `chapter`, `verse`), UI navigation state.

#### B) Scripture Data Access + Book Cache Module
- **Files:** `src/data.js`
- **Domain role:** Loads scripture metadata index and chapter payloads; keeps bounded decompressed book cache.
- **Main contract (high-level):**
  - `loadIndex()` -> works/books metadata
  - `BookCache.getBook(bookMeta)` -> book payload with chapter content
  - cache helpers: `key`, `has`, `touch` (LRU behavior)
- **Primary model objects:** Work metadata, Book metadata (paths/chapter counts), Book payload, Chapter payload, Verse payload.

#### C) Reader Session Engine Module
- **Files:** `src/readerEngine.js`
- **Domain role:** Owns continuous reading mechanics: loading window, anchor capture, virtualization, resize resilience, auto-scroll loop.
- **Main contract (high-level):**
  - lifecycle: `open(location)`, `destroy()`
  - navigation: `jumpToLocation(location, align)`
  - anchor/scroll: `captureAnchor()`, `publishAnchor(velocity)`, `onScroll()`
  - buffering: `ensureBuffer()`, `ensureLoaded(seq, mode)`
  - automation: `startAutoScroll()`, `stopAutoScroll()`, `setAutoScrollSpeed(speed)`
- **Primary model objects:** Reading location, sequence pointer, loaded chapter map, anchor event metadata.

#### D) Bookmark Lifecycle Module
- **Files:** `src/bookmarks.js`
- **Domain role:** Persists bookmark set, active bookmark semantics, movement/update logic, and daily history snapshots.
- **Main contract (high-level):**
  - retrieval: `getBookmarks()`, `getActiveBookmark()`, `getHistoryOnePerDay(bookmark)`
  - mutation: `createBookmark(name)`, `setActiveBookmark(id)`, `updateBookmarkLocation(id, location, source)`
  - auto-follow support: `getBookmarkToFollow(currentLocation)`, `compareLocations(a, b)`
- **Primary model objects:** Bookmark, Bookmark location, History item (day/timestamp/reference/source), bookmark state envelope.

#### E) Telemetry Session Logging Module
- **Files:** `src/logger.js`, `src/loggerDB.js`
- **Domain role:** Session-oriented persisted logs with retrieval/export paths for debugging and AI-human collaboration.
- **Main contract (high-level):**
  - write: `logDebug`, `logInfo`, `logWarn`, `logError`
  - read/export: `getAllSessions()`, `getEntriesForSession(sid)`, `getLogsForCopy(sid?)`
  - UI callback: `setOnLogCallback(cb)`
  - session lifecycle/retention: `createLogSession()`, `purgeOldSessions()`
- **Primary model objects:** Log session, log entry (timestamp/level/message/details), dev-mode state.

### 2.3 Environmental harnesses (plumbing)

These are foundational and cross-cutting but are not core business modules:

- **LocalStorage** for bookmark state, route fallback, dev-mode switch.
- **IndexedDB** for durable log sessions and entries.
- **Service worker + manifest** for installability/offline shell behavior.
- **Browser platform APIs** (`DecompressionStream`, `history`, `hashchange`, viewport/resize events, clipboard).

### 2.4 Master integration test target (definition)

The minimum always-pass acceptance path for this product:

1. Launch app -> Home renders works + bookmarks.
2. Open bookmark -> Reader lands on expected reference.
3. Scroll within reader -> anchor updates and route hash changes.
4. Auto-follow writes bookmark update when scrolling pace is slow.
5. Reload app -> route/state restore returns to same reader context.

If this path regresses, the app’s primary value proposition is degraded.
