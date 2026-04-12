import { isDevMode, logEvent } from "./logger.js";

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
  let parsed;
  if (parts[0] === "r" && parts.length >= 5) {
    parsed = {
      view: "reader",
      workId: parts[1],
      bookId: parts[2],
      chapter: parseInt(parts[3], 10) || 1,
      verse: parseInt(parts[4], 10) || 1,
    };
  } else if (parts[0] === "b" && parts.length >= 3) {
    parsed = {
      view: "chapters",
      workId: parts[1],
      bookId: parts[2],
    };
  } else if (parts[0] === "w" && parts.length >= 2) {
    parsed = {
      view: "books",
      workId: parts[1],
    };
  } else if (parts[0] === "history" && parts.length >= 2) {
    parsed = {
      view: "history",
      bookmarkId: parts[1],
    };
  } else {
    parsed = { view: "home" };
  }
  if (isDevMode()) {
    logEvent({
      level: "debug",
      module: "backend.routing",
      event: "route_parse",
      summary: "Parsed route string",
      refs: {
        hash: h,
      },
      details: parsed,
    });
  }
  return parsed;
}

export function pushRoute(route) {
  const h = route.startsWith("#") ? route : `#${route}`;
  if (window.location.hash !== h) {
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.routing",
        event: "route_push",
        summary: "Updating browser hash route",
        refs: { route: h },
      });
    }
    window.history.replaceState(null, "", h);
  }
}

export function saveRouteToStorage(route) {
  try {
    localStorage.setItem(ROUTE_KEY, route);
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.routing",
        event: "route_persist",
        summary: "Saved route fallback in local storage",
        refs: { storageKey: ROUTE_KEY, route },
      });
    }
  } catch {}
}

export function loadRouteFromStorage() {
  try {
    const route = localStorage.getItem(ROUTE_KEY) || "#/";
    if (isDevMode()) {
      logEvent({
        level: "debug",
        module: "backend.routing",
        event: "route_fallback_loaded",
        summary: "Loaded route fallback from local storage",
        refs: { storageKey: ROUTE_KEY, route },
      });
    }
    return route;
  } catch {
    return "#/";
  }
}
