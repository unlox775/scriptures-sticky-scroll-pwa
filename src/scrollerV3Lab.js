import "./scrollerLab.css";
import "./scrollerV3Lab.css";
import { AutoScrollController } from "./autoScrollController.js";
import { loadIndex } from "./data.js";
import { parseScrollerV3Route, ScriptureScrollerV3 } from "./scriptureScrollerV3.js";

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const els = {
  labHeader: document.querySelector(".lab-header"),
  autoScrollToggle: document.getElementById("autoScrollToggle"),
  bookSelect: document.getElementById("bookSelect"),
  chapterInput: document.getElementById("chapterInput"),
  verseInput: document.getElementById("verseInput"),
  jumpForm: document.getElementById("jumpForm"),
  scroller: document.getElementById("scriptureScroller"),
  content: document.getElementById("scriptureContent"),
  measureHost: document.getElementById("measureHost"),
  topSpacer: document.getElementById("topSpacer"),
  bottomSpacer: document.getElementById("bottomSpacer"),
  currentReference: document.getElementById("currentReference"),
  statusPill: document.getElementById("statusPill"),
  loadedCount: document.getElementById("loadedCount"),
  domHeight: document.getElementById("domHeight"),
  scrollTop: document.getElementById("scrollTop"),
  cacheState: document.getElementById("cacheState"),
  topSpacerMetric: document.getElementById("topSpacerMetric"),
  bottomSpacerMetric: document.getElementById("bottomSpacerMetric"),
  topDistance: document.getElementById("topDistance"),
  bottomDistance: document.getElementById("bottomDistance"),
  topPressureBar: document.getElementById("topPressureBar"),
  bottomPressureBar: document.getElementById("bottomPressureBar"),
  thresholdDetails: document.getElementById("thresholdDetails"),
  alignmentDetails: document.getElementById("alignmentDetails"),
  minimap: document.getElementById("minimap"),
  minimapTrack: document.getElementById("minimapTrack"),
  minimapBlocks: document.getElementById("minimapBlocks"),
  minimapLines: document.getElementById("minimapLines"),
  minimapViewport: document.getElementById("minimapViewport"),
  minimapScale: document.getElementById("minimapScale"),
  setMinimapScreens: document.getElementById("setMinimapScreens"),
  loadedWindow: document.getElementById("loadedWindow"),
  eventTicker: document.getElementById("eventTicker"),
  clearEvents: document.getElementById("clearEvents"),
};

let scroller = null;
let autoScroll = null;
let lastSnapshot = null;
let tickerRepeat = null;
let minimapCenterY = null;
let isApplyingRoute = false;
let minimapScreensVisible = 60;
let previousMinimapBricks = new Map();
const fadingMinimapBricks = new Map();
const MINIMAP_FADE_MS = 1000;

function fmtPx(value) {
  return `${Math.round(value || 0).toLocaleString()} px`;
}

function setStatus(text, level = "info") {
  els.statusPill.textContent = text;
  els.statusPill.dataset.level = level;
}

function addEvent(entry) {
  if (entry.event === "metrics_updated") return;
  const key = `${entry.event || "event"}:${entry.summary || ""}`;
  if (tickerRepeat?.key === key) {
    tickerRepeat.total += 1;
    tickerRepeat.node.querySelector("span").textContent = new Date(entry.ts).toLocaleTimeString();
    tickerRepeat.node.querySelector("[data-repeat-count]").textContent = `x${tickerRepeat.total}`;
    els.eventTicker.prepend(tickerRepeat.node);
    return;
  }

  tickerRepeat = { key, total: 1, node: null };
  const li = document.createElement("li");
  li.className = `ticker-item level-${entry.level || "debug"}`;
  li.innerHTML = `
    <span>${new Date(entry.ts).toLocaleTimeString()}</span>
    <strong>${entry.event}</strong>
    <b data-repeat-count>x1</b>
    <em>${entry.summary || ""}</em>
  `;
  tickerRepeat.node = li;
  els.eventTicker.prepend(li);
  while (els.eventTicker.children.length > 90) {
    els.eventTicker.lastChild.remove();
  }
}

function counterLine(label, item, fallback = "none") {
  if (!item) return `<div><span>${label}</span><strong>${fallback}</strong></div>`;
  if (item.passed) return `<div><span>${label}</span><strong>passed · ${item.label}</strong></div>`;
  return `<div><span>${label}</span><strong>${fmtPx(item.px)} · ${item.label}</strong></div>`;
}

