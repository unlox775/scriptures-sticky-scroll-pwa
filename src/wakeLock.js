import { KEEP_AWAKE_VIDEO_SRC } from "./wakeLockVideo.js";

const wakeLockState = {
  desiredActive: false,
  sentinel: null,
  pending: false,
  supportLogged: false,
  listenersAttached: false,
  video: null,
  videoPlaying: false,
  videoPending: false,
};

let envOverride = null;
let logger = null;

export function setWakeLockLogger(next) {
  logger = next;
}

export function setWakeLockEnvForTests(env) {
  stopVideoFallbackSync();
  envOverride = env;
  wakeLockState.desiredActive = false;
  wakeLockState.sentinel = null;
  wakeLockState.pending = false;
  wakeLockState.supportLogged = false;
  wakeLockState.listenersAttached = false;
  wakeLockState.videoPlaying = false;
  wakeLockState.videoPending = false;
  publishDebugState();
}

function getNavigator() {
  if (envOverride) return envOverride.navigator;
  return typeof navigator === "undefined" ? undefined : navigator;
}

function getDocument() {
  if (envOverride) return envOverride.document;
  return typeof document === "undefined" ? undefined : document;
}

function getWindow() {
  if (envOverride) return envOverride.window;
  return typeof window === "undefined" ? undefined : window;
}

function getVisibilityState() {
  return getDocument()?.visibilityState ?? "unknown";
}

function getWakeLockRequestor() {
  const wakeLock = getNavigator()?.wakeLock;
  if (!wakeLock || typeof wakeLock.request !== "function") return null;
  return wakeLock;
}

export function isIosWakeLockUnreliable(nav = getNavigator()) {
  if (!nav) return false;
  if (nav.standalone === true) return true;
  const ua = nav.userAgent ?? "";
  if (/iP(hone|ad|od)/i.test(ua)) return true;
  const platform = nav.platform ?? "";
  const maxTouch = nav.maxTouchPoints ?? 0;
  return platform === "MacIntel" && maxTouch > 1;
}

function needsVideoFallback() {
  return isIosWakeLockUnreliable() || !getWakeLockRequestor();
}

function currentMethod() {
  const lock = Boolean(wakeLockState.sentinel);
  const video = wakeLockState.videoPlaying;
  if (lock && video) return "wake-lock+video";
  if (lock) return "wake-lock";
  if (video) return "video";
  return "none";
}

function currentStatus() {
  return wakeLockState.desiredActive && (wakeLockState.sentinel || wakeLockState.videoPlaying)
    ? "held"
    : "released";
}

function logWakeLock(level, message, details) {
  if (!logger) return;
  try {
    logger(level, () => (details ? { message, details } : { message }));
  } catch {
    // Wake-lock logging must never throw into auto-scroll.
  }
}

