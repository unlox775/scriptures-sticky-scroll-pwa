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

const viewIds = ["homeView", "booksView", "chaptersView", "readerView"];
const homeView = document.getElementById("homeView");
const booksView = document.getElementById("booksView");
const chaptersView = document.getElementById("chaptersView");
const readerView = document.getElementById("readerView");
const breadcrumbEl = document.getElementById("breadcrumb");
const installButton = document.getElementById("installButton");
const homeButton = document.getElementById("homeButton");
const currentReferenceEl = document.getElementById("currentReference");
const bookmarkStatusEl = document.getElementById("bookmarkStatus");
const activeBookmarkSelect = document.getElementById("activeBookmarkSelect");
const newBookmarkButton = document.getElementById("newBookmarkButton");
const showChaptersButton = document.getElementById("showChaptersButton");
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
  if (!value) {
    return "Never";
  }
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

  if (state.reader) {
    state.reader.destroy();
  }
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
  renderActiveBookmarkSelect();
  setView("readerView");
  breadcrumbEl.textContent = `${work.title} > ${book.title}`;
}

function renderHomeView() {
  setView("homeView");
  breadcrumbEl.textContent = "Standard Works Reader";
  const activeBookmark = bookmarks.getActiveBookmark();
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
    .map((bookmark) => {
      const history = [...bookmark.history].reverse().slice(0, 4);
      const historyHtml =
        history.length === 0
          ? "<li>No history yet</li>"
          : history.map((entry) => `<li>${entry.day}: ${entry.reference}</li>`).join("");
      return `
      <article class="bookmark-item">
        <div>
          <strong>${bookmark.name}</strong>
          <div class="bookmark-meta">${bookmark.location?.reference || "No location yet"}</div>
          <div class="bookmark-meta">Updated: ${formatTimestamp(bookmark.updatedAt)}</div>
          <ul class="history-list">${historyHtml}</ul>
        </div>
        <div>
          <button data-activate-bookmark="${bookmark.id}">${
            activeBookmark?.id === bookmark.id ? "Active" : "Set Active"
          }</button>
          <button data-open-bookmark="${bookmark.id}">Open</button>
        </div>
      </article>`;
    })
    .join("");

  homeView.innerHTML = `
    <section class="panel">
      <h2>Scripture Collections</h2>
      <div class="grid works">${works}</div>
    </section>

    <section class="panel" style="margin-top: 1rem;">
      <h2>Bookmarks</h2>
      <p>Sticky auto-follow updates your active bookmark as you read.</p>
      <div class="bookmark-list">${bookmarkItems}</div>
    </section>
  `;

  homeView.querySelectorAll("[data-open-work]").forEach((button) => {
    button.addEventListener("click", () => openWork(button.dataset.openWork));
  });
  homeView.querySelectorAll("[data-activate-bookmark]").forEach((button) => {
    button.addEventListener("click", () => {
      bookmarks.setActiveBookmark(button.dataset.activateBookmark);
      renderActiveBookmarkSelect();
      renderHomeView();
    });
  });
  homeView.querySelectorAll("[data-open-bookmark]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bookmark = bookmarks.getBookmarks().find((item) => item.id === button.dataset.openBookmark);
      if (!bookmark) {
        return;
      }
      const location = bookmark.location || defaultLocationFromIndex();
      await openReader(location);
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

  booksView.querySelectorAll("[data-open-book]").forEach((button) => {
    button.addEventListener("click", () => openBook(button.dataset.openBook));
  });
}

function renderChaptersView() {
  setView("chaptersView");
  if (!state.currentWork || !state.currentBook) {
    renderBooksView();
    return;
  }
  breadcrumbEl.textContent = `${state.currentWork.title} > ${state.currentBook.title} > Chapters`;
  const chapterButtons = Array.from({ length: state.currentBook.chapterCount }, (_, index) => index + 1)
    .map(
      (chapter) => `
      <button class="secondary-btn" data-open-chapter="${chapter}">
        ${chapter}
      </button>`,
    )
    .join("");

  chaptersView.innerHTML = `
    <section class="panel">
      <h2>${state.currentBook.title}</h2>
      <p>Tap a chapter tile to enter continuous reading mode.</p>
      <div class="grid chapters">${chapterButtons}</div>
    </section>
  `;

  chaptersView.querySelectorAll("[data-open-chapter]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openReader({
        workId: state.currentWork.id,
        workTitle: state.currentWork.title,
        bookId: state.currentBook.id,
        bookTitle: state.currentBook.title,
        chapter: Number(button.dataset.openChapter),
        verse: 1,
        reference: `${state.currentBook.title} ${button.dataset.openChapter}:1`,
      });
    });
  });
}

