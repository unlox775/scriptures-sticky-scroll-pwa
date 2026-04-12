import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, stateToRoute } from "../../src/stateRouting.js";

test("stateToRoute and parseRoute round-trip reader route", () => {
  const state = {
    currentWork: { id: "book-of-mormon" },
    currentBook: { id: "2-ne" },
    currentLocation: { chapter: 4, verse: 9 },
  };
  const route = stateToRoute(state);
  assert.equal(route, "#/r/book-of-mormon/2-ne/4/9");
  const parsed = parseRoute(route);
  assert.deepEqual(parsed, {
    view: "reader",
    workId: "book-of-mormon",
    bookId: "2-ne",
    chapter: 4,
    verse: 9,
  });
});

test("stateToRoute emits home when empty state", () => {
  const route = stateToRoute({});
  assert.equal(route, "#/");
  assert.deepEqual(parseRoute(route), { view: "home" });
});

test("parseRoute supports history bookmark route", () => {
  const parsed = parseRoute("#/history/abc-123");
  assert.deepEqual(parsed, {
    view: "history",
    bookmarkId: "abc-123",
  });
});
