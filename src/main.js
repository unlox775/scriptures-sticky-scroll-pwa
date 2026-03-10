import "./styles.css";
import { loadIndex, BookCache } from "./data.js";
import { BookmarkStore } from "./bookmarks.js";
import { ReaderEngine } from "./readerEngine.js";
import { logInfo, logDebug, logWarn, logError, getLogsForCopy, getAllSessions, getEntriesForSession, setOnLogCallback, isDevMode, setDevMode } from "./logger.js";
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
  renderBooksView();
}

function openBook(bookId) {
  state.currentBook = state.currentWork.books.find((book) => book.id === bookId) || null;
  pushRouteAndSave(`#/b/${state.currentWork.id}/${bookId}`);
  renderChaptersView();
  logInfo("nav:openBook", { workId: state.currentWork?.id, bookId, title: state.currentBook?.title });
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
  logInfo("nav:openReader", { loc: safeLocation.reference, workId: work.id, bookId: book.id, chapter: safeLocation.chapter });
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
  historyView.querySelector("#historyBackButton").addEventListener("click", () => {
    renderHomeView();
  });
}

function renderHomeView() {
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

  booksView.querySelectorAll("[data-open-book]").forEach((el) => {
    el.addEventListener("click", () => openBook(el.dataset.openBook));
  });
}

function renderChaptersView() {
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

  chaptersView.querySelectorAll("[data-open-chapter]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const chapter = Number(btn.dataset.openChapter);
      logInfo("nav:chapterClick", { workId: state.currentWork?.id, bookId: state.currentBook?.id, chapter });
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
    logDebug("autoFollow skip", { reason: "scrolled too fast", avg: avg.toFixed(1), threshold: SLOW_READING_THRESHOLD });
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
      logInfo("scroll:chapterChange", { ref: chapterRef, fullRef: anchor.reference });
    }
  }
  if (!readerView.hidden) updateHeader("readerView");
  pushRoute(stateToRoute(state));
  renderBookmarkRibbons();
  if (isDevMode()) {
    logDebug("anchor", {
      ref: anchor?.reference,
      velocity: meta?.velocity?.toFixed(1),
      avgVel: getAverageVelocityOverWindow().toFixed(1),
      autoScroll: meta?.autoScrolling,
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
    if (isDevMode()) logInfo("autoFollow", { name: toFollow.name, ref: anchor.reference });
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
    logInfo("nav:home");
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
      logInfo("nav:back", { to: "chapters", workId: state.currentWork?.id, bookId: state.currentBook?.id });
    } else if (!chaptersView.hidden) {
      pushRouteAndSave(`#/w/${state.currentWork?.id || ""}`);
      renderBooksView();
      logInfo("nav:back", { to: "books", workId: state.currentWork?.id });
    } else if (!booksView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
      logInfo("nav:back", { to: "home" });
    } else if (!historyView.hidden) {
      pushRouteAndSave("#/");
      renderHomeView();
      logInfo("nav:back", { to: "home" });
    }
  });

  autoScrollStart.addEventListener("click", () => {
    if (!state.reader) return;
    if (state.autoScrollActive) {
      stopAutoScrollAndUpdateUI();
      return;
    }
    state.reader.startAutoScroll();
    state.autoScrollActive = true;
    autoScrollPanel.hidden = false;
    autoScrollStart.textContent = "Stop";
  });

  autoScrollStop.addEventListener("click", () => {
    if (!state.reader) return;
    stopAutoScrollAndUpdateUI();
  });

  autoScrollSpeed.addEventListener("input", () => {
    const speed = Number(autoScrollSpeed.value);
    autoScrollSpeedLabel.textContent = `${speed} px/s`;
    if (state.reader) state.reader.setAutoScrollSpeed(speed);
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
      const msg = "To add this app to your home screen:\n\n1. Tap the Share button (square with arrow) at the bottom of the screen\n2. Scroll and tap \"Add to Home Screen\"\n3. Tap Add";
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
      const details = e.details
        ? `<code class="dev-log-details">${escapeHtml(typeof e.details === "string" ? e.details : JSON.stringify(e.details, null, 2))}</code>`
        : "";
      return `<article class="dev-log-entry level-${e.level}"><header><span class="dev-log-message">${escapeHtml(e.message)}</span><span class="dev-log-meta"><span class="dev-log-level">${e.level.toUpperCase()}</span> <time>${new Date(e.timestamp).toLocaleString()}</time></span></header>${details}</article>`;
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

  if (isDevMode()) {
    if (bugIcon) bugIcon.hidden = false;
  }

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
      const tab = document.querySelector(".dev-tab.active")?.dataset.tab || "storage";
      if (tab === "storage") showStorage();
      else void showLogs();
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
      if (tab.dataset.tab === "storage") showStorage();
      else void showLogs();
    });
  });

  logSelect?.addEventListener("change", async () => {
    const sid = logSelect.value || null;
    await renderLogEntries(sid, logEntries);
    updatePrevNextButtons();
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
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => { copyBtn.textContent = "Copy logs"; }, 1200);
    }
  });

  function appendLogEntryLive(entry) {
    if (!logsPanel || logsPanel.hidden || !logEntries) return;
    const sid = logSelect?.value || "";
    if (entry.sessionId !== sid) return;
    const details = entry.details
      ? `<code class="dev-log-details">${escapeHtml(typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2))}</code>`
      : "";
    const html = `<article class="dev-log-entry level-${entry.level}"><header><span class="dev-log-message">${escapeHtml(entry.message)}</span><span class="dev-log-meta"><span class="dev-log-level">${entry.level.toUpperCase()}</span> <time>${new Date().toLocaleString()}</time></span></header>${details}</article>`;
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
  logInfo("restoreFromRoute", { route, parsed });
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
  renderHomeView();
}

async function init() {
  logInfo("init start");
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
      restoreFromRoute(h);
    }
  });

  await registerServiceWorker();
  logInfo("init complete");
}

init().catch((err) => {
  homeView.innerHTML = `<section class="panel"><h2>Failed to load app</h2><pre>${err.message}</pre></section>`;
});
