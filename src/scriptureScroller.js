import { BookCache } from "./data.js";
import { escapeHtml } from "./viewUtils.js";

const DEFAULTS = {
  workId: "book-of-mormon",
  initialBookId: "jacob",
  initialChapter: 2,
  initialVerse: 12,
  alignRatio: 0.25,
  preloadViewportPages: 1.75,
  unloadViewportPages: 2.25,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createEmitter(listener) {
  return (event, payload = {}) => {
    listener?.({
      event,
      ts: Date.now(),
      ...payload,
    });
  };
}

function compareSeq(a, b) {
  return Number(a) - Number(b);
}

const UNLOAD_EPSILON_PX = 4;

export class ScriptureScroller {
  constructor(options) {
    this.scroller = options.scroller;
    this.content = options.content;
    this.index = options.index;
    this.config = { ...DEFAULTS, ...options };
    this.emit = createEmitter(options.onTelemetry);
    this.cache = options.bookCache || new BookCache(4);
    this.sequence = [];
    this.loaded = new Map();
    this.pendingLoads = new Map();
    this.lastScrollTop = 0;
    this.lastAnchor = null;
    this.scrollRaf = 0;
    this.isJumping = false;
    this.lastLoadDirection = null;
    this.userScrollSinceJump = false;
    this.resizeObserver = new ResizeObserver(() => this.queueMeasure("resize"));

    this.handleScroll = this.handleScroll.bind(this);
    this.markUserScroll = this.markUserScroll.bind(this);
  }

  async init(location = {}) {
    this.work = this.index.works.find((work) => work.id === this.config.workId) || this.index.works[0];
    this.sequence = this.buildSequence(this.work);
    this.scroller.addEventListener("scroll", this.handleScroll, { passive: true });
    this.scroller.addEventListener("wheel", this.markUserScroll, { passive: true });
    this.scroller.addEventListener("touchmove", this.markUserScroll, { passive: true });
    this.scroller.addEventListener("keydown", this.markUserScroll);
    this.resizeObserver.observe(this.content);
    await this.jumpTo({
      bookId: location.bookId || this.config.initialBookId,
      chapter: parsePositiveInt(location.chapter, this.config.initialChapter),
      verse: parsePositiveInt(location.verse, this.config.initialVerse),
    });
    this.emit("scroller_ready", {
      level: "info",
      summary: "Scroller initialized",
      metrics: { chaptersInWork: this.sequence.length },
    });
  }

  destroy() {
    this.scroller.removeEventListener("scroll", this.handleScroll);
    this.scroller.removeEventListener("wheel", this.markUserScroll);
    this.scroller.removeEventListener("touchmove", this.markUserScroll);
    this.scroller.removeEventListener("keydown", this.markUserScroll);
    this.resizeObserver.disconnect();
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
  }

  buildSequence(work) {
    return work.books.flatMap((bookMeta) =>
      Array.from({ length: bookMeta.chapterCount }, (_, index) => ({
        seq: this.sequence.length + index,
        workId: work.id,
        workTitle: work.title,
        bookMeta,
        chapter: index + 1,
      })),
    ).map((item, seq) => ({ ...item, seq }));
  }

  getBooks() {
    return this.work?.books ?? [];
  }

  normalizeLocation(location) {
    const fallbackBook = this.getBooks().find((book) => book.id === this.config.initialBookId) || this.getBooks()[0];
    const requestedBook = this.getBooks().find((book) => book.id === location.bookId) || fallbackBook;
    const chapter = clamp(parsePositiveInt(location.chapter, 1), 1, requestedBook.chapterCount);
    return {
      bookId: requestedBook.id,
      chapter,
      verse: parsePositiveInt(location.verse, 1),
    };
  }

  locationToSeq(location) {
    const normalized = this.normalizeLocation(location);
    const seq = this.sequence.findIndex(
      (item) => item.bookMeta.id === normalized.bookId && item.chapter === normalized.chapter,
    );
    return Math.max(0, seq);
  }

  pointerLabel(pointer) {
    return `${pointer.bookMeta.title} ${pointer.chapter}`;
  }

  preloadDistancePx(viewportHeight = this.scroller.clientHeight) {
    return viewportHeight * this.config.preloadViewportPages;
  }

  unloadDistancePx(viewportHeight = this.scroller.clientHeight) {
    return viewportHeight * this.config.unloadViewportPages;
  }

  bufferGapPx(viewportHeight = this.scroller.clientHeight) {
    return this.unloadDistancePx(viewportHeight) - this.preloadDistancePx(viewportHeight);
  }

  async jumpTo(location) {
    const normalized = this.normalizeLocation(location);
    const targetSeq = this.locationToSeq(normalized);
    this.isJumping = true;
    this.userScrollSinceJump = false;
    this.emit("jump_requested", {
      level: "info",
      summary: `Jump requested: ${this.pointerLabel(this.sequence[targetSeq])}:${normalized.verse}`,
      refs: { ...normalized, seq: targetSeq },
    });

    this.content.innerHTML = "";
    this.loaded.clear();
    await this.ensureLoaded(targetSeq, "append");

    await nextFrame();
    await nextFrame();
    const applied = await this.alignToVerse(targetSeq, normalized.verse);
    await this.ensurePixelBuffer();
    this.lastScrollTop = this.scroller.scrollTop;
    this.isJumping = false;
    this.emit("jump_applied", {
      level: "info",
      summary: `Target aligned at ${Math.round(this.config.alignRatio * 100)}% viewport`,
      refs: { ...normalized, seq: targetSeq },
      metrics: applied,
    });
    this.queueMeasure("jump");
    return this.getSnapshot("jump");
  }

  async ensurePixelBuffer() {
    let loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
    let firstSeq = loadedSeqs[0];
    let lastSeq = loadedSeqs.at(-1);
    const desiredBufferPx = this.preloadDistancePx();

    for (
      let guard = 0;
      guard < this.sequence.length &&
      firstSeq > 0 &&
      this.scroller.scrollTop < desiredBufferPx;
      guard += 1
    ) {
      await this.ensureLoaded(firstSeq - 1, "prepend");
      loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
      firstSeq = loadedSeqs[0];
    }

    for (
      let guard = 0;
      guard < this.sequence.length &&
      lastSeq < this.sequence.length - 1 &&
      this.content.scrollHeight - this.scroller.clientHeight - this.scroller.scrollTop < desiredBufferPx;
      guard += 1
    ) {
      await this.ensureLoaded(lastSeq + 1, "append");
      loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
      lastSeq = loadedSeqs.at(-1);
    }
  }

  async alignToVerse(seq, requestedVerse) {
    const chapterNode = this.loaded.get(seq);
    const verseCount = chapterNode?.querySelectorAll(".lab-verse").length || 1;
    const verse = clamp(parsePositiveInt(requestedVerse, 1), 1, verseCount);
    const target =
      chapterNode?.querySelector(`.lab-verse[data-verse="${verse}"]`) ||
      chapterNode?.querySelector(".chapter-heading");
    if (!target) return { aligned: false };

    const scrollerRect = this.scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const desiredTop = this.scroller.clientHeight * this.config.alignRatio;
    const delta = targetRect.top - scrollerRect.top - desiredTop;
    const before = this.scroller.scrollTop;
    this.scroller.scrollTop = Math.max(0, before + delta);
    return {
      aligned: true,
      requestedVerse,
      appliedVerse: verse,
      before: Math.round(before),
      after: Math.round(this.scroller.scrollTop),
      delta: Math.round(delta),
    };
  }

  async ensureLoaded(seq, mode) {
    if (seq < 0 || seq >= this.sequence.length || this.loaded.has(seq)) return false;
    if (this.pendingLoads.has(seq)) return this.pendingLoads.get(seq);

    const promise = this.loadAndInsert(seq, mode).finally(() => this.pendingLoads.delete(seq));
    this.pendingLoads.set(seq, promise);
    return promise;
  }

  async loadAndInsert(seq, mode) {
    const pointer = this.sequence[seq];
    const startedAt = performance.now();
    this.emit("chapter_load_start", {
      level: "debug",
      summary: `${mode} ${this.pointerLabel(pointer)}`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
    });

    const bookPayload = await this.cache.getBook(pointer.bookMeta);
    const chapter = bookPayload.chapters.find((item) => item.chapter === pointer.chapter);
    if (!chapter) throw new Error(`Missing ${this.pointerLabel(pointer)}`);

    const node = this.renderChapter(chapter, pointer);
    const beforeHeight = this.content.scrollHeight;
    const beforeScroll = this.scroller.scrollTop;
    if (mode === "prepend" && this.content.firstChild) {
      this.content.insertBefore(node, this.content.firstChild);
      const delta = this.content.scrollHeight - beforeHeight;
      this.scroller.scrollTop = beforeScroll + delta;
    } else {
      this.content.appendChild(node);
    }
    this.loaded.set(seq, node);
    this.lastLoadDirection = mode === "append" ? "down" : mode === "prepend" ? "up" : null;

    this.emit("chapter_load_done", {
      level: "info",
      summary: `${this.pointerLabel(pointer)} loaded`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
      metrics: {
        elapsedMs: Math.round(performance.now() - startedAt),
        loadedCount: this.loaded.size,
        scrollAdjustedBy: Math.round(this.scroller.scrollTop - beforeScroll),
      },
    });
    return true;
  }

  renderChapter(chapter, pointer) {
    const section = document.createElement("section");
    section.className = "lab-chapter";
    section.dataset.seq = String(pointer.seq);
    section.dataset.bookId = pointer.bookMeta.id;
    section.dataset.chapter = String(pointer.chapter);

    section.innerHTML = `
      <header class="chapter-heading">
        <span>${escapeHtml(pointer.bookMeta.title)}</span>
        <strong>Chapter ${chapter.chapter}</strong>
        <a
          class="chapter-external-link"
          href="${escapeHtml(chapter.externalUrl || "#")}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open ${escapeHtml(this.pointerLabel(pointer))} in Gospel Library"
          title="Open in Gospel Library"
        >↗</a>
      </header>
      ${chapter.verses
        .map(
          (verse) => `
            <p class="lab-verse" data-verse="${verse.verse}">
              <span class="verse-ref">${verse.verse}</span>
              ${escapeHtml(verse.text)}
            </p>
          `,
        )
        .join("")}
    `;
    return section;
  }

  handleScroll() {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(async () => {
      this.scrollRaf = 0;
      await this.evaluateWindow();
      this.queueMeasure("scroll");
    });
  }

  markUserScroll() {
    this.userScrollSinceJump = true;
  }

  markIntentionalScroll() {
    this.userScrollSinceJump = true;
  }

  handleAutoScrollTick(details = {}) {
    this.markIntentionalScroll();
    if (details.atLoadedBottom && !this.scrollRaf) {
      void this.evaluateWindow();
    }
  }

  canScrollForward() {
    const loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
    const lastSeq = loadedSeqs.at(-1);
    return Number.isFinite(lastSeq) && lastSeq < this.sequence.length - 1;
  }

  emitAutoScrollStop(details = {}) {
    const snapshot = this.getSnapshot("auto-scroll-stop");
    this.emit("auto_scroll_stop", {
      level: details.reason === "work-end" ? "info" : "debug",
      summary: `Auto-scroll stopped: ${details.reason || "unknown"}`,
      refs: { reference: snapshot.anchor?.reference, reason: details.reason },
      metrics: {
        scrollTop: snapshot.scrollTop,
        viewportHeight: snapshot.viewportHeight,
        contentHeight: snapshot.contentHeight,
        bottomDistance: snapshot.bottomDistance,
        loadedCount: snapshot.loadedCount,
        pendingLoads: snapshot.pendingLoads,
        canScrollForward: this.canScrollForward(),
        speed: details.speed,
      },
    });
  }

  async evaluateWindow() {
    const snapshot = this.getSnapshot("scroll");
    const previousScrollTop = this.lastScrollTop;
    const direction = snapshot.scrollTop >= this.lastScrollTop ? "down" : "up";
    this.lastScrollTop = snapshot.scrollTop;
    const loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
    const firstSeq = loadedSeqs[0];
    const lastSeq = loadedSeqs.at(-1);

    if (snapshot.topDistance < snapshot.preloadDistancePx) {
      if (firstSeq > 0) await this.ensureLoaded(firstSeq - 1, "prepend");
      else this.emit("work_boundary_hit", { level: "debug", summary: "At beginning of work", refs: { edge: "top" } });
    } else {
      this.emit("preload_not_needed", {
        level: "debug",
        summary: "Top threshold not crossed",
        metrics: { edge: "top", distance: snapshot.topDistance, threshold: snapshot.preloadDistancePx },
      });
    }

    if (snapshot.bottomDistance < snapshot.preloadDistancePx) {
      if (lastSeq < this.sequence.length - 1) await this.ensureLoaded(lastSeq + 1, "append");
      else this.emit("work_boundary_hit", { level: "debug", summary: "At end of work", refs: { edge: "bottom" } });
    } else if (direction === "down") {
      this.emit("preload_not_needed", {
        level: "debug",
        summary: "Bottom threshold not crossed",
        metrics: { edge: "bottom", distance: snapshot.bottomDistance, threshold: snapshot.preloadDistancePx },
      });
    }

    this.unloadFarChapters(direction, previousScrollTop);
  }

  unloadFarChapters(direction, previousScrollTop) {
    const viewportTop = this.scroller.scrollTop;
    const viewportBottom = viewportTop + this.scroller.clientHeight;
    const previousViewportBottom = previousScrollTop + this.scroller.clientHeight;
    const unloadDistancePx = this.unloadDistancePx();
    const entries = Array.from(this.loaded.entries()).sort(([a], [b]) => a - b);
    if (!this.userScrollSinceJump || entries.length <= 1) {
      this.lastLoadDirection = null;
      return;
    }

    const [seq, node] = direction === "down" ? entries[0] : entries.at(-1);
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    const unloadAboveAt = bottom + unloadDistancePx;
    const unloadBelowAt = top - unloadDistancePx;
    const crossedAbove = direction === "down" && previousScrollTop <= unloadAboveAt && viewportTop > unloadAboveAt;
    const crossedBelow = direction === "up" && previousViewportBottom >= unloadBelowAt && viewportBottom < unloadBelowAt;
    const pastAbove = direction === "down" && viewportTop > unloadAboveAt + UNLOAD_EPSILON_PX;
    const pastBelow = direction === "up" && viewportBottom < unloadBelowAt - UNLOAD_EPSILON_PX;
    const shouldUnloadAbove = pastAbove;
    const shouldUnloadBelow = pastBelow;

    if (!shouldUnloadAbove && !shouldUnloadBelow) {
      this.lastLoadDirection = null;
      return;
    }

    const beforeScroll = this.scroller.scrollTop;
    const nextNode = node.nextElementSibling;
    const removedSpace = shouldUnloadAbove && nextNode
      ? nextNode.offsetTop - node.offsetTop
      : node.offsetHeight;
    node.remove();
    this.loaded.delete(seq);
    if (shouldUnloadAbove) this.scroller.scrollTop = Math.max(0, beforeScroll - removedSpace);
    this.lastScrollTop = this.scroller.scrollTop;
    this.emit("chapter_unloaded", {
      level: "info",
      summary: `${this.pointerLabel(this.sequence[seq])} unloaded`,
      refs: { seq, edge: shouldUnloadAbove ? "top" : "bottom" },
      metrics: {
        retainedCount: this.loaded.size,
        beforeScroll: Math.round(beforeScroll),
        afterScroll: Math.round(this.scroller.scrollTop),
        removedSpace: Math.round(removedSpace),
        mode: crossedAbove || crossedBelow ? "crossed" : "catch-up",
        scrollAdjustedBy: shouldUnloadAbove ? Math.round(this.scroller.scrollTop - beforeScroll) : 0,
      },
    });
    this.lastLoadDirection = null;
  }

  queueMeasure(reason) {
    requestAnimationFrame(() => {
      const snapshot = this.getSnapshot(reason);
      const anchor = this.findAnchor();
      if (!this.isJumping && anchor?.reference !== this.lastAnchor?.reference) {
        this.lastAnchor = anchor;
        this.emit("anchor_changed", {
          level: "debug",
          summary: `Anchor: ${anchor.reference}`,
          refs: anchor,
        });
      }
      this.emit("metrics_updated", {
        level: "trace",
        summary: "Scroller metrics updated",
        snapshot,
      });
    });
  }

  findAnchor() {
    const targetY = this.scroller.getBoundingClientRect().top + this.scroller.clientHeight * this.config.alignRatio;
    const verses = Array.from(this.content.querySelectorAll(".lab-verse"));
    let best = null;
    for (const verse of verses) {
      const rect = verse.getBoundingClientRect();
      const distance = Math.abs(rect.top - targetY);
      if (!best || distance < best.distance) best = { verse, distance };
    }
    if (!best) return null;
    const chapter = best.verse.closest(".lab-chapter");
    const pointer = this.sequence[Number(chapter.dataset.seq)];
    return {
      workId: pointer.workId,
      workTitle: pointer.workTitle,
      seq: pointer.seq,
      bookId: pointer.bookMeta.id,
      bookTitle: pointer.bookMeta.title,
      chapter: pointer.chapter,
      verse: Number(best.verse.dataset.verse),
      reference: `${pointer.bookMeta.title} ${pointer.chapter}:${best.verse.dataset.verse}`,
    };
  }

  getThresholdDiagnostics(loadedChapters, scrollTop, viewportHeight, contentHeight) {
    const sortedChapters = [...loadedChapters].sort((a, b) => a.seq - b.seq);
    const loadedSeqs = sortedChapters.map((chapter) => chapter.seq);
    const firstSeq = loadedSeqs[0];
    const lastSeq = loadedSeqs.at(-1);
    const firstChapter = sortedChapters[0] || null;
    const lastChapter = sortedChapters.at(-1) || null;
    const viewportBottom = scrollTop + viewportHeight;
    const bottomDistance = Math.max(0, contentHeight - viewportHeight - scrollTop);
    const preloadDistancePx = this.preloadDistancePx(viewportHeight);
    const unloadDistancePx = this.unloadDistancePx(viewportHeight);
    const bufferGapPx = this.bufferGapPx(viewportHeight);
    const labelForSeq = (seq) => (this.sequence[seq] ? this.pointerLabel(this.sequence[seq]) : null);
    const loadUp = firstSeq > 0
      ? {
          label: labelForSeq(firstSeq - 1),
          targetScrollTop: preloadDistancePx,
          px: Math.max(0, scrollTop - preloadDistancePx),
          active: scrollTop < preloadDistancePx,
        }
      : null;
    const loadDown = lastSeq < this.sequence.length - 1
      ? {
          label: labelForSeq(lastSeq + 1),
          targetScrollTop: Math.max(0, contentHeight - viewportHeight - preloadDistancePx),
          px: Math.max(0, bottomDistance - preloadDistancePx),
          active: bottomDistance < preloadDistancePx,
        }
      : null;

    const canUnloadEdge = sortedChapters.length > 1;
    const unloadDown = canUnloadEdge && firstChapter
      ? (() => {
          const targetScrollTop = firstChapter.top + firstChapter.height + unloadDistancePx;
          return {
            label: firstChapter.label,
            targetScrollTop,
            triggerY: targetScrollTop + viewportHeight,
            px: targetScrollTop - scrollTop,
            passed: targetScrollTop < scrollTop,
          };
        })()
      : null;
    const unloadUpTargetScrollTop = canUnloadEdge && lastChapter
      ? lastChapter.top - viewportHeight - unloadDistancePx
      : null;
    const unloadUp = canUnloadEdge && lastChapter && unloadUpTargetScrollTop >= 0
      ? {
          label: lastChapter.label,
          triggerY: lastChapter.top - unloadDistancePx,
          targetScrollTop: unloadUpTargetScrollTop,
          px: scrollTop - unloadUpTargetScrollTop,
          passed: unloadUpTargetScrollTop > scrollTop,
        }
      : null;

    return {
      preloadDistancePx,
      preloadViewportPages: this.config.preloadViewportPages,
      unloadDistancePx,
      unloadViewportPages: this.config.unloadViewportPages,
      bufferGapPx,
      loadUp,
      loadDown,
      unloadUp,
      unloadDown,
    };
  }

  getSnapshot(reason = "measure") {
    const loadedSeqs = Array.from(this.loaded.keys()).sort(compareSeq);
    const loadedChapters = loadedSeqs.map((seq) => {
      const node = this.loaded.get(seq);
      const pointer = this.sequence[seq];
      return {
        seq,
        label: this.pointerLabel(pointer),
        bookId: pointer.bookMeta.id,
        chapter: pointer.chapter,
        top: Math.round(node.offsetTop),
        height: Math.round(node.offsetHeight),
      };
    });
    const scrollTop = Math.round(this.scroller.scrollTop);
    const viewportHeight = Math.round(this.scroller.clientHeight);
    const contentHeight = Math.round(this.content.scrollHeight);
    const thresholds = this.getThresholdDiagnostics(loadedChapters, scrollTop, viewportHeight, contentHeight);
    return {
      reason,
      scrollTop,
      viewportHeight,
      contentHeight,
      topDistance: scrollTop,
      bottomDistance: Math.max(0, contentHeight - viewportHeight - scrollTop),
      preloadDistancePx: this.preloadDistancePx(viewportHeight),
      unloadDistancePx: this.unloadDistancePx(viewportHeight),
      bufferGapPx: this.bufferGapPx(viewportHeight),
      alignRatio: this.config.alignRatio,
      loadedCount: this.loaded.size,
      loadedChapters,
      thresholds,
      pendingLoads: this.pendingLoads.size,
      cache: this.cache.snapshot?.() ?? null,
      anchor: this.findAnchor(),
    };
  }
}

export function parseScrollerRoute(hash) {
  const clean = (hash || "").replace(/^#\/?/, "");
  const [bookId, chapter, verse] = clean.split("/");
  return {
    bookId: bookId || DEFAULTS.initialBookId,
    chapter: parsePositiveInt(chapter, DEFAULTS.initialChapter),
    verse: parsePositiveInt(verse, DEFAULTS.initialVerse),
  };
}
