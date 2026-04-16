import { parseRoute, pushRoute, saveRouteToStorage, loadRouteFromStorage, stateToRoute } from "../stateRouting.js";
import { createTelemetryEmitter } from "../telemetry.js";

export function createNavigationService() {
  const emit = createTelemetryEmitter("backend.routing");

  function push(route, options = {}) {
    const save = options.save === true;
    pushRoute(route);
    if (save) saveRouteToStorage(route);
    emit({
      level: "info",
      event: "route_push",
      summary: save ? "Route pushed and saved" : "Route pushed",
      refs: { route, save },
      minVerbosity: "minimal",
    });
  }

  function parse(route) {
    const parsed = parseRoute(route);
    emit({
      level: "debug",
      event: "route_parse",
      summary: "Route parsed",
      refs: { route },
      details: { parsed },
      minVerbosity: "standard",
    });
    return parsed;
  }

  function routeFromState(state) {
    const route = stateToRoute(state);
    emit({
      level: "debug",
      event: "state_to_route",
      summary: "Computed route from state",
      refs: { route },
      minVerbosity: "deep",
    });
    return route;
  }

  function loadFallbackRoute() {
    const route = loadRouteFromStorage();
    emit({
      level: "info",
      event: "route_fallback_loaded",
      summary: "Loaded fallback route from storage",
      refs: { route },
      minVerbosity: "minimal",
    });
    return route;
  }

  function emitRestoreStart(route) {
    emit({
      level: "info",
      event: "route_restore_start",
      summary: "Route restore started",
      refs: { route },
      minVerbosity: "minimal",
    });
  }

  function emitRestoreResolved(target, refs = {}) {
    emit({
      level: "info",
      event: "route_restore_resolved",
      summary: "Route restore resolved",
      refs: { target, ...refs },
      minVerbosity: "minimal",
    });
  }

  function emitRestoreFail(route, reason, details = {}) {
    emit({
      level: "warn",
      event: "route_restore_fail",
      summary: "Route restore failed",
      refs: { route, reason },
      details,
      minVerbosity: "standard",
    });
  }

  return {
    push,
    pushAndSave(route) {
      push(route, { save: true });
    },
    parse,
    routeFromState,
    loadFallbackRoute,
    emitRestoreStart,
    emitRestoreResolved,
    emitRestoreFail,
  };
}
