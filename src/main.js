import "./styles.css";
import { loadIndex, BookCache } from "./data.js";
import { BookmarkStore } from "./bookmarks.js";
import { ReaderEngine } from "./readerEngine.js";
import { logEvent, getLogsForCopy, getAllSessions, getEntriesForSession, setOnLogCallback, isDevMode } from "./logger.js";
import { stateToRoute, parseRoute, pushRoute, saveRouteToStorage, loadRouteFromStorage } from "./stateRouting.js";

const state = {
  index: null,
  currentWork: null,
  currentBook: null,
  currentLocation: null,
  reader: null,
  deferredPrompt: null,
  lastAutoBookmarkAt: 0,
  lastAutoReference: "",
  lastChapterRef: "",
  velocitySamples: [],
  autoScrollActive: false,
};

const viewIds = ["homeView", "booksView", "chaptersView", "historyView", "readerView"];
const homeView = document.getElementById("homeView");
const booksView = document.getElementById("booksView");
const chaptersView = document.getElementById("chaptersView");
const historyView = document.getElementById("historyView");
const readerView = document.getElementById("readerView");
const headerTitleEl = document.getElementById("headerTitle");
const installButton = document.getElementById("installButton");
const homeButton = document.getElementById("homeButton");
const backButton = document.getElementById("backButton");
const addBookmarkButton = document.getElementById("addBookmarkButton");
const moveBookmarkButton = document.getElementById("moveBookmarkButton");
const readerStatusEl = document.getElementById("readerStatus");
const bookmarkStatusEl = document.getElementById("bookmarkStatus");
const bookmarkRibbonsEl = document.getElementById("bookmarkRibbons");
const readerRibbonsOverlay = document.getElementById("readerRibbonsOverlay");
const autoScrollStart = document.getElementById("autoScrollStart");
const autoScrollPanel = document.getElementById("autoScrollPanel");
const autoScrollStop = document.getElementById("autoScrollStop");
const autoScrollSpeed = document.getElementById("autoScrollSpeed");
const autoScrollSpeedLabel = document.getElementById("autoScrollSpeedLabel");

const scroller = document.getElementById("readerScroller");
const content = document.getElementById("readerContent");

const cache = new BookCache(2);
const bookmarks = new BookmarkStore();

let installCanShow = false;

/**
 * UI/domain event wrapper that emits structured telemetry envelopes.
 * Keeping this in one place makes module-level instrumentation consistent.
 */
function uiEvent({
  module,
  event,
  summary,
  refs,
  metrics,
  details,
  level = "debug",
  devOnly = false,
}) {
  if (devOnly && !isDevMode()) {
    return;
  }
  logEvent({ level, module, event, summary, refs, metrics, details });
}

function getStructuredEnvelope(details) {
  if (!details || typeof details !== "object") {
    return null;
  }
  if (typeof details.module !== "string" || typeof details.event !== "string") {
    return null;
  }
  return details;
}

function updateInstallVisibility(viewId) {
  installButton.hidden = !installCanShow || viewId !== "homeView";
}

function pushRouteAndSave(route) {
  pushRoute(route);
  saveRouteToStorage(route);
}

function setView(viewId) {
  for (const id of viewIds) {
    document.getElementById(id).hidden = id !== viewId;
  }
  const app = document.getElementById("app");
  if (app) app.classList.toggle("reader-active", viewId === "readerView");
  const inReader = viewId === "readerView";
  addBookmarkButton.hidden = !inReader;
  moveBookmarkButton.hidden = !inReader;
  autoScrollStart.hidden = !inReader;
  if (inReader) {
    autoScrollStart.textContent = state.autoScrollActive ? "Stop" : "Auto-scroll";
    autoScrollPanel.hidden = !state.autoScrollActive;
  } else {
    autoScrollPanel.hidden = true;
  }
  updateHeader(viewId);
  updateInstallVisibility(viewId);
  updateDevEasterEggVisibility();
}

function stopAutoScrollAndUpdateUI() {
  if (state.reader) state.reader.stopAutoScroll();
  state.autoScrollActive = false;
  autoScrollPanel.hidden = true;
  autoScrollStart.textContent = "Auto-scroll";
}

function updateHeader(viewId) {
  homeButton.hidden = viewId === "homeView";
  backButton.hidden = viewId === "homeView" || viewId === "booksView";
  switch (viewId) {
    case "homeView":
      headerTitleEl.textContent = "Standard Works Reader";
      break;
    case "booksView":
      headerTitleEl.textContent = state.currentWork?.title ?? "Standard Works Reader";
      break;
    case "chaptersView":
      headerTitleEl.textContent = state.currentBook?.title ?? "";
      break;
    case "readerView":
      headerTitleEl.textContent = state.currentLocation
        ? `${state.currentBook?.title ?? ""} ${state.currentLocation.chapter ?? 1}`
        : "";
      break;
    case "historyView":
      headerTitleEl.textContent = state.historyBookmarkName ?? "History";
      break;
    default:
      headerTitleEl.textContent = "Standard Works Reader";
  }
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
  pushRouteAndSave(`#/w/${workId}`);
  uiEvent({
    level: "info",
    module: "ui.homeView",
    event: "home_open_work_click",
    summary: "Opened work from home view",
    refs: { workId },
  });
  renderBooksView();
}

