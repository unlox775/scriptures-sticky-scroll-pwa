import { chromium, devices } from "/workspace/scriptures-sticky-scroll-pwa/node_modules/@playwright/test/index.mjs";
import fs from "node:fs";
const OUT = "/workspace/scriptures-sticky-scroll-pwa/documentation/qa";
const URL = "http://127.0.0.1:5199/scriptures-sticky-scroll-pwa/#/r/book-of-mormon/1-ne/4/1";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
const cdp = await ctx.newCDPSession(page);
const results = {};
await page.goto(URL);
await page.waitForSelector(".scripture-block", { timeout: 20000 });
await page.waitForTimeout(1500);

const firstVerseTop = () => page.evaluate(() => {
  const el = document.querySelector('[data-reference="1 Nephi 4:1"]');
  const sc = document.querySelector('#readerScroller');
  return { verseTop: el.getBoundingClientRect().top, scrollTop: sc.scrollTop, scrollerTop: sc.getBoundingClientRect().top, scrollerH: sc.getBoundingClientRect().height, headerH: document.querySelector('.app-header').getBoundingClientRect().height };
});
const state = () => page.evaluate(() => ({
  st: document.querySelector('#readerScroller').scrollTop,
  label: document.querySelector('[data-auto-speed]')?.textContent,
  panels: document.querySelectorAll('.auto-scroll-panel').length,
  saved: localStorage.getItem('scripture-pwa-auto-scroll-speed-v1'),
  wake: window.__wakeLockState,
}));

// Stationary before (clean 20px/s default from fresh profile)
results.before = await firstVerseTop();
await page.screenshot({ path: `${OUT}/floating-speed-before-start-iphone.png` });

