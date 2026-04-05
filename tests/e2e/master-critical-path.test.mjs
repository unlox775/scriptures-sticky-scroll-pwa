import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../../src/stateRouting.js";
import { BookmarkStore } from "../../src/bookmarks.js";

function setupLocalStorage() {
  const data = new Map();
  const storage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

function setupCrypto() {
  let i = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID() {
        i += 1;
        return `uuid-${i}`;
      },
    },
    configurable: true,
    writable: true,
  });
}

function loc(chapter, verse = 1) {
  return {
    workId: "book-of-mormon",
    workTitle: "Book of Mormon",
    bookId: "1-ne",
    bookTitle: "1 Nephi",
    chapter,
    verse,
    reference: `1 Nephi ${chapter}:${verse}`,
  };
}

test("master critical path domain contract stays intact", () => {
  setupLocalStorage();
  setupCrypto();
  const store = new BookmarkStore();
  const bookmark = store.getBookmarks()[0];
  assert.ok(bookmark);

  // 1) open bookmark route into reader
  store.updateBookmarkLocation(bookmark.id, loc(4, 1), "manual");
  const route = `#/r/${bookmark.location.workId}/${bookmark.location.bookId}/${bookmark.location.chapter}/${bookmark.location.verse}`;
  const parsed = parseRoute(route);
  assert.equal(parsed.view, "reader");
  assert.equal(parsed.chapter, 4);
  assert.equal(parsed.verse, 1);

  // 2) "scroll" forward and auto-follow update
  const afterScroll = loc(4, 12);
  const toFollow = store.getBookmarkToFollow(afterScroll);
  assert.equal(toFollow?.id, bookmark.id);
  store.updateBookmarkLocation(toFollow.id, afterScroll, "scroll");
  assert.equal(store.getBookmarks()[0].location.verse, 12);

  // 3) "slow scroll" further and verify persisted history update
  const slowScroll = loc(5, 3);
  store.updateBookmarkLocation(bookmark.id, slowScroll, "scroll");
  assert.equal(store.getBookmarks()[0].location.chapter, 5);
  assert.ok(Array.isArray(store.getBookmarks()[0].history));

  // 4) reload simulation: create a new store and ensure restoration persisted
  const restored = new BookmarkStore();
  const restoredBookmark = restored.getBookmarks().find((b) => b.id === bookmark.id);
  assert.equal(restoredBookmark?.location?.chapter, 5);
  assert.equal(restoredBookmark?.location?.verse, 3);
});