function openBook(bookId) {
  state.currentBook = state.currentWork.books.find((book) => book.id === bookId) || null;
  pushRouteAndSave(`#/b/${state.currentWork.id}/${bookId}`);
  renderChaptersView();
  uiEvent({
    level: "info",
    module: "ui.booksView",
    event: "books_open_book_click",
    summary: "Opened book from books view",
    refs: { workId: state.currentWork?.id, bookId },
    details: { title: state.currentBook?.title },
  });
}

async function openReader(location) {
  const startedAt = performance.now();
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
  state.lastChapterRef = "";
  uiEvent({
    level: "info",
    module: "ui.readerView",
    event: "reader_open_start",
    summary: "Opening reader at location",
    refs: {
      workId: safeLocation.workId,
      bookId: safeLocation.bookId,
      chapter: safeLocation.chapter,
      verse: safeLocation.verse,
    },
    details: { reference: safeLocation.reference },
  });

  setView("readerView");
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
  pushRouteAndSave(stateToRoute(state));
  requestAnimationFrame(() => requestAnimationFrame(renderBookmarkRibbons));
  uiEvent({
    level: "info",
    module: "ui.readerView",
    event: "reader_open_ready",
    summary: "Reader opened and anchored",
    refs: { workId: work.id, bookId: book.id, chapter: safeLocation.chapter, verse: safeLocation.verse },
    metrics: { elapsedMs: Math.round(performance.now() - startedAt) },
    details: { reference: safeLocation.reference },
  });
}

function isBookmarkInView(bookmark) {
  if (!bookmark.location || !state.currentLocation) return false;
  if (bookmark.location.workId !== state.currentLocation.workId) return false;
  if (bookmark.location.bookId !== state.currentLocation.bookId) return false;
  const ch = state.currentLocation.chapter || 0;
  const bCh = bookmark.location.chapter || 0;
  return Math.abs(ch - bCh) <= 3;
}

function renderBookmarkRibbons() {
  const inView = bookmarks.getBookmarks().filter(isBookmarkInView);
  if (!readerRibbonsOverlay || !scroller) return;

  const scrollerRect = scroller.getBoundingClientRect();
  const items = [];

  for (const b of inView) {
    const loc = b.location;
    if (!loc) continue;
    const bookId = loc.bookId;
    const chapter = String(loc.chapter || 1);
    const verse = String(loc.verse || 1);
    const verseEl = content.querySelector(
      `.verse[data-book-id="${CSS.escape(bookId)}"][data-chapter="${chapter}"][data-verse="${verse}"]`,
    );
    if (!verseEl) continue;
    const verseRect = verseEl.getBoundingClientRect();
    const top = verseRect.top - scrollerRect.top + verseRect.height / 2;
    if (top < -20 || top > scrollerRect.height + 20) continue;
    items.push({
      b,
      top,
    });
  }

  readerRibbonsOverlay.innerHTML = items
    .map(
      ({ b, top }) =>
        `<span class="bookmark-ribbon" data-bookmark-id="${b.id}" title="${(b.location?.reference || b.name).replace(/"/g, "&quot;")}" style="top: ${Math.round(top)}px">${escapeHtml(b.name)}</span>`,
    )
    .join("");

  readerRibbonsOverlay.querySelectorAll(".bookmark-ribbon").forEach((el) => {
    el.addEventListener("click", () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === el.dataset.bookmarkId);
      if (b?.location) openReader(b.location);
    });
  });
}