await page.tap("#autoScrollStart");
await page.waitForSelector(".auto-scroll-strip");
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/floating-speed-after-start-iphone.png` });
// measure immediately (scroll has barely moved: compare same verse after accounting scrollTop)
const s0 = await state();
const after = await firstVerseTop();
results.after = after;
results.scrolledSinceStartPx = after.scrollTop - results.before.scrollTop;
results.verseOffsetBefore = results.before.verseTop - results.before.scrollerTop;
results.verseOffsetAfterAdjusted = after.verseTop - after.scrollerTop + (after.scrollTop - results.before.scrollTop);
results.layoutShiftScrollerTop = after.scrollerTop - results.before.scrollerTop;
results.layoutShiftScrollerHeight = after.scrollerH - results.before.scrollerH;
results.panelBox = await page.evaluate(() => { const r = document.querySelector('.auto-scroll-strip').getBoundingClientRect(); const t = document.querySelector('.auto-scroll-thumb').getBoundingClientRect(); const p = document.querySelector('.auto-scroll-panel'); return { strip: r.toJSON(), thumb: t.toJSON(), panelPosition: getComputedStyle(p).position, vw: innerWidth, vh: innerHeight, inner: document.documentElement.scrollHeight }; });
console.log(JSON.stringify(results.panelBox));

// Real touch drag via CDP
async function touchDrag(x, y0, y1, steps = 12) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const geo = async () => page.evaluate(() => { const r = document.querySelector('.auto-scroll-strip').getBoundingClientRect(); const t = document.querySelector('.auto-scroll-thumb').getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom, thumbCY: t.top + t.height / 2, thumbH: t.height }; });

async function measure(ms = 3000) {
  const a = await state(); const t0 = Date.now();
  await page.waitForTimeout(ms);
  const b = await state(); const dt = (Date.now() - t0) / 1000;
  return { label: b.label, measuredPxPerS: (b.st - a.st) / dt, saved: b.saved, wake: b.wake?.status };
}
async function dragTo(frac) {
  const g = await geo();
  const targetCY = g.top + g.thumbH / 2 + frac * (g.bottom - g.top - g.thumbH);
  const before = (await state()).st;
  await touchDrag(g.x, g.thumbCY, targetCY);
  return before;
}

// (2) middle 20 px/s : drag thumb to t=0.5. thumb starts at middle already (20 saved default) -> verify
let g = await geo();
results.thumbStartFraction = (g.thumbCY - g.top - g.thumbH / 2) / (g.bottom - g.top - g.thumbH);
await page.waitForTimeout(500);
results.middle = await measure(4000);
await page.screenshot({ path: `${OUT}/floating-speed-middle-20-iphone.png` });

// (1) slow near top
await dragTo(0.12);
let st = await state();
results.slowLabel = st.label;
await page.waitForTimeout(400);
results.slow = await measure(6000);
await page.screenshot({ path: `${OUT}/floating-speed-slow-top-iphone.png` });

// Dragging the thumb must not scroll the page: sample scrollTop + speed each frame during long
// drags and compare actual scroll with the integral of the displayed speed.
await dragTo(0.5);
await page.evaluate(() => {
  const sc = document.querySelector('#readerScroller');
  window.__samples = [{ t: performance.now(), st: sc.scrollTop, sp: parseFloat(document.querySelector('[data-auto-speed]').textContent) }];
  const tick = () => { window.__samples.push({ t: performance.now(), st: sc.scrollTop, sp: parseFloat(document.querySelector('[data-auto-speed]').textContent) }); window.__raf = requestAnimationFrame(tick); };
  tick();
});
{
  const g4 = await geo();
  await touchDrag(g4.x, g4.thumbCY, g4.bottom - 40, 25);
  const g5 = await geo();
  await touchDrag(g5.x, g5.thumbCY, g5.top + 4, 25);
  const g6 = await geo();
  await touchDrag(g6.x, g6.thumbCY, g6.top + (g6.bottom - g6.top) * 0.5, 15);
}
const dn = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  const S = window.__samples; let expected = 0;
  for (let i = 1; i < S.length; i++) expected += S[i - 1].sp * Math.min((S[i].t - S[i - 1].t) / 1000, 0.1);
  return { actualScrolledPx: S[S.length - 1].st - S[0].st, expectedFromDisplayedSpeedPx: expected, windowScrollY: scrollY, bodyScrollH: document.documentElement.scrollHeight, innerH: innerHeight, activeStill: document.querySelectorAll('.auto-scroll-panel').length === 1, samples: S.length };
});
results.dragNoScroll = dn;

// (3) fast near bottom
await dragTo(0.93);
await page.waitForTimeout(400);
results.fast = await measure(2500);
await page.screenshot({ path: `${OUT}/floating-speed-fast-bottom-iphone.png` });

// tap on track jumps: tap at 50%
{
  const g2 = await geo();
  const y = g2.top + (g2.bottom - g2.top) / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g2.x, y: g2.top + 10 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  results.tapTopLabel = (await state()).label;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g2.x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  results.tapMidLabel = (await state()).label;
}
// persistence
results.savedAfter = (await state()).saved;

// auto-scroll still running + stop via header button; panel removed; wake released
results.wakeWhileRunning = (await state()).wake;
await page.tap("#autoScrollStart");
await page.waitForTimeout(500);
const fin = await state();
results.afterStop = { panels: fin.panels, wake: fin.wake?.status };

// restart: thumb restored from saved speed
await page.tap("#autoScrollStart");
await page.waitForSelector(".auto-scroll-strip");
await page.waitForTimeout(300);
const g3 = await geo();
results.restart = { label: (await state()).label, thumbFrac: (g3.thumbCY - g3.top - g3.thumbH / 2) / (g3.bottom - g3.top - g3.thumbH) };
// fast fling (touch-swipe on content) drops auto-scroll (manual scroll intent) -- existing behaviour
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 500 }] });
for (let i = 1; i <= 6; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 150, y: 500 - i * 50 }] }); await page.waitForTimeout(16); }
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(500);
const fl = await state();
results.afterFling = { panels: fl.panels, wake: fl.wake?.status };

fs.writeFileSync("/workspace/qa-floating/results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
