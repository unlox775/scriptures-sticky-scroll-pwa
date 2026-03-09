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
  const response = await fetch(INDEX_PATH, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Unable to load scripture index (${response.status})`);
  }
  return response.json();
}

export class BookCache {
  constructor(maxBooks = 2) {
    this.maxBooks = maxBooks;
    this.cache = new Map();
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

  async getBook(bookMeta) {
    const key = this.key(bookMeta.workId, bookMeta.id);
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      this.touch(key, existing);
      return existing;
    }

    let payload;
    try {
      const gzResponse = await fetch(bookMeta.pathGz, { cache: "force-cache" });
      if (!gzResponse.ok) {
        throw new Error(`Failed to fetch gzip data for ${bookMeta.title}`);
      }
      payload = await gunzipToJson(gzResponse);
    } catch (_error) {
      // Fallback for browsers without DecompressionStream support.
      const jsonResponse = await fetch(bookMeta.pathJson, { cache: "force-cache" });
      if (!jsonResponse.ok) {
        throw new Error(`Failed to fetch JSON data for ${bookMeta.title}`);
      }
      payload = await jsonResponse.json();
    }

    this.touch(key, payload);
    return payload;
  }
}
