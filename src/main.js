import "./styles.css";
import "./scriptureReader.css";
import { loadIndex, BookCache } from "./data.js";
import { BookmarkStore } from "./bookmarks.js";
import { getLogsForCopy, getLogsForAiShare, getAllSessions, getEntriesForSession, setOnLogCallback, logInfo } from "./logger.js";
import { createNavigationService } from "./services/navigationService.js";
import { createBookmarkService } from "./services/bookmarkService.js";
import { createReaderService } from "./services/readerService.js";
import { createVisibilityService } from "./services/visibilityService.js";
import { createTelemetryEmitter } from "./telemetry.js";
import { renderHomeView as renderHomeTemplate } from "./views/homeView.js";
import { renderBooksView as renderBooksTemplate } from "./views/booksView.js";
import { renderChaptersView as renderChaptersTemplate } from "./views/chaptersView.js";
import { renderHistoryView as renderHistoryTemplate } from "./views/historyView.js";
import { renderBookmarkRibbons as renderBookmarkRibbonsTemplate } from "./views/readerView.js";
import { escapeHtml } from "./viewUtils.js";

const state = {
  index: null,
  currentWork: null,
  currentBook: null,
  currentLocation: null,
  deferredPrompt: null,
  lastAutoBookmarkAt: 0,
  lastAutoReference: "",
  lastChapterRef: "",
  velocitySamples: [],
  autoScrollActive: false,
  stickyFollowBookmarkId: null,
  stickyFollowOutOfRangeSince: null,
  stickyFollowWasInUpdateRange: false,
  historyBookmarkName: "History",
  devTapCount: 0,
  devTapResetTimer: null,
  activeLogFilters: {
    modules: new Set(),
    levels: new Set(),
    search: "",
  },
  lastRenderedLogEntries: [],
  lastRenderedSessionId: null,
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
const readerRibbonsOverlay = document.getElementById("readerRibbonsOverlay");
const autoScrollStart = document.getElementById("autoScrollStart");
const scroller = document.getElementById("readerScroller");
const content = document.getElementById("readerContent");

const navigationService = createNavigationService();
const visibilityService = createVisibilityService();
const visibilityEmit = createTelemetryEmitter("ui.devDrawer");
const dataEmit = createTelemetryEmitter("domain.dataAccess");
const uiEmit = {
  home: createTelemetryEmitter("ui.homeView"),
  books: createTelemetryEmitter("ui.booksView"),
  chapters: createTelemetryEmitter("ui.chaptersView"),
  reader: createTelemetryEmitter("ui.readerView"),
  history: createTelemetryEmitter("ui.historyView"),
};

let readerService = null;
let installCanShow = false;

const cache = new BookCache(2, {
  onHit(bookMeta, snapshot) {
    readerService?.recordCacheHit?.();
    dataEmit({
      level: "debug",
      event: "book_cache_hit",
      summary: "Book cache hit",
      refs: { workId: bookMeta.workId, bookId: bookMeta.id },
      details: { snapshot },
      minVerbosity: "standard",
    });
  },
  onMiss(bookMeta, snapshot) {
    readerService?.recordCacheMiss?.();
    dataEmit({
      level: "info",
      event: "book_cache_miss",
      summary: "Book cache miss",
      refs: { workId: bookMeta.workId, bookId: bookMeta.id },
      details: { snapshot },
      minVerbosity: "minimal",
    });
  },
});
const bookmarkService = createBookmarkService(new BookmarkStore());

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

function updateInstallVisibility(viewId) {
  installButton.hidden = !installCanShow || viewId !== "homeView";
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
  autoScrollStart.textContent = state.autoScrollActive ? "Auto scrolling" : "Auto scroll";
  updateHeader(viewId);
  updateInstallVisibility(viewId);
  updateDevEasterEggVisibility();
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

function stopAutoScrollAndUpdateUI() {
  readerService?.stopAutoScroll?.();
  state.autoScrollActive = false;
  autoScrollStart.textContent = "Auto scroll";
}

function routeFromState() {
  return navigationService.routeFromState({
    currentLocation: state.currentLocation,
    currentWork: state.currentWork,
    currentBook: state.currentBook,
  });
}

function pushRouteAndSave(route) {
  navigationService.push(route, { save: true });
}

function ensureReaderService() {
  if (readerService) return readerService;
  readerService = createReaderService({
    index: state.index,
    scroller,
    content,
    autoScrollButton: autoScrollStart,
    autoScrollPanelHost: document.querySelector(".app-header"),
    getWorkMeta(location) {
      return state.index.works.find((item) => item.id === location.workId) || state.index.works[0];
    },
    bookCache: cache,
    onAnchorChange: handleAnchorChange,
    onAutoScrollStateChange(active) {
      state.autoScrollActive = active;
      autoScrollStart.textContent = active ? "Auto scrolling" : "Auto scroll";
    },
    onAutoScrollFrame() {
      if (!readerView.hidden) renderBookmarkRibbons();
    },
  });
  return readerService;
}

function openWork(workId) {
  state.currentWork = state.index.works.find((work) => work.id === workId) || null;
  state.currentBook = null;
  state.currentLocation = null;
  clearStickyFollow();
  pushRouteAndSave(`#/w/${workId}`);
  renderBooksView();
}

function openBook(bookId) {
  if (!state.currentWork) return;
  state.currentBook = state.currentWork.books.find((book) => book.id === bookId) || null;
  state.currentLocation = null;
  clearStickyFollow();
  pushRouteAndSave(`#/b/${state.currentWork.id}/${bookId}`);
  renderChaptersView();
  uiEmit.books({
    level: "info",
    event: "books_open_book_click",
    summary: "Book selected from books view",
    refs: { workId: state.currentWork.id, bookId },
  });
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
  state.lastChapterRef = "";
  setView("readerView");
  uiEmit.reader({
    level: "info",
    event: "reader_open_start",
    summary: "Reader open started",
    refs: { workId: safeLocation.workId, bookId: safeLocation.bookId, chapter: safeLocation.chapter, verse: safeLocation.verse },
  });

  const reader = ensureReaderService();
  await reader.open(safeLocation);
  uiEmit.reader({
    level: "info",
    event: "reader_open_ready",
    summary: "Reader open complete",
    refs: { workId: safeLocation.workId, bookId: safeLocation.bookId, chapter: safeLocation.chapter, verse: safeLocation.verse },
  });
  pushRouteAndSave(routeFromState());
  requestAnimationFrame(() => requestAnimationFrame(renderBookmarkRibbons));
}

function renderBookmarkRibbons() {
  renderBookmarkRibbonsTemplate({
    overlay: readerRibbonsOverlay,
    scroller,
    content,
    bookmarks: bookmarkService.getBookmarks(),
    currentLocation: state.currentLocation,
    activeStickyBookmarkId: state.stickyFollowBookmarkId,
    onToggleStickyFollow: toggleStickyFollow,
  });
}

function resetStickyFollowTracking() {
  state.stickyFollowOutOfRangeSince = null;
  state.stickyFollowWasInUpdateRange = false;
  state.velocitySamples = [];
  state.lastAutoBookmarkAt = 0;
  state.lastAutoReference = "";
}

function clearStickyFollow() {
  state.stickyFollowBookmarkId = null;
  resetStickyFollowTracking();
}

function toggleStickyFollow(bookmarkId) {
  state.stickyFollowBookmarkId = state.stickyFollowBookmarkId === bookmarkId ? null : bookmarkId;
  resetStickyFollowTracking();
  readerStatusEl.hidden = true;
  bookmarkStatusEl.textContent = "";
  renderBookmarkRibbons();
}

function renderHistoryView(bookmark) {
  state.historyBookmarkName = `History: ${bookmark.name}`;
  setView("historyView");
  uiEmit.history({
    level: "info",
    event: "history_render_start",
    summary: "Rendering history view",
    refs: { bookmarkId: bookmark.id },
  });
  const entries = bookmarkService.getHistoryOnePerDay(bookmark);
  renderHistoryTemplate({
    container: historyView,
    bookmark,
    entries,
    onBack: () => renderHomeView(),
  });
  uiEmit.history({
    level: "info",
    event: "history_render_done",
    summary: "History view rendered",
    refs: { bookmarkId: bookmark.id },
    metrics: { rows: entries.length },
  });
}

function renderHomeView() {
  state.currentWork = null;
  state.currentBook = null;
  state.currentLocation = null;
  clearStickyFollow();
  setView("homeView");
  const bookmarks = bookmarkService.getBookmarks();
  uiEmit.home({
    level: "info",
    event: "home_render_start",
    summary: "Rendering home view",
    metrics: { works: state.index.works.length, bookmarks: bookmarks.length },
  });
  renderHomeTemplate({
    container: homeView,
    works: state.index.works,
    bookmarks,
    onOpenWork: (workId) => {
      uiEmit.home({
        level: "info",
        event: "home_open_work_click",
        summary: "Work selected from home",
        refs: { workId },
      });
      openWork(workId);
    },
    onOpenSingleBook: (work, bookId) => {
      state.currentWork = work;
      openBook(bookId);
    },
    onViewHistory: (bookmarkId) => {
      uiEmit.home({
        level: "info",
        event: "home_view_history_click",
        summary: "History opened from home",
        refs: { bookmarkId },
      });
      const bookmark = bookmarkService.getBookmarks().find((x) => x.id === bookmarkId);
      if (bookmark) renderHistoryView(bookmark);
    },
    onOpenBookmark: async (bookmarkId) => {
      uiEmit.home({
        level: "info",
        event: "home_open_bookmark_click",
        summary: "Bookmark opened from home",
        refs: { bookmarkId },
      });
      const bookmark = bookmarkService.getBookmarks().find((x) => x.id === bookmarkId);
      if (!bookmark) return;
      const loc = bookmark.location || defaultLocationFromIndex();
      state.stickyFollowBookmarkId = bookmark.id;
      resetStickyFollowTracking();
      await openReader(loc);
    },
  });
  uiEmit.home({
    level: "info",
    event: "home_render_done",
    summary: "Home view rendered",
    metrics: { works: state.index.works.length, bookmarks: bookmarks.length },
  });
}

function renderBooksView() {
  setView("booksView");
  if (!state.currentWork) {
    renderHomeView();
    return;
  }
  uiEmit.books({
    level: "info",
    event: "books_render_start",
    summary: "Rendering books view",
    refs: { workId: state.currentWork.id },
  });
  renderBooksTemplate({
    container: booksView,
    work: state.currentWork,
    onOpenBook: (bookId) => openBook(bookId),
  });
  uiEmit.books({
    level: "info",
    event: "books_render_done",
    summary: "Books view rendered",
    refs: { workId: state.currentWork.id },
    metrics: { count: state.currentWork.books.length },
  });
}

function renderChaptersView() {
  setView("chaptersView");
  if (!state.currentWork || !state.currentBook) {
    renderBooksView();
    return;
  }
  uiEmit.chapters({
    level: "info",
    event: "chapters_render_start",
    summary: "Rendering chapters view",
    refs: { workId: state.currentWork.id, bookId: state.currentBook.id },
  });
  renderChaptersTemplate({
    container: chaptersView,
    book: state.currentBook,
    onOpenChapter: async (chapter) => {
      clearStickyFollow();
      uiEmit.chapters({
        level: "info",
        event: "chapters_open_chapter_click",
        summary: "Chapter selected",
        refs: { workId: state.currentWork.id, bookId: state.currentBook.id, chapter },
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
    },
  });
  uiEmit.chapters({
    level: "info",
    event: "chapters_render_done",
    summary: "Chapters view rendered",
    refs: { workId: state.currentWork.id, bookId: state.currentBook.id },
    metrics: { count: state.currentBook.chapterCount },
  });
}

const VELOCITY_WINDOW_MS = 30_000;
const SLOW_READING_THRESHOLD = 188;
const STICKY_FOLLOW_RESUME_VERSE_GAP = 80;
const STICKY_FOLLOW_MAX_UPDATE_VERSE_JUMP = 36;
const STICKY_FOLLOW_MAX_CHAPTER_GAP = 1;
const STICKY_FOLLOW_OUT_OF_RANGE_DISABLE_MS = 5 * 60 * 1000;

function getAverageVelocityOverWindow() {
  const now = Date.now();
  const cutoff = now - VELOCITY_WINDOW_MS;
  state.velocitySamples = state.velocitySamples.filter((s) => s.ts >= cutoff);
  if (state.velocitySamples.length === 0) return 0;
  const sum = state.velocitySamples.reduce((a, s) => a + Math.abs(s.v), 0);
  return sum / state.velocitySamples.length;
}

function shouldAutoFollow(anchor, meta) {
  const now = meta.timestamp;
  state.velocitySamples.push({ v: meta.velocity, ts: now });
  const avg = getAverageVelocityOverWindow();
  if (avg > SLOW_READING_THRESHOLD) return { ok: false, reason: "average_velocity_too_high", averageVelocity: avg };
  if (anchor.reference === state.lastAutoReference && now - state.lastAutoBookmarkAt < 900) {
    return { ok: false, reason: "same_reference_throttled", averageVelocity: avg };
  }
  if (now - state.lastAutoBookmarkAt < 350) return { ok: false, reason: "update_throttled", averageVelocity: avg };
  return { ok: true, reason: "ok", averageVelocity: avg };
}

function stickyFollowDelta(bookmark, anchor) {
  if (!bookmark?.location || !anchor) return null;
  const loc = bookmark.location;
  if (loc.workId !== anchor.workId || loc.bookId !== anchor.bookId) return null;
  if (Number.isFinite(loc.seq) && Number.isFinite(anchor.seq)) {
    const seqGap = anchor.seq - loc.seq;
    if (seqGap < 0 || seqGap > STICKY_FOLLOW_MAX_CHAPTER_GAP) return null;
    return seqGap === 0
      ? Math.abs((anchor.verse || 0) - (loc.verse || 0))
      : (anchor.verse || 0);
  }
  const chapterGap = (anchor.chapter || 0) - (loc.chapter || 0);
  if (chapterGap < 0 || chapterGap > STICKY_FOLLOW_MAX_CHAPTER_GAP) return null;
  return chapterGap === 0
    ? Math.abs((anchor.verse || 0) - (loc.verse || 0))
    : (anchor.verse || 0);
}

function handleAnchorChange(anchor, meta) {
  if (readerView.hidden) return;
  state.currentLocation = anchor;
  if (anchor?.workId) {
    state.currentWork = state.index.works.find((work) => work.id === anchor.workId) || state.currentWork;
  }
  if (anchor?.bookId && state.currentWork) {
    state.currentBook = state.currentWork.books.find((book) => book.id === anchor.bookId) || state.currentBook;
  }
  const chapterRef = anchor ? `${anchor.bookTitle ?? ""} ${anchor.chapter ?? 1}` : "";
  if (chapterRef && chapterRef !== state.lastChapterRef) {
    state.lastChapterRef = chapterRef;
    uiEmit.reader({
      level: "info",
      event: "reader_chapter_change",
      summary: "Reader chapter changed",
      refs: { reference: anchor.reference, chapterRef },
      minVerbosity: "minimal",
    });
  }
  if (!readerView.hidden) updateHeader("readerView");
  navigationService.push(routeFromState());
  renderBookmarkRibbons();
  uiEmit.reader({
    level: "debug",
    event: "reader_anchor_change",
    summary: "Reader anchor changed",
    refs: {
      reference: anchor?.reference,
      workId: anchor?.workId,
      bookId: anchor?.bookId,
      chapter: anchor?.chapter,
      verse: anchor?.verse,
    },
    metrics: {
      velocity: Number((meta?.velocity ?? 0).toFixed(1)),
      averageVelocity: Number(getAverageVelocityOverWindow().toFixed(1)),
      autoScrolling: Boolean(meta?.autoScrolling),
    },
    throttleMs: 650,
    minVerbosity: "standard",
  });

  const toFollow = state.stickyFollowBookmarkId
    ? bookmarkService.getBookmarks().find((bookmark) => bookmark.id === state.stickyFollowBookmarkId)
    : null;
  if (!toFollow) {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    return;
  }
  const delta = stickyFollowDelta(toFollow, anchor);
  const now = meta?.timestamp ?? Date.now();
  const canResume = delta !== null && delta <= STICKY_FOLLOW_RESUME_VERSE_GAP;
  const canUpdate = delta !== null && delta <= STICKY_FOLLOW_MAX_UPDATE_VERSE_JUMP;

  if (!canResume) {
    state.stickyFollowOutOfRangeSince ??= now;
    state.stickyFollowWasInUpdateRange = false;
    const outOfRangeSince = state.stickyFollowOutOfRangeSince;
    if (now - state.stickyFollowOutOfRangeSince >= STICKY_FOLLOW_OUT_OF_RANGE_DISABLE_MS) {
      clearStickyFollow();
      renderBookmarkRibbons();
      uiEmit.reader({
        level: "info",
        event: "sticky_follow_auto_disabled",
        summary: "Sticky follow auto-disabled after staying out of range",
        refs: { bookmarkId: toFollow.id, bookmarkName: toFollow.name, reference: anchor?.reference },
      });
    }
    uiEmit.reader({
      level: "debug",
      event: "sticky_follow_skipped",
      summary: "Sticky follow waiting: anchor is out of resume range",
      refs: { bookmarkId: toFollow.id, bookmarkName: toFollow.name, reference: anchor?.reference },
      metrics: { delta, resumeGap: STICKY_FOLLOW_RESUME_VERSE_GAP, maxUpdateJump: STICKY_FOLLOW_MAX_UPDATE_VERSE_JUMP },
      details: { outOfRangeSeconds: Number(((now - outOfRangeSince) / 1000).toFixed(1)) },
      throttleMs: 1000,
      minVerbosity: "standard",
    });
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    return;
  }

  state.stickyFollowOutOfRangeSince = null;
  if (canUpdate && !state.stickyFollowWasInUpdateRange) {
    state.velocitySamples = [];
    state.lastAutoBookmarkAt = 0;
    state.lastAutoReference = "";
    uiEmit.reader({
      level: "info",
      event: "sticky_follow_resumed",
      summary: "Sticky follow resumed in update range",
      refs: { bookmarkId: toFollow.id, bookmarkName: toFollow.name, reference: anchor?.reference },
      metrics: { delta, maxUpdateJump: STICKY_FOLLOW_MAX_UPDATE_VERSE_JUMP },
      minVerbosity: "standard",
    });
  }
  state.stickyFollowWasInUpdateRange = canUpdate;
  const followDecision = canUpdate
    ? shouldAutoFollow(anchor, meta)
    : { ok: false, reason: "near_but_update_jump_too_large", averageVelocity: getAverageVelocityOverWindow() };
  if (canUpdate && followDecision.ok) {
    bookmarkService.updateBookmarkLocation(toFollow.id, anchor, meta.autoScrolling ? "auto-scroll" : "scroll");
    state.lastAutoBookmarkAt = meta.timestamp;
    state.lastAutoReference = anchor.reference;
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    uiEmit.reader({
      level: "debug",
      event: "sticky_follow_updated",
      summary: `Sticky follow updated ${toFollow.name} to ${anchor.reference}`,
      refs: { bookmarkId: toFollow.id, bookmarkName: toFollow.name, reference: anchor.reference },
      metrics: {
        delta,
        velocity: Number((meta?.velocity ?? 0).toFixed(1)),
        averageVelocity: Number(followDecision.averageVelocity.toFixed(1)),
      },
      minVerbosity: "standard",
    });
  } else {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    uiEmit.reader({
      level: "debug",
      event: "sticky_follow_skipped",
      summary: `Sticky follow skipped: ${followDecision.reason}`,
      refs: { bookmarkId: toFollow.id, bookmarkName: toFollow.name, reference: anchor?.reference },
      metrics: {
        delta,
        resumeGap: STICKY_FOLLOW_RESUME_VERSE_GAP,
        maxUpdateJump: STICKY_FOLLOW_MAX_UPDATE_VERSE_JUMP,
        velocity: Number((meta?.velocity ?? 0).toFixed(1)),
        averageVelocity: Number(followDecision.averageVelocity.toFixed(1)),
        slowReadingThreshold: SLOW_READING_THRESHOLD,
      },
      throttleMs: 650,
      minVerbosity: "standard",
    });
  }
  renderBookmarkRibbons();
}

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

function wireInstallFlow() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    installButton.textContent = "Install";
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
      return;
    }
    if (isIOS()) {
      const msg =
        "To add this app to your home screen:\n\n1. Tap the Share button (square with arrow) at the bottom of the screen\n2. Scroll and tap \"Add to Home Screen\"\n3. Tap Add";
      alert(msg);
    }
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const swUrl = base.endsWith("/") ? `${base}sw.js` : `${base}/sw.js`;
  await navigator.serviceWorker.register(swUrl, { scope: base });
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
  egg.hidden = document.getElementById("homeView").hidden || visibilityService.isDevMode();
  if (visibilityService.isDevMode() && document.getElementById("devBugIcon")) {
    document.getElementById("devBugIcon").hidden = false;
  }
}

const STORAGE_LABELS = {
  "scripture-pwa-bookmarks-v1": "Bookmarks",
  "scripture-pwa-route-v1": "Route",
  "scripture-pwa-dev-mode-v1": "Developer Mode",
  "scripture-pwa-logs-v1": "Legacy Logs",
  "scripture-pwa-visibility-v1": "Visibility Config",
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
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  keys.sort((a, b) => a.localeCompare(b));
  const parts = keys.map((k) => {
    const value = localStorage.getItem(k);
    const label = STORAGE_LABELS[k] ?? k;
    const pretty = value != null ? formatStorageValue(value) : "[empty]";
    return `<section class="dev-storage-section"><h4 class="dev-storage-header">${escapeHtml(label)}</h4><pre class="dev-storage-pre">${escapeHtml(pretty)}</pre></section>`;
  });
  container.innerHTML = parts.length ? parts.join("\n") : "<p>No localStorage keys.</p>";
}

function matchesFilters(entry) {
  const { modules, levels, search } = state.activeLogFilters;
  if (modules.size > 0 && !modules.has(entry.module || "domain.logging")) return false;
  if (levels.size > 0 && !levels.has(entry.level)) return false;
  if (search) {
    const haystack = JSON.stringify({
      message: entry.message,
      summary: entry.summary,
      details: entry.details,
      refs: entry.refs,
      event: entry.event,
      module: entry.module,
    }).toLowerCase();
    if (!haystack.includes(search.toLowerCase())) return false;
  }
  return true;
}

function entrySimpleString(entry) {
  const parts = [
    entry.summary || entry.message || entry.event || "Log event",
    entry.refs?.reference,
    entry.metrics?.delta != null ? `delta ${entry.metrics.delta}` : "",
    entry.metrics?.averageVelocity != null ? `avg ${entry.metrics.averageVelocity}px/s` : "",
    entry.metrics?.velocity != null ? `v ${entry.metrics.velocity}px/s` : "",
    entry.metrics?.loadedCount != null ? `loaded ${entry.metrics.loadedCount}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function compactLogEntriesNewestFirst(entries) {
  const ordered = entries.slice().sort((a, b) => b.timestamp - a.timestamp);
  const compacted = [];
  for (const entry of ordered) {
    const key = JSON.stringify({
      level: entry.level,
      module: entry.module || "domain.logging",
      event: entry.event || "legacy_log",
      message: entrySimpleString(entry),
    });
    const previous = compacted[compacted.length - 1];
    if (previous?._compactKey === key) {
      previous._count += 1;
      previous._oldestTimestamp = entry.timestamp;
      continue;
    }
    compacted.push({
      ...entry,
      _compactKey: key,
      _count: 1,
      _oldestTimestamp: entry.timestamp,
    });
  }
  return compacted;
}

function renderLogEntryHtml(entry) {
  const level = entry.level || "debug";
  const metaParts = [
    `<span class="dev-log-level">${level.toUpperCase()}</span>`,
    entry.module ? `<span>${escapeHtml(entry.module)}</span>` : "",
    entry.event ? `<span>${escapeHtml(entry.event)}</span>` : "",
    `<time>${new Date(entry.timestamp).toLocaleTimeString()}</time>`,
  ]
    .filter(Boolean)
    .join(" · ");
  const count = entry._count > 1 ? `<span class="dev-log-count">x${entry._count}</span>` : "";
  const title = entry._count > 1
    ? `Newest ${new Date(entry.timestamp).toLocaleString()} · oldest ${new Date(entry._oldestTimestamp).toLocaleString()}`
    : new Date(entry.timestamp).toLocaleString();
  return `<article class="dev-log-entry compact level-${level}" title="${escapeHtml(title)}"><header><span class="dev-log-message">${escapeHtml(entrySimpleString(entry))}</span>${count}<span class="dev-log-meta">${metaParts}</span></header></article>`;
}

function renderLogFilterControls(filtersEl, entries) {
  if (!filtersEl) return;
  const modules = [...new Set(entries.map((e) => e.module || "domain.logging"))].sort();
  const levelOptions = ["debug", "info", "warn", "error"];
  const moduleChecks = modules
    .map(
      (moduleId) => `
      <label class="dev-filter-chip">
        <input type="checkbox" data-filter-module="${moduleId}" ${state.activeLogFilters.modules.has(moduleId) ? "checked" : ""} />
        <span>${escapeHtml(moduleId)}</span>
      </label>`,
    )
    .join("");
  const levelChecks = levelOptions
    .map(
      (level) => `
      <label class="dev-filter-chip">
        <input type="checkbox" data-filter-level="${level}" ${state.activeLogFilters.levels.has(level) ? "checked" : ""} />
        <span>${level.toUpperCase()}</span>
      </label>`,
    )
    .join("");

  filtersEl.innerHTML = `
    <div class="dev-filter-block">
      <strong>Modules</strong>
      <div class="dev-filter-list">${moduleChecks || "<em>No modules in this session</em>"}</div>
    </div>
    <div class="dev-filter-block">
      <strong>Levels</strong>
      <div class="dev-filter-list">${levelChecks}</div>
    </div>
  `;
}

function renderLogEntries(entries, container, countEl) {
  if (!container) return;
  const filtered = entries.filter(matchesFilters);
  const compacted = compactLogEntriesNewestFirst(filtered);
  state.lastRenderedLogEntries = compacted;
  if (countEl) {
    countEl.textContent = `${compacted.length}/${filtered.length}/${entries.length} rows/events/total`;
  }
  if (filtered.length === 0) {
    container.innerHTML = "<p>No entries match the current filters.</p>";
    return;
  }
  container.innerHTML = compacted
    .map(renderLogEntryHtml)
    .join("");
}

async function loadLogSessionsAndRender(selectEl, entriesEl, filtersEl, countEl) {
  const sessions = await getAllSessions();
  selectEl.innerHTML =
    sessions.length === 0
      ? '<option value="">No sessions</option>'
      : sessions.map((s) => `<option value="${escapeHtml(s.id)}">${new Date(s.startedAt).toLocaleString()}</option>`).join("");
  const first = sessions[0] ?? null;
  selectEl.value = first?.id ?? "";
  selectEl.dataset.sessions = JSON.stringify(sessions);
  state.lastRenderedSessionId = first?.id ?? null;
  if (!first) {
    entriesEl.innerHTML = "<p>No entries for this session.</p>";
    filtersEl.innerHTML = "";
    if (countEl) countEl.textContent = "0/0 visible";
    return;
  }
  const entries = await getEntriesForSession(first.id);
  renderLogFilterControls(filtersEl, entries);
  renderLogEntries(entries, entriesEl, countEl);
}

function renderObjectsPanel(container) {
  if (!container) return;
  const bookmarkList = bookmarkService.getBookmarks();
  const route = window.location.hash || "#/";
  const parsedRoute = navigationService.parse(route);
  const fallbackRoute = navigationService.loadFallbackRoute();
  const readerSnapshot = readerService?.captureRuntimeSnapshot?.() ?? null;
  const cacheSnapshot = cache.snapshot();
  const metricsSnapshot = readerService?.getMetricsSnapshot?.() ?? null;

  const bookmarkRows = bookmarkList
    .map((b) => {
      const summary = `${escapeHtml(b.name)} — ${escapeHtml(b.location?.reference || "No location")}`;
      const raw = escapeHtml(JSON.stringify(b, null, 2));
      return `<details class="dev-object-row"><summary>${summary}</summary><pre class="dev-storage-pre">${raw}</pre></details>`;
    })
    .join("");

  container.innerHTML = `
    <section class="dev-object-section">
      <h4>Bookmarks + History (${bookmarkList.length})</h4>
      ${bookmarkRows || "<p>No bookmarks found.</p>"}
    </section>
    <section class="dev-object-section">
      <h4>Route State</h4>
      <details class="dev-object-row"><summary>Current / Parsed / Fallback route</summary><pre class="dev-storage-pre">${escapeHtml(JSON.stringify({ route, parsedRoute, fallbackRoute }, null, 2))}</pre></details>
    </section>
    <section class="dev-object-section">
      <h4>Reader Runtime Snapshot</h4>
      <details class="dev-object-row"><summary>Reader runtime state</summary><pre class="dev-storage-pre">${escapeHtml(JSON.stringify(readerSnapshot, null, 2))}</pre></details>
      <details class="dev-object-row"><summary>Runtime metrics snapshot</summary><pre class="dev-storage-pre">${escapeHtml(JSON.stringify(metricsSnapshot, null, 2))}</pre></details>
    </section>
    <section class="dev-object-section">
      <h4>Book Cache Snapshot</h4>
      <details class="dev-object-row"><summary>Cache state</summary><pre class="dev-storage-pre">${escapeHtml(JSON.stringify(cacheSnapshot, null, 2))}</pre></details>
    </section>
  `;
}

function renderVisibilityPanel(container) {
  if (!container) return;
  const config = visibilityService.getConfig();
  const modules = visibilityService.getCatalog();
  const presets = visibilityService.getPresets();
  const moduleControls = modules
    .map(
      (m) => `
      <label class="dev-filter-chip">
        <input type="checkbox" data-visibility-module="${m.id}" ${config.modules[m.id] ? "checked" : ""} />
        <span>${escapeHtml(m.id)}</span>
      </label>`,
    )
    .join("");
  const presetOptions = presets.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

  container.innerHTML = `
    <section class="dev-object-section">
      <h4>Visibility Controls</h4>
      <p class="dev-help-text">Tip: checking any module enables global logging and standard verbosity automatically. Use the Reader performance preset for scroller debugging.</p>
      <label class="dev-filter-chip"><input type="checkbox" id="devVisibilityEnabled" ${config.enabled ? "checked" : ""} /><span>Global visibility enabled</span></label>
      <label class="dev-inline-label">Verbosity:
        <select id="devVisibilityVerbosity">
          <option value="minimal" ${config.verbosity === "minimal" ? "selected" : ""}>minimal</option>
          <option value="standard" ${config.verbosity === "standard" ? "selected" : ""}>standard</option>
          <option value="deep" ${config.verbosity === "deep" ? "selected" : ""}>deep</option>
        </select>
      </label>
      <label class="dev-inline-label">Preset:
        <select id="devVisibilityPreset">
          <option value="">Select preset...</option>
          ${presetOptions}
        </select>
      </label>
      <div class="dev-filter-list">${moduleControls}</div>
    </section>
  `;

  container.querySelector("#devVisibilityEnabled")?.addEventListener("change", (e) => {
    visibilityService.setGlobalEnabled(Boolean(e.target.checked));
    renderVisibilityPanel(container);
  });

  container.querySelector("#devVisibilityVerbosity")?.addEventListener("change", (e) => {
    visibilityService.setVerbosity(e.target.value);
    renderVisibilityPanel(container);
  });

  container.querySelector("#devVisibilityPreset")?.addEventListener("change", (e) => {
    if (!e.target.value) return;
    visibilityService.applyPreset(e.target.value);
    renderVisibilityPanel(container);
  });

  container.querySelectorAll("[data-visibility-module]").forEach((input) => {
    input.addEventListener("change", (e) => {
      visibilityService.setModule(e.target.dataset.visibilityModule, Boolean(e.target.checked));
      renderVisibilityPanel(container);
    });
  });
}

function wireDevEasterEgg() {
  const egg = document.getElementById("devEasterEgg");
  if (!egg) return;
  egg.addEventListener("click", () => {
    if (visibilityService.isDevMode()) return;
    state.devTapCount += 1;
    if (state.devTapResetTimer) window.clearTimeout(state.devTapResetTimer);
    state.devTapResetTimer = window.setTimeout(() => {
      state.devTapCount = 0;
    }, 1800);
    if (state.devTapCount >= 10) {
      visibilityService.setDevMode(true);
      state.devTapCount = 0;
      const bug = document.getElementById("devBugIcon");
      if (bug) bug.hidden = false;
      egg.hidden = true;
      visibilityEmit({
        level: "info",
        event: "debug_easter_egg_enabled",
        summary: "Developer mode enabled via easter egg tap zone",
      });
    }
  });
}

function wireDeveloperMode() {
  const bugIcon = document.getElementById("devBugIcon");
  const drawer = document.getElementById("devDrawer");
  const storageContent = document.getElementById("devStorageContent");
  const logsPanel = document.getElementById("devLogsPanel");
  const storagePanel = document.getElementById("devStoragePanel");
  const objectsPanel = document.getElementById("devObjectsPanel");
  const visibilityPanel = document.getElementById("devVisibilityPanel");
  const copyVisibleBtn = document.getElementById("devCopyVisibleLogs");
  const copyFullBtn = document.getElementById("devCopyLogs");
  const copyAiShareBtn = document.getElementById("devCopyAiShare");
  const logEntries = document.getElementById("devLogEntries");
  const logSelect = document.getElementById("devLogSessionSelect");
  const logPrev = document.getElementById("devLogPrev");
  const logNext = document.getElementById("devLogNext");
  const logSearch = document.getElementById("devLogSearch");
  const logFilters = document.getElementById("devLogFilters");
  const logCount = document.getElementById("devLogVisibleCount");

  if (visibilityService.isDevMode() && bugIcon) {
    bugIcon.hidden = false;
  }
  const sessionControls = document.getElementById("devLogSessionControls");

  function showStorage() {
    renderStoragePanel(storageContent);
    storagePanel.hidden = false;
    logsPanel.hidden = true;
    if (objectsPanel) objectsPanel.hidden = true;
    if (visibilityPanel) visibilityPanel.hidden = true;
    if (sessionControls) sessionControls.hidden = true;
  }

  async function showLogs() {
    storagePanel.hidden = true;
    logsPanel.hidden = false;
    if (objectsPanel) objectsPanel.hidden = true;
    if (visibilityPanel) visibilityPanel.hidden = true;
    if (sessionControls) sessionControls.hidden = false;
    await loadLogSessionsAndRender(logSelect, logEntries, logFilters, logCount);
    updatePrevNextButtons();
  }

  function showObjects() {
    storagePanel.hidden = true;
    logsPanel.hidden = true;
    if (objectsPanel) {
      objectsPanel.hidden = false;
      renderObjectsPanel(objectsPanel);
    }
    if (visibilityPanel) visibilityPanel.hidden = true;
    if (sessionControls) sessionControls.hidden = true;
  }

  function showVisibility() {
    storagePanel.hidden = true;
    logsPanel.hidden = true;
    if (objectsPanel) objectsPanel.hidden = true;
    if (visibilityPanel) {
      visibilityPanel.hidden = false;
      renderVisibilityPanel(visibilityPanel);
    }
    if (sessionControls) sessionControls.hidden = true;
  }

  bugIcon?.addEventListener("click", () => {
    if (drawer.hidden) {
      drawer.hidden = false;
      visibilityEmit({
        level: "info",
        event: "debug_drawer_open",
        summary: "Debug drawer opened",
      });
      const tab = document.querySelector(".dev-tab.active")?.dataset.tab || "storage";
      if (tab === "storage") showStorage();
      else if (tab === "logs") void showLogs();
      else if (tab === "objects") showObjects();
      else showVisibility();
    } else {
      drawer.hidden = true;
    }
  });

  document.getElementById("devDrawerClose")?.addEventListener("click", () => {
    drawer.hidden = true;
  });

  document.querySelectorAll(".dev-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dev-tab[data-tab]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      visibilityEmit({
        level: "info",
        event: "debug_tab_change",
        summary: "Debug tab changed",
        refs: { tab: tabName },
      });
      if (tabName === "storage") showStorage();
      else if (tabName === "logs") void showLogs();
      else if (tabName === "objects") showObjects();
      else showVisibility();
    });
  });

  logSelect?.addEventListener("change", async () => {
    const sid = logSelect.value || null;
    state.lastRenderedSessionId = sid;
    const entries = sid ? await getEntriesForSession(sid) : [];
    renderLogFilterControls(logFilters, entries);
    renderLogEntries(entries, logEntries, logCount);
    updatePrevNextButtons();
    visibilityEmit({
      level: "info",
      event: "debug_session_select",
      summary: "Log session selected",
      refs: { sessionId: sid },
    });
  });

  function updatePrevNextButtons() {
    const sessions = JSON.parse(logSelect?.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect?.value);
    if (logPrev) logPrev.disabled = idx < 0 || idx >= sessions.length - 1;
    if (logNext) logNext.disabled = idx <= 0;
  }

  logPrev?.addEventListener("click", async () => {
    const sessions = JSON.parse(logSelect.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect.value);
    if (idx < sessions.length - 1) {
      const next = sessions[idx + 1];
      logSelect.value = next.id;
      const entries = await getEntriesForSession(next.id);
      renderLogFilterControls(logFilters, entries);
      renderLogEntries(entries, logEntries, logCount);
      updatePrevNextButtons();
      state.lastRenderedSessionId = next.id;
    }
  });

  logNext?.addEventListener("click", async () => {
    const sessions = JSON.parse(logSelect.dataset.sessions || "[]");
    const idx = sessions.findIndex((s) => s.id === logSelect.value);
    if (idx > 0) {
      const next = sessions[idx - 1];
      logSelect.value = next.id;
      const entries = await getEntriesForSession(next.id);
      renderLogFilterControls(logFilters, entries);
      renderLogEntries(entries, logEntries, logCount);
      updatePrevNextButtons();
      state.lastRenderedSessionId = next.id;
    }
  });

  logSearch?.addEventListener("input", async () => {
    state.activeLogFilters.search = logSearch.value.trim();
    const sid = logSelect?.value || null;
    const entries = sid ? await getEntriesForSession(sid) : [];
    renderLogEntries(entries, logEntries, logCount);
  });

  logFilters?.addEventListener("change", async (e) => {
    const moduleId = e.target.dataset.filterModule;
    const level = e.target.dataset.filterLevel;
    if (moduleId) {
      if (e.target.checked) state.activeLogFilters.modules.add(moduleId);
      else state.activeLogFilters.modules.delete(moduleId);
    }
    if (level) {
      if (e.target.checked) state.activeLogFilters.levels.add(level);
      else state.activeLogFilters.levels.delete(level);
    }
    const sid = logSelect?.value || null;
    const entries = sid ? await getEntriesForSession(sid) : [];
    renderLogEntries(entries, logEntries, logCount);
  });

  copyFullBtn?.addEventListener("click", async () => {
    const sid = logSelect?.value || null;
    const data = await getLogsForCopy(sid);
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyFullBtn.textContent = "Copied!";
      setTimeout(() => {
        copyFullBtn.textContent = "Copy full";
      }, 1200);
      visibilityEmit({
        level: "info",
        event: "debug_copy_logs",
        summary: "Copied full session logs",
        refs: { sessionId: sid },
      });
    } catch {
      copyFullBtn.textContent = "Copy failed";
      setTimeout(() => {
        copyFullBtn.textContent = "Copy full";
      }, 1200);
    }
  });

  copyVisibleBtn?.addEventListener("click", async () => {
    const payload = {
      sessionId: state.lastRenderedSessionId,
      visibleEntries: state.lastRenderedLogEntries.map((e) => ({
        time: new Date(e.timestamp).toISOString(),
        count: e._count,
        level: e.level,
        module: e.module,
        event: e.event,
        summary: entrySimpleString(e),
        metrics: e.metrics,
        refs: e.refs,
        details: e.details,
      })),
      filters: {
        modules: Array.from(state.activeLogFilters.modules),
        levels: Array.from(state.activeLogFilters.levels),
        search: state.activeLogFilters.search,
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      copyVisibleBtn.textContent = "Copied!";
      setTimeout(() => {
        copyVisibleBtn.textContent = "Copy visible";
      }, 1200);
    } catch {
      copyVisibleBtn.textContent = "Copy failed";
      setTimeout(() => {
        copyVisibleBtn.textContent = "Copy visible";
      }, 1200);
    }
  });

  copyAiShareBtn?.addEventListener("click", async () => {
    const sid = logSelect?.value || null;
    const payload = await getLogsForAiShare(sid);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      copyAiShareBtn.textContent = "Copied!";
      setTimeout(() => {
        copyAiShareBtn.textContent = "Copy AI-share";
      }, 1200);
    } catch {
      copyAiShareBtn.textContent = "Copy failed";
      setTimeout(() => {
        copyAiShareBtn.textContent = "Copy AI-share";
      }, 1200);
    }
  });

  function appendLogEntryLive(entry) {
    if (!logsPanel || logsPanel.hidden || !logEntries) return;
    const sid = logSelect?.value || "";
    if (entry.sessionId !== sid) return;
    const synthetic = { ...entry, timestamp: Date.now() };
    if (!matchesFilters(synthetic)) return;
    const compacted = compactLogEntriesNewestFirst([synthetic, ...state.lastRenderedLogEntries.flatMap((e) => Array(e._count || 1).fill(e))]);
    state.lastRenderedLogEntries = compacted;
    if (logCount) logCount.textContent = `${compacted.length} live rows`;
    logEntries.innerHTML = compacted.map(renderLogEntryHtml).join("");
  }

  setOnLogCallback(appendLogEntryLive);
}

function wireGlobalEvents() {
  homeButton.addEventListener("click", () => {
    stopAutoScrollAndUpdateUI();
    pushRouteAndSave("#/");
    readerService?.destroy?.();
    readerService = null;
    renderHomeView();
  });

  addBookmarkButton.addEventListener("click", () => {
    if (state.autoScrollActive) stopAutoScrollAndUpdateUI();
    const name = window.prompt("Bookmark name:", "Reading Plan");
    if (!name?.trim()) return;
    const bookmark = bookmarkService.createBookmark(name.trim());
    if (state.currentLocation) {
      bookmarkService.updateBookmarkLocation(bookmark.id, state.currentLocation, "manual");
    }
    renderBookmarkRibbons();
    if (!homeView.hidden) renderHomeView();
  });

  moveBookmarkButton.addEventListener("click", () => {
    if (state.autoScrollActive) stopAutoScrollAndUpdateUI();
    const list = bookmarkService.getBookmarks();
    if (list.length === 0) {
      bookmarkStatusEl.textContent = "No bookmarks to move";
      return;
    }
    if (!state.currentLocation) {
      bookmarkStatusEl.textContent = "No current location";
      return;
    }
    if (list.length === 1) {
      bookmarkService.updateBookmarkLocation(list[0].id, state.currentLocation, "manual");
      state.stickyFollowBookmarkId = list[0].id;
      resetStickyFollowTracking();
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
        bookmarkService.updateBookmarkLocation(b.id, state.currentLocation, "manual");
        state.stickyFollowBookmarkId = b.id;
        resetStickyFollowTracking();
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
      readerService?.destroy?.();
      readerService = null;
      renderChaptersView();
    } else if (!chaptersView.hidden) {
      pushRouteAndSave(`#/w/${state.currentWork?.id || ""}`);
      renderBooksView();
    } else if (!booksView.hidden || !historyView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
    }
  });

}

