#!/usr/bin/env node
import { chromium, devices } from "@playwright/test";

const BASE = "http://127.0.0.1:5173/scriptures-sticky-scroll-pwa/";
const starts = [
  { id: "3ne30", bookId: "3-ne", chapter: 30, verse: 1 },
  { id: "4ne46", bookId: "4-ne", chapter: 1, verse: 46 },
  { id: "morm9", bookId: "morm", chapter: 9, verse: 34 },
  { id: "ether15", bookId: "ether", chapter: 15, verse: 31 },
];

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

function gaps(loaded) {
  const rows = [];
  for (let i = 0; i < loaded.length; i += 1) {
    const cur = loaded[i];
    const next = loaded[i + 1];
    rows.push({
      label: cur.label,
      top: cur.top,
      height: cur.height,
      gap: next ? next.top - cur.bottom : null,
    });
  }
  return rows;
}

for (const start of starts) {
  const url = `${BASE}?test=1&jump=${start.id}#/r/book-of-mormon/${start.bookId}/${start.chapter}/${start.verse}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__scriptureReaderTest?.getSnapshot?.()?.loadedCount > 0);
  await page.waitForTimeout(1600);
  const snap = await page.evaluate(() => window.__scriptureReaderTest.getSnapshot("diag"));
  console.log("\n====", start.id, snap.anchor?.reference);
  for (const row of gaps(snap.loadedChapters)) {
    console.log(`${row.label} top=${row.top} h=${row.height} gap=${row.gap}`);
  }
}

await browser.close();
