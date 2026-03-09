# Scripture PWA Interface Refinements — Iteration Log

**Prompt slug:** `scripture-pwa-interface-refinements`  
**Last updated:** 2026-03-09

This living spec rolls up every instruction and deliverable from the interface/UX refinement work. See `20260309-200000_scripture-pwa-interface-refinements-PROMPT.txt` for the full prompt history (chronological, earliest-first).

## Delivery Summary (cumulative)

### Prompt 1: Auto-scroll, bookmarks, ribbons
| Item | Status | Where / Notes |
|------|--------|---------------|
| Cap auto-scroll at 100px/s | Done | `index.html` slider max |
| Auto-scroll UI only in reader | Done | `setView()` hides when not readerView |
| Scroll stop/slider bar only when scrolling ON | Done | Panel; `state.autoScrollActive` |
| Verse-anchored bookmark ribbons on left | Done | `readerRibbonsOverlay`, `renderBookmarkRibbons()` |
| 30-sec average: quick scroll no follow, slow/paused follow | Done | `getAverageVelocityOverWindow()`, `SLOW_READING_THRESHOLD` 150px/s |

### Prompt 2: Daily Reading default, refresh button
| Item | Status | Where / Notes |
|------|--------|---------------|
| Daily Reading default at 1 Ne 1:1 | Done | `bookmarks.js` `DEFAULT_1NE_1_1` |
| Refresh-arrow button (↻) next to + | Done | `moveBookmarkButton`; picker to move bookmark to current location |

### Prompt 3: Low-speed scroll, stop button, slider, panel
| Item | Status | Where / Notes |
|------|--------|---------------|
| Fix scroll stopping at ≤13px/s | Done | `readerEngine.js` accumulated fractional pixels |
| Stop button → X icon | Done | `index.html` "×"; `.stop-btn` styles |
| Slider full width, max 400px | Done | `.auto-scroll-slider-wrap` |
| Panel only when scrolling, only in reader | Done | `state.autoScrollActive`; `updateHeader()` |

### Prompt 4: Top bar rework per view
| Item | Status | Where / Notes |
|------|--------|---------------|
| Home: no home btn, just "Standard Works Reader" | Done | `updateHeader()` |
| Books: Home + "Book of Mormon" | Done | |
| Chapters: Home + ‹ Back + "1 Nephi" | Done | |
| Reader: Home + ‹ Back + "1 Nephi 2" + + + ↻ + Auto-scroll, no Chapters | Done | Chapters button removed |
| Back: Reader→Chapters→Books→Home; History→Home | Done | `backButton` handler |

### Prompt 6: Scroller bar, reference, iOS, ribbons
| Item | Status | Where / Notes |
|------|--------|---------------|
| Auto-scroll bar edge-to-edge (full width) | Done | Panel moved to global position between header and main |
| Remove "Reference:" display | Done | Removed currentReferenceEl |
| iOS: Add-to-Home-Screen instructions | Done | Detect iOS; show button; alert with Share → Add to Home Screen steps |
| Ribbon slide animation | Done | `transition: top 0.25s ease-out` on bookmark-ribbon |

## Files Modified (refinements)

- `index.html` — header, auto-scroll panel, slider, stop button
- `src/main.js` — setView, updateHeader, backButton, moveBookmarkButton, velocity samples, ribbon overlay, iOS install
- `src/readerEngine.js` — accumulated px for low-speed scroll
- `src/bookmarks.js` — DEFAULT_1NE_1_1
- `src/styles.css` — header-title, slider wrap, stop-btn, overlay

## Next Actions

1. Polish bookmark ribbon positioning if still misaligned.
2. Tune bookmark auto-follow heuristics for variable scroll speeds and pause patterns.
