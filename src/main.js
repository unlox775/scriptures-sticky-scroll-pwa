import "./styles.css";
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
  currentHistoryBookmarkId: null,
  deferredPrompt: null,
  lastAutoBookmarkAt: 0,
  lastAutoReference: "",
  lastChapterRef: "",
  velocitySamples: [],
  autoScrollActive: false,
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
  devDrawerOpen: false,
  devDrawerTab: "storage",
  historyBookmarkId: null,
};

const UI_SESSION_KEY = "scripture-pwa-ui-session-v1";
const DEBUG_DRAWER_TABS = new Set(["storage", "logs", "objects", "visibility"]);

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
const autoScrollPanel = document.getElementById("autoScrollPanel");
const autoScrollStop = document.getElementById("autoScrollStop");
const autoScrollSpeed = document.getElementById("autoScrollSpeed");
const autoScrollSpeedLabel = document.getElementById("autoScrollSpeedLabel");
const scroller = document.getElementById("readerScroller");
const content = document.getElementById("readerContent");

const navigationService = createNavigationService();
const visibilityService = createVisibilityService();
const visibilityEmit = createTelemetryEmitter("ui.devDrawer");
const dataEmit = createTelemetryEmitter("backend.dataAccess");
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

function getVisibleViewId() {
  return viewIds.find((id) => !document.getElementById(id).hidden) || "homeView";
}

function sanitizeDebugDrawerTab(value) {
  return DEBUG_DRAWER_TABS.has(value) ? value : "storage";
}

function readUiSessionState() {
  try {
    const raw = localStorage.getItem(UI_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      viewId: viewIds.includes(parsed?.viewId) ? parsed.viewId : "homeView",
      route: typeof parsed?.route === "string" ? parsed.route : "#/",
      devDrawerOpen: parsed?.devDrawerOpen === true,
      devDrawerTab: sanitizeDebugDrawerTab(parsed?.devDrawerTab),
      historyBookmarkId: typeof parsed?.historyBookmarkId === "string" ? parsed.historyBookmarkId : null,
    };
  } catch {
    return null;
  }
}

function persistUiSessionState(nextState = {}) {
  const current = readUiSessionState() || {};
  const merged = {
    ...current,
    ...nextState,
  };
  try {
    localStorage.setItem(
      UI_SESSION_KEY,
      JSON.stringify({
        viewId: viewIds.includes(merged.viewId) ? merged.viewId : "homeView",
        route: typeof merged.route === "string" ? merged.route : "#/",
        devDrawerOpen: merged.devDrawerOpen === true,
        devDrawerTab: sanitizeDebugDrawerTab(merged.devDrawerTab),
        historyBookmarkId: typeof merged.historyBookmarkId === "string" ? merged.historyBookmarkId : null,
      }),
    );
  } catch {}
}

function persistUiSessionFromActiveView(partial = {}) {
  persistUiSessionState({
    viewId: getVisibleViewId(),
    route: window.location.hash || navigationService.loadFallbackRoute() || "#/",
    devDrawerOpen: state.devDrawerOpen,
    devDrawerTab: state.devDrawerTab,
    historyBookmarkId: state.historyBookmarkId,
    ...partial,
  });
}

function restoreUiSessionState() {
  const restored = readUiSessionState();
  if (!restored) return null;
  state.devDrawerOpen = restored.devDrawerOpen;
  state.devDrawerTab = restored.devDrawerTab;
  state.historyBookmarkId = restored.historyBookmarkId;
  return restored;
}

function persistRouteSnapshot(route) {
  persistUiSessionFromActiveView({ route: route || "#/" });
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
  autoScrollPanel.hidden = inReader ? !state.autoScrollActive : true;
  autoScrollStart.textContent = state.autoScrollActive ? "Stop" : "Auto-scroll";
  updateHeader(viewId);
  updateInstallVisibility(viewId);
  updateDevEasterEggVisibility();
  persistUiSessionFromActiveView({ viewId });
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
  autoScrollPanel.hidden = true;
  autoScrollStart.textContent = "Auto-scroll";
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
  persistRouteSnapshot(route);
}

function ensureReaderService() {
  if (readerService) return readerService;
  readerService = createReaderService({
    scroller,
    content,
    getWorkMeta(location) {
      return state.index.works.find((item) => item.id === location.workId) || state.index.works[0];
    },
    bookCache: cache,
    onAnchorChange: handleAnchorChange,
  });
  return readerService;
}

function openWork(workId) {
  state.currentWork = state.index.works.find((work) => work.id === workId) || null;
  state.currentBook = null;
  pushRouteAndSave(`#/w/${workId}`);
  renderBooksView();
}

