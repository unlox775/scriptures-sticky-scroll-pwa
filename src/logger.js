import * as loggerDB from "./loggerDB.js";

const DEV_MODE_KEY = "scripture-pwa-dev-mode-v1";
const MAX_ENTRIES_PER_SESSION = 500;

let sessionId = null;
let sessionPromise = null;
let persistenceAvailable = true;

function createEphemeralSessionId() {
  return `session-ephemeral-${Date.now()}`;
}

async function getSessionIdAsync() {
  if (sessionId) return sessionId;
  if (sessionPromise) return sessionPromise;
  sessionPromise = loggerDB
    .createLogSession()
    .then((s) => {
      sessionId = s.id;
      persistenceAvailable = true;
      loggerDB.purgeOldSessions().catch(() => {});
      return sessionId;
    })
    .catch(() => {
      // Non-browser runtimes (tests/SSR) may not expose IndexedDB.
      persistenceAvailable = false;
      sessionId = createEphemeralSessionId();
      return sessionId;
    });
  return sessionPromise;
}

export function getSessionIdOrCreate() {
  if (sessionId) return sessionId;
  getSessionIdAsync().then((id) => {
    sessionId = id;
  });
  return sessionId;
}

export async function ensureLogSession() {
  return getSessionIdAsync();
}

let onLogCallback = null;

export function setOnLogCallback(cb) {
  onLogCallback = cb;
}

export function log(level, message, details = {}) {
  const structuredPayload = normalizeToStructuredPayload(level, message, details);
  getSessionIdAsync().then((sid) => {
    if (persistenceAvailable) {
      loggerDB.appendLogEntry(sid, structuredPayload).catch((e) => {
        console.warn("[Logger] Failed to persist:", e);
      });
    }
    if (onLogCallback) {
      onLogCallback({
        sessionId: sid,
        level: structuredPayload.level,
        message: structuredPayload.message,
        module: structuredPayload.module,
        event: structuredPayload.event,
        summary: structuredPayload.summary,
        metrics: structuredPayload.metrics,
        refs: structuredPayload.refs,
        details: structuredPayload.details,
      });
    }
  });
}

function normalizeToStructuredPayload(level, message, details) {
  const candidate = details && typeof details === "object" ? details : {};
  const isStructured = typeof candidate.module === "string" && typeof candidate.event === "string";
  if (isStructured) {
    return {
      level,
      message: candidate.summary || message,
      module: candidate.module,
      event: candidate.event,
      summary: candidate.summary || message,
      metrics: candidate.metrics,
      refs: candidate.refs,
      details: candidate.details,
    };
  }
  return {
    level,
    message,
    module: "backend.logging",
    event: "legacy_log",
    summary: message,
    details: Object.keys(candidate).length ? candidate : undefined,
  };
}

export function logDebug(msg, details) {
  log("debug", msg, details);
}

export function logInfo(msg, details) {
  log("info", msg, details);
}

export function logWarn(msg, details) {
  log("warn", msg, details);
}

export function logError(msg, details) {
  log("error", msg, details);
}

function maybeField(value) {
  return value == null ? undefined : value;
}

/**
 * Emit a structured, module-oriented event envelope that stays readable for
 * humans while remaining machine-filterable for tooling and AI debugging.
 */
export function logEvent({
  level = "debug",
  module,
  event,
  summary,
  refs,
  metrics,
  details,
} = {}) {
  const safeSummary = summary || event || "event";
  const envelope = {
    module: maybeField(module),
    event: maybeField(event),
    summary: maybeField(summary),
    refs: maybeField(refs),
    metrics: maybeField(metrics),
    details: maybeField(details),
  };
  const compact = Object.fromEntries(Object.entries(envelope).filter(([, v]) => v !== undefined));
  log(level, safeSummary, compact);
}

export async function getLogsForCopy(sessionIdOverride = null) {
  if (!persistenceAvailable) {
    return {
      sessionId: sessionIdOverride ?? sessionId ?? createEphemeralSessionId(),
      startedAt: Date.now(),
      entries: [],
    };
  }
  const sid = sessionIdOverride ?? (await getSessionIdAsync());
  const sessions = await loggerDB.listLogSessions();
  const session = sessions.find((s) => s.id === sid);
  const entries = await loggerDB.getLogEntries(sid, MAX_ENTRIES_PER_SESSION);
  return {
    sessionId: sid,
    startedAt: session?.startedAt,
    entries: entries.map((e) => ({
      time: new Date(e.timestamp).toISOString(),
      level: e.level,
      message: e.message,
      ...(e.module ? { module: e.module } : {}),
      ...(e.event ? { event: e.event } : {}),
      ...(e.summary ? { summary: e.summary } : {}),
      ...(e.metrics ? { metrics: e.metrics } : {}),
      ...(e.refs ? { refs: e.refs } : {}),
      ...(e.details ? { details: e.details } : {}),
    })),
  };
}

export async function getLogsForAiShare(sessionIdOverride = null) {
  const data = await getLogsForCopy(sessionIdOverride);
  return {
    version: 1,
    channel: "manual-copy",
    retrievalReady: false,
    sessionId: data.sessionId,
    startedAt: data.startedAt,
    entries: data.entries,
  };
}

export async function getAllSessions() {
  if (!persistenceAvailable) {
    return [];
  }
  return loggerDB.listLogSessions();
}

export async function getEntriesForSession(sid) {
  if (!persistenceAvailable) {
    return [];
  }
  return loggerDB.getLogEntries(sid, MAX_ENTRIES_PER_SESSION);
}

export function isDevMode() {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevMode(on) {
  try {
    localStorage.setItem(DEV_MODE_KEY, on ? "1" : "0");
  } catch {}
}
