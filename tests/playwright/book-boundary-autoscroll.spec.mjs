import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const IPHONE = { width: 390, height: 844 };
const SPEED = 20;
const INTENDED_GAP = 24;
const ARTIFACT_DIR = process.env.REPRO_ARTIFACT_DIR || "/opt/cursor/artifacts/screenshots";
const DOC_AFTER_DIR = "documentation/debug-frames/book-boundary-after";

const BOM_BOUNDARIES = [
  { id: "1ne-to-2ne", from: { bookId: "1-ne", chapter: 22, verse: 31 }, fromBook: "1-ne", toBook: "2-ne", toTitle: "2 Nephi" },
  { id: "2ne-to-jacob", from: { bookId: "2-ne", chapter: 33, verse: 15 }, fromBook: "2-ne", toBook: "jacob", toTitle: "Jacob" },
  { id: "jacob-to-enos", from: { bookId: "jacob", chapter: 7, verse: 27 }, fromBook: "jacob", toBook: "enos", toTitle: "Enos" },
  { id: "enos-to-jarom", from: { bookId: "enos", chapter: 1, verse: 27 }, fromBook: "enos", toBook: "jarom", toTitle: "Jarom" },
  { id: "jarom-to-omni", from: { bookId: "jarom", chapter: 1, verse: 15 }, fromBook: "jarom", toBook: "omni", toTitle: "Omni" },
  { id: "omni-to-wom", from: { bookId: "omni", chapter: 1, verse: 30 }, fromBook: "omni", toBook: "w-of-m", toTitle: "Words of Mormon" },
  { id: "wom-to-mosiah", from: { bookId: "w-of-m", chapter: 1, verse: 18 }, fromBook: "w-of-m", toBook: "mosiah", toTitle: "Mosiah" },
  { id: "mosiah-to-alma", from: { bookId: "mosiah", chapter: 29, verse: 47 }, fromBook: "mosiah", toBook: "alma", toTitle: "Alma" },
  { id: "alma-to-hel", from: { bookId: "alma", chapter: 63, verse: 17 }, fromBook: "alma", toBook: "hel", toTitle: "Helaman" },
  { id: "hel-to-3ne", from: { bookId: "hel", chapter: 16, verse: 25 }, fromBook: "hel", toBook: "3-ne", toTitle: "3 Nephi" },
  { id: "3ne-to-4ne", from: { bookId: "3-ne", chapter: 30, verse: 2 }, fromBook: "3-ne", toBook: "4-ne", toTitle: "4 Nephi" },
  { id: "4ne-to-morm", from: { bookId: "4-ne", chapter: 1, verse: 49 }, fromBook: "4-ne", toBook: "morm", toTitle: "Mormon" },
  { id: "morm-to-ether", from: { bookId: "morm", chapter: 9, verse: 37 }, fromBook: "morm", toBook: "ether", toTitle: "Ether" },
  { id: "ether-to-moro", from: { bookId: "ether", chapter: 15, verse: 34 }, fromBook: "ether", toBook: "moro", toTitle: "Moroni" },
];

const NAMED = new Set(["3ne-to-4ne", "4ne-to-morm", "morm-to-ether", "ether-to-moro"]);

test.use({
  viewport: IPHONE,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  serviceWorkers: "block",
});