async function restoreFromRoute(route) {
  const parsed = navigationService.parse(route);
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
      return;
    }
  }
  if (parsed.view === "chapters" && parsed.workId && parsed.bookId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    const book = work?.books.find((b) => b.id === parsed.bookId);
    if (work && book) {
      state.currentWork = work;
      state.currentBook = book;
      state.currentLocation = null;
      renderChaptersView();
      return;
    }
  }
  if (parsed.view === "books" && parsed.workId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    if (work) {
      state.currentWork = work;
      state.currentBook = null;
      state.currentLocation = null;
      renderBooksView();
      return;
    }
  }
  renderHomeView();
}

async function init() {
  logInfo("init start");
  dataEmit({
    level: "info",
    event: "index_load_start",
    summary: "Loading scripture index",
  });
  state.index = await loadIndex();
  dataEmit({
    level: "info",
    event: "index_load_done",
    summary: "Loaded scripture index",
    metrics: { works: state.index.works.length },
  });

  wireGlobalEvents();
  wireScrollerRibbonUpdates();
  wireDevEasterEgg();
  wireDeveloperMode();
  wireInstallFlow();

  const hash = window.location.hash || navigationService.loadFallbackRoute();
  if (hash && hash !== "#/") {
    await restoreFromRoute(hash);
  } else {
    renderHomeView();
  }
  pushRouteAndSave(routeFromState());

  window.addEventListener("hashchange", () => {
    const h = window.location.hash;
    if (h && !document.getElementById("homeView").hidden) {
      restoreFromRoute(h);
    }
  });

  await registerServiceWorker();
  logInfo("init complete");
}

init().catch((err) => {
  homeView.innerHTML = `<section class="panel"><h2>Failed to load app</h2><pre>${escapeHtml(err.message)}</pre></section>`;
});
