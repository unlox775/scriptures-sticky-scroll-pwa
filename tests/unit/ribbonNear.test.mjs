import test from "node:test";
import assert from "node:assert/strict";
import { isBookmarkNearLocation } from "../../src/views/readerView.js";

const bm = { location: { workId: "book-of-mormon", bookId: "ether", chapter: 1, verse: 1, seq: 205 } };
test("ribbon stays near across book boundary (seq)", () => {
  assert.equal(isBookmarkNearLocation(bm, { workId: "book-of-mormon", bookId: "morm", chapter: 9, seq: 204 }), true);
  assert.equal(isBookmarkNearLocation(bm, { workId: "book-of-mormon", bookId: "morm", chapter: 1, seq: 196 }), false);
  assert.equal(isBookmarkNearLocation(bm, { workId: "doctrine-and-covenants", bookId: "dc", chapter: 1, seq: 205 }), false);
});
test("fallback without seq keeps old bookId rule", () => {
  const b = { location: { workId: "w", bookId: "a", chapter: 5 } };
  assert.equal(isBookmarkNearLocation(b, { workId: "w", bookId: "a", chapter: 7 }), true);
  assert.equal(isBookmarkNearLocation(b, { workId: "w", bookId: "b", chapter: 5 }), false);
});