async function openReader(page, location) {
  const nonce = `${location.bookId}-${location.chapter}-${location.verse}-${Date.now()}`;
  const url = `?test=1&jump=${encodeURIComponent(nonce)}#/r/book-of-mormon/${location.bookId}/${location.chapter}/${location.verse}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expected) => {
    const snap = window.__scriptureReaderTest?.getSnapshot?.("ready");
    return Boolean(
      snap?.anchor &&
      snap.loadedCount > 0 &&
      snap.anchor.bookId === expected.bookId &&
      snap.anchor.chapter === expected.chapter,
    );
  }, location, { timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function snapshot(page) {
  return page.evaluate(() => window.__scriptureReaderTest.getSnapshot("test"));
}

function chapterGaps(loadedChapters) {
  const gaps = [];
  for (let i = 1; i < loadedChapters.length; i += 1) {
    const prev = loadedChapters[i - 1];
    const next = loadedChapters[i];
    if (next.seq !== prev.seq + 1) continue;
    gaps.push({
      from: prev.label,
      to: next.label,
      gap: next.top - prev.bottom,
    });
  }
  return gaps;
}

async function parkNearBoundary(page, toBook) {
  await page.waitForFunction((bookId) => {
    const snap = window.__scriptureReaderTest?.getSnapshot?.("park");
    return snap?.loadedChapters?.some((chapter) => chapter.bookId === bookId);
  }, toBook, { timeout: 20_000 });
  await page.evaluate((bookId) => {
    const snap = window.__scriptureReaderTest.getSnapshot("park");
    const next = snap.loadedChapters.find((chapter) => chapter.bookId === bookId);
    const scroller = document.querySelector("#readerScroller");
    if (!next || !scroller) return;
    scroller.scrollTop = Math.max(0, next.top - 140);
  }, toBook);
  await page.waitForTimeout(200);
}

async function autoScrollUntil(page, { toBook, timeoutMs = 25_000 }) {
  await page.evaluate((speed) => window.__scriptureReaderTest.startAutoScroll(speed), SPEED);
  const startedAt = Date.now();
  let lastTop = (await snapshot(page)).scrollTop;
  let stall = 0;
  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(350);
    const snap = await snapshot(page);
    if (Math.abs(snap.scrollTop - lastTop) < 1) stall += 1;
    else stall = 0;
    lastTop = snap.scrollTop;
    const reached = snap.loadedChapters.some((chapter) => chapter.bookId === toBook)
      && (snap.anchor?.bookId === toBook || snap.loadedChapters.some((chapter) => chapter.bookId === toBook && snap.scrollTop + snap.viewportHeight * 0.3 >= chapter.top));
    if (reached && snap.anchor?.bookId === toBook) {
      await page.evaluate(() => window.__scriptureReaderTest.stopAutoScroll());
      return snap;
    }
    expect(stall, `auto-scroll stalled at ${snap.anchor?.reference}`).toBeLessThan(8);
  }
  await page.evaluate(() => window.__scriptureReaderTest.stopAutoScroll());
  return snapshot(page);
}

test.describe("Book of Mormon book-boundary auto-scroll", () => {
  test.setTimeout(12 * 60_000);

  test("auto-scroll at 20 px/s stays continuous across every BoM book boundary", async ({ page }) => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await mkdir(DOC_AFTER_DIR, { recursive: true });
    const results = [];

    for (const boundary of BOM_BOUNDARIES) {
      await openReader(page, boundary.from);
      const before = await snapshot(page);
      for (const gap of chapterGaps(before.loadedChapters)) {
        expect(gap.gap, `${boundary.id} start gap ${gap.from}→${gap.to}`).toBeGreaterThanOrEqual(INTENDED_GAP - 2);
        expect(gap.gap, `${boundary.id} start gap ${gap.from}→${gap.to}`).toBeLessThanOrEqual(INTENDED_GAP + 2);
      }

      await parkNearBoundary(page, boundary.toBook);
      if (NAMED.has(boundary.id)) {
        const startName = `after_${boundary.id}_start.png`;
        await page.screenshot({ path: path.join(ARTIFACT_DIR, startName), fullPage: false });
        await page.screenshot({ path: path.join(DOC_AFTER_DIR, `${boundary.id}__01-start.png`), fullPage: false });
      }

      const after = await autoScrollUntil(page, { toBook: boundary.toBook });
      expect(after.anchor?.bookId, `${boundary.id} did not reach ${boundary.toTitle}`).toBe(boundary.toBook);
      expect(after.loadedChapters.map((chapter) => chapter.bookId)).toContain(boundary.toBook);
      expect(after.loadedChapters.some((chapter) => chapter.bookId === "moro") && boundary.fromBook === "morm" && !after.loadedChapters.some((chapter) => chapter.bookId === "ether")).toBeFalsy();

      for (const gap of chapterGaps(after.loadedChapters)) {
        expect(gap.gap, `${boundary.id} after gap ${gap.from}→${gap.to}`).toBeGreaterThanOrEqual(INTENDED_GAP - 2);
        expect(gap.gap, `${boundary.id} after gap ${gap.from}→${gap.to}`).toBeLessThanOrEqual(INTENDED_GAP + 2);
      }

      if (NAMED.has(boundary.id)) {
        const crossName = `after_${boundary.id}_crossing.png`;
        await page.screenshot({ path: path.join(ARTIFACT_DIR, crossName), fullPage: false });
        await page.screenshot({ path: path.join(DOC_AFTER_DIR, `${boundary.id}__02-crossing.png`), fullPage: false });
      }

      results.push({
        id: boundary.id,
        from: before.anchor?.reference,
        to: after.anchor?.reference,
      });
    }

    expect(results).toHaveLength(BOM_BOUNDARIES.length);
    expect(results.find((item) => item.id === "3ne-to-4ne")?.to).toMatch(/4 Nephi/);
    expect(results.find((item) => item.id === "4ne-to-morm")?.to).toMatch(/Mormon/);
    expect(results.find((item) => item.id === "morm-to-ether")?.to).toMatch(/Ether/);
    expect(results.find((item) => item.id === "ether-to-moro")?.to).toMatch(/Moroni/);
  });

  test("slow auto-scroll keeps sticky-follow on across 3 Nephi → 4 Nephi", async ({ page }) => {
    await openReader(page, { bookId: "3-ne", chapter: 30, verse: 2 });
    await parkNearBoundary(page, "4-ne");
    await page.waitForTimeout(200);
    await page.locator("#moveBookmarkButton").click();
    await expect(page.locator(".bookmark-ribbon-active")).toBeVisible();
    const after = await autoScrollUntil(page, { toBook: "4-ne" });
    expect(after.anchor?.bookId).toBe("4-ne");
    const ribbon = page.locator(".bookmark-ribbon-active");
    await expect(ribbon).toBeVisible();
    const box = await ribbon.boundingBox();
    expect(box).toBeTruthy();
    expect(box.y).toBeGreaterThanOrEqual(-8);
    expect(box.y).toBeLessThan(IPHONE.height);
  });
});
