import test from "node:test";
import assert from "node:assert/strict";
import { BookCache } from "../../src/data.js";

test("BookCache evicts least recently used entry", async () => {
  const payloads = {
    "a::one": { chapters: [{ chapter: 1 }] },
    "a::two": { chapters: [{ chapter: 2 }] },
    "a::three": { chapters: [{ chapter: 3 }] },
  };
  Object.defineProperty(globalThis, "fetch", {
    value: async (url) => {
      const key = url.includes("one") ? "a::one" : url.includes("two") ? "a::two" : "a::three";
      return {
        ok: true,
        json: async () => payloads[key],
      };
    },
    configurable: true,
    writable: true,
  });

  const cache = new BookCache(2);
  const one = { workId: "a", id: "one", pathGz: "/one.gz", pathJson: "/one.json", title: "One" };
  const two = { workId: "a", id: "two", pathGz: "/two.gz", pathJson: "/two.json", title: "Two" };
  const three = { workId: "a", id: "three", pathGz: "/three.gz", pathJson: "/three.json", title: "Three" };

  await cache.getBook(one);
  await cache.getBook(two);
  assert.deepEqual(cache.snapshot().keysByRecency, ["a::one", "a::two"]);
  await cache.getBook(one); // touch one => two becomes LRU
  assert.deepEqual(cache.snapshot().keysByRecency, ["a::two", "a::one"]);
  await cache.getBook(three); // should evict two
  assert.deepEqual(cache.snapshot().keysByRecency, ["a::one", "a::three"]);
});
