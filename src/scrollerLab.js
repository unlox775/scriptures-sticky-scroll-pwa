import "./scrollerLab.css";
import { loadIndex } from "./data.js";
import { createScriptureReader, parseScrollerRoute } from "./scriptureReader.js";

const els = {
  labHeader: document.querySelector(".lab-header"),
  autoScrollToggle: document.getElementById("autoScrollToggle"),
  bookSelect: document.getElementById("bookSelect"),
  chapterInput: document.getElementById("chapterInput"),
  verseInput: document.getElementById("verseInput"),
  jumpForm: document.getElementById("jumpForm"),
  scroller: document.getElementById("scriptureScroller"),
  content: document.getElementById("scriptureContent"),
  currentReference: document.getElementById("currentReference"),
  statusPill: document.getElementById("statusPill"),
  loadedCount: document.getElementById("loadedCount"),
  domHeight: document.getElementById("domHeight"),
  scrollTop: document.getElementById("scrollTop"),
  cacheState: document.getElementById("cacheState"),
  topDistance: document.getElementById("topDistance"),
  bottomDistance: document.getElementById("bottomDistance"),
  topPressureBar: document.getElementById("topPressureBar"),
  bottomPressureBar: document.getElementById("bottomPressureBar"),
  thresholdDetails: document.getElementById("thresholdDetails"),
  minimap: document.getElementById("minimap"),
  minimapBlocks: document.getElementById("minimapBlocks"),
  minimapLines: document.getElementById("minimapLines"),
  minimapViewport: document.getElementById("minimapViewport"),
  minimapScale: document.getElementById("minimapScale"),
  loadedWindow: document.getElementById("loadedWindow"),
  eventTicker: document.getElementById("eventTicker"),
  clearEvents: document.getElementById("clearEvents"),
};

let scroller = null;
let reader = null;
let lastSnapshot = null;
let preloadNoise = null;

function fmtPx(value) {
  return `${Math.round(value || 0).toLocaleString()} px`;
}

function setStatus(text, level = "info") {
  els.statusPill.textContent = text;
  els.statusPill.dataset.level = level;
}

