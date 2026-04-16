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
    emitAutoFollowUpdateContext(location, source) {
      const sourceEvent = source === "auto-scroll" || source === "scroll" ? "bookmark_auto_follow_update" : "bookmark_move";
      emit({
        level: sourceEvent === "bookmark_move" ? "info" : "debug",
        event: sourceEvent,
        summary: sourceEvent === "bookmark_move" ? "Moved bookmark" : "Auto-follow updated bookmark",
        refs: {
          source,
          workId: location?.workId,
          bookId: location?.bookId,
          chapter: location?.chapter,
          verse: location?.verse,
        },
        details: { reference: location?.reference },
        minVerbosity: sourceEvent === "bookmark_move" ? "minimal" : "standard",
      });
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
        const isAutoFollow = source === "auto-scroll" || source === "scroll";
        emit({
          level: source === "manual" ? "info" : "debug",
          event: isAutoFollow ? "bookmark_auto_follow_update" : "bookmark_move",
          summary: isAutoFollow ? "Auto-follow updated bookmark" : "Moved bookmark",
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
