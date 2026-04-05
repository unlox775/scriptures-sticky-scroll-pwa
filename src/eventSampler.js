const throttleState = new Map();
const sampleState = new Map();

/**
 * Returns true when enough time has elapsed for this key.
 */
export function shouldEmitThrottled(key, throttleMs = 0, now = Date.now()) {
  if (!throttleMs || throttleMs <= 0) return true;
  const last = throttleState.get(key) ?? 0;
  if (now - last < throttleMs) return false;
  throttleState.set(key, now);
  return true;
}

/**
 * Returns true for every Nth invocation of a key.
 */
export function shouldEmitSampled(key, sampleEvery = 1) {
  if (!sampleEvery || sampleEvery <= 1) return true;
  const next = (sampleState.get(key) ?? 0) + 1;
  sampleState.set(key, next);
  return next % sampleEvery === 0;
}

export function shouldEmitEvent(key, options = {}) {
  const now = options.now ?? Date.now();
  const okThrottle = shouldEmitThrottled(key, options.throttleMs ?? 0, now);
  if (!okThrottle) return false;
  return shouldEmitSampled(key, options.sampleEvery ?? 1);
}

export function resetEventSampler() {
  throttleState.clear();
  sampleState.clear();
}
