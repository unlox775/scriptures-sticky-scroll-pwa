const BOOKMARKS_KEY = "scripture-pwa-bookmarks-v1";

function isoDateOnly(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function makeDefaultBookmark() {
  return {
    id: crypto.randomUUID(),
    name: "Daily Reading",
    location: null,
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
    this.state.activeBookmarkId = bookmark.id;
    this.save();
    return bookmark;
  }

  updateActiveLocation(location, source = "manual") {
    const active = this.getActiveBookmark();
    if (!active || !location) {
      return null;
    }
    const now = Date.now();
    const day = isoDateOnly(now);
    const historyItem = {
      day,
      timestamp: new Date(now).toISOString(),
      reference: location.reference,
      location,
      source,
    };

    active.location = location;
    active.updatedAt = historyItem.timestamp;
    const existingIndex = active.history.findIndex((item) => item.day === day);
    if (existingIndex >= 0) {
      active.history[existingIndex] = historyItem;
    } else {
      active.history.push(historyItem);
    }
    this.save();
    return active;
  }
}
