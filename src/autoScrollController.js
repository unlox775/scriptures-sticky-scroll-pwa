const MANUAL_SCROLL_CANCEL_PX = 12;
const AUTO_SCROLL_SPEED_KEY = "scripture-pwa-auto-scroll-speed-v1";

function readSavedSpeed(fallback) {
  try {
    const saved = Number(localStorage.getItem(AUTO_SCROLL_SPEED_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : fallback;
  } catch {
    return fallback;
  }
}

function saveSpeed(speed) {
  try {
    localStorage.setItem(AUTO_SCROLL_SPEED_KEY, String(speed));
  } catch {}
}

// Cubic mapping: speed = 160 * t^3 (t in [0,1])
// This makes the left half more detailed for typical reading speeds
function sliderToSpeed(t) {
  return 160 * Math.pow(t, 3);
}

// Inverse: t = (speed / 160)^(1/3)
function speedToSlider(speed) {
  return Math.pow(speed / 160, 1 / 3);
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
    document.querySelectorAll(".auto-scroll-panel").forEach((node) => node.remove());
    this.onStateChange?.(false);
    if (wasActive) this.onStop?.({ reason, scrollTop: this.scroller.scrollTop, speed: this.speed });
  }

  open() {
    if (this.isActive) {
      this.stop();
      return;
    }

    this.stop();
    const panel = document.createElement("div");
    panel.className = "auto-scroll-panel";
    const sliderValue = speedToSlider(this.speed);
    const formatSpeed = (speed) => {
      if (speed < 0.05) return "0 px/s";
      if (speed < 1) return `${speed.toFixed(1)} px/s`;
      if (speed < 10) return `${speed.toFixed(1)} px/s`;
      return `${speed.toFixed(1)} px/s`;
    };
    panel.innerHTML = `
      <label class="auto-scroll-speed-control">
        <span>px/sec</span>
        <input type="range" min="0" max="1" step="any" value="${sliderValue}" />
      </label>
      <span class="auto-scroll-speed-value" data-auto-speed>${formatSpeed(this.speed)}</span>
      <button class="auto-scroll-stop" type="button" data-auto-stop>Stop</button>
    `;

    const input = panel.querySelector("input");
    const speedLabel = panel.querySelector("[data-auto-speed]");
    input.addEventListener("input", () => {
      const t = Number(input.value);
      this.speed = sliderToSpeed(t);
      saveSpeed(this.speed);
      speedLabel.textContent = formatSpeed(this.speed);
    });
    panel.querySelector("[data-auto-stop]").addEventListener("click", this.stop);

    this.panelHost?.insertAdjacentElement("afterend", panel);
    if (this.button) this.button.textContent = "Auto scrolling";
    this.floatScrollTop = this.scroller.scrollTop;
    this.onStateChange?.(true);
    this.raf = requestAnimationFrame(this.step);
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
