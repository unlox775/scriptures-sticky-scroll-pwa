import { isDevMode, logEvent } from "./logger.js";

const BOOKMARKS_KEY = "scripture-pwa-bookmarks-v1";

function isoDateOnly(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

const DEFAULT_1NE_1_1 = {
  workId: "book-of-mormon",
  workTitle: "Book of Mormon",
  bookId: "1-ne",
  bookTitle: "1 Nephi",
  chapter: 1,
  verse: 1,
  reference: "1 Nephi 1:1",
};

function makeDefaultBookmark() {
  return {
    id: crypto.randomUUID(),
    name: "Daily Reading",
    location: DEFAULT_1NE_1_1,
    updatedAt: null,
    history: [],
  };
}

function sanitizeState(raw) {
  if (!raw || !Array.isArray(raw.bookmarks) || raw.bookmarks.length === 0) {
    const fallback = makeDefaultBookmark();
    return { activeBookmarkId: fallback.id, bookmarks: [fallback] };
  }
  const active = raw.bookmarks.find((b) => b.id === raw.activeBookmarkId) || raw.bookmarks[0];
  return {
    activeBookmarkId: active.id,
    bookmarks: raw.bookmarks.map((bookmark) => ({
      id: bookmark.id || crypto.randomUUID(),
      name: bookmark.name || "Bookmark",
      location: bookmark.location || null,
      updatedAt: bookmark.updatedAt || null,
      history: Array.isArray(bookmark.history) ? bookmark.history : [],
    })),
  };
}

export class BookmarkStore {
  constructor() {
    this.state = sanitizeState(this.loadRaw());
    this.save();
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.bookmarks",
        event: "bookmark_store_init",
        summary: "Bookmark store initialized",
        metrics: {
          bookmarks: this.state.bookmarks.length,
        },
        refs: {
          activeBookmarkId: this.state.activeBookmarkId,
        },
      });
    }
  }

  loadRaw() {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "null");
    } catch (_error) {
      return null;
    }
  }

  save() {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(this.state));
  }

  getBookmarks() {
    return this.state.bookmarks;
  }

  getActiveBookmark() {
    return this.state.bookmarks.find((bookmark) => bookmark.id === this.state.activeBookmarkId) || null;
  }

  setActiveBookmark(bookmarkId) {
    if (!this.state.bookmarks.some((bookmark) => bookmark.id === bookmarkId)) {
      return;
    }
    this.state.activeBookmarkId = bookmarkId;
    this.save();
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.bookmarks",
        event: "bookmark_active_set",
        summary: "Changed active bookmark",
        refs: { bookmarkId },
      });
    }
  }

  createBookmark(name = "Bookmark") {
    const bookmark = {
      id: crypto.randomUUID(),
      name,
      location: null,
      updatedAt: null,
      history: [],
    };
    this.state.bookmarks.push(bookmark);
    this.save();
    logEvent({
      level: "info",
      module: "backend.bookmarks",
      event: "bookmark_create",
      summary: "Created new bookmark",
      refs: { bookmarkId: bookmark.id },
      details: { name: bookmark.name },
      metrics: { totalBookmarks: this.state.bookmarks.length },
    });
    return bookmark;
  }

  updateActiveLocation(location, source = "manual") {
    const active = this.getActiveBookmark();
    if (!active || !location) {
      return null;
    }
    return this.updateBookmarkLocation(active.id, location, source);
  }

  /** Compare two locations; returns -1 if a < b, 0 if equal, 1 if a > b. */
  static compareLocations(a, b) {
    if (!a || !b) return 0;
    if (a.workId !== b.workId) return a.workId < b.workId ? -1 : 1;
    if (a.bookId !== b.bookId) return a.bookId < b.bookId ? -1 : 1;
    if (a.chapter !== b.chapter) return (a.chapter || 0) < (b.chapter || 0) ? -1 : 1;
    const va = a.verse || 0;
    const vb = b.verse || 0;
    return va < vb ? -1 : va > vb ? 1 : 0;
  }

  /** Find the bookmark whose location is at or before the given location (for auto-follow). */
  getBookmarkToFollow(currentLocation) {
    if (!currentLocation) return null;
    let best = null;
    for (const b of this.state.bookmarks) {
      if (!b.location) continue;
      const cmp = BookmarkStore.compareLocations(b.location, currentLocation);
      if (cmp <= 0) {
        if (!best || BookmarkStore.compareLocations(best.location, b.location) < 0) {
          best = b;
        }
      }
    }
    return best;
  }

  updateBookmarkLocation(bookmarkId, location, source = "manual") {
    const bookmark = this.state.bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark || !location) return null;
    const now = Date.now();
    const day = isoDateOnly(now);
    const historyItem = {
      day,
      timestamp: new Date(now).toISOString(),
      reference: location.reference,
      location,
      source,
    };
    bookmark.location = location;
    bookmark.updatedAt = historyItem.timestamp;
    const existingIndex = bookmark.history.findIndex((item) => item.day === day);
    if (existingIndex >= 0) {
      bookmark.history[existingIndex] = historyItem;
    } else {
      bookmark.history.push(historyItem);
    }
    this.save();
    logEvent({
      level: source === "manual" ? "info" : "debug",
      module: "backend.bookmarks",
      event: "bookmark_location_updated",
      summary: "Updated bookmark location",
      refs: {
        bookmarkId,
        source,
      },
      details: {
        reference: location.reference,
        day,
      },
    });
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.bookmarks",
        event: "bookmark_history_snapshot",
        summary: "Recorded one-per-day bookmark history snapshot",
        refs: { bookmarkId, day },
        metrics: { historyCount: bookmark.history.length },
      });
    }
    return bookmark;
  }

  /** History entries, at most one per day, newest first. */
  getHistoryOnePerDay(bookmark) {
    const byDay = new Map();
    for (const h of bookmark.history) {
      if (!byDay.has(h.day) || h.timestamp > (byDay.get(h.day).timestamp || "")) {
        byDay.set(h.day, h);
      }
    }
    return [...byDay.values()].sort((a, b) => (b.day > a.day ? 1 : -1));
  }
}
