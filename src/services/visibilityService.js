import {
  getVisibilityConfig,
  setVisibilityEnabled,
  setVisibilityVerbosity,
  setModuleVisibility,
  applyVisibilityPreset,
  getVisibilityModuleCatalog,
  VISIBILITY_PRESETS,
} from "../visibilityConfig.js";
import { isDevMode, setDevMode } from "../logger.js";
import { createTelemetryEmitter } from "../telemetry.js";

export function createVisibilityService() {
  const emit = createTelemetryEmitter("ui.devDrawer");

  function getConfig() {
    return getVisibilityConfig();
  }

  function getCatalog() {
    return getVisibilityModuleCatalog();
  }

  function getPresets() {
    return Object.keys(VISIBILITY_PRESETS);
  }

  function setGlobalEnabled(enabled) {
    const result = setVisibilityEnabled(enabled);
    emit({
      level: "info",
      event: "visibility_global_toggle",
      summary: "Toggled global visibility mode",
      details: { enabled: result.enabled },
    });
    return result;
  }

  function setVerbosity(verbosity) {
    const result = setVisibilityVerbosity(verbosity);
    emit({
      level: "info",
      event: "visibility_verbosity_change",
      summary: "Updated visibility verbosity",
      details: { verbosity: result.verbosity },
    });
    return result;
  }

  function setModule(moduleId, enabled) {
    let result = setModuleVisibility(moduleId, enabled);
    if (enabled && !result.enabled) {
      result = setVisibilityEnabled(true);
    }
    emit({
      level: "debug",
      event: "visibility_module_toggle",
      summary: "Toggled module visibility",
      refs: { moduleId },
      details: { enabled: Boolean(enabled), globalEnabled: result.enabled },
      minVerbosity: "standard",
    });
    return result;
  }

  function applyPreset(name) {
    const result = applyVisibilityPreset(name);
    emit({
      level: "info",
      event: "visibility_preset_apply",
      summary: "Applied visibility profile preset",
      details: { preset: name, verbosity: result.verbosity },
    });
    return result;
  }

  return {
    isDevMode,
    setDevMode,
    getConfig,
    getCatalog,
    getPresets,
    setGlobalEnabled,
    setVerbosity,
    setModule,
    applyPreset,
  };
}
