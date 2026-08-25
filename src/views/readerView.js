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
  const inView = bookmarks.filter((bookmark) => {
    if (!bookmark.location || !currentLocation) return false;
    if (bookmark.location.workId !== currentLocation.workId) return false;
    if (bookmark.location.bookId !== currentLocation.bookId) return false;
    const ch = currentLocation.chapter || 0;
    const bCh = bookmark.location.chapter || 0;
    return Math.abs(ch - bCh) <= 3;
  });

  const visibleIds = new Set();
  const scrollerRect = scroller.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const ribbonLeft = Math.max(4, contentRect.left - scrollerRect.left - 76);
  const STICKY_RIBBON_TOP_INSET = 8;
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
    let top = verseRect.top - scrollerRect.top + paddingTop + lineHeight * 0.2;
    const isSticky = bookmark.id === activeStickyBookmarkId;
    if (isSticky) {
      top = Math.max(STICKY_RIBBON_TOP_INSET, top);
    }
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

