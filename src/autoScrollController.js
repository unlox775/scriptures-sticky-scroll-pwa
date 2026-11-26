import { initializeWakeLock, setWakeLockActive } from "./wakeLock.js";

const MANUAL_SCROLL_CANCEL_PX = 12;
const AUTO_SCROLL_SPEED_KEY = "scripture-pwa-auto-scroll-speed-v1";

const SPEED_MIN = 0;
const SPEED_MAX = 160;

// Clamp a saved speed to the slider range; keep fractional values as-is.
// Do not snap to the old 4 px/s grid.
export function normalizeSpeed(speed, fallback = 20) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n));
}

// Cubic mapping: speed = 160 * t^3 (t in [0,1])
// The first half of the control is fine-grained around typical reading speeds:
//   t=0 (top) 0 px/s, t=0.5 (middle) 20 px/s, t=1 (bottom) 160 px/s.
export function sliderToSpeed(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return SPEED_MIN;
  const clamped = Math.min(1, Math.max(0, n));
  return SPEED_MAX * Math.pow(clamped, 3);
}

// Inverse: t = (speed / 160)^(1/3). A saved 20 px/s places the thumb at center.
export function speedToSlider(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.pow(Math.min(SPEED_MAX, n) / SPEED_MAX, 1 / 3);
}

// Integers show no decimals; anything else shows exactly two (Nov 2, 2026 rule).
export function formatSpeedLabel(speed) {
  const n = Number(speed);
  return `${Number.isInteger(n) ? String(n) : n.toFixed(2)} px/s`;
}

function readSavedSpeed(fallback) {
  try {
    const raw = localStorage.getItem(AUTO_SCROLL_SPEED_KEY);
    return raw == null ? fallback : normalizeSpeed(raw, fallback);
  } catch {
    return fallback;
  }
}

function saveSpeed(speed) {
  try {
    localStorage.setItem(AUTO_SCROLL_SPEED_KEY, String(speed));
  } catch {}
}

export class AutoScrollController {
  constructor({
    scroller,
    content,
    button,
    panelHost,
    initialSpeed = 20,
    onAutoScroll = null,
    onStateChange = null,
    canContinue = null,
    onStop = null,
  }) {
    this.scroller = scroller;
    this.content = content;
    this.button = button;
    this.panelHost = panelHost;
    this.speed = readSavedSpeed(initialSpeed);
    this.onAutoScroll = onAutoScroll;
    this.onStateChange = onStateChange;
    this.canContinue = canContinue;
    this.onStop = onStop;
    this.raf = 0;
    this.lastTs = 0;
    this.floatScrollTop = 0;
    this.touchStartY = null;

    this.panel = null;
    this.layoutSpeedControl = this.layoutSpeedControl.bind(this);
    this.handleStripPointerDown = this.handleStripPointerDown.bind(this);
    this.handleStripPointerMove = this.handleStripPointerMove.bind(this);
    this.handleStripPointerEnd = this.handleStripPointerEnd.bind(this);
    this.open = this.open.bind(this);
    this.stop = this.stop.bind(this);
    this.step = this.step.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleManualScrollIntent = this.handleManualScrollIntent.bind(this);
  }

  connect() {
    this.button?.addEventListener("click", this.open);
    this.scroller.addEventListener("wheel", this.handleManualScrollIntent, { passive: true });
    this.scroller.addEventListener("touchstart", this.handleTouchStart, { passive: true });
    this.scroller.addEventListener("touchmove", this.handleManualScrollIntent, { passive: true });
    this.scroller.addEventListener("keydown", this.handleManualScrollIntent);
    initializeWakeLock();
  }

  disconnect() {
    this.button?.removeEventListener("click", this.open);
    this.scroller.removeEventListener("wheel", this.handleManualScrollIntent);
    this.scroller.removeEventListener("touchstart", this.handleTouchStart);
    this.scroller.removeEventListener("touchmove", this.handleManualScrollIntent);
    this.scroller.removeEventListener("keydown", this.handleManualScrollIntent);
    this.stop();
  }

  get isActive() {
    return Boolean(this.raf);
  }

  stop(reason = "manual") {
    const wasActive = this.isActive;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTs = 0;
    this.floatScrollTop = 0;
    this.touchStartY = null;
    if (this.button) this.button.textContent = "Auto scroll";
    this.unmountSpeedControl();
    document.querySelectorAll(".auto-scroll-panel").forEach((node) => node.remove());
    this.onStateChange?.(false);
    if (wasActive) {
      void setWakeLockActive(false, reason);
      this.onStop?.({ reason, scrollTop: this.scroller.scrollTop, speed: this.speed });
    }
  }

  open() {
    if (this.isActive) {
      this.stop();
      return;
    }

    this.stop();
    this.mountSpeedControl();
    if (this.button) this.button.textContent = "Stop";
    this.floatScrollTop = this.scroller.scrollTop;
    this.onStateChange?.(true);
    this.raf = requestAnimationFrame(this.step);
    // Start in the same turn as the Auto scroll tap so iOS can play the video fallback.
    void setWakeLockActive(true, "auto-scroll-start");
  }

