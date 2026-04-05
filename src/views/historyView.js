import { escapeHtml } from "../viewUtils.js";

export function renderHistoryView({ container, bookmark, entries, onBack }) {
  const lines =
    entries.length === 0
      ? "<p>No history yet.</p>"
      : entries
          .map((h) => `<div class="history-line">${escapeHtml(h.day)}: ${escapeHtml(h.reference)}</div>`)
          .join("");
  container.innerHTML = `
    <section class="panel">
      <h2>${escapeHtml(bookmark.name)}</h2>
      <p>One line per day, newest first.</p>
      <div class="history-lines">${lines}</div>
      <button id="historyBackButton" class="secondary-btn">Back</button>
    </section>
  `;
  container.querySelector("#historyBackButton")?.addEventListener("click", () => {
    onBack?.();
  });
}