function escapeHtml(value) {
  if (typeof value !== "string") return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHistoryView(bookmark) {
  const startedAt = performance.now();
  state.historyBookmarkName = `History: ${bookmark.name}`;
  setView("historyView");
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
  uiEvent({
    level: "debug",
    module: "ui.historyView",
    event: "history_render_done",
    summary: "Rendered history view for bookmark",
    refs: { bookmarkId: bookmark.id },
    metrics: { rows: entries.length, elapsedMs: Math.round(performance.now() - startedAt) },
    details: { bookmarkName: bookmark.name },
    devOnly: true,
  });
  historyView.querySelector("#historyBackButton").addEventListener("click", () => {
    uiEvent({
      level: "debug",
      module: "ui.historyView",
      event: "history_back_click",
      summary: "Returned from history view to home",
      refs: { bookmarkId: bookmark.id },
      devOnly: true,
    });
    renderHomeView();
  });
}

function renderHomeView() {
  const startedAt = performance.now();
  setView("homeView");
  const works = state.index.works
    .map(
      (work) => `
      <article class="card card-clickable" data-open-work="${work.id}">
        <h3>${work.title}</h3>
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
      <div class="grid works">${works}</div>
    </section>
    <section class="panel" style="margin-top: 1rem;">
      <h2>Bookmarks</h2>
      <p>Scroll slowly and a bookmark at your location will auto-follow. Tap to open.</p>
      <div class="bookmark-list">${bookmarkItems}</div>
    </section>
  `;
  uiEvent({
    level: "debug",
    module: "ui.homeView",
    event: "home_render_done",
    summary: "Rendered home view",
    metrics: {
      works: state.index.works.length,
      bookmarks: bookmarks.getBookmarks().length,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
    devOnly: true,
  });

  homeView.querySelectorAll("[data-open-work]").forEach((el) => {
    el.addEventListener("click", () => {
      const workId = el.dataset.openWork;
      const work = state.index.works.find((w) => w.id === workId);
      state.currentWork = work ?? null;
      if (work?.books?.length === 1) {
        openBook(work.books[0].id);
      } else {
        openWork(workId);
      }
    });
  });
  homeView.querySelectorAll("[data-view-history]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === btn.dataset.viewHistory);
      if (b) {
        uiEvent({
          level: "info",
          module: "ui.homeView",
          event: "home_view_history_click",
          summary: "Opened bookmark history from home",
          refs: { bookmarkId: b.id },
          details: { bookmarkName: b.name },
        });
        renderHistoryView(b);
      }
    });
  });
  homeView.querySelectorAll("[data-open-bookmark]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const b = bookmarks.getBookmarks().find((x) => x.id === btn.dataset.openBookmark);
      if (!b) return;
      const loc = b.location || defaultLocationFromIndex();
      uiEvent({
        level: "info",
        module: "ui.homeView",
        event: "home_open_bookmark_click",
        summary: "Opened bookmark from home",
        refs: { bookmarkId: b.id },
        details: { bookmarkName: b.name, reference: loc.reference },
      });
      await openReader(loc);
    });
  });
}

function renderBooksView() {
  const startedAt = performance.now();
  setView("booksView");
  if (!state.currentWork) {
    renderHomeView();
    return;
  }
  const booksHtml = state.currentWork.books
    .map(
      (book) => `
        <article class="card card-clickable" data-open-book="${book.id}">
          <h3>${book.title}</h3>
        </article>
      `,
    )
    .join("");

  booksView.innerHTML = `
    <section class="panel">
      <div class="grid books">${booksHtml}</div>
    </section>
  `;
  uiEvent({
    level: "debug",
    module: "ui.booksView",
    event: "books_render_done",
    summary: "Rendered books view for selected work",
    refs: { workId: state.currentWork.id },
    metrics: {
      books: state.currentWork.books.length,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
    devOnly: true,
  });

  booksView.querySelectorAll("[data-open-book]").forEach((el) => {
    el.addEventListener("click", () => openBook(el.dataset.openBook));
  });
}

function renderChaptersView() {
  const startedAt = performance.now();
  setView("chaptersView");
  if (!state.currentWork || !state.currentBook) {
    renderBooksView();
    return;
  }
  const chapterButtons = Array.from({ length: state.currentBook.chapterCount }, (_, i) => i + 1)
    .map((ch) => `<button class="chapter-tile" data-open-chapter="${ch}">${ch}</button>`)
    .join("");

  chaptersView.innerHTML = `
    <section class="panel">
      <p class="chapter-hint">Tap a chapter tile to enter continuous reading mode.</p>
      <div class="grid chapters">${chapterButtons}</div>
    </section>
  `;
  uiEvent({
    level: "debug",
    module: "ui.chaptersView",
    event: "chapters_render_done",
    summary: "Rendered chapter grid",
    refs: { workId: state.currentWork.id, bookId: state.currentBook.id },
    metrics: {
      chapterCount: state.currentBook.chapterCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
    devOnly: true,
  });

  chaptersView.querySelectorAll("[data-open-chapter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const chapter = Number(btn.dataset.openChapter);
      uiEvent({
        level: "info",
        module: "ui.chaptersView",
        event: "chapters_open_chapter_click",
        summary: "Opened reader from chapter grid",
        refs: { workId: state.currentWork?.id, bookId: state.currentBook?.id, chapter },
      });
      await openReader({
        workId: state.currentWork.id,
        workTitle: state.currentWork.title,
        bookId: state.currentBook.id,
        bookTitle: state.currentBook.title,
        chapter,
        verse: 1,
        reference: `${state.currentBook.title} ${chapter}:1`,
      });
    });
  });
}

const VELOCITY_WINDOW_MS = 30_000;
const SLOW_READING_THRESHOLD = 150;

function getAverageVelocityOverWindow() {
  const now = Date.now();
  const cutoff = now - VELOCITY_WINDOW_MS;
  state.velocitySamples = state.velocitySamples.filter((s) => s.ts >= cutoff);
  if (state.velocitySamples.length === 0) return 0;
  const sum = state.velocitySamples.reduce((a, s) => a + Math.abs(s.v), 0);
  return sum / state.velocitySamples.length;
}

