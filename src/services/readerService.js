import { ReaderEngine } from "../readerEngine.js";
import { createTelemetryEmitter } from "../telemetry.js";
import { createRuntimeMetrics } from "../runtimeMetrics.js";

export function createReaderService({ scroller, content, getWorkMeta, bookCache, onAnchorChange }) {
  const emit = createTelemetryEmitter("domain.readerEngine");
  const metrics = createRuntimeMetrics();
  let reader = null;

  return {
    getReader() {
      return reader;
    },
    getMetricsSnapshot() {
      return metrics.snapshot();
    },
    recordCacheHit() {
      metrics.recordCacheHit();
    },
    recordCacheMiss() {
      metrics.recordCacheMiss();
    },
    async open(location) {
      const workMeta = getWorkMeta(location);
      if (reader) reader.destroy();
      const wrappedAnchorChange = (anchor, meta) => {
        metrics.recordAnchor(meta?.timestamp ?? Date.now());
        onAnchorChange(anchor, meta);
      };
      reader = new ReaderEngine({
        scroller,
        content,
        workMeta,
        bookCache,
        onAnchorChange: wrappedAnchorChange,
      });
      const start = performance.now();
      await reader.open(location);
      metrics.recordChapterLoadDuration(performance.now() - start);
      emit({
        level: "info",
        event: "reader_open_ready",
        summary: "Reader opened and positioned",
        refs: {
          workId: location.workId,
          bookId: location.bookId,
          chapter: location.chapter,
          verse: location.verse,
        },
        metrics: {
          durationMs: Math.round(performance.now() - start),
        },
      });
      return reader;
    },
    destroy() {
      if (reader) reader.destroy();
      reader = null;
    },
    startAutoScroll() {
      if (!reader) return;
      reader.startAutoScroll();
      emit({
        level: "info",
        event: "reader_autoscroll_start",
        summary: "Started auto-scroll",
      });
    },
    stopAutoScroll() {
      if (!reader) return;
      reader.stopAutoScroll();
      emit({
        level: "info",
        event: "reader_autoscroll_stop",
        summary: "Stopped auto-scroll",
      });
    },
    setAutoScrollSpeed(speed) {
      if (!reader) return;
      reader.setAutoScrollSpeed(speed);
      emit({
        level: "debug",
        event: "reader_autoscroll_speed_change",
        summary: "Auto-scroll speed changed",
        metrics: { speed },
        minVerbosity: "standard",
      });
    },
    captureRuntimeSnapshot() {
      if (!reader) return null;
      return {
        autoScroll: { ...reader.autoScroll },
        loadedSeqRange: {
          min: reader.minLoadedSeq?.(),
          max: reader.maxLoadedSeq?.(),
        },
        loadedCount: reader.loaded?.size ?? 0,
        lastScroll: reader.lastScroll,
        isBuffering: reader.isBuffering,
      };
    },
  };
}
