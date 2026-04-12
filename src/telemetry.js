import { logDebug, logInfo, logWarn, logError } from "./logger.js";
import { isVisibilityEnabled, getVisibilityVerbosity } from "./visibilityConfig.js";
import { shouldEmitEvent } from "./eventSampler.js";

const LEVEL_WRITERS = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
};

const VERBOSITY_RANK = {
  minimal: 0,
  standard: 1,
  deep: 2,
};

function verbosityAllowed(minVerbosity) {
  const current = getVisibilityVerbosity();
  const currentRank = VERBOSITY_RANK[current] ?? 0;
  const requiredRank = VERBOSITY_RANK[minVerbosity] ?? 0;
  return currentRank >= requiredRank;
}

export function createTelemetryEmitter(moduleId) {
  return function emitTelemetry({
    level = "info",
    event,
    summary,
    metrics,
    refs,
    details,
    throttleMs = 0,
    sampleEvery = 1,
    minVerbosity = "minimal",
  }) {
    if (!event || !summary) return;
    if (!isVisibilityEnabled(moduleId)) return;
    if (!verbosityAllowed(minVerbosity)) return;

    const key = `${moduleId}:${event}`;
    if (!shouldEmitEvent(key, { throttleMs, sampleEvery })) return;

    const writer = LEVEL_WRITERS[level] ?? logInfo;
    writer(summary, {
      module: moduleId,
      event,
      summary,
      ...(metrics ? { metrics } : {}),
      ...(refs ? { refs } : {}),
      ...(details ? { details } : {}),
    });
  };
}
