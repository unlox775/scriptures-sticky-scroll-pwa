import "./styles.css";
import { loadIndex, BookCache } from "./data.js";
import { BookmarkStore } from "./bookmarks.js";
import { ReaderEngine } from "./readerEngine.js";

const state = {
  index: null,
  currentWork: null,
  currentBook: null,
  currentLocation: null,
  reader: null,
  deferredPrompt: null,
  lastAutoBookmarkAt: 0,
  lastAutoReference: "",
};

const viewIds = ["homeView", "booksView", "chaptersView", "historyView", "readerView"];
const homeView = document.getElementById("homeView");
const booksView = document.getElementById("booksView");
const chaptersView = document.getElementById("chaptersView");
const historyView = document.getElementById("historyView");
const readerView = document.getElementById("readerView");
const breadcrumbEl = document.getElementById("breadcrumb");
const installButton = document.getElementById("installButton");
const homeButton = document.getElementById("homeButton");
const addBookmarkButton = document.getElementById("addBookmarkButton");
const showChaptersButton = document.getElementById("showChaptersButton");
const currentReferenceEl = document.getElementById("currentReference");
const bookmarkStatusEl = document.getElementById("bookmarkStatus");
const bookmarkRibbonsEl = document.getElementById("bookmarkRibbons");
const autoScrollStart = document.getElementById("autoScrollStart");
const autoScrollPanel = document.getElementById("autoScrollPanel");
const autoScrollStop = document.getElementById("autoScrollStop");
const autoScrollSpeed = document.getElementById("autoScrollSpeed");
const autoScrollSpeedLabel = document.getElementById("autoScrollSpeedLabel");

const scroller = document.getElementById("readerScroller");
const content = document.getElementById("readerContent");

const cache = new BookCache(2);
const bookmarks = new BookmarkStore();

function setView(viewId) {
  for (const id of viewIds) {
    document.getElementById(id).hidden = id !== viewId;
  }
  addBookmarkButton.hidden = viewId !== "readerView";
}

function defaultLocationFromIndex() {
  const defaultWork = state.index.works.find((work) => work.id === "book-of-mormon") || state.index.works[0];
  const defaultBook = defaultWork.books[0];
  return {
    workId: defaultWork.id,
    workTitle: defaultWork.title,
    bookId: defaultBook.id,
    bookTitle: defaultBook.title,
    chapter: 1,
    verse: 1,
    reference: `${defaultBook.title} 1:1`,
  };
}

function formatTimestamp(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function openWork(workId) {
  state.currentWork = state.index.works.find((work) => work.id === workId) || null;
  state.currentBook = null;
  renderBooksView();
}

function openBook(bookId) {
  state.currentBook = state.currentWork.books.find((book) => book.id === bookId) || null;
  renderChaptersView();
}

async function openReader(location) {
  const work = state.index.works.find((item) => item.id === location.workId) || state.index.works[0];
  const book = work.books.find((item) => item.id === location.bookId) || work.books[0];
  const safeLocation = {
    ...location,
    workId: work.id,
    workTitle: work.title,
    bookId: book.id,
    bookTitle: book.title,
    chapter: location.chapter || 1,
    verse: location.verse || 1,
    reference: `${book.title} ${location.chapter || 1}:${location.verse || 1}`,
  };

  state.currentWork = work;
  state.currentBook = book;
  state.currentLocation = safeLocation;

  if (state.reader) state.reader.destroy();
  state.reader = new ReaderEngine({
    scroller,
    content,
    workMeta: work,
    bookCache: cache,
    onAnchorChange: handleAnchorChange,
  });
  autoScrollSpeedLabel.textContent = `${autoScrollSpeed.value} px/s`;
  state.reader.setAutoScrollSpeed(Number(autoScrollSpeed.value));
  await state.reader.open(safeLocation);
  renderBookmarkRibbons();
  setView("readerView");
  breadcrumbEl.textContent = `${work.title} > ${book.title}`;
}

function isBookmarkInView(bookmark) {
  if (!bookmark.location || !state.currentLocation) return false;
  if (bookmark.location.workId !== state.currentLocation.workId) return false;
  if (bookmark.location.bookId !== state.currentLocation.bookId) return false;
  const ch = state.currentLocation.chapter || 0;
  const bCh = bookmark.location.chapter || 0;
  return Math.abs(ch - bCh) <= 2;
}

function renderBookmarkRibbons() {
  const inView = bookmarks.getBookmarks().filter(isBookmarkInView);
  bookmarkRibbonsEl.innerHTML = inView
    .map(
      (b) =>
        `<span class="bookmark-ribbon" data-bookmark-id="${b.id}" title="${b.location?.reference || b.name}">${b.name}</span>`,
    )
    .join("");
  bookmarkRibbonsEl.querySelectorAll(".bookmark-ribbon").forEach((el) => {
    el.addEventListener("click", () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === el.dataset.bookmarkId);
      if (b?.location) openReader(b.location);
    });
  });
}