function shouldAutoFollow(anchor, meta) {
  const speed = Math.abs(meta.velocity);
  const now = meta.timestamp;
  state.velocitySamples.push({ v: meta.velocity, ts: now });
  const avg = getAverageVelocityOverWindow();
  if (isDevMode() && avg > SLOW_READING_THRESHOLD) {
    uiEvent({
      level: "debug",
      module: "domain.bookmarks",
      event: "bookmark_follow_skipped",
      summary: "Skipped auto-follow because reading speed is too high",
      refs: { reference: anchor.reference },
      metrics: { avgVelocity: Number(avg.toFixed(1)), threshold: SLOW_READING_THRESHOLD },
      details: { reason: "scrolled too fast" },
      devOnly: true,
    });
  }
  if (avg > SLOW_READING_THRESHOLD) return false;
  if (anchor.reference === state.lastAutoReference && now - state.lastAutoBookmarkAt < 2200) return false;
  if (now - state.lastAutoBookmarkAt < 1200) return false;
  return true;
}

function handleAnchorChange(anchor, meta) {
  state.currentLocation = anchor;
  const chapterRef = anchor ? `${anchor.bookTitle ?? ""} ${anchor.chapter ?? 1}` : "";
  if (chapterRef && chapterRef !== state.lastChapterRef) {
    state.lastChapterRef = chapterRef;
    if (isDevMode()) {
      uiEvent({
        level: "debug",
        module: "ui.readerView",
        event: "reader_chapter_change",
        summary: "Reader chapter context changed",
        refs: {
          workId: anchor.workId,
          bookId: anchor.bookId,
          chapter: anchor.chapter,
        },
        details: { chapterRef, fullRef: anchor.reference },
        devOnly: true,
      });
    }
  }
  if (!readerView.hidden) updateHeader("readerView");
  pushRoute(stateToRoute(state));
  renderBookmarkRibbons();
  if (isDevMode()) {
    uiEvent({
      level: "debug",
      module: "domain.readerEngine",
      event: "reader_anchor_change",
      summary: "Anchor changed from viewport probe",
      refs: {
        workId: anchor?.workId,
        bookId: anchor?.bookId,
        chapter: anchor?.chapter,
        verse: anchor?.verse,
      },
      metrics: {
        velocity: Number(meta?.velocity?.toFixed(1)),
        avgVelocity: Number(getAverageVelocityOverWindow().toFixed(1)),
        autoScroll: Boolean(meta?.autoScrolling),
      },
      details: { reference: anchor?.reference },
      devOnly: true,
    });
  }

  const toFollow = bookmarks.getBookmarkToFollow(anchor);
  if (!toFollow) {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    return;
  }
  if (shouldAutoFollow(anchor, meta)) {
    bookmarks.updateBookmarkLocation(toFollow.id, anchor, meta.autoScrolling ? "auto-scroll" : "scroll");
    state.lastAutoBookmarkAt = meta.timestamp;
    state.lastAutoReference = anchor.reference;
    bookmarkStatusEl.textContent = `${toFollow.name} updated`;
    readerStatusEl.hidden = false;
    if (isDevMode()) {
      uiEvent({
        level: "debug",
        module: "domain.bookmarks",
        event: "bookmark_auto_follow_update",
        summary: "Auto-follow updated bookmark location",
        refs: { bookmarkId: toFollow.id },
        details: {
          bookmarkName: toFollow.name,
          reference: anchor.reference,
          source: meta.autoScrolling ? "auto-scroll" : "scroll",
        },
        devOnly: true,
      });
    }
  } else {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
  }
}

