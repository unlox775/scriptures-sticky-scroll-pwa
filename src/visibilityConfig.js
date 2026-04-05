const VISIBILITY_KEY = "scripture-pwa-visibility-v1";

export const VISIBILITY_LEVELS = ["minimal", "standard", "deep"];

export const VISIBILITY_MODULES = [
  { id: "ui.homeView", label: "Home view", group: "ui" },
  { id: "ui.booksView", label: "Books view", group: "ui" },
  { id: "ui.chaptersView", label: "Chapters view", group: "ui" },
  { id: "ui.readerView", label: "Reader view", group: "ui" },
  { id: "ui.historyView", label: "History view", group: "ui" },
  { id: "ui.devDrawer", label: "Debug drawer", group: "ui" },
  { id: "domain.routing", label: "Routing", group: "domain" },
  { id: "domain.dataAccess", label: "Data access", group: "domain" },
  { id: "domain.readerEngine", label: "Reader engine", group: "domain" },
  { id: "domain.bookmarks", label: "Bookmarks", group: "domain" },
  { id: "domain.logging", label: "Logging", group: "domain" },
];

function buildDefaultModules() {
  return Object.fromEntries(VISIBILITY_MODULES.map((item) => [item.id, false]));
}

const DEFAULT_CONFIG = {
  enabled: false,
  verbosity: "minimal",
  modules: buildDefaultModules(),
};

export const VISIBILITY_PRESETS = {
  "Reader performance": {
    verbosity: "standard",
    modules: {
      "ui.readerView": true,
      "domain.readerEngine": true,
      "domain.dataAccess": true,
      "domain.routing": true,
    },
  },
  "Bookmark correctness": {
    verbosity: "deep",
    modules: {
      "ui.readerView": true,
      "ui.homeView": true,
      "domain.bookmarks": true,
      "domain.routing": true,
      "domain.readerEngine": true,
    },
  },
  "Navigation restore": {
    verbosity: "standard",
    modules: {
      "ui.homeView": true,
      "ui.booksView": true,
      "ui.chaptersView": true,
      "ui.readerView": true,
      "domain.routing": true,
      "domain.readerEngine": true,
    },
  },
};

function sanitizeConfig(raw) {
  const fallback = buildDefaultModules();
  const modules = raw && typeof raw.modules === "object" ? raw.modules : {};
  for (const key of Object.keys(fallback)) {
    fallback[key] = modules[key] === true;
  }
  const verbosity = VISIBILITY_LEVELS.includes(raw?.verbosity) ? raw.verbosity : DEFAULT_CONFIG.verbosity;
  return {
    enabled: raw?.enabled === true,
    verbosity,
    modules: fallback,
  };
}

function readRawConfig() {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeConfig(config) {
  const sanitized = sanitizeConfig(config);
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function getVisibilityConfig() {
  return readRawConfig();
}

export function setVisibilityConfig(config) {
  return writeConfig(config);
}

export function setVisibilityEnabled(enabled) {
  const current = readRawConfig();
  return writeConfig({ ...current, enabled: Boolean(enabled) });
}

export function setVisibilityVerbosity(verbosity) {
  const current = readRawConfig();
  const nextVerbosity = VISIBILITY_LEVELS.includes(verbosity) ? verbosity : current.verbosity;
  return writeConfig({ ...current, verbosity: nextVerbosity });
}

export function isVisibilityEnabled(moduleId) {
  const config = readRawConfig();
  if (!config.enabled) return false;
  return config.modules[moduleId] === true;
}

export function getVisibilityVerbosity(moduleId) {
  const config = readRawConfig();
  if (moduleId && !config.modules[moduleId]) return "minimal";
  return config.verbosity;
}

export function setModuleVisibility(moduleId, enabled) {
  const current = readRawConfig();
  if (!(moduleId in current.modules)) return current;
  return writeConfig({
    ...current,
    modules: {
      ...current.modules,
      [moduleId]: Boolean(enabled),
    },
  });
}

export function applyVisibilityPreset(presetName) {
  const preset = VISIBILITY_PRESETS[presetName];
  if (!preset) return readRawConfig();
  const current = readRawConfig();
  const modules = { ...current.modules, ...preset.modules };
  return writeConfig({
    enabled: true,
    verbosity: preset.verbosity ?? current.verbosity,
    modules,
  });
}

export function getVisibilityModuleCatalog() {
  return VISIBILITY_MODULES.slice();
}
