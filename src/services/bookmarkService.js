import { createTelemetryEmitter } from "../telemetry.js";

export function createBookmarkService(bookmarkStore) {
  const emit = createTelemetryEmitter("backend.bookmarks");

  return {
    getBookmarks() {
      return bookmarkStore.getBookmarks();
    },
    getBookmarkToFollow(location) {
      return bookmarkStore.getBookmarkToFollow(location);
    },
    getHistoryOnePerDay(bookmark) {
      return bookmarkStore.getHistoryOnePerDay(bookmark);
    },
    createBookmark(name = "Bookmark") {
      const bookmark = bookmarkStore.createBookmark(name);
      emit({
        level: "info",
        event: "bookmark_create",
        summary: "Created bookmark",
        refs: { bookmarkId: bookmark.id },
        details: { name: bookmark.name },
      });
      return bookmark;
    },
    updateBookmarkLocation(bookmarkId, location, source = "manual") {
      const bookmark = bookmarkStore.updateBookmarkLocation(bookmarkId, location, source);
      if (bookmark) {
        emit({
          level: source === "manual" ? "info" : "debug",
          event: source === "manual" ? "bookmark_move" : "bookmark_auto_follow_update",
          summary: source === "manual" ? "Moved bookmark" : "Auto-follow updated bookmark",
          refs: {
            bookmarkId: bookmark.id,
            source,
            workId: location?.workId,
            bookId: location?.bookId,
            chapter: location?.chapter,
            verse: location?.verse,
          },
          details: { reference: location?.reference, name: bookmark.name },
          minVerbosity: source === "manual" ? "minimal" : "standard",
        });
      }
      return bookmark;
    },
    setActiveBookmark(bookmarkId) {
      bookmarkStore.setActiveBookmark(bookmarkId);
    },
    getActiveBookmark() {
      return bookmarkStore.getActiveBookmark();
    },
    compareLocations(a, b) {
      return bookmarkStore.constructor.compareLocations(a, b);
    },
    updateActiveLocation(location, source = "manual") {
      return bookmarkStore.updateActiveLocation(location, source);
    },
  };
}
