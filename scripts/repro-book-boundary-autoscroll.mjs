#!/usr/bin/env node
/**
 * iPhone-emulation auto-scroll harness for Book of Mormon book boundaries.
 * Captures screenshots + a JSON report describing continuity (stall/jump/blank/skip).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.REPRO_BASE_URL || "http://127.0.0.1:5173/scriptures-sticky-scroll-pwa/";
const OUT_DIR = process.env.REPRO_OUT_DIR || "documentation/debug-frames/book-boundary-before";
const ARTIFACT_DIR = process.env.REPRO_ARTIFACT_DIR || "/opt/cursor/artifacts/screenshots";
const SPEED = Number(process.env.REPRO_SPEED || 20);
const IPHONE = devices["iPhone 14"];

const BOUNDARIES = [
  {
    id: "3ne-to-4ne",
    label: "3 Nephi → 4 Nephi",
    start: { bookId: "3-ne", chapter: 30, verse: 1 },
    fromBook: "3-ne",
    toBook: "4-ne",
    timeoutMs: 55_000,
  },
  {
    id: "4ne-to-morm",
    label: "4 Nephi → Mormon",
    start: { bookId: "4-ne", chapter: 1, verse: 46 },
    fromBook: "4-ne",
    toBook: "morm",
    timeoutMs: 70_000,
  },
  {
    id: "morm-to-next",
    label: "Mormon → next book (canon: Ether)",
    start: { bookId: "morm", chapter: 9, verse: 34 },
    fromBook: "morm",
    toBook: "ether",
    timeoutMs: 70_000,
  },
  {
    id: "ether-to-moro",
    label: "Ether → Moroni",
    start: { bookId: "ether", chapter: 15, verse: 31 },
    fromBook: "ether",
    toBook: "moro",
    timeoutMs: 70_000,
  },
];

function readerUrl(bookId, chapter, verse) {
  return `${BASE}#/r/book-of-mormon/${bookId}/${chapter}/${verse}`;
}

async function collectState(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector("#readerScroller");
    const content = document.querySelector("#readerContent");
    if (!scroller) return { ready: false };
    const scrollerRect = scroller.getBoundingClientRect();
    const chapters = [...document.querySelectorAll("#readerContent .lab-chapter")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        bookId: el.dataset.bookId,
        chapter: Number(el.dataset.chapter),
        seq: Number(el.dataset.seq),
        styleTop: Number.parseFloat(el.style.top) || 0,
        height: Math.round(rect.height),
        visible: rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom,
        top: Math.round(rect.top - scrollerRect.top),
      };
    });
    const headings = [...document.querySelectorAll("#readerContent .chapter-heading")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: el.innerText.replace(/\s+/g, " ").trim(),
        top: Math.round(rect.top - scrollerRect.top),
        visible: rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom + 8,
      };
    });
    const verses = [...scroller.querySelectorAll(".lab-verse")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
    });
    const gaps = [];
    const placed = [...chapters].sort((a, b) => a.styleTop - b.styleTop);
    for (let i = 1; i < placed.length; i += 1) {
      const prev = placed[i - 1];
      const next = placed[i];
      const gap = next.styleTop - (prev.styleTop + prev.height);
      if (Math.abs(gap) > 40) {
        gaps.push({
          from: `${prev.bookId} ${prev.chapter}`,
          to: `${next.bookId} ${next.chapter}`,
          gap: Math.round(gap),
        });
      }
    }
    return {
      ready: true,
      header: document.querySelector("#headerTitle")?.textContent?.trim() || "",
      autoScrollLabel: document.querySelector("#autoScrollStart")?.textContent?.trim() || "",
      scrollTop: Math.round(scroller.scrollTop),
      clientHeight: Math.round(scroller.clientHeight),
      scrollHeight: Math.round(scroller.scrollHeight),
      contentHeight: content?.style.height || "",
      loaded: chapters.map((c) => `${c.bookId}:${c.chapter}`),
      visibleChapters: chapters.filter((c) => c.visible).map((c) => `${c.bookId}:${c.chapter}`),
      visibleHeadings: headings.filter((h) => h.visible),
      visibleVerseCount: verses.length,
      visibleVerseSample: verses.slice(0, 3).map((el) => el.dataset.reference || el.innerText.slice(0, 48)),
      ribbons: [...document.querySelectorAll(".bookmark-ribbon")].map((el) => ({
        name: el.textContent,
        top: el.style.top,
        active: el.classList.contains("bookmark-ribbon-active"),
      })),
      gaps,
      url: location.hash,
    };
  });
}

function diagnose(samples, boundary) {
  const issues = [];
  if (!samples.length) {
    issues.push("no-samples");
    return issues;
  }
  let maxDelta = 0;
  let stallCount = 0;
  let blankCount = 0;
  const seenBooks = new Set();
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dt = Math.max(1, curr.ts - prev.ts) / 1000;
    const delta = curr.scrollTop - prev.scrollTop;
    maxDelta = Math.max(maxDelta, delta);
    const expected = SPEED * dt;
    if (delta > expected * 8 + 80) {
      issues.push(`jump +${delta}px in ${Math.round(dt * 1000)}ms at ${curr.header}`);
    }
    if (curr.autoScrollLabel.includes("scrolling") && Math.abs(delta) < 1) {
      stallCount += 1;
    } else {
      stallCount = 0;
    }
    if (stallCount >= 6) {
      issues.push(`stall at scrollTop=${curr.scrollTop} header=${curr.header} loaded=${curr.loaded.join(",")}`);
      stallCount = 0;
    }
    if (curr.visibleVerseCount === 0) {
      blankCount += 1;
    } else {
      blankCount = 0;
    }
    if (blankCount >= 3) {
      issues.push(`blank viewport at ${curr.header} scrollTop=${curr.scrollTop}`);
      blankCount = 0;
    }
    for (const id of curr.loaded) {
      const book = id.split(":")[0];
      seenBooks.add(book);
    }
    for (const gap of curr.gaps || []) {
      issues.push(`layout-gap ${gap.from}→${gap.to} ${gap.gap}px`);
    }
  }
  const crossed = samples.some((s) => s.loaded.includes(`${boundary.toBook}:1`) || s.visibleChapters.some((c) => c.startsWith(`${boundary.toBook}:`)));
  if (!crossed) issues.push(`did-not-reach-${boundary.toBook}`);
  if (boundary.fromBook === "morm" && seenBooks.has("moro") && !seenBooks.has("ether")) {
    issues.push("skipped-ether-jumped-to-moroni");
  }
  return [...new Set(issues)];
}

async function runBoundary(page, boundary, dirs) {
  const hash = readerUrl(boundary.start.bookId, boundary.start.chapter, boundary.start.verse);
  await page.goto(hash, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("scripture-pwa-auto-scroll-speed-v1", "20");
  });
  await page.waitForSelector("#readerScroller .lab-chapter", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const btn = document.querySelector("#autoScrollStart");
    return btn && !btn.hidden && document.querySelectorAll(".lab-chapter").length > 0;
  });
  await page.waitForTimeout(800);

  const startState = await collectState(page);
  const startShot = path.join(dirs.out, `${boundary.id}__01-start.png`);
  await page.screenshot({ path: startShot, fullPage: false });
  await page.screenshot({ path: path.join(dirs.artifacts, `before_${boundary.id}_start.png`), fullPage: false });

  if (page.locator("#autoScrollStart").isVisible) {
    await page.locator("#autoScrollStart").click();
  }
  await page.waitForTimeout(200);
  await page.evaluate((speed) => {
    const input = document.querySelector(".auto-scroll-panel input[type=range]");
    if (input) {
      input.value = String(speed);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, SPEED);

  const samples = [{ ...startState, ts: Date.now(), phase: "start" }];
  const startedAt = Date.now();
  let crossedShot = false;
  let afterShot = false;
  let frame = 1;

  while (Date.now() - startedAt < boundary.timeoutMs) {
    await page.waitForTimeout(400);
    const state = await collectState(page);
    samples.push({ ...state, ts: Date.now(), phase: "run" });

    const onToBook = state.visibleChapters.some((c) => c.startsWith(`${boundary.toBook}:`))
      || state.header.toLowerCase().includes(boundary.toBook === "4-ne" ? "4 nephi" : boundary.toBook === "morm" ? "mormon" : boundary.toBook === "ether" ? "ether" : "moroni");
    const leftFrom = !state.visibleChapters.some((c) => c.startsWith(`${boundary.fromBook}:`));

    if (onToBook && !crossedShot) {
      crossedShot = true;
      frame += 1;
      const name = `${boundary.id}__02-crossing.png`;
      await page.screenshot({ path: path.join(dirs.out, name), fullPage: false });
      await page.screenshot({ path: path.join(dirs.artifacts, `before_${boundary.id}_crossing.png`), fullPage: false });
    }
    if (onToBook && leftFrom && !afterShot) {
      afterShot = true;
      frame += 1;
      await page.screenshot({ path: path.join(dirs.out, `${boundary.id}__03-after.png`), fullPage: false });
      await page.screenshot({ path: path.join(dirs.artifacts, `before_${boundary.id}_after.png`), fullPage: false });
      await page.waitForTimeout(1500);
      break;
    }
  }

  if (!afterShot) {
    await page.screenshot({ path: path.join(dirs.out, `${boundary.id}__03-timeout.png`), fullPage: false });
    await page.screenshot({ path: path.join(dirs.artifacts, `before_${boundary.id}_timeout.png`), fullPage: false });
  }

  const endState = await collectState(page);
  samples.push({ ...endState, ts: Date.now(), phase: "end" });
  const issues = diagnose(samples, boundary);
  if (page.locator("#autoScrollStart")) {
    const label = await page.locator("#autoScrollStart").textContent();
    if (label?.includes("scrolling")) {
      await page.locator("#autoScrollStart").click();
    }
  }

  return {
    id: boundary.id,
    label: boundary.label,
    start: boundary.start,
    issues,
    crossed: issues.every((issue) => !issue.startsWith("did-not-reach")),
    sampleCount: samples.length,
    startState,
    endState,
    samples: samples.filter((_, i) => i === 0 || i === samples.length - 1 || i % 5 === 0),
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-gl=swiftshader"],
  });
  const context = await browser.newContext({
    ...IPHONE,
    locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const report = {
    startedAt: new Date().toISOString(),
    viewport: IPHONE.viewport,
    speed: SPEED,
    base: BASE,
    boundaries: [],
  };

  for (const boundary of BOUNDARIES) {
    console.log(`\n=== ${boundary.label} ===`);
    const result = await runBoundary(page, boundary, { out: OUT_DIR, artifacts: ARTIFACT_DIR });
    report.boundaries.push(result);
    console.log(JSON.stringify({
      id: result.id,
      issues: result.issues,
      headerStart: result.startState.header,
      headerEnd: result.endState.header,
      loadedEnd: result.endState.loaded,
      visibleEnd: result.endState.visibleChapters,
      gaps: result.endState.gaps,
    }, null, 2));
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = path.join(OUT_DIR, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(path.join(ARTIFACT_DIR, "before_book_boundary_report.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${reportPath}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
