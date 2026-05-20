import { expect, test } from "@playwright/test";

async function waitForV3Ready(page) {
  await page.waitForFunction(() => {
    const lab = window.__scriptureScrollerV3Lab;
    const snapshot = lab?.getSnapshot?.("test");
    return snapshot?.anchor && snapshot.loadedCount > 0 && document.querySelector("#statusPill")?.textContent === "ready";
  });
}

test("V3 lab boots with visible target scripture and centered minimap viewport", async ({ page }) => {
  await page.goto("scroller-v3-lab.html?test=1#/alma/36/1");
  await waitForV3Ready(page);

  const state = await page.evaluate(() => {
    const snapshot = window.__scriptureScrollerV3Lab.getSnapshot("test");
    const readerText = document.querySelector("#scriptureScroller")?.innerText || "";
    const minimap = document.querySelector("#minimap");
    return {
      anchor: snapshot.anchor?.reference,
      loadedLabels: snapshot.loadedChapters.map((chapter) => chapter.label),
      scrollTop: snapshot.scrollTop,
      readerText,
      screensVisible: minimap?.dataset.screensVisible,
      viewportCenterRatio: Number(minimap?.dataset.viewportCenterRatio),
    };
  });

  expect(state.readerText).toContain("Alma");
  expect(state.readerText).toContain("Chapter 36");
  expect(state.anchor).toMatch(/^Alma 36(?::\d+)?$/);
  expect(state.loadedLabels).toContain("Alma 36");
  expect(state.screensVisible).toBe("30");
  expect(state.viewportCenterRatio).toBeGreaterThan(0.38);
  expect(state.viewportCenterRatio).toBeLessThan(0.62);
});

test("V3 lab keeps the beginning of the work visible at 1 Nephi 1", async ({ page }) => {
  await page.goto("scroller-v3-lab.html?test=2#/1-ne/1/1");
  await waitForV3Ready(page);

  const state = await page.evaluate(() => {
    const snapshot = window.__scriptureScrollerV3Lab.getSnapshot("test");
    return {
      anchor: snapshot.anchor?.reference,
      scrollTop: snapshot.scrollTop,
      readerText: document.querySelector("#scriptureScroller")?.innerText || "",
    };
  });

  expect(state.scrollTop).toBe(0);
  expect(state.readerText).toContain("1 Nephi");
  expect(state.readerText).toContain("Chapter 1");
  expect(state.anchor).toMatch(/^1 Nephi 1(?::\d+)?$/);
});