function renderThresholdDetails(snapshot) {
  const t = snapshot.thresholds;
  if (!t) return;
  els.thresholdDetails.innerHTML = `
    <div><span>strategy</span><strong>spacer swap, scrollTop untouched</strong></div>
    <div><span>preload</span><strong>${t.preloadViewportPages} viewports</strong></div>
    ${counterLine("up load", t.loadUp, "start of work")}
    ${counterLine("down load", t.loadDown, "end of work")}
    ${counterLine("above unload", t.unloadAbove)}
    ${counterLine("below unload", t.unloadBelow)}
  `;
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;
  lastSnapshot = snapshot;
  const scrollerTop = els.scroller.getBoundingClientRect().top;
  document.documentElement.style.setProperty("--target-line-top", `${scrollerTop + snapshot.viewportHeight * 0.25}px`);
  els.loadedCount.textContent = String(snapshot.loadedCount);
  els.domHeight.textContent = fmtPx(snapshot.contentHeight);
  els.scrollTop.textContent = fmtPx(snapshot.scrollTop);
  els.cacheState.textContent = `${snapshot.cache?.size ?? 0}/${snapshot.cache?.maxBooks ?? 0} books`;
  els.topSpacerMetric.textContent = fmtPx(snapshot.topSpacerPx);
  els.bottomSpacerMetric.textContent = fmtPx(snapshot.bottomSpacerPx);

  const loadUpDistance = snapshot.thresholds?.loadUp?.px ?? 0;
  const loadDownDistance = snapshot.thresholds?.loadDown?.px ?? 0;
  els.topDistance.textContent = fmtPx(loadUpDistance);
  els.bottomDistance.textContent = fmtPx(loadDownDistance);
  const threshold = Math.max(snapshot.preloadDistancePx, 1);
  const topPressure = 1 - Math.min(loadUpDistance / threshold, 1);
  const bottomPressure = 1 - Math.min(loadDownDistance / threshold, 1);
  els.topPressureBar.style.width = `${Math.max(0, topPressure) * 100}%`;
  els.bottomPressureBar.style.width = `${Math.max(0, bottomPressure) * 100}%`;
  els.topPressureBar.classList.toggle("threshold-hot", topPressure >= 1);
  els.bottomPressureBar.classList.toggle("threshold-hot", bottomPressure >= 1);

  if (snapshot.anchor) {
    els.currentReference.textContent = snapshot.anchor.reference;
  }
  if (els.alignmentDetails) {
    const alignment = snapshot.lastAlignment;
    els.alignmentDetails.innerHTML = alignment
      ? `
        <div><span>align target</span><strong>${fmtPx(alignment.targetY)}</strong></div>
        <div><span>requested scroll</span><strong>${fmtPx(alignment.requestedScrollTop)}</strong></div>
        <div><span>actual scroll</span><strong>${fmtPx(alignment.actualScrollTop)}</strong></div>
        <div><span>scroll range</span><strong>${fmtPx(alignment.scrollHeight - alignment.clientHeight)}</strong></div>
      `
      : "";
  }

  renderThresholdDetails(snapshot);
  renderMinimap(snapshot);
  renderLoadedWindow(snapshot);
}

function scheduleMinimapFadeFrame() {
  if (fadingMinimapBricks.size === 0 || !lastSnapshot) return;
  window.setTimeout(() => {
    if (fadingMinimapBricks.size > 0 && lastSnapshot) {
      renderMinimap(lastSnapshot);
      scheduleMinimapFadeFrame();
    }
  }, 80);
}

function makeLine(label, y, className) {
  const line = document.createElement("div");
  line.className = `minimap-line ${className}`;
  line.style.top = `${y}px`;
  line.innerHTML = `<span>${label}</span>`;
  return line;
}