  // Floating speed control: fixed to the viewport, takes no layout space.
  // Thumb TOP = slowest (t=0), BOTTOM = fastest (t=1). Same cubic mapping as before.
  mountSpeedControl() {
    const panel = document.createElement("div");
    panel.className = "auto-scroll-panel";
    panel.innerHTML = `
      <div class="auto-scroll-label" aria-hidden="true">
        <span class="auto-scroll-label-title">Scroll speed</span>
        <span class="auto-scroll-speed-value" data-auto-speed>${formatSpeedLabel(this.speed)}</span>
      </div>
      <div class="auto-scroll-strip" data-auto-strip role="slider" aria-label="Scroll speed"
        aria-orientation="vertical" aria-valuemin="0" aria-valuemax="160">
        <div class="auto-scroll-track"></div>
        <div class="auto-scroll-thumb" data-auto-thumb></div>
      </div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;
    this.strip = panel.querySelector("[data-auto-strip]");
    this.thumb = panel.querySelector("[data-auto-thumb]");
    this.speedLabel = panel.querySelector("[data-auto-speed]");
    this.dragOffset = null;

    this.layoutSpeedControl();
    this.syncSpeedUI();
    window.addEventListener("resize", this.layoutSpeedControl);

    const strip = this.strip;
    strip.addEventListener("pointerdown", this.handleStripPointerDown);
    strip.addEventListener("pointermove", this.handleStripPointerMove);
    strip.addEventListener("pointerup", this.handleStripPointerEnd);
    strip.addEventListener("pointercancel", this.handleStripPointerEnd);
  }

  unmountSpeedControl() {
    window.removeEventListener("resize", this.layoutSpeedControl);
    this.panel?.remove();
    this.panel = null;
    this.strip = null;
    this.thumb = null;
    this.speedLabel = null;
    this.dragOffset = null;
  }

  // Anchor the control just below the app header (top of the reading view).
  layoutSpeedControl() {
    if (!this.panel) return;
    const top = Math.max(0, Math.round(this.scroller.getBoundingClientRect().top));
    this.panel.style.setProperty("--auto-scroll-top", `${top}px`);
    this.syncSpeedUI();
  }

  speedFromPointer(clientY) {
    const rect = this.strip.getBoundingClientRect();
    const thumbH = this.thumb.offsetHeight;
    const travel = Math.max(1, rect.height - thumbH);
    const center = clientY - (this.dragOffset || 0);
    return sliderToSpeed((center - rect.top - thumbH / 2) / travel);
  }

  handleStripPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const thumbRect = this.thumb.getBoundingClientRect();
    const onThumb = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    // Grabbing the thumb keeps its offset; tapping the track jumps the thumb there.
    this.dragOffset = onThumb ? event.clientY - (thumbRect.top + thumbRect.height / 2) : 0;
    try {
      this.strip.setPointerCapture(event.pointerId);
    } catch {}
    this.strip.classList.add("is-dragging");
    this.setSpeed(this.speedFromPointer(event.clientY), { persist: true });
  }

  handleStripPointerMove(event) {
    if (this.dragOffset === null || !this.strip?.hasPointerCapture?.(event.pointerId)) return;
    event.preventDefault();
    this.setSpeed(this.speedFromPointer(event.clientY), { persist: true });
  }

  handleStripPointerEnd(event) {
    if (this.dragOffset === null) return;
    this.dragOffset = null;
    this.strip?.classList.remove("is-dragging");
    try {
      this.strip?.releasePointerCapture(event.pointerId);
    } catch {}
  }

  setSpeed(speed, { persist = false } = {}) {
    this.speed = normalizeSpeed(speed, this.speed);
    if (persist) saveSpeed(this.speed);
    this.syncSpeedUI();
  }

  syncSpeedUI() {
    if (!this.panel) return;
    const t = speedToSlider(this.speed);
    const travel = Math.max(0, this.strip.clientHeight - this.thumb.offsetHeight);
    this.thumb.style.transform = `translateY(${(t * travel).toFixed(2)}px)`;
    this.strip.setAttribute("aria-valuenow", String(Math.round(this.speed * 100) / 100));
    this.strip.setAttribute("aria-valuetext", formatSpeedLabel(this.speed));
    this.speedLabel.textContent = formatSpeedLabel(this.speed);
  }

  step(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const elapsedSeconds = Math.min((ts - this.lastTs) / 1000, 0.1);
    this.lastTs = ts;
    this.onAutoScroll?.({ phase: "before-scroll", atLoadedBottom: false });

    if (Math.abs(this.scroller.scrollTop - this.floatScrollTop) > 1) {
      this.floatScrollTop = this.scroller.scrollTop;
    }

    this.floatScrollTop += this.speed * elapsedSeconds;
    const nextScrollTop = Math.round(this.floatScrollTop);
    if (nextScrollTop !== Math.round(this.scroller.scrollTop)) {
      this.scroller.scrollTop = nextScrollTop;
    }

    const atBottom = this.scroller.scrollTop + this.scroller.clientHeight >= this.content.scrollHeight - 1;
    if (atBottom) {
      if (!this.canContinue?.()) {
        this.stop("work-end");
        return;
      }
      this.onAutoScroll?.({ phase: "loaded-bottom", atLoadedBottom: true });
    }

    this.raf = requestAnimationFrame(this.step);
  }

  handleTouchStart(event) {
    this.touchStartY = event.touches?.[0]?.clientY ?? null;
  }

  handleManualScrollIntent(event) {
    if (!this.isActive) return;

    const isMeaningfulWheel = event.type === "wheel" && Math.abs(event.deltaY || 0) >= MANUAL_SCROLL_CANCEL_PX;
    const touchY = event.touches?.[0]?.clientY;
    const isMeaningfulTouch =
      event.type === "touchmove" &&
      this.touchStartY !== null &&
      Number.isFinite(touchY) &&
      Math.abs(touchY - this.touchStartY) >= MANUAL_SCROLL_CANCEL_PX;
    const isMeaningfulKey =
      event.type === "keydown" &&
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Spacebar"].includes(event.key);

    if (isMeaningfulWheel || isMeaningfulTouch || isMeaningfulKey) {
      this.stop("manual-scroll");
    }
  }
}