function renderHistoryView(bookmark) {
  setView("historyView");
  breadcrumbEl.textContent = `History: ${bookmark.name}`;
  const entries = bookmarks.getHistoryOnePerDay(bookmark);
  const lines =
    entries.length === 0
      ? "<p>No history yet.</p>"
      : entries.map((h) => `<div class="history-line">${h.day}: ${h.reference}</div>`).join("");
  historyView.innerHTML = `
    <section class="panel">
      <h2>${bookmark.name}</h2>
      <p>One line per day, newest first.</p>
      <div class="history-lines">${lines}</div>
      <button id="historyBackButton" class="secondary-btn">Back</button>
    </section>
  `;
  historyView.querySelector("#historyBackButton").addEventListener("click", () => {
    renderHomeView();
  });
}

function renderHomeView() {
  setView("homeView");
  breadcrumbEl.textContent = "Standard Works Reader";
  const works = state.index.works
    .map(
      (work) => `
      <article class="card">
        <h3>${work.title}</h3>
        <p>${work.books.length} books</p>
        <button data-open-work="${work.id}">Browse</button>
      </article>
    `,
    )
    .join("");

  const bookmarkItems = bookmarks
    .getBookmarks()
    .map(
      (bookmark) => `
      <article class="bookmark-item">
        <div>
          <strong>${bookmark.name}</strong>
          <div class="bookmark-meta">${bookmark.location?.reference || "No location yet"}</div>
        </div>
        <div class="bookmark-actions">
          <button data-view-history="${bookmark.id}">View History</button>
          <button data-open-bookmark="${bookmark.id}">Open</button>
        </div>
      </article>`,
    )
    .join("");

  homeView.innerHTML = `
    <section class="panel">
      <h2>Scripture Collections</h2>
      <div class="grid works">${works}</div>
    </section>
    <section class="panel" style="margin-top: 1rem;">
      <h2>Bookmarks</h2>
      <p>Scroll slowly and a bookmark at your location will auto-follow. Tap to open.</p>
      <div class="bookmark-list">${bookmarkItems}</div>
    </section>
  `;

  homeView.querySelectorAll("[data-open-work]").forEach((btn) => {
    btn.addEventListener("click", () => openWork(btn.dataset.openWork));
  });
  homeView.querySelectorAll("[data-view-history]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === btn.dataset.viewHistory);
      if (b) renderHistoryView(b);
    });
  });
  homeView.querySelectorAll("[data-open-bookmark]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === btn.dataset.openBookmark);
      if (!b) return;
      const loc = b.location || defaultLocationFromIndex();
      await openReader(loc);
    });
  });
}

function renderBooksView() {
  setView("booksView");
  if (!state.currentWork) {
    renderHomeView();
    return;
  }
  breadcrumbEl.textContent = `${state.currentWork.title} > Books`;
  const booksHtml = state.currentWork.books
    .map(
      (book) => `
        <article class="card">
          <h3>${book.title}</h3>
          <p>${book.chapterCount} chapters</p>
          <button data-open-book="${book.id}">Chapters</button>
        </article>
      `,
    )
    .join("");

  booksView.innerHTML = `
    <section class="panel">
      <h2>${state.currentWork.title}</h2>
      <div class="grid books">${booksHtml}</div>
    </section>
  `;

  booksView.querySelectorAll("[data-open-book]").forEach((btn) => {
    btn.addEventListener("click", () => openBook(btn.dataset.openBook));
  });
}

