import test, { beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatWakeLockStatus,
  getWakeLockDebugState,
  initializeWakeLock,
  isIosWakeLockUnreliable,
  isWakeLockDebugEnabled,
  setWakeLockActive,
  setWakeLockEnvForTests,
  setWakeLockLogger,
} from "../../src/wakeLock.js";

function createFakeVideo(opts) {
  const video = {
    muted: false,
    defaultMuted: false,
    volume: 1,
    loop: false,
    playsInline: false,
    paused: true,
    src: "",
    playCalls: 0,
    pauseCalls: 0,
    attrs: {},
    style: {},
    setAttribute(name, value) {
      video.attrs[name] = value;
    },
    play: opts?.play
      ? async () => {
          video.playCalls += 1;
          await opts.play();
          video.paused = false;
        }
      : async () => {
          video.playCalls += 1;
          video.paused = false;
        },
    pause() {
      video.pauseCalls += 1;
      video.paused = true;
    },
    remove() {
      video.paused = true;
    },
  };
  return video;
}

function createEnv(opts = {}) {
  const available = opts.available ?? true;
  let visibilityState = opts.visible === false ? "hidden" : "visible";
  const listeners = new Map();
  const windowListeners = new Map();
  const sentinels = [];
  const requestCalls = [];
  const videos = [];
  const appended = [];
  const win = { __wakeLockState: null, addEventListener(type, listener) {
    const list = windowListeners.get(type) ?? [];
    list.push(listener);
    windowListeners.set(type, list);
  } };

  const env = {
    navigator: {
      userAgent: opts.userAgent ?? "test",
      platform: opts.platform ?? "Linux",
      maxTouchPoints: opts.maxTouchPoints ?? 0,
      standalone: opts.standalone,
      ...(available
        ? {
            wakeLock: {
              request: async (type) => {
                requestCalls.push(type);
                if (opts.request) {
                  const sentinel = await opts.request(type);
                  sentinels.push(sentinel);
                  return sentinel;
                }
                const releaseListeners = [];
                const sentinel = {
                  released: false,
                  release: async () => {
                    sentinel.released = true;
                    for (const listener of releaseListeners) listener();
                  },
                  addEventListener(_type, listener) {
                    releaseListeners.push(listener);
                  },
                  fireRelease() {
                    sentinel.released = true;
                    for (const listener of releaseListeners) listener();
                  },
                };
                sentinels.push(sentinel);
                return sentinel;
              },
            },
          }
        : {}),
    },
    document: {
      get visibilityState() {
        return visibilityState;
      },
      body: {
        appendChild(el) {
          appended.push(el);
        },
      },
      addEventListener(type, listener) {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
      createElement(_tag) {
        const video = opts.video ?? createFakeVideo();
        videos.push(video);
        return video;
      },
    },
    window: win,
    requestCalls,
    sentinels,
    videos,
    appended,
    setVisible(next) {
      visibilityState = next ? "visible" : "hidden";
      for (const listener of listeners.get("visibilitychange") ?? []) listener();
    },
    setVisibilityQuietly(next) {
      visibilityState = next ? "visible" : "hidden";
    },
    firePageShow() {
      for (const listener of windowListeners.get("pageshow") ?? []) listener();
      for (const listener of listeners.get("pageshow") ?? []) listener();
    },
  };
  return env;
}

describe("auto-scroll wake lock", () => {
  const logs = [];

  beforeEach(() => {
    logs.length = 0;
    setWakeLockEnvForTests(null);
    setWakeLockLogger((level, payload) => {
      const resolved = payload();
      logs.push({ level, message: resolved.message, details: resolved.details });
    });
  });

  afterEach(() => {
    setWakeLockLogger(null);
    setWakeLockEnvForTests(null);
  });

  test("acquires a screen lock while auto-scroll is on and releases on stop", async () => {
    const env = createEnv();
    setWakeLockEnvForTests(env);
    initializeWakeLock();

    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(env.requestCalls.length, 1);
    assert.equal(env.requestCalls[0], "screen");
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(getWakeLockDebugState().status, "held");
    assert.equal(env.sentinels[0]?.released, false);
    assert.equal(formatWakeLockStatus(), "Wake lock: held · wake lock");
    assert.equal(env.window.__wakeLockState.status, "held");
    assert.equal(logs.some((row) => row.level === "info" && row.message === "wake lock acquired"), true);

    await setWakeLockActive(false, "manual");
    assert.equal(env.sentinels[0]?.released, true);
    assert.equal(getWakeLockDebugState().desiredActive, false);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(getWakeLockDebugState().status, "released");
    assert.equal(formatWakeLockStatus(), "Wake lock: released");
    assert.equal(env.window.__wakeLockState.status, "released");
    assert.equal(logs.some((row) => row.level === "info" && row.message === "wake lock released"), true);
  });

  test("releases the lock when the app is hidden and re-acquires when visible again", async () => {
    const env = createEnv();
    setWakeLockEnvForTests(env);
    initializeWakeLock();

    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(env.sentinels[0]?.released, false);

    env.setVisible(false);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.sentinels[0]?.released, true);
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(getWakeLockDebugState().status, "released");

    env.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.requestCalls.length, 2);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(getWakeLockDebugState().status, "held");
  });

  test("re-requests the lock on pageshow while auto-scroll is still on", async () => {
    const env = createEnv({ visible: false });
    setWakeLockEnvForTests(env);
    initializeWakeLock();

    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(env.requestCalls.length, 0);

    env.setVisibilityQuietly(true);
    env.firePageShow();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.requestCalls.length, 1);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(getWakeLockDebugState().status, "held");
  });

  test("does not throw when Wake Lock API is missing and uses the video fallback", async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    initializeWakeLock();
    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(getWakeLockDebugState().method, "video");
    assert.equal(getWakeLockDebugState().status, "held");
    assert.equal(formatWakeLockStatus(), "Wake lock: held · video");
    assert.equal(env.videos[0]?.muted, true);
    assert.equal(env.videos[0]?.volume, 0);
    assert.equal(env.videos[0]?.loop, true);
    assert.equal(env.videos[0]?.playsInline, true);
    assert.equal(env.videos[0]?.attrs.playsinline, "true");
    assert.ok(env.videos[0]?.src.startsWith("data:video/mp4;base64,"));

    await setWakeLockActive(false, "manual");
    assert.equal(env.videos[0]?.pauseCalls >= 1, true);
    assert.equal(getWakeLockDebugState().videoPlaying, false);
    assert.equal(getWakeLockDebugState().status, "released");
  });

  test("uses video even when the Wake Lock API exists on iOS", async () => {
    const env = createEnv({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)" });
    setWakeLockEnvForTests(env);
    initializeWakeLock();
    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(getWakeLockDebugState().method, "wake-lock+video");
    assert.equal(getWakeLockDebugState().status, "held");
    assert.equal(formatWakeLockStatus(), "Wake lock: held · wake lock + video");
  });

  test("pauses the video fallback when hidden and resumes when visible", async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    initializeWakeLock();
    await setWakeLockActive(true, "auto-scroll-start");
    const playsBefore = env.videos[0]?.playCalls ?? 0;
    env.setVisible(false);
    assert.equal(env.videos[0]?.paused, true);
    assert.equal(getWakeLockDebugState().videoPlaying, false);

    env.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.ok((env.videos[0]?.playCalls ?? 0) > playsBefore);
    assert.equal(env.videos[0]?.paused, false);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(getWakeLockDebugState().status, "held");
  });

  test("reports none/released when both the API and video fail", async () => {
    const env = createEnv({
      available: false,
      video: createFakeVideo({
        play: async () => {
          throw new Error("autoplay blocked");
        },
      }),
    });
    setWakeLockEnvForTests(env);
    initializeWakeLock();
    await setWakeLockActive(true, "auto-scroll-start");
    assert.equal(getWakeLockDebugState().method, "none");
    assert.equal(getWakeLockDebugState().status, "released");
    assert.equal(formatWakeLockStatus(), "Wake lock: released");
    assert.equal(logs.some((row) => row.level === "warn" && row.message === "wake lock acquire failed"), true);
  });

  test("detects iOS standalone / iPhone UA as an unreliable wake-lock environment", () => {
    assert.equal(isIosWakeLockUnreliable({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)" }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: "Safari", standalone: true }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }), false);
  });

  test("debug query flag is only on with ?debug", () => {
    assert.equal(isWakeLockDebugEnabled({ search: "?debug", hash: "" }), true);
    assert.equal(isWakeLockDebugEnabled({ search: "?debug=1", hash: "" }), true);
    assert.equal(isWakeLockDebugEnabled({ search: "", hash: "#/r/book-of-mormon/1-ne/4/1" }), false);
    assert.equal(isWakeLockDebugEnabled({ search: "", hash: "" }), false);
  });
});
