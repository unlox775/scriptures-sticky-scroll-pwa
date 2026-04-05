import test from "node:test";
import assert from "node:assert/strict";
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
    clear() {
      data.clear();
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

function loc(bookId, chapter, verse = 1) {
  return {
    workId: "book-of-mormon",
    workTitle: "Book of Mormon",
    bookId,
    bookTitle: bookId,
    chapter,
    verse,
    reference: `${bookId} ${chapter}:${verse}`,
  };
}

test("BookmarkStore.getBookmarkToFollow picks nearest at-or-before", () => {
  setupLocalStorage();
  setupCrypto();
  const store = new BookmarkStore();
  const b1 = store.getBookmarks()[0];
  store.updateBookmarkLocation(b1.id, loc("1-ne", 2, 1), "manual");
  const b2 = store.createBookmark("Second");
  store.updateBookmarkLocation(b2.id, loc("1-ne", 4, 3), "manual");
  const b3 = store.createBookmark("Third");
  store.updateBookmarkLocation(b3.id, loc("2-ne", 1, 1), "manual");

  const target = loc("1-ne", 4, 10);
  const follow = store.getBookmarkToFollow(target);
  assert.equal(follow?.id, b2.id);
});

test("BookmarkStore.getBookmarkToFollow returns null when all ahead", () => {
  setupLocalStorage();
  setupCrypto();
  const store = new BookmarkStore();
  const b1 = store.getBookmarks()[0];
  store.updateBookmarkLocation(b1.id, loc("1-ne", 9, 1), "manual");
  const target = loc("1-ne", 2, 1);
  const follow = store.getBookmarkToFollow(target);
  assert.equal(follow, null);
});