function renderChaptersView() {
  setView("chaptersView");
  if (!state.currentWork || !state.currentBook) {
    renderBooksView();
    return;
  }
  breadcrumbEl.textContent = `${state.currentWork.title} > ${state.currentBook.title} > Chapters`;
  const chapterButtons = Array.from({ length: state.currentBook.chapterCount }, (_, i) => i + 1)
    .map((ch) => `<button class="secondary-btn" data-open-chapter="${ch}">${ch}</button>`)
    .join("");

  chaptersView.innerHTML = `
    <section class="panel">
      <h2>${state.currentBook.title}</h2>
      <p>Tap a chapter tile to enter continuous reading mode.</p>
      <div class="grid chapters">${chapterButtons}</div>
    </section>
  `;

  chaptersView.querySelectorAll("[data-open-chapter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await openReader({
        workId: state.currentWork.id,
        workTitle: state.currentWork.title,
        bookId: state.currentBook.id,
        bookTitle: state.currentBook.title,
        chapter: Number(btn.dataset.openChapter),
        verse: 1,
        reference: `${state.currentBook.title} ${btn.dataset.openChapter}:1`,
      });
    });
  });
}

function shouldAutoFollow(anchor, meta) {
  const speed = Math.abs(meta.velocity);
  const now = meta.timestamp;
  if (speed < 8 || speed > 3800) return false;
  if (anchor.reference === state.lastAutoReference && now - state.lastAutoBookmarkAt < 2200) return false;
  if (now - state.lastAutoBookmarkAt < 1200) return false;
  return true;
}

function handleAnchorChange(anchor, meta) {
  currentReferenceEl.textContent = `Reference: ${anchor.reference}`;
  state.currentLocation = anchor;
  renderBookmarkRibbons();

  const toFollow = bookmarks.getBookmarkToFollow(anchor);
  if (!toFollow) {
    bookmarkStatusEl.textContent = "";
    return;
  }
  if (shouldAutoFollow(anchor, meta)) {
    bookmarks.updateBookmarkLocation(toFollow.id, anchor, meta.autoScrolling ? "auto-scroll" : "scroll");
    state.lastAutoBookmarkAt = meta.timestamp;
    state.lastAutoReference = anchor.reference;
    bookmarkStatusEl.textContent = `${toFollow.name} updated`;
  } else {
    bookmarkStatusEl.textContent = "";
  }
}

function wireGlobalEvents() {
  homeButton.addEventListener("click", () => {
    if (state.reader) state.reader.stopAutoScroll();
    autoScrollPanel.hidden = true;
    autoScrollStart.hidden = false;
    renderHomeView();
  });

  addBookmarkButton.addEventListener("click", () => {
    const name = window.prompt("Bookmark name:", "Reading Plan");
    if (!name?.trim()) return;
    const b = bookmarks.createBookmark(name.trim());
    if (state.currentLocation) {
      bookmarks.updateBookmarkLocation(b.id, state.currentLocation, "manual");
    }
    renderBookmarkRibbons();
    if (!homeView.hidden) renderHomeView();
  });

  showChaptersButton.addEventListener("click", () => {
    if (state.reader) state.reader.stopAutoScroll();
    autoScrollPanel.hidden = true;
    autoScrollStart.hidden = false;
    renderChaptersView();
  });

  autoScrollStart.addEventListener("click", () => {
    if (!state.reader) return;
    state.reader.startAutoScroll();
    autoScrollPanel.hidden = false;
    autoScrollStart.hidden = true;
  });

  autoScrollStop.addEventListener("click", () => {
    if (!state.reader) return;
    state.reader.stopAutoScroll();
    autoScrollPanel.hidden = true;
    autoScrollStart.hidden = false;
  });

  autoScrollSpeed.addEventListener("input", () => {
    const speed = Number(autoScrollSpeed.value);
    autoScrollSpeedLabel.textContent = `${speed} px/s`;
    if (state.reader) state.reader.setAutoScrollSpeed(speed);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const swUrl = base.endsWith("/") ? `${base}sw.js` : `${base}/sw.js`;
  await navigator.serviceWorker.register(swUrl, { scope: base });
}

async function init() {
  state.index = await loadIndex();
  wireGlobalEvents();
  renderHomeView();
  await registerServiceWorker();
}

init().catch((err) => {
  homeView.innerHTML = `<section class="panel"><h2>Failed to load app</h2><pre>${err.message}</pre></section>`;
});
