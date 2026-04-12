# Module Visibility Story: `backend.dataAccess`

## Module type and boundary
- **Type:** Backend module
- **Owns:** index and book payload loading policy, gzip/JSON fallback behavior, and cache retention/eviction behavior.
- **Does not own:** DOM rendering decisions, viewport measurements, scroll thresholds, or reader panel composition.

## Mechanism story
`backend.dataAccess` loads index and book payloads with a cache-first strategy:
- index JSON is loaded once at startup
- per-book data is loaded with gzip-first transport
- if gzip/decompression path fails, JSON fallback is used
- book payloads are retained in a small LRU cache

## Why this is tricky
- payload path can branch by browser capability/network response
- cache churn can look like network instability if not instrumented
- this module must remain UI-agnostic; it should never depend on viewport geometry or DOM state

## Scenario walkthrough: cold app load then continued reading

### Scenario A: cold startup index load
1. App init begins in app shell.
2. Data layer emits `index_load_start`.
3. Index fetch resolves and emits `index_load_done` with elapsed timing and work count.
4. UI modules can now render works/books.

### Scenario B: first reader open in a new book
1. Reader requests a chapter from a book not currently cached.
2. Data layer emits `book_cache_miss`.
3. Gzip path is attempted:
   - success -> `book_load_gzip_ok`
   - fallback path -> `book_load_json_fallback`
4. Payload is inserted into cache (`book_cache_store`).
5. Subsequent chapter loads in same book trend toward `book_cache_hit`.

### Scenario C: fallback/failure branch
1. Gzip fetch/decompression fails and JSON fallback is attempted.
2. If fallback succeeds: `book_load_json_fallback` (warn-level signal but still healthy functionally).
3. If fallback fails: `book_load_fail` and upper layers should surface read failure.

## Signals to watch
- `index_load_start|done|fail`
- `book_cache_hit|book_cache_miss|book_cache_store`
- `book_load_gzip_ok|book_load_json_fallback|book_load_fail`

## Healthy sequence
- first open of a book: miss -> gzip_ok (or json_fallback) -> cache_store
- nearby chapter loads in same book: mostly cache_hit

## Failure cues
- frequent `book_load_fail` => data path/network issue
- frequent `book_cache_miss` on same book in short interval => cache too small or eviction churn

## Actionable debug checklist
1. Start fresh session and open reader in a book not recently used.
2. Confirm `book_cache_miss` then `book_load_gzip_ok` or `book_load_json_fallback`.
3. Continue to nearby chapters and confirm rise in `book_cache_hit`.
4. If misses continue for same book, inspect `metrics.cacheSize` and configured max cache size.