function openBook(bookId) {
  if (!state.currentWork) return;
  state.currentBook = state.currentWork.books.find((book) => book.id === bookId) || null;
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
  autoScrollSpeedLabel.textContent = `${autoScrollSpeed.value} px/s`;
  reader.setAutoScrollSpeed(Number(autoScrollSpeed.value));
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
    onOpenBookmarkLocation: (location) => openReader(location),
  });
}

function renderHistoryView(bookmark) {
  state.historyBookmarkName = `History: ${bookmark.name}`;
  state.historyBookmarkId = bookmark.id;
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
  persistRouteSnapshot(`#/history/${bookmark.id}`);
  persistUiSessionFromActiveView({ viewId: "historyView", historyBookmarkId: bookmark.id });
}

function restoreHistoryBookmarkById(bookmarkId) {
  if (!bookmarkId) return false;
  const bookmark = bookmarkService.getBookmarks().find((item) => item.id === bookmarkId);
  if (!bookmark) return false;
  renderHistoryView(bookmark);
  return true;
}

function renderHomeView() {
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
  const now = meta.timestamp;
  state.velocitySamples.push({ v: meta.velocity, ts: now });
  const avg = getAverageVelocityOverWindow();
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

  const toFollow = bookmarkService.getBookmarkToFollow(anchor);
  if (!toFollow) {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
    return;
  }
  if (shouldAutoFollow(anchor, meta)) {
    bookmarkService.updateBookmarkLocation(toFollow.id, anchor, meta.autoScrolling ? "auto-scroll" : "scroll");
    state.lastAutoBookmarkAt = meta.timestamp;
    state.lastAutoReference = anchor.reference;
    bookmarkStatusEl.textContent = `${toFollow.name} updated`;
    readerStatusEl.hidden = false;
  } else {
    bookmarkStatusEl.textContent = "";
    readerStatusEl.hidden = true;
  }
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
  "scripture-pwa-ui-session-v1": "UI Session",
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
  if (modules.size > 0 && !modules.has(entry.module || "backend.logging")) return false;
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

function renderLogFilterControls(filtersEl, entries) {
  if (!filtersEl) return;
  const modules = [...new Set(entries.map((e) => e.module || "backend.logging"))].sort();
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
  state.lastRenderedLogEntries = filtered;
  if (countEl) {
    countEl.textContent = `${filtered.length}/${entries.length} visible`;
  }
  if (filtered.length === 0) {
    container.innerHTML = "<p>No entries match the current filters.</p>";
    return;
  }
  container.innerHTML = filtered
    .map((e) => {
      const details = e.details
        ? `<code class="dev-log-details">${escapeHtml(typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 2))}</code>`
        : "";
      const metaParts = [
        `<span class="dev-log-level">${e.level.toUpperCase()}</span>`,
        e.module ? `<span>${escapeHtml(e.module)}</span>` : "",
        e.event ? `<span>${escapeHtml(e.event)}</span>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const metrics = e.metrics ? `<code class="dev-log-details">${escapeHtml(JSON.stringify(e.metrics, null, 2))}</code>` : "";
      const refs = e.refs ? `<code class="dev-log-details">${escapeHtml(JSON.stringify(e.refs, null, 2))}</code>` : "";
      return `<article class="dev-log-entry level-${e.level}"><header><span class="dev-log-message">${escapeHtml(e.summary || e.message)}</span><span class="dev-log-meta">${metaParts} <time>${new Date(e.timestamp).toLocaleString()}</time></span></header>${metrics}${refs}${details}</article>`;
    })
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

function setActiveDebugTab(tabName) {
  const safeTab = sanitizeDebugDrawerTab(tabName);
  state.devDrawerTab = safeTab;
  document.querySelectorAll(".dev-tab[data-tab]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === safeTab);
  });
}

function applyDebugDrawerState({
  drawer,
  showStorage,
  showLogs,
  showObjects,
  showVisibility,
  persist = true,
  overrideOpen,
} = {}) {
  if (!drawer) return;
  const targetOpen = typeof overrideOpen === "boolean" ? overrideOpen : state.devDrawerOpen;
  drawer.hidden = !targetOpen;
  state.devDrawerOpen = targetOpen;
  const tab = sanitizeDebugDrawerTab(state.devDrawerTab);
  state.devDrawerTab = tab;
  setActiveDebugTab(tab);
  if (targetOpen) {
    if (tab === "storage") showStorage();
    else if (tab === "logs") void showLogs();
    else if (tab === "objects") showObjects();
    else showVisibility();
  }
  if (persist) {
    persistUiSessionFromActiveView({
      devDrawerOpen: state.devDrawerOpen,
      devDrawerTab: state.devDrawerTab,
    });
  }
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
    const opening = drawer.hidden;
    if (opening) {
      visibilityEmit({
        level: "info",
        event: "debug_drawer_open",
        summary: "Debug drawer opened",
      });
    }
    applyDebugDrawerState({
      drawer,
      showStorage,
      showLogs,
      showObjects,
      showVisibility,
      overrideOpen: opening,
    });
  });

  document.getElementById("devDrawerClose")?.addEventListener("click", () => {
    applyDebugDrawerState({
      drawer,
      showStorage,
      showLogs,
      showObjects,
      showVisibility,
      overrideOpen: false,
    });
  });

  document.querySelectorAll(".dev-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = sanitizeDebugDrawerTab(tab.dataset.tab);
      setActiveDebugTab(tabName);
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
      persistUiSessionFromActiveView({
        devDrawerOpen: !drawer.hidden,
        devDrawerTab: tabName,
      });
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
        level: e.level,
        module: e.module,
        event: e.event,
        summary: e.summary || e.message,
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
    const details = entry.details
      ? `<code class="dev-log-details">${escapeHtml(typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2))}</code>`
      : "";
    const refs = entry.refs ? `<code class="dev-log-details">${escapeHtml(JSON.stringify(entry.refs, null, 2))}</code>` : "";
    const metrics = entry.metrics ? `<code class="dev-log-details">${escapeHtml(JSON.stringify(entry.metrics, null, 2))}</code>` : "";
    const html = `<article class="dev-log-entry level-${entry.level}"><header><span class="dev-log-message">${escapeHtml(entry.summary || entry.message)}</span><span class="dev-log-meta"><span class="dev-log-level">${entry.level.toUpperCase()}</span> ${escapeHtml(entry.module || "")} ${escapeHtml(entry.event || "")} <time>${new Date().toLocaleString()}</time></span></header>${metrics}${refs}${details}</article>`;
    logEntries.insertAdjacentHTML("beforeend", html);
    requestAnimationFrame(() => {
      logsPanel.scrollTop = logsPanel.scrollHeight;
    });
  }

  applyDebugDrawerState({
    drawer,
    showStorage,
    showLogs,
    showObjects,
    showVisibility,
    persist: false,
  });

  setOnLogCallback(appendLogEntryLive);
}

function wireGlobalEvents() {
  homeButton.addEventListener("click", () => {
    stopAutoScrollAndUpdateUI();
    pushRouteAndSave("#/");
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
    } else if (!chaptersView.hidden) {
      pushRouteAndSave(`#/w/${state.currentWork?.id || ""}`);
      renderBooksView();
    } else if (!booksView.hidden || !historyView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
    }
  });

  autoScrollStart.addEventListener("click", () => {
    if (state.autoScrollActive) {
      stopAutoScrollAndUpdateUI();
      return;
    }
    ensureReaderService().startAutoScroll();
    state.autoScrollActive = true;
    autoScrollPanel.hidden = false;
    autoScrollStart.textContent = "Stop";
  });

  autoScrollStop.addEventListener("click", () => {
    stopAutoScrollAndUpdateUI();
  });

  autoScrollSpeed.addEventListener("input", () => {
    const speed = Number(autoScrollSpeed.value);
    autoScrollSpeedLabel.textContent = `${speed} px/s`;
    ensureReaderService().setAutoScrollSpeed(speed);
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
      renderChaptersView();
      return;
    }
  }
  if (parsed.view === "books" && parsed.workId) {
    const work = state.index.works.find((w) => w.id === parsed.workId);
    if (work) {
      state.currentWork = work;
      state.currentBook = null;
      renderBooksView();
      return;
    }
  }
  if (parsed.view === "history") {
    const targetBookmarkId = parsed.bookmarkId || state.historyBookmarkId;
    if (restoreHistoryBookmarkById(targetBookmarkId)) {
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

  const restoredUiSession = restoreUiSessionState();
  const initialRoute =
    window.location.hash ||
    restoredUiSession?.route ||
    navigationService.loadFallbackRoute() ||
    "#/";
  if (initialRoute && initialRoute !== "#/") {
    await restoreFromRoute(initialRoute);
  } else {
    if (restoredUiSession?.viewId === "historyView" && restoreHistoryBookmarkById(restoredUiSession.historyBookmarkId)) {
      // History view restored from persisted UI session state.
    } else {
      renderHomeView();
    }
  }
  navigationService.push(routeFromState());
  persistUiSessionFromActiveView();

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
