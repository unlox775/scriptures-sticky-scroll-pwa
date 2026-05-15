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

test("ScriptureScroller unload above preserves the visible anchor", () => {
  setupEnv();
  const scroller = createScroller();
  scroller.clientHeight = 1000;
  scroller.scrollTop = 2350;
  const anchor = {
    documentTop: 2610,
    getBoundingClientRect() {
      const top = this.documentTop - scroller.scrollTop;
      return { top, bottom: top + 40 };
    },
  };
  const removed = {
    offsetTop: 0,
    offsetHeight: 1200,
    nextElementSibling: null,
    contains(candidate) {
      return candidate === this;
    },
    removeCalled: false,
    remove() {
      this.removeCalled = true;
      anchor.documentTop -= 1200;
    },
  };
  const visible = {
    offsetTop: 1200,
    offsetHeight: 5000,
    nextElementSibling: null,
    contains() {
      return false;
    },
    querySelectorAll(selector) {
      return selector === ".lab-verse" ? [anchor] : [];
    },
    remove() {},
  };
  removed.nextElementSibling = visible;
  const content = createContent();
  content.querySelectorAll = (selector) => (selector === ".lab-verse" ? [anchor] : []);
  const index = {
    works: [
      {
        id: "w",
        title: "Work",
        books: [{ id: "a", title: "Alma", chapterCount: 2, workId: "w" }],
      },
    ],
  };
  const engine = new ScriptureScroller({
    scroller,
    content,
    index,
    workId: "w",
    unloadViewportPages: 1,
    bookCache: {
      async getBook() {
        return { chapters: [] };
      },
    },
  });
  engine.work = index.works[0];
  engine.sequence = engine.buildSequence(engine.work);
  engine.loaded.set(0, removed);
  engine.loaded.set(1, visible);
  engine.userScrollSinceJump = true;

  engine.unloadFarChapters("down", 2200);

  assert.equal(removed.removeCalled, true);
  assert.equal(scroller.scrollTop, 1150);
  assert.equal(anchor.getBoundingClientRect().top, 260);
  assert.equal(engine.loaded.has(0), false);
  assert.equal(engine.loaded.has(1), true);
});

test("ScriptureScroller unload above never advances scrollTop", () => {
  setupEnv();
  const scroller = createScroller();
  scroller.clientHeight = 1000;
  scroller.scrollTop = 2350;
  const anchor = {
    getBoundingClientRect() {
      return { top: 300, bottom: 340 };
    },
  };
  const removed = {
    offsetTop: 0,
    offsetHeight: 1200,
    nextElementSibling: null,
    contains() {
      return false;
    },
    remove() {},
  };
  const visible = {
    offsetTop: 1200,
    offsetHeight: 5000,
    nextElementSibling: null,
    remove() {},
  };
  removed.nextElementSibling = visible;
  const content = createContent();
  content.querySelectorAll = () => [anchor];
  const index = {
    works: [
      {
        id: "w",
        title: "Work",
        books: [{ id: "a", title: "Alma", chapterCount: 2, workId: "w" }],
      },
    ],
  };
  const engine = new ScriptureScroller({
    scroller,
    content,
    index,
    workId: "w",
    unloadViewportPages: 1,
    bookCache: {
      async getBook() {
        return { chapters: [] };
      },
    },
  });
  engine.work = index.works[0];
  engine.sequence = engine.buildSequence(engine.work);
  engine.loaded.set(0, removed);
  engine.loaded.set(1, visible);
  engine.userScrollSinceJump = true;

  engine.unloadFarChapters("down", 2200);

  assert.equal(scroller.scrollTop <= 2350, true);
});

test("ScriptureScroller unload anchor ignores sticky headings", () => {
  setupEnv();
  const scroller = createScroller();
  scroller.clientHeight = 1000;
  scroller.scrollTop = 2350;
  const stickyHeading = {
    getBoundingClientRect() {
      return { top: 0, bottom: 50 };
    },
  };
  const verseAnchor = {
    documentTop: 2610,
    getBoundingClientRect() {
      const top = this.documentTop - scroller.scrollTop;
      return { top, bottom: top + 40 };
    },
  };
  const removed = {
    offsetTop: 0,
    offsetHeight: 1200,
    nextElementSibling: null,
    contains(candidate) {
      return candidate === this;
    },
    remove() {
      verseAnchor.documentTop -= 1200;
    },
  };
  const visible = {
    offsetTop: 1200,
    offsetHeight: 5000,
    nextElementSibling: null,
    remove() {},
  };
  removed.nextElementSibling = visible;
  const content = createContent();
  content.querySelectorAll = (selector) => {
    if (selector === ".lab-verse") return [verseAnchor];
    if (selector === ".lab-verse, .chapter-heading") return [stickyHeading, verseAnchor];
    return [];
  };
  const index = {
    works: [
      {
        id: "w",
        title: "Work",
        books: [{ id: "a", title: "Alma", chapterCount: 2, workId: "w" }],
      },
    ],
  };
  const engine = new ScriptureScroller({
    scroller,
    content,
    index,
    workId: "w",
    unloadViewportPages: 1,
    bookCache: {
      async getBook() {
        return { chapters: [] };
      },
    },
  });
  engine.work = index.works[0];
  engine.sequence = engine.buildSequence(engine.work);
  engine.loaded.set(0, removed);
  engine.loaded.set(1, visible);
  engine.userScrollSinceJump = true;

  engine.unloadFarChapters("down", 2200);

  assert.equal(scroller.scrollTop, 1150);
  assert.equal(verseAnchor.getBoundingClientRect().top, 260);
});