function renderMinimap(snapshot) {
  const now = performance.now();
  const mapHeight = Math.max(els.minimap.clientHeight || 420, 1);
  const screensVisible = minimapScreensVisible;
  const worldHeight = Math.max(snapshot.viewportHeight * screensVisible, snapshot.viewportHeight);
  const viewportCenter = snapshot.scrollTop + snapshot.viewportHeight / 2;
  const safeMargin = worldHeight * 0.18;
  if (minimapCenterY === null) {
    minimapCenterY = viewportCenter;
  } else if (viewportCenter < minimapCenterY - worldHeight / 2 + safeMargin) {
    minimapCenterY = viewportCenter + worldHeight / 2 - safeMargin;
  } else if (viewportCenter > minimapCenterY + worldHeight / 2 - safeMargin) {
    minimapCenterY = viewportCenter - worldHeight / 2 + safeMargin;
  }

  const worldTop = Math.max(0, minimapCenterY - worldHeight / 2);
  const worldBottom = worldTop + worldHeight;
  const scale = mapHeight / worldHeight;
  els.minimapScale.textContent = `${screensVisible} screens · 1:${Math.max(1, Math.round(1 / scale))}`;
  els.minimapBlocks.innerHTML = "";

  const toMapY = (documentY) => (documentY - worldTop) * scale;
  const visibleBricks = new Map();
  for (const chapter of snapshot.loadedChapters) {
    const key = `${chapter.seq}:${chapter.label}`;
    visibleBricks.set(key, chapter);
    if (chapter.bottom < worldTop || chapter.top > worldBottom) continue;
    renderMinimapBrick(chapter, toMapY, scale);
  }

  for (const [key, chapter] of previousMinimapBricks) {
    if (!visibleBricks.has(key)) {
      if (!fadingMinimapBricks.has(key)) {
        fadingMinimapBricks.set(key, { ...chapter, removedAt: now });
      }
    }
  }

  for (const [key, chapter] of fadingMinimapBricks) {
    const age = now - chapter.removedAt;
    if (age >= MINIMAP_FADE_MS) {
      fadingMinimapBricks.delete(key);
      continue;
    }
    if (chapter.bottom < worldTop || chapter.top > worldBottom) continue;
    renderMinimapBrick(chapter, toMapY, scale, {
      fading: true,
      progress: age / MINIMAP_FADE_MS,
    });
  }
  previousMinimapBricks = visibleBricks;
  if (fadingMinimapBricks.size > 0) scheduleMinimapFadeFrame();

  const lines = [];
  const t = snapshot.thresholds;
  if (t?.loadUp) lines.push(makeLine(`load up: ${t.loadUp.label}`, toMapY(t.loadUp.targetY), "line-load"));
  if (t?.loadDown) lines.push(makeLine(`load down: ${t.loadDown.label}`, toMapY(t.loadDown.targetY), "line-load"));
  if (t?.unloadAbove && !t.unloadAbove.passed) {
    lines.push(makeLine(`unload above: ${t.unloadAbove.label}`, toMapY(t.unloadAbove.targetY), "line-unload"));
  }
  if (t?.unloadBelow && !t.unloadBelow.passed) {
    lines.push(makeLine(`unload below: ${t.unloadBelow.label}`, toMapY(t.unloadBelow.targetY), "line-unload"));
  }
  els.minimapLines.replaceChildren(...lines);
  els.minimapViewport.style.top = `${toMapY(snapshot.scrollTop)}px`;
  els.minimapViewport.style.height = `${Math.max(2, snapshot.viewportHeight * scale)}px`;
  els.minimapViewport.dataset.mapTop = String(Math.round(toMapY(snapshot.scrollTop)));
  els.minimapViewport.dataset.mapHeight = String(Math.round(Math.max(2, snapshot.viewportHeight * scale)));
  els.minimap.dataset.screensVisible = String(screensVisible);
  els.minimap.dataset.viewportCenterRatio = String((toMapY(snapshot.scrollTop) + Math.max(2, snapshot.viewportHeight * scale) / 2) / mapHeight);
}

function renderMinimapBrick(chapter, toMapY, scale, options = {}) {
  const block = document.createElement("div");
  block.className = `minimap-block${options.fading ? " minimap-block-fading" : ""}`;
  block.style.top = `${toMapY(chapter.top)}px`;
  block.style.height = `${Math.max(3, chapter.height * scale)}px`;
  if (options.fading) {
    block.style.setProperty("--fade-progress", String(options.progress));
  }
  block.title = chapter.label;
  block.textContent = chapter.label;
  els.minimapBlocks.appendChild(block);
}

function promptForMinimapScreens() {
  const value = window.prompt("How many viewport heights should the minimap show?", String(minimapScreensVisible));
  if (value === null) return;
  const next = Number.parseInt(value, 10);
  if (!Number.isFinite(next) || next < 1) {
    addEvent({
      event: "minimap_config_rejected",
      level: "error",
      summary: "Minimap viewport count must be a positive number",
      ts: Date.now(),
    });
    return;
  }
  minimapScreensVisible = Math.min(next, 1000);
  minimapCenterY = null;
  renderSnapshot(lastSnapshot);
  addEvent({
    event: "minimap_config_updated",
    level: "info",
    summary: `Minimap now shows ${minimapScreensVisible} viewport heights`,
    ts: Date.now(),
  });
}

function renderLoadedWindow(snapshot) {
  els.loadedWindow.innerHTML = snapshot.loadedChapters
    .map((chapter) => `<span title="seq ${chapter.seq} · top ${chapter.top}px">${chapter.label}</span>`)
    .join("<b>,</b> ");
}

function updateHash(location) {
  const hash = `#/${location.bookId}/${location.chapter}/${location.verse}`;
  if (window.location.hash !== hash) {
    history.replaceState(null, "", hash);
  }
}

function syncControls(location) {
  els.bookSelect.value = location.bookId;
  els.chapterInput.value = String(location.chapter);
  els.verseInput.value = String(location.verse || 1);
}

