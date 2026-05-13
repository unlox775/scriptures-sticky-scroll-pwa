import test from "node:test";
import assert from "node:assert/strict";
import { ScriptureScroller } from "../../src/scriptureScroller.js";

function setupEnv() {
  class ResizeObserver {
    observe() {}
    disconnect() {}
  }

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
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserver,
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

test("ScriptureScroller locationToSeq resolves known and fallback seq", () => {
  setupEnv();
  const index = {
    works: [
      {
        id: "w",
        title: "Work",
        books: [
          { id: "a", title: "A", chapterCount: 2, workId: "w" },
          { id: "b", title: "B", chapterCount: 1, workId: "w" },
        ],
      },
    ],
  };
  const engine = new ScriptureScroller({
    scroller: createScroller(),
    content: createContent(),
    index,
    workId: "w",
    bookCache: {
      async getBook() {
        return { chapters: [] };
      },
    },
  });
  engine.work = index.works[0];
  engine.sequence = engine.buildSequence(engine.work);
  assert.equal(engine.locationToSeq({ bookId: "a", chapter: 1 }), 0);
  assert.equal(engine.locationToSeq({ bookId: "a", chapter: 2 }), 1);
  assert.equal(engine.locationToSeq({ bookId: "b", chapter: 1 }), 2);
  assert.equal(engine.locationToSeq({ bookId: "missing", chapter: 1 }), 0);
});

