import { expect, test } from "@playwright/test";

async function waitForLab(page) {
  await page.goto("scroller-lab.html#/alma/36/8");
  await expect(page.locator("#statusPill")).toHaveText("ready");
  await page.waitForFunction(() => Boolean(window.__scriptureScrollerLab?.getSnapshot));
}

async function snapshot(page) {
  return page.evaluate(() => window.__scriptureScrollerLab.getSnapshot("playwright"));
}

async function reference(page) {
  return page.evaluate(() => window.__scriptureScrollerLab.getReference());
}

test("unloading above near Alma 36 does not skip into Alma 37", async ({ page }) => {
  await waitForLab(page);

  let beforeUnload = await snapshot(page);
  let sawUnload = false;
  let lastAlma36Verse = beforeUnload.anchor.verse;
  for (let i = 0; i < 260; i += 1) {
    await page.evaluate(() => window.__scriptureScrollerLab.scrollBy(18));
    await page.waitForTimeout(35);
    const next = await snapshot(page);
    if (next.anchor.bookTitle === "Alma" && next.anchor.chapter === 36) {
      expect(next.anchor.verse, `step ${i} Alma 36 verse`).toBeGreaterThanOrEqual(lastAlma36Verse);
      lastAlma36Verse = next.anchor.verse;
    }
    if (next.anchor.bookTitle === "Alma" && next.anchor.chapter === 37) {
      expect(lastAlma36Verse, `step ${i} crossed into Alma 37 after Alma 36 verse`).toBeGreaterThanOrEqual(28);
      break;
    }
    if (next.loadedChapters[0]?.seq > beforeUnload.loadedChapters[0]?.seq) {
      sawUnload = true;
    }
    beforeUnload = next;
  }

  expect(sawUnload).toBe(true);
  expect(lastAlma36Verse).toBeGreaterThanOrEqual(28);
});
