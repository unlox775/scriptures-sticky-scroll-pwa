import test from "node:test";
import assert from "node:assert/strict";
import { getNextChapterPointer } from "../../src/readerSequence.js";

const WORK = {
  id: "book-of-mormon",
  title: "Book of Mormon",
  books: [
    { id: "mosiah", title: "Mosiah", chapterCount: 2 },
    { id: "alma", title: "Alma", chapterCount: 3 },
  ],
};

test("getNextChapterPointer advances within same book", () => {
  const next = getNextChapterPointer(WORK, { bookId: "alma", chapter: 1 });
  assert.deepEqual(next, {
    workId: "book-of-mormon",
    workTitle: "Book of Mormon",
    bookId: "alma",
    bookTitle: "Alma",
    chapter: 2,
  });
});

test("getNextChapterPointer advances across book boundary", () => {
  const next = getNextChapterPointer(WORK, { bookId: "mosiah", chapter: 2 });
  assert.deepEqual(next, {
    workId: "book-of-mormon",
    workTitle: "Book of Mormon",
    bookId: "alma",
    bookTitle: "Alma",
    chapter: 1,
  });
});

test("getNextChapterPointer returns null at end of work", () => {
  const next = getNextChapterPointer(WORK, { bookId: "alma", chapter: 3 });
  assert.equal(next, null);
});
