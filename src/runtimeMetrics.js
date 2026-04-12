function percentBucket(pct) {
  if (pct <= 25) return "p25";
  if (pct <= 50) return "p50";
  if (pct <= 75) return "p75";
  if (pct <= 90) return "p90";
  return "p99";
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function createRuntimeMetrics() {
  const state = {
    anchorIntervals: [],
    lastAnchorTs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    chapterLoadDurations: [],
  };

  return {
    recordAnchor(timestamp = Date.now()) {
      if (state.lastAnchorTs > 0) {
        state.anchorIntervals.push(timestamp - state.lastAnchorTs);
        if (state.anchorIntervals.length > 250) state.anchorIntervals.shift();
      }
      state.lastAnchorTs = timestamp;
    },
    recordCacheHit() {
      state.cacheHits += 1;
    },
    recordCacheMiss() {
      state.cacheMisses += 1;
    },
    recordChapterLoadDuration(durationMs) {
      if (typeof durationMs !== "number" || durationMs < 0) return;
      state.chapterLoadDurations.push(durationMs);
      if (state.chapterLoadDurations.length > 250) state.chapterLoadDurations.shift();
    },
    snapshot() {
      const durations = [...state.chapterLoadDurations].sort((a, b) => a - b);
      const buckets = { p25: 0, p50: 0, p75: 0, p90: 0, p99: 0 };
      if (durations.length > 0) {
        for (let i = 0; i < durations.length; i += 1) {
          const pct = ((i + 1) / durations.length) * 100;
          buckets[percentBucket(pct)] = durations[i];
        }
      }
      const totalCacheReads = state.cacheHits + state.cacheMisses;
      return {
        averageAnchorUpdateIntervalMs: Math.round(average(state.anchorIntervals)),
        cacheHitRate: totalCacheReads === 0 ? 0 : Number((state.cacheHits / totalCacheReads).toFixed(3)),
        chapterLoadDurationBucketsMs: buckets,
        counters: {
          cacheHits: state.cacheHits,
          cacheMisses: state.cacheMisses,
          chapterLoadSamples: state.chapterLoadDurations.length,
          anchorIntervalsCaptured: state.anchorIntervals.length,
        },
      };
    },
  };
}
