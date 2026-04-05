import test from "node:test";
import assert from "node:assert/strict";
import { ReaderEngine } from "../../src/readerEngine.js";

function setupEnv() {
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener() {},
      removeEventListener() {},
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "performance", {
    value: { now: () => 1000 },
    configurable: true,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (cb) => {
      cb(0);
      return 1;
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: () => {},
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      elementFromPoint() {
        return null;
      },
    },
    configurable: true,
  });
}

function createScroller() {
  return {
    scrollTop: 0,
    clientHeight: 500,
    scrollHeight: 1200,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 320, height: 500 };
    },
    scrollBy({ top }) {
      this.scrollTop += top;
    },
  };
}

function createContent() {
  return {
    innerHTML: "",
    firstChild: null,
    scrollHeight: 1000,
    appendChild() {},
    insertBefore() {},
    querySelector() {
      return null;
    },
  };
}

test("ReaderEngine locationToSeq resolves known and fallback seq", () => {
  setupEnv();
  const engine = new ReaderEngine({
    scroller: createScroller(),
    content: createContent(),
    workMeta: {
      id: "w",
      title: "Work",
      books: [
        { id: "a", title: "A", chapterCount: 2 },
        { id: "b", title: "B", chapterCount: 1 },
      ],
    },
    bookCache: {
      async getBook() {
        return { chapters: [] };
      },
    },
    onAnchorChange() {},
  });
  assert.equal(engine.locationToSeq({ bookId: "a", chapter: 1 }), 0);
  assert.equal(engine.locationToSeq({ bookId: "a", chapter: 2 }), 1);
  assert.equal(engine.locationToSeq({ bookId: "b", chapter: 1 }), 2);
  assert.equal(engine.locationToSeq({ bookId: "missing", chapter: 1 }), 0);
});

