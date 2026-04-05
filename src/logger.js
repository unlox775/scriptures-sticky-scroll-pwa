import * as loggerDB from "./loggerDB.js";

const DEV_MODE_KEY = "scripture-pwa-dev-mode-v1";
const MAX_ENTRIES_PER_SESSION = 500;

let sessionId = null;
let sessionPromise = null;

async function getSessionIdAsync() {
  if (sessionId) return sessionId;
  if (sessionPromise) return sessionPromise;
  sessionPromise = loggerDB.createLogSession().then((s) => {
    sessionId = s.id;
    loggerDB.purgeOldSessions().catch(() => {});
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

let onLogCallback = null;

export function setOnLogCallback(cb) {
  onLogCallback = cb;
}

export function log(level, message, details = {}) {
  getSessionIdAsync().then((sid) => {
    loggerDB.appendLogEntry(sid, level, message, details).catch((e) => {
      console.warn("[Logger] Failed to persist:", e);
    });
    if (onLogCallback) {
      onLogCallback({ sessionId: sid, level, message, details });
    }
  });
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
      ...(e.details ? { details: e.details } : {}),
    })),
  };
}

export async function getAllSessions() {
  return loggerDB.listLogSessions();
}

export async function getEntriesForSession(sid) {
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