function renderActiveBookmarkSelect() {
  const list = bookmarks.getBookmarks();
  const active = bookmarks.getActiveBookmark();
  activeBookmarkSelect.innerHTML = list
    .map((bookmark) => `<option value="${bookmark.id}">${bookmark.name}</option>`)
    .join("");
  if (active) {
    activeBookmarkSelect.value = active.id;
  }
}

function shouldAutoFollow(anchor, meta) {
  const speed = Math.abs(meta.velocity);
  const now = meta.timestamp;
  if (speed < 8 || speed > 3800) {
    return false;
  }
  if (anchor.reference === state.lastAutoReference && now - state.lastAutoBookmarkAt < 2200) {
    return false;
  }
  if (now - state.lastAutoBookmarkAt < 1200) {
    return false;
  }
  return true;
}

function handleAnchorChange(anchor, meta) {
  currentReferenceEl.textContent = `Reference: ${anchor.reference}`;
  state.currentLocation = anchor;
  const active = bookmarks.getActiveBookmark();
  if (!active) {
    bookmarkStatusEl.textContent = "Bookmark follow: no active bookmark";
    return;
  }
  if (shouldAutoFollow(anchor, meta)) {
    bookmarks.updateActiveLocation(anchor, meta.autoScrolling ? "auto-scroll" : "scroll");
    state.lastAutoBookmarkAt = meta.timestamp;
    state.lastAutoReference = anchor.reference;
    bookmarkStatusEl.textContent = `Bookmark "${active.name}" auto-saved at ${anchor.reference}`;
  } else {
    bookmarkStatusEl.textContent = `Bookmark "${active.name}" watching`;
  }
}

function wireGlobalEvents() {
  homeButton.addEventListener("click", () => {
    if (state.reader) {
      state.reader.stopAutoScroll();
    }
    renderHomeView();
  });

  activeBookmarkSelect.addEventListener("change", () => {
    bookmarks.setActiveBookmark(activeBookmarkSelect.value);
    if (!homeView.hidden) {
      renderHomeView();
    }
  });

  newBookmarkButton.addEventListener("click", () => {
    const name = window.prompt("Bookmark name:", "Reading Plan");
    if (!name) {
      return;
    }
    bookmarks.createBookmark(name.trim());
    renderActiveBookmarkSelect();
    if (!homeView.hidden) {
      renderHomeView();
    }
  });

  showChaptersButton.addEventListener("click", () => {
    if (state.reader) {
      state.reader.stopAutoScroll();
    }
    renderChaptersView();
  });

  autoScrollStart.addEventListener("click", () => {
    if (!state.reader) {
      return;
    }
    state.reader.startAutoScroll();
    autoScrollPanel.hidden = false;
    autoScrollStart.hidden = true;
  });

  autoScrollStop.addEventListener("click", () => {
    if (!state.reader) {
      return;
    }
    state.reader.stopAutoScroll();
    autoScrollPanel.hidden = true;
    autoScrollStart.hidden = false;
  });

  autoScrollSpeed.addEventListener("input", () => {
    const speed = Number(autoScrollSpeed.value);
    autoScrollSpeedLabel.textContent = `${speed} px/s`;
    if (state.reader) {
      state.reader.setAutoScrollSpeed(speed);
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!state.deferredPrompt) {
      return;
    }
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  await navigator.serviceWorker.register("/sw.js");
}

async function init() {
  state.index = await loadIndex();
  wireGlobalEvents();
  renderActiveBookmarkSelect();
  renderHomeView();
  await registerServiceWorker();

  const active = bookmarks.getActiveBookmark();
  if (active && !active.location) {
    bookmarks.updateActiveLocation(defaultLocationFromIndex(), "init");
  }
}

init().catch((error) => {
  homeView.innerHTML = `<section class="panel"><h2>Failed to load app</h2><pre>${error.message}</pre></section>`;
});