function wireGlobalEvents() {
  homeButton.addEventListener("click", () => {
    stopAutoScrollAndUpdateUI();
    pushRouteAndSave("#/");
    renderHomeView();
    uiEvent({
      level: "info",
      module: "ui.readerView",
      event: "reader_home_click",
      summary: "Navigated home from header",
    });
  });

  addBookmarkButton.addEventListener("click", () => {
    if (state.autoScrollActive) stopAutoScrollAndUpdateUI();
    const name = window.prompt("Bookmark name:", "Reading Plan");
    if (!name?.trim()) return;
    const b = bookmarks.createBookmark(name.trim());
    if (state.currentLocation) {
      bookmarks.updateBookmarkLocation(b.id, state.currentLocation, "manual");
    }
    renderBookmarkRibbons();
    if (!homeView.hidden) renderHomeView();
  });

  moveBookmarkButton.addEventListener("click", () => {
    if (state.autoScrollActive) stopAutoScrollAndUpdateUI();
    const list = bookmarks.getBookmarks();
    if (list.length === 0) {
      bookmarkStatusEl.textContent = "No bookmarks to move";
      return;
    }
    if (!state.currentLocation) {
      bookmarkStatusEl.textContent = "No current location";
      uiEvent({
        level: "debug",
        module: "ui.readerView",
        event: "bookmark_move_skipped",
        summary: "Skipped move bookmark because no current location is available",
        details: { reason: "no-current-location" },
        devOnly: true,
      });
      return;
    }
    if (list.length === 1) {
      bookmarks.updateBookmarkLocation(list[0].id, state.currentLocation, "manual");
      bookmarkStatusEl.textContent = `Moved ${list[0].name} to ${state.currentLocation.reference}`;
      readerStatusEl.hidden = false;
      renderBookmarkRibbons();
      return;
    }
    const picker = document.createElement("div");
    picker.className = "move-bookmark-picker";
    picker.innerHTML = `<p>Move which bookmark to ${escapeHtml(state.currentLocation.reference)}?</p>`;
    const btnWrap = document.createElement("div");
    btnWrap.className = "move-bookmark-buttons";
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = "secondary-btn";
      btn.textContent = b.name;
      btn.addEventListener("click", () => {
        bookmarks.updateBookmarkLocation(b.id, state.currentLocation, "manual");
        bookmarkStatusEl.textContent = `Moved ${b.name} to ${state.currentLocation.reference}`;
        readerStatusEl.hidden = false;
        picker.remove();
        renderBookmarkRibbons();
      });
      btnWrap.append(btn);
    }
    const cancel = document.createElement("button");
    cancel.className = "secondary-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => picker.remove());
    btnWrap.append(cancel);
    picker.append(btnWrap);
    picker.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:100;";
    picker.querySelector("p").style.cssText = "background:#fff;padding:1rem;border-radius:0.5rem;margin:0 0 0.5rem;";
    btnWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5rem;background:#fff;padding:1rem;border-radius:0.5rem;";
    document.body.append(picker);
    picker.addEventListener("click", (e) => {
      if (e.target === picker) picker.remove();
    });
  });

  backButton.addEventListener("click", () => {
    stopAutoScrollAndUpdateUI();
    if (!readerView.hidden) {
      pushRouteAndSave(`#/b/${state.currentWork?.id || ""}/${state.currentBook?.id || ""}`);
      renderChaptersView();
      uiEvent({
        level: "info",
        module: "ui.readerView",
        event: "reader_back_to_chapters",
        summary: "Navigated back from reader to chapter tiles",
        refs: { workId: state.currentWork?.id, bookId: state.currentBook?.id },
      });
    } else if (!chaptersView.hidden) {
      pushRouteAndSave(`#/w/${state.currentWork?.id || ""}`);
      renderBooksView();
      uiEvent({
        level: "info",
        module: "ui.chaptersView",
        event: "chapters_back_to_books",
        summary: "Navigated back from chapter tiles to books",
        refs: { workId: state.currentWork?.id },
      });
    } else if (!booksView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
      uiEvent({
        level: "info",
        module: "ui.booksView",
        event: "books_back_to_home",
        summary: "Navigated back from books view to home",
      });
    } else if (!historyView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
      uiEvent({
        level: "info",
        module: "ui.historyView",
        event: "history_back_to_home",
        summary: "Navigated back from history view to home",
      });
    }
  });

  autoScrollStart.addEventListener("click", () => {
    if (!state.reader) return;
    if (state.autoScrollActive) {
      stopAutoScrollAndUpdateUI();
      uiEvent({
        level: "info",
        module: "ui.readerView",
        event: "reader_autoscroll_stop",
        summary: "Stopped auto-scroll from toggle button",
      });
      return;
    }
    state.reader.startAutoScroll();
    state.autoScrollActive = true;
    autoScrollPanel.hidden = false;
    autoScrollStart.textContent = "Stop";
    uiEvent({
      level: "info",
      module: "ui.readerView",
      event: "reader_autoscroll_start",
      summary: "Started auto-scroll",
      metrics: { speed: Number(autoScrollSpeed.value) },
    });
  });

  autoScrollStop.addEventListener("click", () => {
    if (!state.reader) return;
    stopAutoScrollAndUpdateUI();
    uiEvent({
      level: "info",
      module: "ui.readerView",
      event: "reader_autoscroll_stop",
      summary: "Stopped auto-scroll from stop button",
    });
  });

  autoScrollSpeed.addEventListener("input", () => {
    const speed = Number(autoScrollSpeed.value);
    autoScrollSpeedLabel.textContent = `${speed} px/s`;
    if (state.reader) state.reader.setAutoScrollSpeed(speed);
    if (isDevMode()) {
      uiEvent({
        level: "debug",
        module: "ui.readerView",
        event: "reader_autoscroll_speed_change",
        summary: "Changed auto-scroll speed",
        metrics: { speed },
        devOnly: true,
      });
    }
  });

  function isStandaloneOrDesktopInstall() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://")
    );
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    installButton.textContent = "Install";
    uiEvent({
      level: "debug",
      module: "ui.appShell",
      event: "install_prompt_available",
      summary: "Install prompt became available",
      devOnly: true,
    });
    if (!isStandaloneOrDesktopInstall()) {
      installCanShow = true;
      const viewId = viewIds.find((id) => !document.getElementById(id).hidden) || "homeView";
      updateInstallVisibility(viewId);
    }
  });

  if (isIOS() && !isStandaloneOrDesktopInstall()) {
    installButton.textContent = "Add to Home Screen";
    installCanShow = true;
    const viewId = viewIds.find((id) => !document.getElementById(id).hidden) || "homeView";
    updateInstallVisibility(viewId);
  }

  installButton.addEventListener("click", async () => {
    if (state.deferredPrompt) {
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      installButton.hidden = true;
      uiEvent({
        level: "info",
        module: "ui.appShell",
        event: "install_prompt_accepted",
        summary: "User accepted install prompt",
      });
      return;
    }
    if (isIOS()) {
      const msg = "To add this app to your home screen:\n\n1. Tap the Share button (square with arrow) at the bottom of the screen\n2. Scroll and tap \"Add to Home Screen\"\n3. Tap Add";
      alert(msg);
      uiEvent({
        level: "info",
        module: "ui.appShell",
        event: "install_ios_instructions_shown",
        summary: "Displayed iOS install instructions",
      });
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const swUrl = base.endsWith("/") ? `${base}sw.js` : `${base}/sw.js`;
  await navigator.serviceWorker.register(swUrl, { scope: base });
  uiEvent({
    level: "debug",
    module: "ui.appShell",
    event: "service_worker_registered",
    summary: "Service worker registered successfully",
    refs: { scope: base, swUrl },
    devOnly: true,
  });
}

function wireScrollerRibbonUpdates() {
  let rafId = null;
  scroller.addEventListener(
    "scroll",
    () => {
      if (readerView.hidden) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        renderBookmarkRibbons();
      });
    },
    { passive: true },
  );
}

