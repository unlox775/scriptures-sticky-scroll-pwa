import { logDebug, isDevMode } from "./logger.js";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export class ReaderEngine {
  constructor({ scroller, content, workMeta, bookCache, onAnchorChange }) {
    this.scroller = scroller;
    this.content = content;
    this.workMeta = workMeta;
    this.bookCache = bookCache;
    this.onAnchorChange = onAnchorChange;

    this.sequence = [];
    for (const bookMeta of this.workMeta.books) {
      for (let chapter = 1; chapter <= bookMeta.chapterCount; chapter += 1) {
        this.sequence.push({ bookMeta, chapter });
      }
    }

    this.loaded = new Map();
    this.inFlightLoads = new Map();
    this.failedLoads = new Map();
    this.lastScroll = { top: 0, ts: performance.now() };
    this.frameId = null;
    this.autoScroll = { active: false, speed: 90, frameId: null, lastTs: 0, accumulatedPx: 0 };
    this.isBuffering = false;
    this.destroyed = false;

    this.boundOnScroll = this.onScroll.bind(this);
    this.boundOnResize = this.onResize.bind(this);
    this.scroller.addEventListener("scroll", this.boundOnScroll, { passive: true });
    window.addEventListener("resize", this.boundOnResize);
  }

  destroy() {
    this.destroyed = true;
    this.stopAutoScroll();
    this.scroller.removeEventListener("scroll", this.boundOnScroll);
    window.removeEventListener("resize", this.boundOnResize);
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }

  async open(location) {
    this.content.innerHTML = "";
    this.loaded.clear();
    this.inFlightLoads.clear();
    this.failedLoads.clear();

    const seq = this.locationToSeq(location);
    const didLoadTarget = await this.ensureLoaded(seq, "append", { reason: "open-target" });
    if (!didLoadTarget || !this.loaded.has(seq)) {
      throw new Error(`Unable to load target chapter for ${location?.reference || "requested location"}`);
    }
    if (seq > 0) {
      await this.ensureLoaded(seq - 1, "prepend", { reason: "open-adjacent-previous" });
    }
    if (seq < this.sequence.length - 1) {
      await this.ensureLoaded(seq + 1, "append", { reason: "open-adjacent-next" });
    }
    await this.jumpToLocation(location, 0.25);
    await this.ensureBuffer();
    this.publishAnchor(0);
  }

  setAutoScrollSpeed(speed) {
    this.autoScroll.speed = speed;
  }

  startAutoScroll() {
    if (this.autoScroll.active) {
      return;
    }
    this.autoScroll.active = true;
    this.autoScroll.lastTs = performance.now();
    this.autoScroll.accumulatedPx = 0;
    this.autoScroll._logCount = 0;
    const step = (ts) => {
      if (!this.autoScroll.active || this.destroyed) {
        return;
      }
      const dt = Math.max(0, (ts - this.autoScroll.lastTs) / 1000);
      this.autoScroll.lastTs = ts;
      this.autoScroll.accumulatedPx += this.autoScroll.speed * dt;
      const whole = Math.floor(this.autoScroll.accumulatedPx);
      if (whole >= 1) {
        const maxScroll = this.scroller.scrollHeight - this.scroller.clientHeight;
        const before = this.scroller.scrollTop;
        if (maxScroll > 0 && before < maxScroll) {
          const delta = Math.min(whole, Math.max(0, maxScroll - before));
          this.scroller.scrollBy({ top: delta, behavior: "auto" });
          this.autoScroll.accumulatedPx -= whole;
          if (isDevMode() && this.autoScroll._logCount < 3) {
            this.autoScroll._logCount += 1;
            logDebug("scroll:autoScroll", {
              before,
              delta,
              after: this.scroller.scrollTop,
              maxScroll,
              scrollHeight: this.scroller.scrollHeight,
              clientHeight: this.scroller.clientHeight,
            });
          }
        }
      }
      this.autoScroll.frameId = requestAnimationFrame(step);
    };
    this.autoScroll.frameId = requestAnimationFrame(step);
  }

  stopAutoScroll() {
    this.autoScroll.active = false;
    if (this.autoScroll.frameId) {
      cancelAnimationFrame(this.autoScroll.frameId);
      this.autoScroll.frameId = null;
    }
  }

  async onResize() {
    const anchor = this.captureAnchor();
    if (!anchor) {
      return;
    }
    // Keep the currently-read text locked at 25% viewport after reflow.
    await this.jumpToLocation(anchor, 0.25);
  }

  onScroll() {
    if (this.frameId) {
      return;
    }
    this.frameId = requestAnimationFrame(async () => {
      this.frameId = null;
      const now = performance.now();
      const top = this.scroller.scrollTop;
      const dt = Math.max(1, now - this.lastScroll.ts);
      const velocity = ((top - this.lastScroll.top) / dt) * 1000;
      this.lastScroll = { top, ts: now };
      this.publishAnchor(velocity);
      await this.ensureBuffer();
    });
  }

  publishAnchor(velocity) {
    const anchor = this.captureAnchor();
    if (!anchor || !this.onAnchorChange) {
      return;
    }
    this.onAnchorChange(anchor, {
      velocity,
      autoScrolling: this.autoScroll.active,
      timestamp: Date.now(),
    });
  }

  captureAnchor() {
    const rect = this.scroller.getBoundingClientRect();
    const probeX = rect.left + Math.min(110, Math.max(20, rect.width * 0.2));
    const probeY = rect.top + rect.height * 0.25;
    const hit = document.elementFromPoint(probeX, probeY);
    const verseEl = hit?.closest(".verse");
    if (!verseEl) {
      if (isDevMode() && hit) {
        logDebug("scroll:captureAnchorMiss", {
          probeY: Math.round(probeY),
          scrollerTop: Math.round(rect.top),
          scrollerHeight: rect.height,
          hitTag: hit.tagName,
          hitClass: hit.className || "(none)",
          hitId: hit.id || "(none)",
        });
      }
      return null;
    }
    const seq = Number(verseEl.dataset.seq);
    const verse = Number(verseEl.dataset.verse);
    const chapter = Number(verseEl.dataset.chapter);
    const bookId = verseEl.dataset.bookId;
    const bookTitle = verseEl.dataset.bookTitle;
    return {
      workId: this.workMeta.id,
      workTitle: this.workMeta.title,
      seq,
      bookId,
      bookTitle,
      chapter,
      verse,
      reference: `${bookTitle} ${chapter}:${verse}`,
    };
  }

  locationToSeq(location) {
    if (!location) {
      return 0;
    }
    const found = this.sequence.findIndex(
      (item) => item.bookMeta.id === location.bookId && item.chapter === location.chapter,
    );
    return found >= 0 ? found : 0;
  }

  minLoadedSeq() {
    if (this.loaded.size === 0) {
      return null;
    }
    return Math.min(...this.loaded.keys());
  }

  maxLoadedSeq() {
    if (this.loaded.size === 0) {
      return null;
    }
    return Math.max(...this.loaded.keys());
  }

  firstEl() {
    const min = this.minLoadedSeq();
    return min == null ? null : this.loaded.get(min);
  }

  lastEl() {
    const max = this.maxLoadedSeq();
    return max == null ? null : this.loaded.get(max);
  }

  pointerForSeq(seq) {
    if (seq == null || seq < 0 || seq >= this.sequence.length) {
      return null;
    }
    return this.sequence[seq];
  }

  snapshotScrollState() {
    const minSeq = this.minLoadedSeq();
    const maxSeq = this.maxLoadedSeq();
    const minPointer = this.pointerForSeq(minSeq);
    const maxPointer = this.pointerForSeq(maxSeq);
    return {
      scrollTop: this.scroller.scrollTop,
      viewportHeight: this.scroller.clientHeight,
      scrollHeight: this.scroller.scrollHeight,
      minLoadedSeq: minSeq,
      maxLoadedSeq: maxSeq,
      minLoadedRef: minPointer ? { bookId: minPointer.bookMeta.id, chapter: minPointer.chapter } : null,
      maxLoadedRef: maxPointer ? { bookId: maxPointer.bookMeta.id, chapter: maxPointer.chapter } : null,
    };
  }

  async ensureBuffer() {
    if (this.isBuffering || this.destroyed) {
      return;
    }
    this.isBuffering = true;
    const minScreens = 3;
    const maxScreens = 6;
    const vh = Math.max(1, this.scroller.clientHeight);
    const minBuffer = minScreens * vh;
    const maxBuffer = maxScreens * vh;

    try {
      let first = this.firstEl();
      let last = this.lastEl();
      if (!first || !last) {
        return;
      }

      let topBuffer = this.scroller.scrollTop - first.offsetTop;
      let bottomBuffer = last.offsetTop + last.offsetHeight - (this.scroller.scrollTop + vh);

      if (isDevMode()) {
        logDebug("scroll:ensureBuffer", {
          vh,
          minBuffer,
          maxBuffer,
          topBuffer,
          bottomBuffer,
          minSeq: this.minLoadedSeq(),
          maxSeq: this.maxLoadedSeq(),
          scrollTop: this.scroller.scrollTop,
          firstOffset: first?.offsetTop,
          lastEnd: last ? last.offsetTop + last.offsetHeight : null,
        });
      }

      const newlyPrepended = new Set();
      const newlyAppended = new Set();

      while (topBuffer < minBuffer && this.minLoadedSeq() > 0) {
        const beforeMin = this.minLoadedSeq();
        const targetSeq = beforeMin - 1;
        await this.ensureLoaded(targetSeq, "prepend", {
          reason: "buffer-extend-top",
          trigger: {
            topBuffer,
            minBuffer,
          },
        });
        if (this.loaded.has(targetSeq)) {
          newlyPrepended.add(targetSeq);
        }
        first = this.firstEl();
        topBuffer = this.scroller.scrollTop - first.offsetTop;
        if (this.minLoadedSeq() === beforeMin) {
          if (isDevMode()) {
            const target = this.pointerForSeq(targetSeq);
            logDebug("scroll:ensureBuffer:blocked", {
              direction: "prepend",
              targetSeq,
              targetBookId: target?.bookMeta?.id,
              targetChapter: target?.chapter,
              reason: "prepend made no progress",
              topBuffer,
              minBuffer,
              state: this.snapshotScrollState(),
            });
          }
          break;
        }
      }

      while (bottomBuffer < minBuffer && this.maxLoadedSeq() < this.sequence.length - 1) {
        const beforeMax = this.maxLoadedSeq();
        const targetSeq = beforeMax + 1;
        await this.ensureLoaded(targetSeq, "append", {
          reason: "buffer-extend-bottom",
          trigger: {
            bottomBuffer,
            minBuffer,
          },
        });
        if (this.loaded.has(targetSeq)) {
          newlyAppended.add(targetSeq);
        }
        last = this.lastEl();
        bottomBuffer = last.offsetTop + last.offsetHeight - (this.scroller.scrollTop + vh);
        if (this.maxLoadedSeq() === beforeMax) {
          if (isDevMode()) {
            const target = this.pointerForSeq(targetSeq);
            logDebug("scroll:ensureBuffer:blocked", {
              direction: "append",
              targetSeq,
              targetBookId: target?.bookMeta?.id,
              targetChapter: target?.chapter,
              reason: "append made no progress",
              bottomBuffer,
              minBuffer,
              state: this.snapshotScrollState(),
            });
          }
          break;
        }
      }

      while (this.loaded.size > 1) {
        first = this.firstEl();
        topBuffer = this.scroller.scrollTop - first.offsetTop;
        if (topBuffer <= maxBuffer) {
          break;
        }
        const seq = this.minLoadedSeq();
        if (newlyPrepended.has(seq)) {
          if (isDevMode()) {
            logDebug("scroll:ensureBuffer:trimSkipped", {
              direction: "prepend",
              seq,
              reason: "keep newly prepended chapter this pass",
              topBuffer,
              maxBuffer,
              state: this.snapshotScrollState(),
            });
          }
          break;
        }
        const removeEl = this.loaded.get(seq);
        const removedHeight = removeEl.offsetHeight;
        removeEl.remove();
        this.loaded.delete(seq);
        this.scroller.scrollTop -= removedHeight;
      }

      while (this.loaded.size > 1) {
        last = this.lastEl();
        bottomBuffer = last.offsetTop + last.offsetHeight - (this.scroller.scrollTop + vh);
        if (bottomBuffer <= maxBuffer) {
          break;
        }
        const seq = this.maxLoadedSeq();
        if (newlyAppended.has(seq)) {
          if (isDevMode()) {
            logDebug("scroll:ensureBuffer:trimSkipped", {
              direction: "append",
              seq,
              reason: "keep newly appended chapter this pass",
              bottomBuffer,
              maxBuffer,
              state: this.snapshotScrollState(),
            });
          }
          break;
        }
        const removeEl = this.loaded.get(seq);
        removeEl.remove();
        this.loaded.delete(seq);
      }

      if (isDevMode()) {
        const minSeq = this.minLoadedSeq();
        const maxSeq = this.maxLoadedSeq();
        if (topBuffer < minBuffer && minSeq === 0) {
          const pointer = this.pointerForSeq(0);
          logDebug("scroll:ensureBuffer:boundary", {
            boundary: "start-of-work",
            topBuffer,
            minBuffer,
            firstBookId: pointer?.bookMeta?.id,
            firstChapter: pointer?.chapter,
            state: this.snapshotScrollState(),
          });
        }
        if (bottomBuffer < minBuffer && maxSeq === this.sequence.length - 1) {
          const pointer = this.pointerForSeq(maxSeq);
          logDebug("scroll:ensureBuffer:boundary", {
            boundary: "end-of-work",
            bottomBuffer,
            minBuffer,
            lastBookId: pointer?.bookMeta?.id,
            lastChapter: pointer?.chapter,
            state: this.snapshotScrollState(),
          });
        }
      }
    } finally {
      this.isBuffering = false;
    }
  }

  async ensureLoaded(seq, mode, context = {}) {
    if (seq < 0 || seq >= this.sequence.length || this.loaded.has(seq)) {
      if (isDevMode()) {
        logDebug("scroll:ensureLoaded:skip", {
          seq,
          mode,
          reason: seq < 0 || seq >= this.sequence.length ? "out-of-range" : "already-loaded",
          context,
          state: this.snapshotScrollState(),
        });
      }
      return false;
    }
    if (this.inFlightLoads.has(seq)) {
      if (isDevMode()) {
        const pointer = this.sequence[seq];
        logDebug("scroll:ensureLoaded:skip", {
          seq,
          mode,
          reason: "already-in-flight",
          bookId: pointer?.bookMeta?.id,
          chapter: pointer?.chapter,
          context,
          state: this.snapshotScrollState(),
        });
      }
      await this.inFlightLoads.get(seq);
      return this.loaded.has(seq);
    }
    const priorFailure = this.failedLoads.get(seq);
    if (priorFailure) {
      const sinceMs = Date.now() - priorFailure.lastTs;
      const backoffMs = Math.min(2000, 250 * priorFailure.attempts);
      if (sinceMs < backoffMs) {
        if (isDevMode()) {
          const pointer = this.sequence[seq];
          logDebug("scroll:ensureLoaded:skip", {
            seq,
            mode,
            reason: "cooldown-after-failure",
            bookId: pointer?.bookMeta?.id,
            chapter: pointer?.chapter,
            attempts: priorFailure.attempts,
            retryInMs: backoffMs - sinceMs,
            lastError: priorFailure.message,
            context,
            state: this.snapshotScrollState(),
          });
        }
        return false;
      }
    }
    const pointer = this.sequence[seq];
    const startedAt = performance.now();
    logDebug("scroll:ensureLoaded:attempt", {
      seq,
      mode,
      bookId: pointer?.bookMeta?.id,
      chapter: pointer?.chapter,
      loadedCount: this.loaded.size,
      context,
      state: this.snapshotScrollState(),
    });
    const loadPromise = (async () => {
      try {
        const chapterData = await this.loadChapter(seq);
        const chapterNode = this.renderChapter(chapterData, seq);

        if (mode === "prepend" && this.content.firstChild) {
          const before = this.content.scrollHeight;
          this.content.insertBefore(chapterNode, this.content.firstChild);
          const after = this.content.scrollHeight;
          this.scroller.scrollTop += after - before;
        } else {
          this.content.appendChild(chapterNode);
        }
        this.loaded.set(seq, chapterNode);
        this.failedLoads.delete(seq);
        logDebug("scroll:ensureLoaded:success", {
          seq,
          mode,
          bookId: pointer?.bookMeta?.id,
          chapter: pointer?.chapter,
          elapsedMs: Math.round(performance.now() - startedAt),
          loadedCount: this.loaded.size,
          context,
          state: this.snapshotScrollState(),
        });
        return true;
      } catch (error) {
        const prior = this.failedLoads.get(seq);
        const attempts = (prior?.attempts || 0) + 1;
        this.failedLoads.set(seq, {
          attempts,
          lastTs: Date.now(),
          message: error?.message || String(error),
        });
        logDebug("scroll:ensureLoaded:failure", {
          seq,
          mode,
          bookId: pointer?.bookMeta?.id,
          chapter: pointer?.chapter,
          attempts,
          elapsedMs: Math.round(performance.now() - startedAt),
          errorMessage: error?.message || String(error),
          context,
          state: this.snapshotScrollState(),
        });
        return false;
      } finally {
        this.inFlightLoads.delete(seq);
      }
    })();
    this.inFlightLoads.set(seq, loadPromise);
    return loadPromise;
  }

  async loadChapter(seq) {
    const pointer = this.sequence[seq];
    const bookPayload = await this.bookCache.getBook(pointer.bookMeta);
    const chapter = bookPayload.chapters.find((item) => item.chapter === pointer.chapter);
    if (!chapter) {
      throw new Error(`Missing chapter ${pointer.chapter} in ${pointer.bookMeta.title}`);
    }
    return {
      chapter,
      pointer,
    };
  }

  renderChapter({ chapter, pointer }, seq) {
    const section = document.createElement("section");
    section.className = "chapter-block";
    section.dataset.seq = String(seq);

    const heading = document.createElement("div");
    heading.className = "chapter-header";
    const chapterTitle = document.createElement("h3");
    chapterTitle.textContent = `${pointer.bookMeta.title} ${chapter.chapter}`;
    const link = document.createElement("a");
    link.className = "chapter-link";
    link.href = chapter.externalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open in Gospel Library";
    heading.append(chapterTitle, link);
    section.appendChild(heading);

    for (const verse of chapter.verses) {
      const p = document.createElement("p");
      p.className = "verse";
      p.dataset.seq = String(seq);
      p.dataset.bookId = pointer.bookMeta.id;
      p.dataset.bookTitle = pointer.bookMeta.title;
      p.dataset.chapter = String(chapter.chapter);
      p.dataset.verse = String(verse.verse);
      p.innerHTML = `<span class="verse-num">${verse.verse}</span>${escapeHtml(verse.text)}`;
      section.appendChild(p);
    }
    return section;
  }

  async jumpToLocation(location, align = 0.25) {
    const seq = this.locationToSeq(location);
    if (!this.loaded.has(seq)) {
      this.content.innerHTML = "";
      this.loaded.clear();
      this.inFlightLoads.clear();
      this.failedLoads.clear();
      const didLoadTarget = await this.ensureLoaded(seq, "append", { reason: "jump-target" });
      if (!didLoadTarget || !this.loaded.has(seq)) {
        throw new Error(`Unable to load chapter for ${location?.reference || "requested location"}`);
      }
      if (seq > 0) {
        await this.ensureLoaded(seq - 1, "prepend", { reason: "jump-adjacent-previous" });
      }
      if (seq < this.sequence.length - 1) {
        await this.ensureLoaded(seq + 1, "append", { reason: "jump-adjacent-next" });
      }
    }

    const scrollToTarget = () => {
      const verseSelector = `.verse[data-seq="${seq}"][data-verse="${location.verse || 1}"]`;
      const verseEl = this.content.querySelector(verseSelector);
      const target = verseEl || this.content.querySelector(`.chapter-block[data-seq="${seq}"]`);
      const scrollBefore = this.scroller.scrollTop;
      const vh = this.scroller.clientHeight;
      const sh = this.scroller.scrollHeight;

      if (isDevMode()) {
        const noOverflow = sh <= vh;
        logDebug("scroll:jumpToLocation", {
          seq,
          align,
          verseSelector,
          target: target ? target.className : null,
          dimensions: { vh, sh, scrollBefore },
          noOverflow: noOverflow ? "scroller cannot scroll (fix layout)" : null,
        });
      }

      if (!target) return;
      const scrollerRect = this.scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const desiredTop = vh * align;
      const delta = targetRect.top - scrollerRect.top - desiredTop;
      const newTop = Math.max(0, scrollBefore + delta);
      this.scroller.scrollTop = newTop;

      if (isDevMode()) {
        logDebug("scroll:jumpToLocation:after", {
          scrollAfter: this.scroller.scrollTop,
          delta,
          targetRectTop: targetRect.top,
          scrollerRectTop: scrollerRect.top,
        });
      }
    };

    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    scrollToTarget();
  }
}
