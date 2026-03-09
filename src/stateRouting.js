const ROUTE_KEY = "scripture-pwa-route-v1";

export function stateToRoute(state) {
  if (!state) return "#/";
  const loc = state.currentLocation;
  const work = state.currentWork;
  const book = state.currentBook;
  if (loc && work && book) {
    return `#/r/${work.id}/${book.id}/${loc.chapter || 1}/${loc.verse || 1}`;
  }
  if (book && work) {
    return `#/b/${work.id}/${book.id}`;
  }
  if (work) {
    return `#/w/${work.id}`;
  }
  return "#/";
}

export function parseRoute(hash) {
  const h = (hash || window.location.hash || "#/").replace(/^#/, "") || "/";
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "r" && parts.length >= 5) {
    return {
      view: "reader",
      workId: parts[1],
      bookId: parts[2],
      chapter: parseInt(parts[3], 10) || 1,
      verse: parseInt(parts[4], 10) || 1,
    };
  }
  if (parts[0] === "b" && parts.length >= 3) {
    return {
      view: "chapters",
      workId: parts[1],
      bookId: parts[2],
    };
  }
  if (parts[0] === "w" && parts.length >= 2) {
    return {
      view: "books",
      workId: parts[1],
    };
  }
  return { view: "home" };
}

export function pushRoute(route) {
  const h = route.startsWith("#") ? route : `#${route}`;
  if (window.location.hash !== h) {
    window.history.replaceState(null, "", h);
  }
}

export function saveRouteToStorage(route) {
  try {
    localStorage.setItem(ROUTE_KEY, route);
  } catch {}
}

export function loadRouteFromStorage() {
  try {
    return localStorage.getItem(ROUTE_KEY) || "#/";
  } catch {
    return "#/";
  }
}
