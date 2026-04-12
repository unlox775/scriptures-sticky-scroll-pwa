import { isDevMode, logEvent } from "./logger.js";

const INDEX_PATH = "./data/index.json";

async function gunzipToJson(response) {
  if (!("DecompressionStream" in window) || !response.body) {
    throw new Error("Gzip streaming not supported by this browser");
  }
  const gunzip = new DecompressionStream("gzip");
  const decompressed = response.body.pipeThrough(gunzip);
  const text = await new Response(decompressed).text();
  return JSON.parse(text);
}

export async function loadIndex() {
  const startedAt = performance.now();
  if (isDevMode()) {
    logEvent({
      level: "debug",
      module: "backend.dataAccess",
      event: "index_load_start",
      summary: "Loading scripture index",
      refs: { path: INDEX_PATH },
    });
  }
  const response = await fetch(INDEX_PATH, { cache: "no-cache" });
  if (!response.ok) {
    logEvent({
      level: "error",
      module: "backend.dataAccess",
      event: "index_load_fail",
      summary: "Failed to load scripture index",
      refs: { path: INDEX_PATH },
      metrics: { status: response.status },
    });
    throw new Error(`Unable to load scripture index (${response.status})`);
  }
  const data = await response.json();
  logEvent({
    level: "info",
    module: "backend.dataAccess",
    event: "index_load_done",
    summary: "Scripture index loaded",
    metrics: {
      elapsedMs: Math.round(performance.now() - startedAt),
      works: Array.isArray(data?.works) ? data.works.length : 0,
    },
  });
  return data;
}

export class BookCache {
  constructor(maxBooks = 2, hooks = {}) {
    this.maxBooks = maxBooks;
    this.cache = new Map();
    this.hooks = hooks;
  }

  key(workId, bookId) {
    return `${workId}::${bookId}`;
  }

  has(workId, bookId) {
    return this.cache.has(this.key(workId, bookId));
  }

  touch(key, value) {
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > this.maxBooks) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  snapshot() {
    return {
      maxBooks: this.maxBooks,
      size: this.cache.size,
      keysByRecency: Array.from(this.cache.keys()),
    };
  }

  async getBook(bookMeta) {
    const startedAt = performance.now();
    const key = this.key(bookMeta.workId, bookMeta.id);
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      this.touch(key, existing);
      this.hooks.onHit?.(bookMeta, this.snapshot());
      if (isDevMode()) {
        logEvent({
          level: "debug",
          module: "backend.dataAccess",
          event: "book_cache_hit",
          summary: "Using cached book payload",
          refs: { workId: bookMeta.workId, bookId: bookMeta.id },
          metrics: { cacheSize: this.cache.size },
        });
      }
      return existing;
    }
    this.hooks.onMiss?.(bookMeta, this.snapshot());
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.dataAccess",
        event: "book_cache_miss",
        summary: "Book payload not in cache",
        refs: { workId: bookMeta.workId, bookId: bookMeta.id },
        metrics: { cacheSize: this.cache.size },
      });
    }

    let payload;
    try {
      const gzResponse = await fetch(bookMeta.pathGz, { cache: "force-cache" });
      if (!gzResponse.ok) {
        throw new Error(`Failed to fetch gzip data for ${bookMeta.title}`);
      }
      payload = await gunzipToJson(gzResponse);
      if (isDevMode()) {
        logEvent({
          level: "debug",
          module: "backend.dataAccess",
          event: "book_load_gzip_ok",
          summary: "Loaded book from gzip payload",
          refs: { workId: bookMeta.workId, bookId: bookMeta.id },
          metrics: { elapsedMs: Math.round(performance.now() - startedAt) },
        });
      }
    } catch (_error) {
      // Fallback for browsers without DecompressionStream support.
      const jsonResponse = await fetch(bookMeta.pathJson, { cache: "force-cache" });
      if (!jsonResponse.ok) {
        logEvent({
          level: "error",
          module: "backend.dataAccess",
          event: "book_load_fail",
          summary: "Failed to load book payload",
          refs: { workId: bookMeta.workId, bookId: bookMeta.id },
          details: {
            gzipPath: bookMeta.pathGz,
            jsonPath: bookMeta.pathJson,
          },
          metrics: { jsonStatus: jsonResponse.status },
        });
        throw new Error(`Failed to fetch JSON data for ${bookMeta.title}`);
      }
      payload = await jsonResponse.json();
      logEvent({
        level: "warn",
        module: "backend.dataAccess",
        event: "book_load_json_fallback",
        summary: "Loaded book from JSON fallback",
        refs: { workId: bookMeta.workId, bookId: bookMeta.id },
        metrics: { elapsedMs: Math.round(performance.now() - startedAt) },
      });
    }

    this.touch(key, payload);
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.dataAccess",
        event: "book_cache_store",
        summary: "Stored book payload in cache",
        refs: { workId: bookMeta.workId, bookId: bookMeta.id },
        metrics: { cacheSize: this.cache.size, maxBooks: this.maxBooks },
      });
    }
    return payload;
  }
}