async function jumpFromControls() {
  const location = {
    bookId: els.bookSelect.value,
    chapter: els.chapterInput.value,
    verse: els.verseInput.value,
  };
  setStatus("jumping", "info");
  minimapCenterY = null;
  const snapshot = await scroller.jumpTo(location);
  const normalized = snapshot.anchor || location;
  syncControls(normalized);
  updateHash(normalized);
  renderSnapshot(snapshot);
  setStatus("ready", "ok");
}

async function jumpToRoute(location) {
  if (!scroller || isApplyingRoute) return;
  isApplyingRoute = true;
  try {
    setStatus("jumping", "info");
    minimapCenterY = null;
    const snapshot = await scroller.jumpTo(location);
    const normalized = snapshot.anchor || location;
    syncControls(normalized);
    renderSnapshot(snapshot);
    setStatus("ready", "ok");
  } catch (error) {
    setStatus("error", "error");
    addEvent({
      event: "route_jump_failed",
      level: "error",
      summary: error.message,
      ts: Date.now(),
    });
  } finally {
    isApplyingRoute = false;
  }
}

function onTelemetry(entry) {
  if (entry.event === "metrics_updated") {
    renderSnapshot(entry.snapshot);
    return;
  }
  if (entry.event === "anchor_changed") return;
  addEvent(entry);
  if (entry.level === "error") setStatus("error", "error");
  if (entry.event === "chapter_load_start") setStatus("loading", "info");
  if (entry.event === "chapter_load_done" || entry.event === "chapter_unloaded") setStatus("ready", "ok");
  if (entry.event === "jump_requested") setStatus("jumping", "info");
}

function populateBooks(books) {
  els.bookSelect.innerHTML = books
    .map((book) => `<option value="${book.id}">${book.title}</option>`)
    .join("");
  els.bookSelect.addEventListener("change", () => {
    const book = books.find((item) => item.id === els.bookSelect.value);
    els.chapterInput.max = String(book?.chapterCount || 1);
  });
}

function connectAutoScroll() {
  autoScroll = new AutoScrollController({
    scroller: els.scroller,
    content: els.content,
    button: els.autoScrollToggle,
    panelHost: els.labHeader,
    initialSpeed: 96,
    onAutoScroll: (details) => {
      if (details.phase === "before-scroll" || details.atLoadedBottom) {
        void scroller.evaluateWindow("auto-scroll");
      }
    },
    canContinue: () => {
      const loaded = scroller.loadedSeqs();
      return loaded.at(-1) < scroller.sequence.length - 1;
    },
  });
  autoScroll.connect();
}

async function boot() {
  try {
    setStatus("loading", "info");
    const index = await loadIndex();
    const location = parseScrollerV3Route(window.location.hash);
    const work = index.works.find((item) => item.id === "book-of-mormon") || index.works[0];
    populateBooks(work.books);
    syncControls(location);

    scroller = new ScriptureScrollerV3({
      index,
      scroller: els.scroller,
      content: els.content,
      measureHost: els.measureHost,
      topSpacer: els.topSpacer,
      bottomSpacer: els.bottomSpacer,
      location,
      onTelemetry,
    });

    els.jumpForm.addEventListener("submit", (event) => {
      event.preventDefault();
      jumpFromControls().catch((error) => {
        setStatus("error", "error");
        addEvent({
          event: "jump_failed",
          level: "error",
          summary: error.message,
          ts: Date.now(),
        });
      });
    });
    els.clearEvents.addEventListener("click", () => {
      els.eventTicker.innerHTML = "";
      tickerRepeat = null;
    });
    els.setMinimapScreens?.addEventListener("click", promptForMinimapScreens);
    window.addEventListener("resize", () => renderSnapshot(lastSnapshot));
    window.addEventListener("hashchange", () => {
      void jumpToRoute(parseScrollerV3Route(window.location.hash));
    });

    connectAutoScroll();
    const initialSnapshot = await scroller.init(location);
    syncControls(location);
    updateHash(location);
    renderSnapshot(initialSnapshot);
    setStatus("ready", "ok");
    window.__scriptureScrollerV3Lab = {
      getSnapshot(reason = "test") {
        return scroller.getSnapshot(reason);
      },
      jumpTo(nextLocation) {
        minimapCenterY = null;
        return scroller.jumpTo(nextLocation);
      },
      scrollBy(deltaY) {
        els.scroller.scrollTop += deltaY;
      },
      startAutoScroll(speed = 160) {
        autoScroll.open();
        autoScroll.speed = speed;
      },
      stopAutoScroll() {
        autoScroll.stop("test");
      },
    };
  } catch (error) {
    setStatus("error", "error");
    addEvent({
      event: "boot_failed",
      level: "error",
      summary: error.message,
      ts: Date.now(),
    });
  }
}

boot();
