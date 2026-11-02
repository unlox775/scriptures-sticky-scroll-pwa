export const RIBBON_NEAR_CHAPTER_GAP = 3;

// True when a bookmark is close enough to the current location to try rendering its ribbon.
// Uses seq (chapter index across the whole work) when present, so a bookmark at the start of
// the next book (e.g. Ether 1:1 while the header says Mormon 9) still counts as nearby.
export function isBookmarkNearLocation(bookmark, currentLocation) {
  const loc = bookmark?.location;
  if (!loc || !currentLocation) return false;
  if (loc.workId !== currentLocation.workId) return false;
  if (Number.isFinite(loc.seq) && Number.isFinite(currentLocation.seq)) {
    return Math.abs(currentLocation.seq - loc.seq) <= RIBBON_NEAR_CHAPTER_GAP;
  }
  if (loc.bookId !== currentLocation.bookId) return false;
  return Math.abs((currentLocation.chapter || 0) - (loc.chapter || 0)) <= RIBBON_NEAR_CHAPTER_GAP;
}

export function renderBookmarkRibbons({
  overlay,
  scroller,
  content,
  bookmarks,
  currentLocation,
  activeStickyBookmarkId,
  onToggleStickyFollow,
}) {
  if (!overlay || !scroller) return;
  const inView = bookmarks.filter((bookmark) => isBookmarkNearLocation(bookmark, currentLocation));

  const visibleIds = new Set();
  const scrollerRect = scroller.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const ribbonLeft = Math.max(4, contentRect.left - scrollerRect.left - 76);
  for (const bookmark of inView) {
    const loc = bookmark.location;
    if (!loc) continue;
    const bookId = loc.bookId;
    const chapter = String(loc.chapter || 1);
    const verse = String(loc.verse || 1);
    const chapterEl = content.querySelector(
      `.lab-chapter[data-book-id="${CSS.escape(bookId)}"][data-chapter="${chapter}"]`,
    );
    const verseEl = chapterEl?.querySelector(`.scripture-block[data-verse="${verse}"]`);
    if (!verseEl) continue;
    const verseRect = verseEl.getBoundingClientRect();
    const verseStyle = getComputedStyle(verseEl);
    const lineHeight = Number.parseFloat(verseStyle.lineHeight) || verseRect.height;
    const paddingTop = Number.parseFloat(verseStyle.paddingTop) || 0;
    const top = verseRect.top - scrollerRect.top + paddingTop + lineHeight * 0.2;
    if (top < -20 || top > scrollerRect.height + 20) continue;
    visibleIds.add(bookmark.id);
    const title = (bookmark.location?.reference || bookmark.name).replace(/"/g, "&quot;");
    let node = overlay.querySelector(`[data-bookmark-id="${CSS.escape(bookmark.id)}"]`);
    if (!node) {
      node = document.createElement("span");
      node.className = "bookmark-ribbon";
      node.dataset.bookmarkId = bookmark.id;
      node.addEventListener("click", () => {
        onToggleStickyFollow?.(node.dataset.bookmarkId);
      });
      overlay.appendChild(node);
    }
    node.classList.toggle("bookmark-ribbon-active", bookmark.id === activeStickyBookmarkId);
    node.setAttribute("aria-pressed", bookmark.id === activeStickyBookmarkId ? "true" : "false");
    node.title = title;
    node.textContent = bookmark.name;
    node.style.top = `${Math.round(top)}px`;
    node.style.left = `${Math.round(ribbonLeft)}px`;
  }

  overlay.querySelectorAll(".bookmark-ribbon").forEach((el) => {
    if (!visibleIds.has(el.dataset.bookmarkId)) el.remove();
  });
}