function acquireDetails(reason, extra) {
  return {
    reason,
    method: currentMethod(),
    visibility: getVisibilityState(),
    hasSentinel: Boolean(wakeLockState.sentinel),
    videoPlaying: wakeLockState.videoPlaying,
    ...extra,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createVideoElement() {
  const doc = getDocument();
  if (!doc || typeof doc.createElement !== "function") return null;
  return doc.createElement("video");
}

function ensureVideo() {
  if (wakeLockState.video) return wakeLockState.video;
  const video = createVideoElement();
  if (!video) return null;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disableRemotePlayback = true;
  video.setAttribute("muted", "true");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("loop", "true");
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("tabindex", "-1");
  video.setAttribute("disablePictureInPicture", "true");
  video.setAttribute("x-webkit-airplay", "deny");
  video.src = KEEP_AWAKE_VIDEO_SRC;
  const style = video.style ?? (video.style = {});
  style.position = "fixed";
  style.left = "0";
  style.bottom = "0";
  style.width = "2px";
  style.height = "2px";
  style.opacity = "0.01";
  style.pointerEvents = "none";
  getDocument()?.body?.appendChild(video);
  wakeLockState.video = video;
  return video;
}

function isVideoPlaying(video) {
  return Boolean(video) && video?.paused === false;
}

async function startVideoFallback(reason) {
  if (!wakeLockState.desiredActive || wakeLockState.videoPending) return;
  if (isVideoPlaying(wakeLockState.video)) {
    wakeLockState.videoPlaying = true;
    return;
  }
  const video = ensureVideo();
  if (!video) {
    logWakeLock("warn", "wake lock video fallback failed", acquireDetails(reason, {
      error: "no_video_element",
    }));
    return;
  }
  wakeLockState.videoPending = true;
  try {
    const playResult = video.play();
    if (playResult && typeof playResult.then === "function") {
      await playResult;
    }
    wakeLockState.videoPlaying = isVideoPlaying(video);
    if (!wakeLockState.videoPlaying) {
      logWakeLock("warn", "wake lock video fallback failed", acquireDetails(reason, {
        error: "play_resolved_paused",
      }));
    }
  } catch (error) {
    wakeLockState.videoPlaying = false;
    logWakeLock("warn", "wake lock video fallback failed", acquireDetails(reason, {
      error: errorMessage(error),
    }));
  } finally {
    wakeLockState.videoPending = false;
  }
}

function stopVideoFallbackSync() {
  const video = wakeLockState.video;
  wakeLockState.video = null;
  wakeLockState.videoPlaying = false;
  wakeLockState.videoPending = false;
  if (!video) return;
  try {
    video.pause();
  } catch {
    // ignore
  }
  try {
    video.remove?.();
  } catch {
    // ignore
  }
}

function pauseVideoForHide() {
  const video = wakeLockState.video;
  wakeLockState.videoPlaying = false;
  wakeLockState.videoPending = false;
  if (!video) return;
  try {
    video.pause();
  } catch {
    // ignore
  }
}

async function requestWakeLock(reason) {
  if (!wakeLockState.desiredActive || wakeLockState.pending || wakeLockState.sentinel) return;
  const wakeLock = getWakeLockRequestor();
  if (!wakeLock) {
    if (!wakeLockState.supportLogged) {
      wakeLockState.supportLogged = true;
      logWakeLock("warn", "wake lock unavailable", acquireDetails(reason, {
        userAgent: getNavigator()?.userAgent ?? "unknown",
      }));
    }
    return;
  }
  if (getVisibilityState() !== "visible") {
    logWakeLock("debug", "wake lock request deferred until page is visible", acquireDetails(reason));
    return;
  }
  wakeLockState.pending = true;
  try {
    const sentinel = await wakeLock.request("screen");
    wakeLockState.sentinel = sentinel;
    sentinel.addEventListener("release", () => {
      wakeLockState.sentinel = null;
      publishDebugState();
      if (wakeLockState.desiredActive && getVisibilityState() === "visible") {
        logWakeLock("warn", "wake lock released unexpectedly", acquireDetails("released"));
        void acquireAll("released");
      }
    });
  } catch (error) {
    logWakeLock("warn", "wake lock request failed", acquireDetails(reason, {
      error: errorMessage(error),
    }));
  } finally {
    wakeLockState.pending = false;
  }
}

async function releaseWakeLock(reason) {
  const sentinel = wakeLockState.sentinel;
  if (!sentinel) return;
  wakeLockState.sentinel = null;
  try {
    if (!sentinel.released) {
      await sentinel.release();
    }
  } catch (error) {
    logWakeLock("warn", "wake lock release failed", acquireDetails(reason, {
      error: errorMessage(error),
    }));
  }
}

async function acquireAll(reason) {
  if (!wakeLockState.desiredActive) return;
  const startVideo = needsVideoFallback() ? startVideoFallback(reason) : Promise.resolve();
  const startLock = requestWakeLock(reason);
  await Promise.all([startVideo, startLock]);
  if (wakeLockState.desiredActive && !wakeLockState.sentinel && !wakeLockState.videoPlaying) {
    await startVideoFallback(reason);
  }
  publishDebugState();
}

function releaseForHide(reason) {
  if (!wakeLockState.desiredActive) return;
  void releaseWakeLock(reason);
  pauseVideoForHide();
  publishDebugState();
}

function reacquireIfVisible(reason) {
  if (!wakeLockState.desiredActive) return;
  if (getVisibilityState() === "hidden") return;
  void acquireAll(reason);
}

export function isWakeLockDebugEnabled(loc) {
  const location = loc ?? getWindow()?.location;
  if (!location) return false;
  try {
    const search = location.search ?? "";
    if (new URLSearchParams(search).has("debug")) return true;
    const hash = location.hash ?? "";
    return /(?:^|[?#&])debug(?:&|=|$)/.test(hash);
  } catch {
    return false;
  }
}

function ensureDebugIndicator() {
  if (envOverride) return null;
  if (typeof document === "undefined") return null;
  if (!isWakeLockDebugEnabled()) return null;
  let el = document.getElementById("wake-lock-debug");
  if (el) return el;
  el = document.createElement("div");
  el.id = "wake-lock-debug";
  el.className = "wake-lock-debug";
  el.setAttribute("data-wake-lock-debug", "true");
  el.setAttribute("aria-live", "polite");
  document.body?.appendChild(el);
  return el;
}

function publishDebugState() {
  const state = getWakeLockDebugState();
  const win = envOverride ? envOverride.window : getWindow();
  if (win) win.__wakeLockState = state;
  if (envOverride) return state;
  const el = ensureDebugIndicator();
  if (el) {
    el.textContent = formatWakeLockStatus(state);
    el.dataset.status = state.status;
    el.dataset.method = state.method;
  }
  return state;
}

export function initializeWakeLock() {
  if (!wakeLockState.listenersAttached) {
    const doc = getDocument();
    const win = getWindow();
    if (doc || win) {
      wakeLockState.listenersAttached = true;
      doc?.addEventListener("visibilitychange", () => {
        if (getDocument()?.visibilityState === "visible") {
          reacquireIfVisible("visibilitychange");
        } else {
          releaseForHide("hidden");
        }
      });
      const onPageShow = () => reacquireIfVisible("pageshow");
      win?.addEventListener("pageshow", onPageShow);
      doc?.addEventListener("pageshow", onPageShow);
    }
  }
  publishDebugState();
}

export async function setWakeLockActive(active, reason) {
  wakeLockState.desiredActive = active;
  if (active) {
    await acquireAll(reason);
    const method = currentMethod();
    if (method === "none") {
      logWakeLock("warn", "wake lock acquire failed", acquireDetails(reason));
      publishDebugState();
      return;
    }
    logWakeLock("info", "wake lock acquired", acquireDetails(reason));
    publishDebugState();
    return;
  }
  await releaseWakeLock(reason);
  stopVideoFallbackSync();
  logWakeLock("info", "wake lock released", acquireDetails(reason));
  publishDebugState();
}

export function getWakeLockDebugState() {
  return {
    status: currentStatus(),
    desiredActive: wakeLockState.desiredActive,
    hasSentinel: Boolean(wakeLockState.sentinel),
    videoPlaying: wakeLockState.videoPlaying,
    method: currentMethod(),
  };
}

export function formatWakeLockStatus(state = getWakeLockDebugState()) {
  if (state.status !== "held") return "Wake lock: released";
  if (state.method === "wake-lock+video") return "Wake lock: held · wake lock + video";
  if (state.method === "wake-lock") return "Wake lock: held · wake lock";
  if (state.method === "video") return "Wake lock: held · video";
  return "Wake lock: held";
}
