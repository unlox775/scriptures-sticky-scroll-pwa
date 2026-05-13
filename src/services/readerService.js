import { createScriptureReader } from "../scriptureReader.js";
import { createTelemetryEmitter } from "../telemetry.js";
import { createRuntimeMetrics } from "../runtimeMetrics.js";

export function createReaderService({ index, scroller, content, getWorkMeta, bookCache, autoScrollButton, autoScrollPanelHost, onAnchorChange, onAutoScrollStateChange }) {
  const emit = createTelemetryEmitter("domain.readerEngine");
  const metrics = createRuntimeMetrics();
  let reader = null;
  let lastAnchor = null;
  let lastAnchorAt = performance.now();

  function normalizeAnchor(anchor) {
    if (!anchor) return null;
    const workMeta = reader?.scroller?.work;
    return {
      workId: workMeta?.id,
      workTitle: workMeta?.title,
      ...anchor,
      workId: anchor.workId || workMeta?.id,
      workTitle: anchor.workTitle || workMeta?.title,
    };
  }

  function handleTelemetry(entry) {
    if (entry.event === "anchor_changed" || entry.event === "metrics_updated") {
      const snapshot = entry.snapshot || reader?.getSnapshot("telemetry");
      const anchor = normalizeAnchor(entry.refs || snapshot?.anchor);
      if (!anchor) return;

      const now = performance.now();
      const scrollTop = snapshot?.scrollTop ?? 0;
      const previousTop = lastAnchor?.scrollTop ?? scrollTop;
      const dt = Math.max(1, now - lastAnchorAt);
      const velocity = ((scrollTop - previousTop) / dt) * 1000;
      lastAnchor = { reference: anchor.reference, scrollTop };
      lastAnchorAt = now;
      metrics.recordAnchor(Date.now());
      onAnchorChange(anchor, {
        velocity,
        autoScrolling: Boolean(reader?.autoScroll?.isActive),
        timestamp: Date.now(),
      });
      return;
    }

    if (entry.event === "chapter_load_done") {
      metrics.recordChapterLoadDuration(entry.metrics?.elapsedMs ?? 0);
    }

    emit({
      level: entry.level || "debug",
      event: entry.event,
      summary: entry.summary,
      refs: entry.refs,
      metrics: entry.metrics,
      details: entry.details,
      minVerbosity: entry.event === "preload_not_needed" ? "deep" : "standard",
    });
  }

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
      lastAnchor = null;
      lastAnchorAt = performance.now();
      reader = createScriptureReader({
        index,
        scroller,
        content,
        workId: workMeta.id,
        bookCache,
        autoScrollButton,
        autoScrollPanelHost,
        initialAutoScrollSpeed: 20,
        onAutoScrollStateChange,
        onTelemetry: handleTelemetry,
      });
      const start = performance.now();
      const snapshot = await reader.init(location);
      metrics.recordChapterLoadDuration(performance.now() - start);
      const anchor = normalizeAnchor(snapshot.anchor) || location;
      onAnchorChange(anchor, { velocity: 0, autoScrolling: false, timestamp: Date.now() });
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
      reader.autoScroll?.open();
      emit({
        level: "info",
        event: "reader_autoscroll_start",
        summary: "Started auto-scroll",
      });
    },
    stopAutoScroll() {
      if (!reader) return;
      reader.autoScroll?.stop();
      emit({
        level: "info",
        event: "reader_autoscroll_stop",
        summary: "Stopped auto-scroll",
      });
    },
    setAutoScrollSpeed(speed) {
      if (!reader) return;
      if (reader.autoScroll) reader.autoScroll.speed = speed;
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
      const snapshot = reader.getSnapshot("debug");
      return {
        autoScroll: { active: Boolean(reader.autoScroll?.isActive), speed: reader.autoScroll?.speed },
        loadedSeqRange: {
          min: snapshot.loadedChapters.at(0)?.seq ?? null,
          max: snapshot.loadedChapters.at(-1)?.seq ?? null,
        },
        loadedCount: snapshot.loadedCount,
        scrollTop: snapshot.scrollTop,
        anchor: snapshot.anchor,
        thresholds: snapshot.thresholds,
      };
    },
  };
}
