export function renderBooksView({ container, work, onOpenBook }) {
  if (!work) {
    container.innerHTML = "";
    return;
  }
  const booksHtml = work.books
    .map(
      (book) => `
        <article class="card card-clickable" data-open-book="${book.id}">
          <h3>${book.title}</h3>
        </article>
      `,
    )
    .join("");

  container.innerHTML = `
    <section class="panel">
      <div class="grid books">${booksHtml}</div>
    </section>
  `;

  container.querySelectorAll("[data-open-book]").forEach((el) => {
    el.addEventListener("click", () => onOpenBook?.(el.dataset.openBook));
  });
}
