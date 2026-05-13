export class AutoScrollController {
  constructor({ scroller, content, button, panelHost, initialSpeed = 24 }) {
    this.scroller = scroller;
    this.content = content;
    this.button = button;
    this.panelHost = panelHost;
    this.speed = initialSpeed;
    this.raf = 0;
    this.lastTs = 0;

    this.open = this.open.bind(this);
    this.stop = this.stop.bind(this);
    this.step = this.step.bind(this);
  }

  connect() {
    this.button?.addEventListener("click", this.open);
  }

  disconnect() {
    this.button?.removeEventListener("click", this.open);
    this.stop();
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTs = 0;
    if (this.button) this.button.textContent = "Auto scroll";
    document.querySelectorAll(".auto-scroll-panel").forEach((node) => node.remove());
  }

  open() {
    this.stop();
    const panel = document.createElement("div");
    panel.className = "auto-scroll-panel";
    panel.innerHTML = `
      <label>px/sec <input type="range" min="8" max="160" step="4" value="${this.speed}" /></label>
      <span data-auto-speed>${this.speed} px/s</span>
      <button type="button" data-auto-stop>Stop</button>
    `;

    const input = panel.querySelector("input");
    const speedLabel = panel.querySelector("[data-auto-speed]");
    input.addEventListener("input", () => {
      this.speed = Number(input.value) || this.speed;
      speedLabel.textContent = `${this.speed} px/s`;
    });
    panel.querySelector("[data-auto-stop]").addEventListener("click", this.stop);

    this.panelHost?.insertAdjacentElement("afterend", panel);
    if (this.button) this.button.textContent = "Auto scrolling";
    this.raf = requestAnimationFrame(this.step);
  }

  step(ts) {
    if (!this.lastTs) this.lastTs = ts;
    const elapsedSeconds = Math.min((ts - this.lastTs) / 1000, 0.1);
    this.lastTs = ts;
    this.scroller.scrollTop += this.speed * elapsedSeconds;

    const atBottom = this.scroller.scrollTop + this.scroller.clientHeight >= this.content.scrollHeight - 1;
    if (atBottom) {
      this.stop();
      return;
    }

    this.raf = requestAnimationFrame(this.step);
  }
}
