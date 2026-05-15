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
  for (let i = 0; i < 260; i += 1) {
    await page.evaluate(() => window.__scriptureScrollerLab.scrollBy(18));
    await page.waitForTimeout(35);
    const next = await snapshot(page);
    expect(next.anchor.reference, `step ${i} anchor`).toMatch(/^Alma 36:/);
    expect(next.anchor.verse, `step ${i} verse`).toBeLessThanOrEqual(30);
    if (next.loadedChapters[0]?.seq > beforeUnload.loadedChapters[0]?.seq) {
      sawUnload = true;
    }
    beforeUnload = next;
  }

  expect(sawUnload).toBe(true);
  const afterReference = await reference(page);
  const after = await snapshot(page);
  expect(afterReference).toMatch(/^Alma 36:/);
  expect(after.anchor.verse).toBeLessThanOrEqual(30);
});