function updateDevEasterEggVisibility() {
  const egg = document.getElementById("devEasterEgg");
  if (!egg) return;
  egg.hidden = document.getElementById("homeView").hidden || isDevMode();
  if (isDevMode() && document.getElementById("devBugIcon")) {
    document.getElementById("devBugIcon").hidden = false;
  }
}

const STORAGE_LABELS = {
  "scripture-pwa-bookmarks-v1": "Bookmarks",
  "scripture-pwa-route-v1": "Route",
  "scripture-pwa-dev-mode-v1": "Developer Mode",
  "scripture-pwa-logs-v1": "Legacy Logs",
};

function formatStorageValue(raw) {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function renderStoragePanel(container) {
  if (!container) return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  const legacyKey = "scripture-pwa-logs-v1";
  keys.sort((a, b) => {
    if (a === legacyKey) return 1;
    if (b === legacyKey) return -1;
    return a.localeCompare(b);
  });
  const parts = keys.map((k) => {
    const v = localStorage.getItem(k);
    const label = STORAGE_LABELS[k] ?? k;
    const pretty = v != null ? formatStorageValue(v) : "[empty]";
    return `<section class="dev-storage-section"><h4 class="dev-storage-header">${escapeHtml(label)}</h4><pre class="dev-storage-pre">${escapeHtml(pretty)}</pre></section>`;
  });
  container.innerHTML = parts.length ? parts.join("\n") : "<p>No localStorage keys.</p>";
}

async function loadLogSessionsAndRender(selectEl, entriesEl, copyBtn) {
  const sessions = await getAllSessions();
  selectEl.innerHTML = sessions.length === 0
    ? '<option value="">No sessions</option>'
    : sessions.map((s) => `<option value="${escapeHtml(s.id)}">${new Date(s.startedAt).toLocaleString()}</option>`).join("");
  const first = sessions[0] ?? null;
  selectEl.value = first?.id ?? "";
  await renderLogEntries(first?.id ?? null, entriesEl);
  selectEl.dataset.sessions = JSON.stringify(sessions);
}

async function renderLogEntries(sessionId, container) {
  if (!container) return;
  if (!sessionId) {
    container.innerHTML = "<p>No session selected.</p>";
    return;
  }
  const entries = await getEntriesForSession(sessionId);
  if (entries.length === 0) {
    container.innerHTML = "<p>No entries for this session.</p>";
    return;
  }
  container.innerHTML = entries
    .map((e) => {
      const envelope = getStructuredEnvelope(e.details);
      const moduleBadge = envelope?.module ? `<span class="dev-log-level">${escapeHtml(envelope.module)}</span>` : "";
      const eventBadge = envelope?.event ? `<span class="dev-log-level">${escapeHtml(envelope.event)}</span>` : "";
      const details = e.details
        ? `<code class="dev-log-details">${escapeHtml(typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 2))}</code>`
        : "";
      return `<article class="dev-log-entry level-${e.level}"><header><span class="dev-log-message">${escapeHtml(e.message)}</span><span class="dev-log-meta"><span class="dev-log-level">${e.level.toUpperCase()}</span>${moduleBadge}${eventBadge} <time>${new Date(e.timestamp).toLocaleString()}</time></span></header>${details}</article>`;
    })
    .join("");
}

function wireDeveloperMode() {
  const egg = document.getElementById("devEasterEgg");
  const bugIcon = document.getElementById("devBugIcon");
  const drawer = document.getElementById("devDrawer");
  const storageContent = document.getElementById("devStorageContent");
  const logsPanel = document.getElementById("devLogsPanel");
  const storagePanel = document.getElementById("devStoragePanel");
  const copyBtn = document.getElementById("devCopyLogs");
  const logEntries = document.getElementById("devLogEntries");
  const logSelect = document.getElementById("devLogSessionSelect");
  const logPrev = document.getElementById("devLogPrev");
  const logNext = document.getElementById("devLogNext");
  let eggTapCount = 0;
  let eggTapResetTimer = null;

  if (isDevMode()) {
    if (bugIcon) bugIcon.hidden = false;
  }
  egg?.addEventListener("click", () => {
    if (isDevMode()) {
      return;
    }
    eggTapCount += 1;
    if (eggTapResetTimer) {
      clearTimeout(eggTapResetTimer);
    }
    eggTapResetTimer = setTimeout(() => {
      eggTapCount = 0;
      eggTapResetTimer = null;
    }, 3000);
    if (eggTapCount >= 10) {
      eggTapCount = 0;
      clearTimeout(eggTapResetTimer);
      eggTapResetTimer = null;
      setDevMode(true);
      if (bugIcon) bugIcon.hidden = false;
      if (egg) egg.hidden = true;
      uiEvent({
        level: "info",
        module: "ui.devDrawer",
        event: "dev_mode_enabled",
        summary: "Enabled developer mode from easter egg",
      });
    }
  });

  const sessionControls = document.getElementById("devLogSessionControls");

  function showStorage() {
    renderStoragePanel(storageContent);
    storagePanel.hidden = false;
    logsPanel.hidden = true;
    if (sessionControls) sessionControls.hidden = true;
  }

  async function showLogs() {
    storagePanel.hidden = true;
    logsPanel.hidden = false;
    if (sessionControls) sessionControls.hidden = false;
    await loadLogSessionsAndRender(logSelect, logEntries, copyBtn);
    updatePrevNextButtons();
  }

  bugIcon?.addEventListener("click", () => {
    if (drawer.hidden) {
      drawer.hidden = false;
      uiEvent({
        level: "debug",
        module: "ui.devDrawer",
        event: "debug_drawer_open",
        summary: "Opened debug drawer",
        devOnly: true,
      });
      const tab = document.querySelector(".dev-tab.active")?.dataset.tab || "storage";
      if (tab === "storage") showStorage();
      else void showLogs();
    } else {
      drawer.hidden = true;
      uiEvent({
        level: "debug",
        module: "ui.devDrawer",
        event: "debug_drawer_close",
        summary: "Closed debug drawer",
        devOnly: true,
      });
    }
  });

  document.getElementById("devDrawerClose")?.addEventListener("click", () => {
    drawer.hidden = true;
    uiEvent({
      level: "debug",
      module: "ui.devDrawer",
      event: "debug_drawer_close",
      summary: "Closed debug drawer from close button",
      devOnly: true,
    });
  });

  document.querySelectorAll(".dev-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dev-tab[data-tab]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      uiEvent({
        level: "debug",
        module: "ui.devDrawer",
        event: "debug_tab_change",
        summary: "Switched debug drawer tab",
        details: { tab: tab.dataset.tab },
        devOnly: true,
      });
      if (tab.dataset.tab === "storage") showStorage();
      else void showLogs();
    });
  });

  logSelect?.addEventListener("change", async () => {
    const sid = logSelect.value || null;
    await renderLogEntries(sid, logEntries);
    updatePrevNextButtons();
    uiEvent({
      level: "debug",
      module: "ui.devDrawer",
      event: "debug_session_select",
      summary: "Changed selected log session",
      refs: { sessionId: sid },
      devOnly: true,
    });
  });

  logPrev?.addEventListener("click", async () => {
    const sessions = JSON.parse(logSelect.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect.value);
    if (idx < sessions.length - 1) {
      const next = sessions[idx + 1];
      logSelect.value = next.id;
      await renderLogEntries(next.id, logEntries);
      updatePrevNextButtons();
    }
  });

  logNext?.addEventListener("click", async () => {
    const sessions = JSON.parse(logSelect.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect.value);
    if (idx > 0) {
      const next = sessions[idx - 1];
      logSelect.value = next.id;
      await renderLogEntries(next.id, logEntries);
      updatePrevNextButtons();
    }
  });

  copyBtn?.addEventListener("click", async () => {
    const sid = logSelect?.value || null;
    const data = await getLogsForCopy(sid);
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy logs"; }, 1200);
      uiEvent({
        level: "info",
        module: "ui.devDrawer",
        event: "debug_copy_logs",
        summary: "Copied logs to clipboard",
        refs: { sessionId: sid },
        metrics: { entryCount: data.entries?.length || 0 },
      });
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => { copyBtn.textContent = "Copy logs"; }, 1200);
      uiEvent({
        level: "warn",
        module: "ui.devDrawer",
        event: "debug_copy_logs_failed",
        summary: "Failed to copy logs to clipboard",
        refs: { sessionId: sid },
      });
    }
  });

  function appendLogEntryLive(entry) {
    if (!logsPanel || logsPanel.hidden || !logEntries) return;
    const sid = logSelect?.value || "";
    if (entry.sessionId !== sid) return;
    const envelope = getStructuredEnvelope(entry.details);
    const moduleBadge = envelope?.module ? `<span class="dev-log-level">${escapeHtml(envelope.module)}</span>` : "";
    const eventBadge = envelope?.event ? `<span class="dev-log-level">${escapeHtml(envelope.event)}</span>` : "";
    const details = entry.details
      ? `<code class="dev-log-details">${escapeHtml(typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2))}</code>`
      : "";
    const html = `<article class="dev-log-entry level-${entry.level}"><header><span class="dev-log-message">${escapeHtml(entry.message)}</span><span class="dev-log-meta"><span class="dev-log-level">${entry.level.toUpperCase()}</span>${moduleBadge}${eventBadge} <time>${new Date().toLocaleString()}</time></span></header>${details}</article>`;
    logEntries.insertAdjacentHTML("beforeend", html);
    requestAnimationFrame(() => {
      logsPanel.scrollTop = logsPanel.scrollHeight;
    });
  }

  setOnLogCallback(appendLogEntryLive);

  function updatePrevNextButtons() {
    const sessions = JSON.parse(logSelect?.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect?.value);
    if (logPrev) logPrev.disabled = idx < 0 || idx >= sessions.length - 1;
    if (logNext) logNext.disabled = idx <= 0;
  }
}

