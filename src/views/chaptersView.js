export function renderChaptersView({ container, book, onOpenChapter }) {
  if (!book) {
    container.innerHTML = "";
    return;
  }
  const chapterButtons = Array.from({ length: book.chapterCount }, (_, i) => i + 1)
    .map((ch) => `<button class="chapter-tile" data-open-chapter="${ch}">${ch}</button>`)
    .join("");

  container.innerHTML = `
    <section class="panel">
      <p class="chapter-hint">Tap a chapter tile to enter continuous reading mode.</p>
      <div class="grid chapters">${chapterButtons}</div>
    </section>
  `;

  container.querySelectorAll("[data-open-chapter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      onOpenChapter?.(Number(btn.dataset.openChapter));
    });
  });
}
