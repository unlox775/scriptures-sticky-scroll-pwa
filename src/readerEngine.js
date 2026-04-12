import { createTelemetryEmitter } from "./telemetry.js";

const emitReader = createTelemetryEmitter("ui.readerEngine");

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
    this.lastScroll = { top: 0, ts: performance.now() };
    this.frameId = null;
    this.autoScroll = { active: false, speed: 90, frameId: null, lastTs: 0, accumulatedPx: 0 };
    this.isBuffering = false;
    this.destroyed = false;
    this.lastManualScrollAt = 0;
    this.lastResizeAt = 0;
    this.lastReanchorAt = 0;
    this.pendingResizeTimer = null;

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
    if (this.pendingResizeTimer) {
      window.clearTimeout(this.pendingResizeTimer);
      this.pendingResizeTimer = null;
    }
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
  }

  async open(location) {
    emitReader({
      level: "info",
      event: "reader_open_start",
      summary: "Reader engine open started",
      refs: {
        workId: location?.workId,
        bookId: location?.bookId,
        chapter: location?.chapter,
        verse: location?.verse,
      },
      minVerbosity: "minimal",
    });
    this.content.innerHTML = "";
    this.loaded.clear();

    try {
      const seq = this.locationToSeq(location);
      await this.ensureLoaded(seq, "append");
      if (seq > 0) {
        await this.ensureLoaded(seq - 1, "prepend");
      }
      if (seq < this.sequence.length - 1) {
        await this.ensureLoaded(seq + 1, "append");
      }
      await this.jumpToLocation(location, 0.25);
      await this.ensureBuffer();
      this.publishAnchor(0);
      emitReader({
        level: "info",
        event: "reader_open_ready",
        summary: "Reader engine open complete",
        refs: {
          workId: location?.workId,
          bookId: location?.bookId,
          chapter: location?.chapter,
          verse: location?.verse,
        },
        minVerbosity: "minimal",
      });
    } catch (error) {
      emitReader({
        level: "error",
        event: "reader_open_fail",
        summary: "Reader engine open failed",
        refs: {
          workId: location?.workId,
          bookId: location?.bookId,
          chapter: location?.chapter,
          verse: location?.verse,
        },
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
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
          this.autoScroll._logCount += 1;
          emitReader({
            level: "debug",
            event: "reader_autoscroll_tick",
            summary: "Auto-scroll advanced reader",
            metrics: {
              before,
              delta,
              after: this.scroller.scrollTop,
              maxScroll,
              scrollHeight: this.scroller.scrollHeight,
              clientHeight: this.scroller.clientHeight,
            },
            throttleMs: 1200,
            minVerbosity: "standard",
          });
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
    if (this.destroyed) return;
    if (this.autoScroll.active) {
      emitReader({
        level: "debug",
        event: "reader_resize_reanchor_skipped",
        summary: "Skipped resize re-anchor while auto-scroll active",
        details: { reason: "auto-scroll-active" },
        throttleMs: 1200,
        minVerbosity: "deep",
      });
      return;
    }
    const now = performance.now();
    this.lastResizeAt = now;
    if (now - this.lastManualScrollAt < 600) {
      emitReader({
        level: "debug",
        event: "reader_resize_reanchor_skipped",
        summary: "Skipped resize re-anchor during active manual scroll momentum",
        details: {
          reason: "recent-manual-scroll",
          msSinceManualScroll: Math.round(now - this.lastManualScrollAt),
        },
        throttleMs: 1200,
        minVerbosity: "deep",
      });
      return;
    }
    if (this.pendingResizeTimer) {
      clearTimeout(this.pendingResizeTimer);
      this.pendingResizeTimer = null;
    }
    this.pendingResizeTimer = setTimeout(async () => {
      this.pendingResizeTimer = null;
      if (this.destroyed || this.autoScroll.active) return;
      const elapsed = performance.now() - this.lastResizeAt;
      if (elapsed < 140) return;
      if (performance.now() - this.lastReanchorAt < 900) return;
      const anchor = this.captureAnchor();
      if (!anchor) {
        return;
      }
      this.lastReanchorAt = performance.now();
      // Keep currently-read text at 25% after true layout reflow, not momentum scroll.
      await this.jumpToLocation(anchor, 0.25);
      emitReader({
        level: "debug",
        event: "reader_resize_reanchor_applied",
        summary: "Applied resize re-anchor after layout settle",
        refs: {
          workId: anchor.workId,
          bookId: anchor.bookId,
          chapter: anchor.chapter,
          verse: anchor.verse,
        },
        minVerbosity: "deep",
      });
    }, 180);
    return;
  }

  onScroll() {
    this.lastManualScrollAt = performance.now();
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
    if (this.autoScroll.active && Math.abs(velocity) > this.autoScroll.speed * 2.5) {
      // Manual gesture likely occurred while auto-scroll was active; immediately cede control.
      this.stopAutoScroll();
      emitReader({
        level: "info",
        event: "reader_autoscroll_stop",
        summary: "Auto-scroll stopped due to manual scroll override",
        refs: { reason: "manual-scroll-override" },
      });
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
      if (hit) {
        emitReader({
          level: "debug",
          event: "reader_capture_anchor_miss",
          summary: "Anchor probe missed verse element",
          details: {
            probeY: Math.round(probeY),
            scrollerTop: Math.round(rect.top),
            scrollerHeight: rect.height,
            hitTag: hit.tagName,
            hitClass: hit.className || "(none)",
            hitId: hit.id || "(none)",
          },
          throttleMs: 1000,
          minVerbosity: "deep",
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

      emitReader({
        level: "debug",
        event: "reader_buffer_state",
        summary: "Buffer state evaluated",
        metrics: {
          vh,
          minBuffer,
          maxBuffer,
          topBuffer,
          bottomBuffer,
          minSeq: this.minLoadedSeq(),
          maxSeq: this.maxLoadedSeq(),
          scrollTop: this.scroller.scrollTop,
        },
        details: {
          firstOffset: first?.offsetTop,
          lastEnd: last ? last.offsetTop + last.offsetHeight : null,
        },
        throttleMs: 900,
        minVerbosity: "deep",
      });

      while (topBuffer < minBuffer && this.minLoadedSeq() > 0) {
        emitReader({
          level: "debug",
          event: "reader_buffer_threshold_crossed",
          summary: "Top buffer below minimum threshold",
          details: {
            direction: "prepend",
            activeBuffer: topBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
        await this.ensureLoaded(this.minLoadedSeq() - 1, "prepend");
        first = this.firstEl();
        topBuffer = this.scroller.scrollTop - first.offsetTop;
      }
      if (topBuffer < minBuffer && this.minLoadedSeq() === 0) {
        emitReader({
          level: "debug",
          event: "reader_buffer_boundary",
          summary: "Reached start-of-work boundary during prepend",
          details: {
            direction: "prepend",
            boundary: "start-of-work",
            activeBuffer: topBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
        emitReader({
          level: "debug",
          event: "reader_buffer_blocked",
          summary: "Top buffer could not be expanded at boundary",
          details: {
            direction: "prepend",
            reason: "start-of-work",
            activeBuffer: topBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
      }

      while (bottomBuffer < minBuffer && this.maxLoadedSeq() < this.sequence.length - 1) {
        emitReader({
          level: "debug",
          event: "reader_buffer_threshold_crossed",
          summary: "Bottom buffer below minimum threshold",
          details: {
            direction: "append",
            activeBuffer: bottomBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
        await this.ensureLoaded(this.maxLoadedSeq() + 1, "append");
        last = this.lastEl();
        bottomBuffer = last.offsetTop + last.offsetHeight - (this.scroller.scrollTop + vh);
      }
      if (bottomBuffer < minBuffer && this.maxLoadedSeq() === this.sequence.length - 1) {
        emitReader({
          level: "debug",
          event: "reader_buffer_boundary",
          summary: "Reached end-of-work boundary during append",
          details: {
            direction: "append",
            boundary: "end-of-work",
            activeBuffer: bottomBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
        emitReader({
          level: "debug",
          event: "reader_buffer_blocked",
          summary: "Bottom buffer could not be expanded at boundary",
          details: {
            direction: "append",
            reason: "end-of-work",
            activeBuffer: bottomBuffer,
            threshold: minBuffer,
          },
          minVerbosity: "deep",
        });
      }

      while (this.loaded.size > 1) {
        first = this.firstEl();
        topBuffer = this.scroller.scrollTop - first.offsetTop;
        if (topBuffer <= maxBuffer) {
          emitReader({
            level: "debug",
            event: "reader_buffer_trim_skipped",
            summary: "Top trim skipped; buffer within threshold",
            details: {
              direction: "top",
              activeBuffer: topBuffer,
              threshold: maxBuffer,
            },
            minVerbosity: "deep",
          });
          break;
        }
        const seq = this.minLoadedSeq();
        const removeEl = this.loaded.get(seq);
        const removedHeight = removeEl.offsetHeight;
        removeEl.remove();
        this.loaded.delete(seq);
        this.scroller.scrollTop -= removedHeight;
        emitReader({
          level: "debug",
          event: "reader_chunk_trimmed",
          summary: "Trimmed chapter chunk from top buffer",
          refs: { seq },
          metrics: { removedHeight },
          details: { direction: "top" },
          minVerbosity: "deep",
        });
      }

      while (this.loaded.size > 1) {
        last = this.lastEl();
        bottomBuffer = last.offsetTop + last.offsetHeight - (this.scroller.scrollTop + vh);
        if (bottomBuffer <= maxBuffer) {
          emitReader({
            level: "debug",
            event: "reader_buffer_trim_skipped",
            summary: "Bottom trim skipped; buffer within threshold",
            details: {
              direction: "bottom",
              activeBuffer: bottomBuffer,
              threshold: maxBuffer,
            },
            minVerbosity: "deep",
          });
          break;
        }
        const seq = this.maxLoadedSeq();
        const removeEl = this.loaded.get(seq);
        removeEl.remove();
        this.loaded.delete(seq);
        emitReader({
          level: "debug",
          event: "reader_chunk_trimmed",
          summary: "Trimmed chapter chunk from bottom buffer",
          refs: { seq },
          details: { direction: "bottom" },
          minVerbosity: "deep",
        });
      }
    } finally {
      this.isBuffering = false;
    }
  }

  async ensureLoaded(seq, mode) {
    if (seq < 0 || seq >= this.sequence.length) {
      emitReader({
        level: "debug",
        event: "reader_chapter_load_skip",
        summary: "Skipped chapter load out of sequence bounds",
        details: { seq, mode, reason: "out-of-range" },
        minVerbosity: "deep",
      });
      return;
    }
    if (this.loaded.has(seq)) {
      emitReader({
        level: "debug",
        event: "reader_chapter_load_skip",
        summary: "Skipped chapter load already present in buffer",
        refs: { seq },
        details: { mode, reason: "already-loaded" },
        minVerbosity: "deep",
      });
      return;
    }
    const pointer = this.sequence[seq];
    emitReader({
      level: "debug",
      event: "reader_chapter_load_attempt",
      summary: "Loading chapter into reader buffer",
      refs: {
        seq,
        bookId: pointer?.bookMeta?.id,
        chapter: pointer?.chapter,
      },
      details: {
        mode,
        loadedCount: this.loaded.size,
      },
      minVerbosity: "standard",
    });
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
      emitReader({
        level: "debug",
        event: "reader_chapter_load_success",
        summary: "Loaded chapter into reader buffer",
        refs: {
          seq,
          bookId: pointer?.bookMeta?.id,
          chapter: pointer?.chapter,
        },
        metrics: {
          verseCount: chapterData?.chapter?.verses?.length ?? 0,
          chapterPixelHeight: chapterNode.offsetHeight,
        },
        details: { mode, loadedCount: this.loaded.size },
        minVerbosity: "standard",
      });
    } catch (error) {
      emitReader({
        level: "warn",
        event: "reader_chapter_load_failure",
        summary: "Failed to load chapter into reader buffer",
        refs: {
          seq,
          bookId: pointer?.bookMeta?.id,
          chapter: pointer?.chapter,
        },
        details: {
          mode,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
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
    emitReader({
      level: "debug",
      event: "reader_jump_attempt",
      summary: "Attempting reader jump to location",
      refs: {
        workId: location?.workId,
        bookId: location?.bookId,
        chapter: location?.chapter,
        verse: location?.verse,
      },
      details: { align },
      minVerbosity: "standard",
    });
    const seq = this.locationToSeq(location);
    try {
      if (!this.loaded.has(seq)) {
        this.content.innerHTML = "";
        this.loaded.clear();
        await this.ensureLoaded(seq, "append");
        if (seq > 0) {
          await this.ensureLoaded(seq - 1, "prepend");
        }
        if (seq < this.sequence.length - 1) {
          await this.ensureLoaded(seq + 1, "append");
        }
      }

      const scrollToTarget = () => {
        const verseSelector = `.verse[data-seq="${seq}"][data-verse="${location.verse || 1}"]`;
        const verseEl = this.content.querySelector(verseSelector);
        const target = verseEl || this.content.querySelector(`.chapter-block[data-seq="${seq}"]`);
        const scrollBefore = this.scroller.scrollTop;
        const vh = this.scroller.clientHeight;
        const sh = this.scroller.scrollHeight;

        if (!target) return false;
        const scrollerRect = this.scroller.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const desiredTop = vh * align;
        const delta = targetRect.top - scrollerRect.top - desiredTop;
        const newTop = Math.max(0, scrollBefore + delta);
        this.scroller.scrollTop = newTop;

        emitReader({
          level: "debug",
          event: "reader_jump_done",
          summary: "Reader jump applied",
          refs: { seq, chapter: location?.chapter, verse: location?.verse },
          metrics: {
            scrollBefore,
            scrollAfter: this.scroller.scrollTop,
            delta,
            vh,
            sh,
          },
          minVerbosity: "standard",
        });
        return true;
      };

      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const success = scrollToTarget();
      if (!success) {
        emitReader({
          level: "warn",
          event: "reader_jump_fail",
          summary: "Reader jump target not found",
          refs: { seq, chapter: location?.chapter, verse: location?.verse },
          details: { align, reason: "target-not-found" },
          minVerbosity: "standard",
        });
      }
    } catch (error) {
      emitReader({
        level: "error",
        event: "reader_jump_fail",
        summary: "Reader jump failed",
        refs: {
          workId: location?.workId,
          bookId: location?.bookId,
          chapter: location?.chapter,
          verse: location?.verse,
        },
        details: {
          align,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
