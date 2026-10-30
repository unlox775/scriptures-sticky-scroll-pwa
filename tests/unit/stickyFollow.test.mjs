import test from "node:test";
import assert from "node:assert/strict";
import { stickyFollowDelta } from "../../src/stickyFollow.js";

const bm = (location) => ({ location });
const at = (bookId, chapter, verse, seq) => ({ workId: "bofm", bookId, chapter, verse, seq });

test("follows 3 Nephi 30 -> 4 Nephi 1 across book boundary", () => {
  assert.equal(stickyFollowDelta(bm(at("3-ne", 30, 2, 200)), at("4-ne", 1, 1, 201)), 1);
});

test("follows 4 Nephi 1 -> Mormon 1 across book boundary", () => {
  assert.equal(stickyFollowDelta(bm(at("4-ne", 1, 49, 201)), at("morm", 1, 1, 202)), 1);
});

test("same-chapter and backward/far jumps unchanged", () => {
  assert.equal(stickyFollowDelta(bm(at("1-ne", 3, 5, 2)), at("1-ne", 3, 9, 2)), 4);
  assert.equal(stickyFollowDelta(bm(at("1-ne", 3, 5, 2)), at("1-ne", 2, 9, 1)), null);
  assert.equal(stickyFollowDelta(bm(at("1-ne", 3, 5, 2)), at("1-ne", 5, 1, 4)), null);
});

test("different work never follows; no-seq fallback keeps book check", () => {
  assert.equal(stickyFollowDelta(bm(at("3-ne", 30, 2, 200)), { ...at("4-ne", 1, 1, 201), workId: "dc" }), null);
  assert.equal(stickyFollowDelta(bm(at("3-ne", 30, 2)), at("4-ne", 1, 1)), null);
  assert.equal(stickyFollowDelta(bm(at("1-ne", 3, 25)), at("1-ne", 4, 2)), 2);
});
