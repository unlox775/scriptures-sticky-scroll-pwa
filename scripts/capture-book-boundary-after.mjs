#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const BASE = "http://127.0.0.1:5173/scriptures-sticky-scroll-pwa/";
const OUT = "documentation/debug-frames/book-boundary-after";
const ART = "/opt/cursor/artifacts/screenshots";
const SPEED = 20;

const BOUNDARIES = [
  { id: "3ne-to-4ne", label: "3 Nephi → 4 Nephi", bookId: "3-ne", chapter: 30, verse: 2, toBook: "4-ne", toTitle: "4 Nephi" },
  { id: "4ne-to-morm", label: "4 Nephi → Mormon", bookId: "4-ne", chapter: 1, verse: 49, toBook: "morm", toTitle: "Mormon" },
  { id: "morm-to-ether", label: "Mormon → Ether", bookId: "morm", chapter: 9, verse: 37, toBook: "ether", toTitle: "Ether" },
  { id: "ether-to-moro", label: "Ether → Moroni", bookId: "ether", chapter: 15, verse: 34, toBook: "moro", toTitle: "Moroni" },
];

await mkdir(OUT, { recursive: true });
await mkdir(ART, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: devices["iPhone 14"].userAgent,
  deviceScaleFactor: 2,
  serviceWorkers: "block",
});
const page = await context.newPage();

for (const boundary of BOUNDARIES) {
  const url = `${BASE}?test=1&cap=${boundary.id}#/r/book-of-mormon/${boundary.bookId}/${boundary.chapter}/${boundary.verse}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__scriptureReaderTest?.getSnapshot?.()?.loadedCount > 0);
  await page.waitForTimeout(800);
  await page.waitForFunction((bookId) => {
    return window.__scriptureReaderTest.getSnapshot("park").loadedChapters.some((chapter) => chapter.bookId === bookId);
  }, boundary.toBook);
  await page.evaluate((bookId) => {
    const snap = window.__scriptureReaderTest.getSnapshot("park");
    const next = snap.loadedChapters.find((chapter) => chapter.bookId === bookId);
    document.querySelector("#readerScroller").scrollTop = Math.max(0, next.top - 160);
  }, boundary.toBook);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${boundary.id}__01-start.png`), fullPage: false });
  await page.screenshot({ path: path.join(ART, `after_${boundary.id}_start.png`), fullPage: false });

  await page.evaluate((speed) => window.__scriptureReaderTest.startAutoScroll(speed), SPEED);
  const started = Date.now();
  let crossed = false;
  while (Date.now() - started < 20_000) {
    await page.waitForTimeout(280);
    const snap = await page.evaluate(() => window.__scriptureReaderTest.getSnapshot("run"));
    if (!crossed && snap.anchor?.bookId === boundary.toBook) {
      crossed = true;
      await page.screenshot({ path: path.join(OUT, `${boundary.id}__02-crossing.png`), fullPage: false });
      await page.screenshot({ path: path.join(ART, `after_${boundary.id}_crossing.png`), fullPage: false });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${boundary.id}__03-after.png`), fullPage: false });
      await page.screenshot({ path: path.join(ART, `after_${boundary.id}_after.png`), fullPage: false });
      break;
    }
  }
  await page.evaluate(() => window.__scriptureReaderTest.stopAutoScroll());
  console.log(boundary.id, crossed ? "crossed" : "TIMEOUT", (await page.evaluate(() => window.__scriptureReaderTest.getSnapshot("end").anchor?.reference)));
}

await browser.close();
