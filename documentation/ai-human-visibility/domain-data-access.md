# Module Visibility Story: `domain.dataAccess`

## Mechanism story
`domain.dataAccess` loads index and book payloads with a cache-first strategy:
- index JSON is loaded once at startup
- per-book data is loaded with gzip-first transport
- if gzip/decompression path fails, JSON fallback is used
- book payloads are retained in a small LRU cache

## Why this is tricky
- payload path can branch by browser capability/network response
- cache churn can look like network instability if not instrumented

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