function addEvent(entry) {
  if (entry.event === "metrics_updated") return;
  if (entry.event === "preload_not_needed") {
    const edge = entry.metrics?.edge === "top" ? "top" : "bottom";
    if (preloadNoise?.node) {
      preloadNoise.total += 1;
      preloadNoise[edge] += 1;
      preloadNoise.node.querySelector("span").textContent = new Date(entry.ts).toLocaleTimeString();
      preloadNoise.node.querySelector("[data-repeat-count]").textContent = `x${preloadNoise.total}`;
      preloadNoise.node.querySelector("em").textContent =
        `Threshold not crossed · top ${preloadNoise.top} · bottom ${preloadNoise.bottom}`;
      els.eventTicker.prepend(preloadNoise.node);
      return;
    }
    preloadNoise = { total: 1, top: edge === "top" ? 1 : 0, bottom: edge === "bottom" ? 1 : 0, node: null };
  } else {
    preloadNoise = null;
  }
  const li = document.createElement("li");
  li.className = `ticker-item level-${entry.level || "debug"}`;
  const time = new Date(entry.ts).toLocaleTimeString();
  li.innerHTML = `
    <span>${time}</span>
    <strong>${entry.event}</strong>
    <b data-repeat-count></b>
    <em>${entry.summary || ""}</em>
  `;
  if (entry.event === "preload_not_needed") {
    li.querySelector("[data-repeat-count]").textContent = "x1";
    li.querySelector("em").textContent =
      `Threshold not crossed · top ${preloadNoise.top} · bottom ${preloadNoise.bottom}`;
    preloadNoise.node = li;
  }
  els.eventTicker.prepend(li);
  while (els.eventTicker.children.length > 80) {
    els.eventTicker.lastChild.remove();
  }
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;
  lastSnapshot = snapshot;
  const scrollerTop = els.scroller.getBoundingClientRect().top;
  document.documentElement.style.setProperty("--target-line-top", `${scrollerTop + snapshot.viewportHeight * snapshot.alignRatio}px`);
  els.loadedCount.textContent = String(snapshot.loadedCount);
  els.domHeight.textContent = fmtPx(snapshot.contentHeight);
  els.scrollTop.textContent = fmtPx(snapshot.scrollTop);
  els.topDistance.textContent = fmtPx(snapshot.topDistance);
  els.bottomDistance.textContent = fmtPx(snapshot.bottomDistance);
  els.cacheState.textContent = `${snapshot.cache?.size ?? 0}/${snapshot.cache?.maxBooks ?? 0} books`;

  const topPressure = 1 - Math.min(snapshot.topDistance / snapshot.preloadDistancePx, 1);
  const bottomPressure = 1 - Math.min(snapshot.bottomDistance / snapshot.preloadDistancePx, 1);
  els.topPressureBar.style.width = `${Math.max(0, topPressure) * 100}%`;
  els.bottomPressureBar.style.width = `${Math.max(0, bottomPressure) * 100}%`;
  els.topPressureBar.classList.toggle("threshold-hot", topPressure >= 1);
  els.bottomPressureBar.classList.toggle("threshold-hot", bottomPressure >= 1);

  if (snapshot.anchor) {
    els.currentReference.textContent = snapshot.anchor.reference;
  }

  renderThresholdDetails(snapshot);
  renderMinimap(snapshot);
  renderLoadedWindow(snapshot);
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
    <div><span>buffer gap</span><strong>${fmtPx(t.bufferGapPx)} between load/unload</strong></div>
    ${counterLine("up load", t.loadUp, "start of work")}
    ${counterLine("down load", t.loadDown, "end of work")}
    ${counterLine("up unload", t.unloadUp, "no lower chapter to unload")}
    ${counterLine("down unload", t.unloadDown, "no upper chapter to unload")}
  `;
}

function renderMinimap(snapshot) {
  const mapHeight = els.minimap.clientHeight || 420;
  const contentHeight = Math.max(snapshot.contentHeight, snapshot.viewportHeight, 1);
  const scale = mapHeight / contentHeight;
  els.minimapScale.textContent = `1:${Math.max(1, Math.round(1 / scale))}`;
  els.minimapBlocks.innerHTML = "";

  for (const chapter of snapshot.loadedChapters) {
    const block = document.createElement("div");
    block.className = "minimap-block";
    block.style.top = `${chapter.top * scale}px`;
    block.style.height = `${Math.max(8, chapter.height * scale)}px`;
    block.title = chapter.label;
    block.textContent = chapter.label;
    els.minimapBlocks.appendChild(block);
  }

  renderMinimapLines(snapshot, scale);
  els.minimapViewport.style.top = `${snapshot.scrollTop * scale}px`;
  els.minimapViewport.style.height = `${Math.max(3, snapshot.viewportHeight * scale)}px`;
}

function makeLine(label, top, className) {
  const line = document.createElement("div");
  line.className = `minimap-line ${className}`;
  line.style.top = `${top}px`;
  line.innerHTML = `<span>${label}</span>`;
  return line;
}

function renderMinimapLines(snapshot, scale) {
  const lines = [];
  const t = snapshot.thresholds;
  if (!t) {
    els.minimapLines.replaceChildren();
    return;
  }
  if (t.loadUp) {
    lines.push(makeLine(`load up: ${t.loadUp.label} in ${fmtPx(t.loadUp.px)}`, t.loadUp.targetScrollTop * scale, "line-load"));
  }
  if (t.loadDown) {
    lines.push(makeLine(
      `load down: ${t.loadDown.label} in ${fmtPx(t.loadDown.px)}`,
      (t.loadDown.targetScrollTop + snapshot.viewportHeight) * scale,
      "line-load",
    ));
  }

  if (t.unloadUp && !t.unloadUp.passed) {
    lines.push(makeLine(
      `unload below: ${t.unloadUp.label} in ${fmtPx(t.unloadUp.px)}`,
      t.unloadUp.targetScrollTop * scale,
      "line-unload",
    ));
  }
  if (t.unloadDown && !t.unloadDown.passed) {
    lines.push(makeLine(
      `unload above: ${t.unloadDown.label} in ${fmtPx(t.unloadDown.px)}`,
      (t.unloadDown.triggerY ?? t.unloadDown.targetScrollTop + snapshot.viewportHeight) * scale,
      "line-unload",
    ));
  }
  els.minimapLines.replaceChildren(...lines);
}

function renderLoadedWindow(snapshot) {
  els.loadedWindow.innerHTML = snapshot.loadedChapters
    .map(
      (chapter) => `
        <div class="loaded-row">
          <span>${chapter.label}</span>
          <small>seq ${chapter.seq} · top ${chapter.top}px · h ${chapter.height}px</small>
        </div>
      `,
    )
    .join("");
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
  els.verseInput.value = String(location.verse);
}

async function jumpFromControls() {
  const location = {
    bookId: els.bookSelect.value,
    chapter: els.chapterInput.value,
    verse: els.verseInput.value,
  };
  setStatus("jumping", "info");
  const snapshot = await scroller.jumpTo(location);
  const normalized = snapshot.anchor || {
    bookId: location.bookId,
    chapter: Number(location.chapter) || 1,
    verse: Number(location.verse) || 1,
  };
  syncControls(normalized);
  updateHash(normalized);
  renderSnapshot(snapshot);
  setStatus("ready", "ok");
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

async function boot() {
  try {
    setStatus("loading", "info");
    const index = await loadIndex();
    const location = parseScrollerRoute(window.location.hash);
    reader = createScriptureReader({
      index,
      scroller: els.scroller,
      content: els.content,
      autoScrollButton: els.autoScrollToggle,
      autoScrollPanelHost: els.labHeader,
      location,
      onTelemetry,
    });
    scroller = reader.scroller;
    const work = index.works.find((item) => item.id === "book-of-mormon") || index.works[0];
    populateBooks(work.books);
    syncControls(location);

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
      preloadNoise = null;
    });
    window.addEventListener("resize", () => renderSnapshot(lastSnapshot));

    const initialSnapshot = await reader.init(location);
    const anchor = initialSnapshot.anchor || location;
    syncControls(anchor);
    updateHash(anchor);
    renderSnapshot(initialSnapshot);
    setStatus("ready", "ok");
    window.__scriptureScrollerLab = {
      getSnapshot(reason = "test") {
        return reader.getSnapshot(reason);
      },
      getReference() {
        return reader.getSnapshot("test").anchor?.reference ?? null;
      },
      jumpTo(location) {
        return reader.jumpTo(location);
      },
      scrollBy(deltaY) {
        els.scroller.scrollTop += deltaY;
        scroller.markIntentionalScroll();
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
