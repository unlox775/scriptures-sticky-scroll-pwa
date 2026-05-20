import { BookCache } from "./data.js";
import { escapeHtml } from "./viewUtils.js";

const DEFAULTS = {
  workId: "book-of-mormon",
  initialBookId: "alma",
  initialChapter: 36,
  initialVerse: 1,
  alignRatio: 0.25,
  virtualSpacerPx: 100_000_000,
  preloadViewportPages: 10,
  unloadViewportPages: 18,
  lowSpacerWarningPx: 18_000,
  chapterGapPx: 24,
  maxInitialChaptersEachSide: 4,
  maxLoadsPerEvaluation: 8,
  seedRunwayAfterJump: true,
  browserCanvasPx: 30_000_000,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compareSeq(a, b) {
  return Number(a) - Number(b);
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

function createEmitter(listener) {
  return (event, payload = {}) => {
    listener?.({
      event,
      ts: Date.now(),
      ...payload,
    });
  };
}

function chapterReference(pointer) {
  return `${pointer.bookMeta.title} ${pointer.chapter}`;
}

function blockReference(pointer, block) {
  return block.dataset.verse
    ? `${chapterReference(pointer)}:${block.dataset.verse}`
    : block.dataset.reference || chapterReference(pointer);
}

function blockVerse(block) {
  return block.dataset.verse ? Number(block.dataset.verse) : null;
}

export class ScriptureScrollerV3 {
  constructor(options) {
    this.scroller = options.scroller;
    this.content = options.content;
    this.measureHost = options.measureHost || this.createMeasureHost();
    this.ownsMeasureHost = !options.measureHost;
    this.topSpacer = options.topSpacer || this.createSpacer("top");
    this.bottomSpacer = options.bottomSpacer || this.createSpacer("bottom");
    this.ownsTopSpacer = !options.topSpacer;
    this.ownsBottomSpacer = !options.bottomSpacer;
    this.index = options.index;
    this.config = { ...DEFAULTS, ...options };
    this.cache = options.bookCache || new BookCache(5);
    this.emit = createEmitter(options.onTelemetry);
    this.sequence = [];
    this.loaded = new Map();
    this.measuredHeights = new Map();
    this.positions = new Map();
    this.pendingLoads = new Map();
    this.layoutHeightPx = Math.min(this.config.virtualSpacerPx, this.config.browserCanvasPx);
    this.originTopPx = Math.round(this.layoutHeightPx / 2);
    this.virtualHeightPx = this.config.virtualSpacerPx;
    this.scrollRaf = 0;
    this.isEvaluating = false;
    this.needsEvaluation = false;
    this.lastScrollTop = 0;
    this.lastScrollSampleAt = performance.now();
    this.scrollVelocityPxPerSec = 0;
    this.lastAnchor = null;
    this.resizeTimer = 0;
    this.edgeSpringRaf = 0;
    this.edgeSpringActive = false;
    this.edgeSpringTarget = null;
    this.edgeSpringEdge = null;

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  async init(location = {}) {
    this.prepareContent();
    this.work = this.index.works.find((work) => work.id === this.config.workId) || this.index.works[0];
    this.sequence = this.buildSequence(this.work);
    this.scroller.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize);
    await this.jumpTo({
      bookId: location.bookId || this.config.initialBookId,
      chapter: parsePositiveInt(location.chapter, this.config.initialChapter),
      verse: parsePositiveInt(location.verse, this.config.initialVerse),
    });
    this.emit("scroller_v3_ready", {
      level: "info",
      summary: "V3 scroller initialized",
      metrics: { chaptersInWork: this.sequence.length },
    });
    return this.getSnapshot("boot");
  }

  destroy() {
    this.scroller.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("resize", this.handleResize);
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
    if (this.edgeSpringRaf) cancelAnimationFrame(this.edgeSpringRaf);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.ownsMeasureHost) this.measureHost.remove();
    if (this.ownsTopSpacer) this.topSpacer.remove();
    if (this.ownsBottomSpacer) this.bottomSpacer.remove();
  }

  createMeasureHost() {
    const host = document.createElement("div");
    host.className = "v3-measure-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    return host;
  }

  createSpacer(edge) {
    const spacer = document.createElement("div");
    spacer.className = `v3-spacer v3-${edge}-spacer`;
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  }

  prepareContent() {
    this.scroller.classList.add("scripture-scroller-v3");
    this.content.classList.add("v3-scripture-content");
    if (!this.topSpacer.parentNode) this.content.prepend(this.topSpacer);
    if (!this.bottomSpacer.parentNode) this.content.appendChild(this.bottomSpacer);
  }

  buildSequence(work) {
    return work.books.flatMap((bookMeta) =>
      Array.from({ length: bookMeta.chapterCount }, (_, index) => ({
        seq: 0,
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

  setTopSpacer(px) {
    const height = Math.max(0, Math.round(px));
    this.topSpacer.style.height = "0px";
    this.topSpacer.dataset.virtualHeight = String(height);
  }

  setBottomSpacer(px) {
    const height = Math.max(0, Math.round(px));
    this.bottomSpacer.style.height = "0px";
    this.bottomSpacer.dataset.virtualHeight = String(height);
  }

  get topSpacerPx() {
    return Number(this.topSpacer.dataset.virtualHeight || 0);
  }

  get bottomSpacerPx() {
    return Number(this.bottomSpacer.dataset.virtualHeight || 0);
  }

  preloadDistancePx(viewportHeight = this.scroller.clientHeight) {
    return viewportHeight * this.config.preloadViewportPages;
  }

  unloadDistancePx(viewportHeight = this.scroller.clientHeight) {
    return viewportHeight * this.config.unloadViewportPages;
  }

  async jumpTo(location) {
    const normalized = this.normalizeLocation(location);
    const targetSeq = this.locationToSeq(normalized);
    this.emit("jump_requested", {
      level: "info",
      summary: `Jump requested: ${this.pointerLabel(this.sequence[targetSeq])}:${normalized.verse}`,
      refs: { ...normalized, seq: targetSeq },
    });

    this.content.querySelectorAll(".lab-chapter").forEach((node) => node.remove());
    this.cancelEdgeSpring("jump");
    this.loaded.clear();
    this.measuredHeights.clear();
    this.positions.clear();
    this.pendingLoads.clear();
    this.virtualHeightPx = this.config.virtualSpacerPx;
    this.layoutHeightPx = Math.min(this.config.virtualSpacerPx, this.config.browserCanvasPx);
    this.originTopPx = targetSeq === 0
      ? 0
      : Math.round(this.layoutHeightPx / 2);
    this.setTopSpacer(this.originTopPx);
    this.setBottomSpacer(this.layoutHeightPx - this.originTopPx);
    this.content.style.height = `${this.layoutHeightPx}px`;
    this.scroller.scrollTop = 0;

    const didLoadTarget = await this.ensureLoaded(targetSeq, "append");
    await nextFrame();
    const applied = await this.alignToVerse(targetSeq, normalized.verse);
    await nextFrame();
    this.lastScrollTop = this.scroller.scrollTop;
    const snapshot = this.getSnapshot("jump");
    this.emit("jump_applied", {
      level: "info",
      summary: "Target aligned; later window changes avoid scrollTop writes",
      refs: { ...normalized, seq: targetSeq },
      metrics: applied,
    });
    this.queueMeasure("jump");
    if (didLoadTarget && this.config.seedRunwayAfterJump) {
      void this.seedRunwayAfterJump(targetSeq);
    }
    return snapshot;
  }

  async seedRunwayAfterJump(targetSeq) {
    await nextFrame();
    await this.preseedAroundSeq(targetSeq);
    await this.ensureViewportBuffer("initial-runway");
    this.queueMeasure("initial-runway");
  }

  async preseedAroundSeq(targetSeq) {
    const desired = this.preloadDistancePx(this.scroller.clientHeight || window.innerHeight || 1);
    let loadedSeqs = this.loadedSeqs();
    let firstSeq = loadedSeqs[0];
    let lastSeq = loadedSeqs.at(-1);
    let abovePx = 0;
    let belowPx = 0;

    let aboveCount = 0;
    while (abovePx < desired && firstSeq > 0 && aboveCount < this.config.maxInitialChaptersEachSide) {
      aboveCount += 1;
      await this.ensureLoaded(firstSeq - 1, "prepend");
      loadedSeqs = this.loadedSeqs();
      firstSeq = loadedSeqs[0];
      abovePx = this.distanceFromChapterTop(firstSeq, targetSeq);
    }

    let belowCount = 0;
    while (belowPx < desired && lastSeq < this.sequence.length - 1 && belowCount < this.config.maxInitialChaptersEachSide) {
      belowCount += 1;
      await this.ensureLoaded(lastSeq + 1, "append");
      loadedSeqs = this.loadedSeqs();
      lastSeq = loadedSeqs.at(-1);
      belowPx = this.distanceFromChapterBottom(targetSeq, lastSeq);
    }

    this.emit("initial_runway_seeded", {
      level: "info",
      summary: "Initial runway seeded before alignment",
      refs: { targetSeq, firstSeq, lastSeq },
      metrics: {
        desiredPx: Math.round(desired),
        abovePx: Math.round(abovePx),
        belowPx: Math.round(belowPx),
        aboveCount,
        belowCount,
        loadedCount: this.loaded.size,
      },
    });
  }

  distanceFromChapterTop(firstSeq, targetSeq) {
    const firstTop = this.positions.get(firstSeq);
    const targetTop = this.positions.get(targetSeq);
    if (!Number.isFinite(firstTop) || !Number.isFinite(targetTop)) return 0;
    return Math.max(0, targetTop - firstTop);
  }

  distanceFromChapterBottom(targetSeq, lastSeq) {
    const targetTop = this.positions.get(targetSeq);
    const lastTop = this.positions.get(lastSeq);
    const targetHeight = this.measuredHeights.get(targetSeq);
    const lastHeight = this.measuredHeights.get(lastSeq);
    if (!Number.isFinite(targetTop) || !Number.isFinite(lastTop) || !targetHeight || !lastHeight) return 0;
    return Math.max(0, lastTop + lastHeight - (targetTop + targetHeight));
  }

  async alignToVerse(seq, requestedVerse) {
    const chapterNode = this.loaded.get(seq);
    const verseCount = chapterNode?.querySelectorAll(".lab-verse").length || 1;
    const verse = clamp(parsePositiveInt(requestedVerse, 1), 1, verseCount);
    const target =
      verse === 1
        ? chapterNode?.querySelector(".chapter-heading")
        : chapterNode?.querySelector(`.lab-verse[data-verse="${verse}"]`) ||
          chapterNode?.querySelector(".scripture-block") ||
          chapterNode?.querySelector(".chapter-heading");
    if (!target) return { aligned: false };

    const desiredTop = this.scroller.clientHeight * this.config.alignRatio;
    const before = this.scroller.scrollTop;
    const targetTop = this.topWithinScroller(target);
    const requestedScrollTop = Math.max(0, targetTop - desiredTop);
    this.scroller.scrollTop = requestedScrollTop;
    await nextFrame();
    this.lastAlignment = {
      desiredTop: Math.round(desiredTop),
      targetY: Math.round(targetTop),
      requestedScrollTop: Math.round(requestedScrollTop),
      actualScrollTop: Math.round(this.scroller.scrollTop),
      scrollHeight: Math.round(this.content.scrollHeight),
      clientHeight: Math.round(this.scroller.clientHeight),
    };
    this.emit("jump_alignment_debug", {
      level: "debug",
      summary: `Aligned to ${this.pointerLabel(this.sequence[seq])}`,
      metrics: this.lastAlignment,
    });
    return {
      aligned: true,
      requestedVerse,
      appliedVerse: verse,
      before: Math.round(before),
      after: Math.round(this.scroller.scrollTop),
      delta: Math.round(this.scroller.scrollTop - before),
      targetY: Math.round(targetTop),
      note: "Initial jump alignment is the only intended scrollTop write.",
    };
  }

  topWithinScroller(element) {
    const chapter = element.closest(".lab-chapter");
    const seq = Number(chapter?.dataset.seq);
    const chapterTop = this.positions.get(seq);
    if (Number.isFinite(chapterTop)) {
      return chapterTop + (element.getBoundingClientRect().top - chapter.getBoundingClientRect().top);
    }
    return element.getBoundingClientRect().top -
      this.scroller.getBoundingClientRect().top +
      this.scroller.scrollTop;
  }

  async ensureViewportBuffer(reason) {
    const viewportHeight = this.scroller.clientHeight || window.innerHeight || 1;
    const desired = this.preloadDistancePx(viewportHeight);
    let guard = 0;
    while (guard < this.config.maxLoadsPerEvaluation) {
      guard += 1;
      const loadedSeqs = this.loadedSeqs();
      if (!loadedSeqs.length) return;
      const firstSeq = loadedSeqs[0];
      const lastSeq = loadedSeqs.at(-1);
      const firstTop = this.positions.get(firstSeq) ?? this.topSpacerPx;
      const lastNode = this.loaded.get(lastSeq);
      const lastTop = this.positions.get(lastSeq) ?? firstTop;
      const lastBottom = lastNode ? lastTop + (this.measuredHeights.get(lastSeq) || lastNode.offsetHeight) : firstTop;
      const viewportTop = this.scroller.scrollTop;
      const viewportBottom = viewportTop + viewportHeight;
      const needsUp = viewportTop - firstTop < desired && firstSeq > 0 && this.topSpacerPx > 0;
      const needsDown = lastBottom - viewportBottom < desired && lastSeq < this.sequence.length - 1 && this.bottomSpacerPx > 0;
      if (!needsUp && !needsDown) break;
      if (needsUp) {
        const firstTop = this.positions.get(firstSeq) ?? this.loaded.get(firstSeq).offsetTop;
        if (firstTop <= 0) break;
        await this.ensureLoaded(firstSeq - 1, "prepend");
        continue;
      }
      if (needsDown) {
        await this.ensureLoaded(lastSeq + 1, "append");
      }
    }
    if (guard >= this.config.maxLoadsPerEvaluation) {
      this.emit("evaluation_load_budget_hit", {
        level: "debug",
        summary: `Paused sequential buffer fill during ${reason}`,
        metrics: { guard },
      });
    }
  }

  loadedSeqs() {
    return Array.from(this.loaded.keys()).sort(compareSeq);
  }

  async ensureLoaded(seq, mode) {
    if (seq < 0 || seq >= this.sequence.length || this.loaded.has(seq)) return false;
    if (this.pendingLoads.has(seq)) return this.pendingLoads.get(seq);

    const promise = this.loadMeasureAndInsert(seq, mode).finally(() => this.pendingLoads.delete(seq));
    this.pendingLoads.set(seq, promise);
    return promise;
  }

  async loadMeasureAndInsert(seq, mode) {
    const pointer = this.sequence[seq];
    const startedAt = performance.now();
    this.emit("chapter_load_start", {
      level: "debug",
      summary: `${mode} ${this.pointerLabel(pointer)}`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
    });

    const chapter = await this.loadChapter(pointer);
    this.emit("chapter_payload_ready", {
      level: "debug",
      summary: `${this.pointerLabel(pointer)} payload ready`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
    });
    const node = this.renderChapter(chapter, pointer);
    const measuredHeight = await this.measureChapter(node);
    this.emit("chapter_measure_ready", {
      level: "debug",
      summary: `${this.pointerLabel(pointer)} measured`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
      metrics: { measuredHeight: Math.round(measuredHeight) },
    });

    const top = this.placeChapter(seq, node, measuredHeight, mode);

    this.loaded.set(seq, node);
    this.measuredHeights.set(seq, measuredHeight);
    this.setVirtualSpacerMetrics();
    this.emit("chapter_load_done", {
      level: "info",
      summary: `${this.pointerLabel(pointer)} loaded without scrollTop compensation`,
      refs: { seq, bookId: pointer.bookMeta.id, chapter: pointer.chapter },
      metrics: {
        elapsedMs: Math.round(performance.now() - startedAt),
        measuredHeight: Math.round(measuredHeight),
        top: Math.round(top),
        topSpacer: this.topSpacerPx,
        bottomSpacer: this.bottomSpacerPx,
        loadedCount: this.loaded.size,
        scrollAdjustedBy: 0,
      },
    });
    this.warnIfSpacerLow();
    return true;
  }

  placeChapter(seq, node, measuredHeight, mode) {
    const top = this.coordinateForSeq(seq, measuredHeight, mode);
    node.style.top = `${Math.round(top)}px`;
    node.style.height = "auto";
    node.style.position = "absolute";
    node.style.left = "";
    node.style.right = "";
    const nextNode = this.findNextChapterNode(seq);
    this.content.insertBefore(node, nextNode || this.bottomSpacer);
    this.positions.set(seq, top);
    requestAnimationFrame(() => this.reconcileMeasuredHeight(seq));
    return top;
  }

  reconcileMeasuredHeight(seq) {
    const node = this.loaded.get(seq);
    if (!node) return;
    const actualHeight = Math.ceil(node.getBoundingClientRect().height);
    const measuredHeight = this.measuredHeights.get(seq) || 0;
    if (actualHeight <= measuredHeight + 1) return;
    this.measuredHeights.set(seq, actualHeight);
    this.reflowLoadedCoordinatesFrom(seq);
    this.setVirtualSpacerMetrics();
    this.emit("chapter_measure_reconciled", {
      level: "debug",
      summary: `${this.pointerLabel(this.sequence[seq])} height reconciled after render`,
      refs: { seq },
      metrics: {
        measuredHeight: Math.round(measuredHeight),
        actualHeight: Math.round(actualHeight),
      },
    });
    this.queueMeasure("height-reconcile");
  }

  reflowLoadedCoordinatesFrom(seq) {
    const loadedSeqs = this.loadedSeqs();
    let previousSeq = null;
    for (const loadedSeq of loadedSeqs) {
      if (loadedSeq < seq) {
        previousSeq = loadedSeq;
        continue;
      }
      if (previousSeq !== null) {
        const previousTop = this.positions.get(previousSeq);
        const previousHeight = this.measuredHeights.get(previousSeq);
        const node = this.loaded.get(loadedSeq);
        if (Number.isFinite(previousTop) && Number.isFinite(previousHeight) && node) {
          const nextTop = Math.min(
            this.layoutHeightPx - (this.measuredHeights.get(loadedSeq) || node.offsetHeight),
            previousTop + previousHeight + this.config.chapterGapPx,
          );
          this.positions.set(loadedSeq, nextTop);
          node.style.top = `${Math.round(nextTop)}px`;
        }
      }
      previousSeq = loadedSeq;
    }
  }

  coordinateForSeq(seq, measuredHeight, mode) {
    if (this.positions.size === 0) {
      const top = seq === 0 ? 0 : this.originTopPx;
      return clamp(top, 0, Math.max(0, this.layoutHeightPx - measuredHeight));
    }

    if (mode === "prepend") {
      const nextTop = this.positions.get(seq + 1);
      if (Number.isFinite(nextTop)) {
        return Math.max(0, nextTop - measuredHeight - this.config.chapterGapPx);
      }
    }

    if (mode === "append") {
      const previousTop = this.positions.get(seq - 1);
      const previousHeight = this.measuredHeights.get(seq - 1);
      if (Number.isFinite(previousTop) && Number.isFinite(previousHeight)) {
        return Math.min(
          this.virtualHeightPx - measuredHeight,
          this.layoutHeightPx - measuredHeight,
          previousTop + previousHeight + this.config.chapterGapPx,
        );
      }
    }

    const loadedSeqs = this.loadedSeqs();
    const nearestSeq = loadedSeqs.reduce((best, loadedSeq) => {
      if (best === null) return loadedSeq;
      return Math.abs(loadedSeq - seq) < Math.abs(best - seq) ? loadedSeq : best;
    }, null);
    if (nearestSeq === null) return this.originTopPx;
    const nearestTop = this.positions.get(nearestSeq) ?? this.originTopPx;
    const average = this.estimatedChapterHeightPx;
    return clamp(
      nearestTop + (seq - nearestSeq) * (average + this.config.chapterGapPx),
      0,
      Math.max(0, this.layoutHeightPx - measuredHeight),
    );
  }

  get estimatedChapterHeightPx() {
    const heights = Array.from(this.measuredHeights.values()).filter((value) => value > 0);
    if (!heights.length) return 3200;
    return heights.reduce((sum, value) => sum + value, 0) / heights.length;
  }

  findNextChapterNode(seq) {
    for (const loadedSeq of this.loadedSeqs()) {
      if (loadedSeq > seq) return this.loaded.get(loadedSeq);
    }
    return null;
  }

  async loadChapter(pointer) {
    const bookPayload = await this.cache.getBook(pointer.bookMeta);
    const chapter = bookPayload.chapters.find((item) => item.chapter === pointer.chapter);
    if (!chapter) throw new Error(`Missing ${this.pointerLabel(pointer)}`);
    return chapter;
  }

  async measureChapter(node) {
    const clone = node.cloneNode(true);
    clone.style.position = "static";
    clone.style.width = `${this.chapterRenderWidthPx()}px`;
    clone.style.left = "auto";
    clone.style.top = "auto";
    this.measureHost.appendChild(clone);
    const styles = getComputedStyle(clone);
    const marginTop = Number.parseFloat(styles.marginTop) || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
    const height = clone.getBoundingClientRect().height + marginTop + marginBottom;
    clone.remove();
    return Math.ceil(height);
  }

  chapterRenderWidthPx() {
    const scrollerWidth = this.scroller.clientWidth || window.innerWidth || 760;
    return Math.max(1, Math.min(760, scrollerWidth - 40));
  }

  firstChapterNode() {
    return this.content.querySelector(".lab-chapter");
  }

  setVirtualSpacerMetrics() {
    const loadedSeqs = this.loadedSeqs();
    if (!loadedSeqs.length) {
      this.setTopSpacer(this.originTopPx);
      this.setBottomSpacer(Math.max(0, this.layoutHeightPx - this.originTopPx));
      return;
    }
    const firstSeq = loadedSeqs[0];
    const lastSeq = loadedSeqs.at(-1);
    const firstTop = this.positions.get(firstSeq) ?? 0;
    const lastTop = this.positions.get(lastSeq) ?? 0;
    const lastHeight = this.measuredHeights.get(lastSeq) ?? 0;
    this.setTopSpacer(firstTop);
    this.setBottomSpacer(Math.max(0, this.layoutHeightPx - (lastTop + lastHeight)));
  }

  renderChapter(chapter, pointer) {
    const section = document.createElement("section");
    section.className = "lab-chapter v3-chapter";
    section.dataset.seq = String(pointer.seq);
    section.dataset.bookId = pointer.bookMeta.id;
    section.dataset.chapter = String(pointer.chapter);

    const blocks = chapter.blocks?.length
      ? chapter.blocks
      : chapter.verses.map((verse) => ({
          type: "verse",
          key: `verse-${verse.verse}`,
          verse: verse.verse,
          reference: verse.reference,
          text: verse.text,
        }));

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
      ${blocks.map((block) => this.renderBlock(block, pointer)).join("")}
    `;
    return section;
  }

  renderBlock(block, pointer) {
    if (block.type === "verse") {
      return `
        <p
          class="scripture-block lab-verse"
          data-block-type="verse"
          data-block-key="${escapeHtml(block.key || `verse-${block.verse}`)}"
          data-reference="${escapeHtml(block.reference || `${chapterReference(pointer)}:${block.verse}`)}"
          data-verse="${block.verse}"
        >
          <span class="verse-ref">${block.verse}</span>
          ${escapeHtml(block.text)}
        </p>
      `;
    }

    const className = [
      "scripture-block",
      "scripture-heading-block",
      block.type ? `scripture-block-${block.type}` : "",
      block.role ? `scripture-block-${block.role}` : "",
    ].filter(Boolean).join(" ");
    return `
      <p
        class="${escapeHtml(className)}"
        data-block-type="${escapeHtml(block.type || "heading")}"
        data-block-role="${escapeHtml(block.role || "")}"
        data-block-key="${escapeHtml(block.key || block.role || "heading")}"
        data-reference="${escapeHtml(block.reference || chapterReference(pointer))}"
      >
        ${escapeHtml(block.text)}
      </p>
    `;
  }

  handleScroll() {
    this.trackScrollVelocity();
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(async () => {
      this.scrollRaf = 0;
      await this.evaluateWindow("scroll");
      this.applyEdgeSpringIfNeeded("scroll");
      this.queueMeasure("scroll");
    });
  }

  trackScrollVelocity() {
    const now = performance.now();
    const elapsed = Math.max(1, now - this.lastScrollSampleAt);
    const delta = this.scroller.scrollTop - this.lastScrollTop;
    this.scrollVelocityPxPerSec = (delta / elapsed) * 1000;
    this.lastScrollSampleAt = now;
    this.lastScrollTop = this.scroller.scrollTop;
  }

  handleResize() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const anchor = this.findAnchor();
      this.emit("resize_reseed_recommended", {
        level: "info",
        summary: "Resize detected; V3 can reseed from current anchor if dimensions drift",
        refs: anchor,
      });
      this.queueMeasure("resize");
    }, 180);
  }

  async evaluateWindow(reason) {
    if (this.isEvaluating) {
      this.needsEvaluation = true;
      return;
    }
    this.isEvaluating = true;
    try {
      do {
        this.needsEvaluation = false;
        await this.ensureViewportBuffer(reason);
        this.unloadFarChapters();
      } while (this.needsEvaluation);
    } finally {
      this.isEvaluating = false;
      this.lastScrollTop = this.scroller.scrollTop;
    }
    if (this.pendingLoads.size === 0) {
      this.queueMeasure(reason);
    }
  }

  getWorkBounds() {
    const firstNode = this.loaded.get(0);
    const firstTop = this.positions.get(0);
    const lastSeq = this.sequence.length - 1;
    const lastNode = this.loaded.get(lastSeq);
    const lastTop = this.positions.get(lastSeq);
    const lastHeight = this.measuredHeights.get(lastSeq) || lastNode?.offsetHeight || 0;
    return {
      top: firstNode && Number.isFinite(firstTop) ? firstTop : null,
      bottom: lastNode && Number.isFinite(lastTop) ? lastTop + lastHeight : null,
    };
  }

  applyEdgeSpringIfNeeded(reason) {
    const bounds = this.getWorkBounds();
    const viewportTop = this.scroller.scrollTop;
    const viewportBottom = viewportTop + this.scroller.clientHeight;
    let target = null;
    let edge = null;

    if (bounds.top !== null && viewportTop < bounds.top && this.scrollVelocityPxPerSec <= 0) {
      target = bounds.top;
      edge = "start";
    } else if (bounds.bottom !== null && viewportBottom > bounds.bottom && this.scrollVelocityPxPerSec >= 0) {
      target = Math.max(0, bounds.bottom - this.scroller.clientHeight);
      edge = "end";
    }

    if (target === null) return false;
    if (this.edgeSpringActive && Math.abs((this.edgeSpringTarget ?? target) - target) < 1) return true;

    this.emit("edge_spring_started", {
      level: "info",
      summary: `Elastic rebound at ${edge} of work`,
      metrics: {
        reason,
        edge,
        target: Math.round(target),
        scrollTop: Math.round(this.scroller.scrollTop),
        velocityPxPerSec: Math.round(this.scrollVelocityPxPerSec),
      },
    });
    this.startEdgeSpring(target, edge);
    return true;
  }

  startEdgeSpring(target, edge) {
    if (this.edgeSpringRaf) cancelAnimationFrame(this.edgeSpringRaf);
    this.edgeSpringActive = true;
    this.edgeSpringTarget = target;
    this.edgeSpringEdge = edge;
    const tick = () => {
      if (!this.shouldContinueEdgeSpring(edge)) {
        this.cancelEdgeSpring("back-inside-work");
        return;
      }
      const current = this.scroller.scrollTop;
      const delta = target - current;
      if (Math.abs(delta) < 1) {
        this.scroller.scrollTop = target;
        this.edgeSpringActive = false;
        this.edgeSpringTarget = null;
        this.edgeSpringEdge = null;
        this.edgeSpringRaf = 0;
        this.emit("edge_spring_settled", {
          level: "debug",
          summary: `Elastic rebound settled at ${edge}`,
          metrics: { target: Math.round(target) },
        });
        this.queueMeasure("edge-spring");
        return;
      }
      this.scroller.scrollTop = current + delta * 0.22;
      this.edgeSpringRaf = requestAnimationFrame(tick);
    };
    this.edgeSpringRaf = requestAnimationFrame(tick);
  }

  shouldContinueEdgeSpring(edge) {
    const bounds = this.getWorkBounds();
    const viewportTop = this.scroller.scrollTop;
    const viewportBottom = viewportTop + this.scroller.clientHeight;
    if (edge === "start") {
      return bounds.top !== null && viewportTop < bounds.top && this.scrollVelocityPxPerSec <= 0;
    }
    if (edge === "end") {
      return bounds.bottom !== null && viewportBottom > bounds.bottom && this.scrollVelocityPxPerSec >= 0;
    }
    return false;
  }

  cancelEdgeSpring(reason) {
    if (this.edgeSpringRaf) cancelAnimationFrame(this.edgeSpringRaf);
    if (this.edgeSpringActive) {
      this.emit("edge_spring_cancelled", {
        level: "debug",
        summary: `Elastic rebound cancelled: ${reason}`,
        metrics: {
          reason,
          edge: this.edgeSpringEdge,
          target: this.edgeSpringTarget === null ? null : Math.round(this.edgeSpringTarget),
          scrollTop: Math.round(this.scroller.scrollTop),
        },
      });
    }
    this.edgeSpringRaf = 0;
    this.edgeSpringActive = false;
    this.edgeSpringTarget = null;
    this.edgeSpringEdge = null;
  }

  unloadFarChapters() {
    const viewportTop = this.scroller.scrollTop;
    const viewportBottom = viewportTop + this.scroller.clientHeight;
    const unloadDistance = this.unloadDistancePx();
    let removed = false;

    for (let guard = 0; guard < 30; guard += 1) {
      const entries = this.loadedSeqs();
      if (entries.length <= 1) break;
      const firstSeq = entries[0];
      const firstNode = this.loaded.get(firstSeq);
      const firstTop = this.positions.get(firstSeq) ?? firstNode.offsetTop;
      const firstBottom = firstTop + (this.measuredHeights.get(firstSeq) || firstNode.offsetHeight);
      if (firstBottom < viewportTop - unloadDistance) {
        this.removeChapter(firstSeq, "top");
        removed = true;
        continue;
      }

      const lastSeq = entries.at(-1);
      const lastNode = this.loaded.get(lastSeq);
      const lastTop = this.positions.get(lastSeq) ?? lastNode.offsetTop;
      if (lastTop > viewportBottom + unloadDistance) {
        this.removeChapter(lastSeq, "bottom");
        removed = true;
        continue;
      }
      break;
    }

    return removed;
  }

  removeChapter(seq, edge) {
    const node = this.loaded.get(seq);
    if (!node) return;
    const height = this.measuredHeights.get(seq) || node.offsetHeight;
    node.remove();
    this.loaded.delete(seq);
    this.measuredHeights.delete(seq);
    this.positions.delete(seq);
    this.setVirtualSpacerMetrics();
    this.emit("chapter_unloaded", {
      level: "info",
      summary: `${this.pointerLabel(this.sequence[seq])} unloaded from ${edge} edge`,
      refs: { seq, edge },
      metrics: {
        removedPx: Math.round(height),
        topSpacer: this.topSpacerPx,
        bottomSpacer: this.bottomSpacerPx,
        retainedCount: this.loaded.size,
        scrollAdjustedBy: 0,
      },
    });
  }

  warnIfSpacerLow() {
    if (this.topSpacerPx < this.config.lowSpacerWarningPx) {
      this.emit("top_spacer_low", {
        level: "debug",
        summary: "Top virtual runway is getting low",
        metrics: { topSpacer: this.topSpacerPx },
      });
    }
    if (this.bottomSpacerPx < this.config.lowSpacerWarningPx) {
      this.emit("bottom_spacer_low", {
        level: "debug",
        summary: "Bottom virtual runway is getting low",
        metrics: { bottomSpacer: this.bottomSpacerPx },
      });
    }
  }

  canScrollForward() {
    const loadedSeqs = this.loadedSeqs();
    const lastSeq = loadedSeqs.at(-1);
    if (!Number.isFinite(lastSeq)) return false;
    if (lastSeq < this.sequence.length - 1) return true;
    const lastTop = this.positions.get(lastSeq);
    const lastHeight = this.measuredHeights.get(lastSeq) || this.loaded.get(lastSeq)?.offsetHeight || 0;
    if (!Number.isFinite(lastTop)) return false;
    return this.scroller.scrollTop + this.scroller.clientHeight < lastTop + lastHeight - 1;
  }

  handleAutoScrollTick(details = {}) {
    this.emit("auto_scroll_tick", {
      level: "trace",
      summary: "V3 auto-scroll frame",
      metrics: {
        speed: details.speed,
        scrollTop: Math.round(this.scroller.scrollTop),
        canScrollForward: this.canScrollForward(),
      },
    });
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
        loadedCount: snapshot.loadedCount,
        pendingLoads: snapshot.pendingLoads,
        canScrollForward: this.canScrollForward(),
        speed: details.speed,
      },
    });
  }

  queueMeasure(reason) {
    requestAnimationFrame(() => {
      const snapshot = this.getSnapshot(reason);
      const anchor = snapshot.anchor;
      if (anchor?.reference !== this.lastAnchor?.reference) {
        this.lastAnchor = anchor;
        this.emit("anchor_changed", {
          level: "debug",
          summary: `Anchor: ${anchor.reference}`,
          refs: anchor,
        });
      }
      this.emit("metrics_updated", {
        level: "trace",
        summary: "V3 metrics updated",
        snapshot,
      });
    });
  }

  findAnchor() {
    const targetY = this.scroller.scrollTop + this.scroller.clientHeight * this.config.alignRatio;
    const blocks = Array.from(this.content.querySelectorAll(".scripture-block, .chapter-heading"));
    let bestBlock = null;
    let bestDistance = Infinity;
    for (const block of blocks) {
      const chapter = block.closest(".lab-chapter");
      const seq = Number(chapter?.dataset.seq);
      const chapterTop = this.positions.get(seq);
      if (!Number.isFinite(chapterTop)) continue;
      const blockTop = chapterTop + block.offsetTop;
      const blockBottom = blockTop + block.offsetHeight;
      const viewportTop = this.scroller.scrollTop;
      const viewportBottom = viewportTop + this.scroller.clientHeight;
      if (blockBottom < viewportTop || blockTop > viewportBottom) continue;
      const distance = targetY >= blockTop && targetY <= blockBottom
        ? 0
        : Math.min(Math.abs(blockTop - targetY), Math.abs(blockBottom - targetY));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestBlock = block;
      }
    }
    return bestBlock ? this.anchorFromBlock(bestBlock) : null;
  }

  anchorFromBlock(block) {
    const chapter = block.closest(".lab-chapter");
    const pointer = this.sequence[Number(chapter.dataset.seq)];
    return {
      workId: pointer.workId,
      workTitle: pointer.workTitle,
      seq: pointer.seq,
      bookId: pointer.bookMeta.id,
      bookTitle: pointer.bookMeta.title,
      chapter: pointer.chapter,
      verse: blockVerse(block),
      blockType: block.dataset.blockType || "heading",
      blockRole: block.dataset.blockRole || null,
      blockKey: block.dataset.blockKey || null,
      reference: blockReference(pointer, block),
      scrollTop: Math.round(this.scroller.scrollTop),
    };
  }

  getThresholdDiagnostics(loadedChapters, scrollTop, viewportHeight) {
    const first = loadedChapters[0] || null;
    const last = loadedChapters.at(-1) || null;
    const firstSeq = first?.seq;
    const lastSeq = last?.seq;
    const viewportBottom = scrollTop + viewportHeight;
    const preloadDistancePx = this.preloadDistancePx(viewportHeight);
    const unloadDistancePx = this.unloadDistancePx(viewportHeight);
    const labelForSeq = (seq) => (this.sequence[seq] ? this.pointerLabel(this.sequence[seq]) : null);

    return {
      preloadDistancePx,
      preloadViewportPages: this.config.preloadViewportPages,
      unloadDistancePx,
      unloadViewportPages: this.config.unloadViewportPages,
      loadUp: first && firstSeq > 0
        ? {
            label: labelForSeq(firstSeq - 1),
            targetY: first.top + preloadDistancePx,
            px: Math.max(0, scrollTop - (first.top + preloadDistancePx)),
            active: scrollTop < first.top + preloadDistancePx,
          }
        : null,
      loadDown: last && lastSeq < this.sequence.length - 1
        ? {
            label: labelForSeq(lastSeq + 1),
            targetY: last.bottom - preloadDistancePx,
            px: Math.max(0, last.bottom - preloadDistancePx - viewportBottom),
            active: viewportBottom > last.bottom - preloadDistancePx,
          }
        : null,
      unloadAbove: first
        ? {
            label: first.label,
            targetY: first.bottom + unloadDistancePx,
            passed: first.bottom < scrollTop - unloadDistancePx,
          }
        : null,
      unloadBelow: last
        ? {
            label: last.label,
            targetY: last.top - unloadDistancePx,
            passed: last.top > viewportBottom + unloadDistancePx,
          }
        : null,
    };
  }

  getSnapshot(reason = "measure") {
    const loadedSeqs = this.loadedSeqs();
    const loadedChapters = loadedSeqs.map((seq) => {
      const node = this.loaded.get(seq);
      const pointer = this.sequence[seq];
      const top = Math.round(this.positions.get(seq) ?? node.offsetTop);
      const height = Math.round(this.measuredHeights.get(seq) || node.offsetHeight);
      return {
        seq,
        label: this.pointerLabel(pointer),
        bookId: pointer.bookMeta.id,
        chapter: pointer.chapter,
        top,
        height,
        bottom: top + height,
      };
    });
    const scrollTop = Math.round(this.scroller.scrollTop);
    const viewportHeight = Math.round(this.scroller.clientHeight);
    const contentHeight = Math.round(this.layoutHeightPx);
    return {
      version: 3,
      reason,
      scrollTop,
      lastScrollTop: Math.round(this.lastScrollTop),
      viewportHeight,
      contentHeight,
      virtualRunwayPx: Math.round(this.virtualHeightPx),
      browserCanvasPx: Math.round(this.layoutHeightPx),
      loadedCount: this.loaded.size,
      loadedChapters,
      topSpacerPx: this.topSpacerPx,
      bottomSpacerPx: this.bottomSpacerPx,
      preloadDistancePx: this.preloadDistancePx(viewportHeight),
      unloadDistancePx: this.unloadDistancePx(viewportHeight),
      pendingLoads: this.pendingLoads.size,
      isEvaluating: this.isEvaluating,
      edgeSpringActive: this.edgeSpringActive,
      scrollVelocityPxPerSec: Math.round(this.scrollVelocityPxPerSec),
      thresholds: this.getThresholdDiagnostics(loadedChapters, scrollTop, viewportHeight),
      cache: this.cache.snapshot?.() ?? null,
      anchor: this.findAnchor(),
      lastAlignment: this.lastAlignment ?? null,
    };
  }
}

export function parseScrollerV3Route(hash) {
  const clean = (hash || "").replace(/^#\/?/, "");
  const [bookId, chapter, verse] = clean.split("/");
  return {
    bookId: bookId || DEFAULTS.initialBookId,
    chapter: parsePositiveInt(chapter, DEFAULTS.initialChapter),
    verse: parsePositiveInt(verse, DEFAULTS.initialVerse),
  };
}
