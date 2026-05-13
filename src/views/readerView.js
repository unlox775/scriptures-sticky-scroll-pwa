import { escapeHtml } from "../viewUtils.js";

export function renderBookmarkRibbons({
  overlay,
  scroller,
  content,
  bookmarks,
  currentLocation,
  onOpenBookmarkLocation,
}) {
  if (!overlay || !scroller) return;
  const inView = bookmarks.filter((bookmark) => {
    if (!bookmark.location || !currentLocation) return false;
    if (bookmark.location.workId !== currentLocation.workId) return false;
    if (bookmark.location.bookId !== currentLocation.bookId) return false;
    const ch = currentLocation.chapter || 0;
    const bCh = bookmark.location.chapter || 0;
    return Math.abs(ch - bCh) <= 3;
  });

  const scrollerRect = scroller.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const ribbonLeft = Math.max(4, contentRect.left - scrollerRect.left - 76);
  const items = [];
  for (const bookmark of inView) {
    const loc = bookmark.location;
    if (!loc) continue;
    const bookId = loc.bookId;
    const chapter = String(loc.chapter || 1);
    const verse = String(loc.verse || 1);
    const chapterEl = content.querySelector(
      `.lab-chapter[data-book-id="${CSS.escape(bookId)}"][data-chapter="${chapter}"]`,
    );
    const verseEl = chapterEl?.querySelector(`.lab-verse[data-verse="${verse}"]`);
    if (!verseEl) continue;
    const verseRect = verseEl.getBoundingClientRect();
    const top = verseRect.top - scrollerRect.top + verseRect.height / 2;
    if (top < -20 || top > scrollerRect.height + 20) continue;
    items.push({ bookmark, top, left: ribbonLeft });
  }

  overlay.innerHTML = items
    .map(
      ({ bookmark, top, left }) =>
        `<span class="bookmark-ribbon" data-bookmark-id="${bookmark.id}" title="${(bookmark.location?.reference || bookmark.name).replace(/"/g, "&quot;")}" style="top: ${Math.round(top)}px; left: ${Math.round(left)}px">${escapeHtml(bookmark.name)}</span>`,
    )
    .join("");

  overlay.querySelectorAll(".bookmark-ribbon").forEach((el) => {
    el.addEventListener("click", () => {
      const bookmark = bookmarks.find((x) => x.id === el.dataset.bookmarkId);
      if (bookmark?.location) onOpenBookmarkLocation?.(bookmark.location);
    });
  });
}

