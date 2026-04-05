import { escapeHtml } from "../viewUtils.js";

export function renderHomeView({
  container,
  works,
  bookmarks,
  onOpenWork,
  onViewHistory,
  onOpenBookmark,
  onOpenSingleBook,
}) {
  const worksHtml = works
    .map(
      (work) => `
      <article class="card card-clickable" data-open-work="${work.id}">
        <h3>${work.title}</h3>
      </article>
    `,
    )
    .join("");

  const bookmarkItems = bookmarks
    .map(
      (bookmark) => `
      <article class="bookmark-item">
        <div>
          <strong>${escapeHtml(bookmark.name)}</strong>
          <div class="bookmark-meta">${escapeHtml(bookmark.location?.reference || "No location yet")}</div>
        </div>
        <div class="bookmark-actions">
          <button data-view-history="${bookmark.id}">View History</button>
          <button data-open-bookmark="${bookmark.id}">Open</button>
        </div>
      </article>`,
    )
    .join("");

  container.innerHTML = `
    <section class="panel">
      <div class="grid works">${worksHtml}</div>
    </section>
    <section class="panel" style="margin-top: 1rem;">
      <h2>Bookmarks</h2>
      <p>Scroll slowly and a bookmark at your location will auto-follow. Tap to open.</p>
      <div class="bookmark-list">${bookmarkItems}</div>
    </section>
  `;

  container.querySelectorAll("[data-open-work]").forEach((el) => {
    el.addEventListener("click", () => {
      const workId = el.dataset.openWork;
      const work = works.find((w) => w.id === workId);
      if (work?.books?.length === 1) {
        onOpenSingleBook?.(work, work.books[0].id);
      } else {
        onOpenWork?.(workId);
      }
    });
  });

  container.querySelectorAll("[data-view-history]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onViewHistory?.(btn.dataset.viewHistory);
    });
  });

  container.querySelectorAll("[data-open-bookmark]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onOpenBookmark?.(btn.dataset.openBookmark);
    });
  });
}
