/**
 * IndexedDB persistence for logs. Durable, long-term storage.
 */
const DB_NAME = "scripture-pwa-logs";
const DB_VERSION = 1;
const SESSION_STORE = "logSessions";
const ENTRY_STORE = "logEntries";
const SESSION_EXPIRY_DAYS = 7;
const MAX_ENTRIES_PER_SESSION = 500;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const s = db.createObjectStore(SESSION_STORE, { keyPath: "id" });
        s.createIndex("startedAt", "startedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const eStore = db.createObjectStore(ENTRY_STORE, { keyPath: "id", autoIncrement: true });
        eStore.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function createLogSession() {
  const db = await openDB();
  const id = `session-${Date.now()}`;
  const record = { id, startedAt: Date.now() };
  await new Promise((resolve, reject) => {
    const t = db.transaction(SESSION_STORE, "readwrite");
    t.objectStore(SESSION_STORE).put(record);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  return record;
}

export async function appendLogEntry(sessionId, level, message, details = {}) {
  const db = await openDB();
  const record = {
    sessionId,
    timestamp: Date.now(),
    level,
    message,
    details: Object.keys(details).length ? details : undefined,
  };
  return new Promise((resolve, reject) => {
    const t = db.transaction(ENTRY_STORE, "readwrite");
    const store = t.objectStore(ENTRY_STORE);
    store.add(record);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function listLogSessions() {
  const db = await openDB();
  const cutoff = Date.now() - SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const all = await new Promise((resolve, reject) => {
    const t = db.transaction(SESSION_STORE, "readonly");
    const req = t.objectStore(SESSION_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    t.onerror = () => reject(t.error);
  });
  return all.filter((s) => s.startedAt >= cutoff).sort((a, b) => b.startedAt - a.startedAt);
}

export async function getLogEntries(sessionId, limit = MAX_ENTRIES_PER_SESSION) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(ENTRY_STORE, "readonly");
    const index = t.objectStore(ENTRY_STORE).index("sessionId");
    const req = index.getAll(IDBKeyRange.only(sessionId));
    t.oncomplete = () => {
      let entries = req.result || [];
      entries.sort((a, b) => a.timestamp - b.timestamp);
      if (entries.length > limit) {
        entries = entries.slice(-limit);
      }
      resolve(
        entries.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          level: e.level,
          message: e.message,
          details: e.details,
        })),
      );
    };
    t.onerror = () => reject(t.error);
  });
}

export async function purgeOldSessions() {
  const db = await openDB();
  const cutoff = Date.now() - SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const all = await new Promise((resolve, reject) => {
    const t = db.transaction(SESSION_STORE, "readonly");
    const req = t.objectStore(SESSION_STORE).getAll();
    t.oncomplete = () => resolve(req.result || []);
    t.onerror = () => reject(t.error);
  });
  const toRemove = all.filter((s) => s.startedAt < cutoff);
  if (toRemove.length === 0) return;
  return new Promise((resolve, reject) => {
    const t = db.transaction(SESSION_STORE, "readwrite");
    const store = t.objectStore(SESSION_STORE);
    for (const s of toRemove) {
      store.delete(s.id);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