async function restoreFromRoute(route) {
  const parsed = parseRoute(route);
  if (isDevMode()) {
    uiEvent({
      level: "debug",
      module: "domain.routing",
      event: "route_parse",
      summary: "Parsed route before restore",
      refs: { route },
      details: parsed,
      devOnly: true,
    });
  }
  uiEvent({
    level: "info",
    module: "domain.routing",
    event: "route_restore_start",
    summary: "Restoring app state from route",
    refs: { route },
    details: parsed,
  });
  if (parsed.view === "reader" && parsed.workId && parsed.bookId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    const book = work?.books.find((b) => b.id === parsed.bookId);
    if (work && book) {
      state.currentWork = work;
      state.currentBook = book;
      await openReader({
        workId: work.id,
        workTitle: work.title,
        bookId: book.id,
        bookTitle: book.title,
        chapter: parsed.chapter || 1,
        verse: parsed.verse || 1,
        reference: `${book.title} ${parsed.chapter || 1}:${parsed.verse || 1}`,
      });
      uiEvent({
        level: "info",
        module: "domain.routing",
        event: "route_restore_resolved",
        summary: "Route restored to reader view",
        refs: { route, workId: work.id, bookId: book.id, chapter: parsed.chapter || 1, verse: parsed.verse || 1 },
      });
      return;
    }
  }
  if (parsed.view === "chapters" && parsed.workId && parsed.bookId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    const book = work?.books.find((b) => b.id === parsed.bookId);
    if (work && book) {
      state.currentWork = work;
      state.currentBook = book;
      renderChaptersView();
      uiEvent({
        level: "info",
        module: "domain.routing",
        event: "route_restore_resolved",
        summary: "Route restored to chapters view",
        refs: { route, workId: work.id, bookId: book.id },
      });
      return;
    }
  }
  if (parsed.view === "books" && parsed.workId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    if (work) {
      state.currentWork = work;
      state.currentBook = null;
      renderBooksView();
      uiEvent({
        level: "info",
        module: "domain.routing",
        event: "route_restore_resolved",
        summary: "Route restored to books view",
        refs: { route, workId: work.id },
      });
      return;
    }
  }
  if (route && route !== "#/") {
    uiEvent({
      level: "warn",
      module: "domain.routing",
      event: "route_restore_fail",
      summary: "Route could not be fully resolved; falling back to home",
      refs: { route },
      details: parsed,
    });
  }
  renderHomeView();
  uiEvent({
    level: "info",
    module: "domain.routing",
    event: "route_restore_resolved",
    summary: "Route restored to home view",
    refs: { route },
  });
}

async function init() {
  uiEvent({
    level: "info",
    module: "ui.appShell",
    event: "app_init_start",
    summary: "Application initialization started",
  });
  state.index = await loadIndex();
  wireGlobalEvents();
  wireScrollerRibbonUpdates();
  wireDeveloperMode();

  const hash = window.location.hash || loadRouteFromStorage();
  if (hash && hash !== "#/") {
    await restoreFromRoute(hash);
  } else {
    renderHomeView();
  }
  pushRoute(stateToRoute(state));

  window.addEventListener("hashchange", () => {
    const h = window.location.hash;
    if (h && !document.getElementById("homeView").hidden) {
      void restoreFromRoute(h);
    }
  });

  await registerServiceWorker();
  uiEvent({
    level: "info",
    module: "ui.appShell",
    event: "app_init_complete",
    summary: "Application initialization complete",
  });
}

init().catch((err) => {
  uiEvent({
    level: "error",
    module: "ui.appShell",
    event: "app_init_fail",
    summary: "Application failed during initialization",
    details: { errorMessage: err?.message || String(err) },
  });
  homeView.innerHTML = `<section class="panel"><h2>Failed to load app</h2><pre>${err.message}</pre></section>`;
});
