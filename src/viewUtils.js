export function escapeHtml(value) {
  if (typeof value !== "string") return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatTimestamp(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}
