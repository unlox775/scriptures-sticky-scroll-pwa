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

async function targetReference(page) {
  return page.evaluate(() => window.__scriptureScrollerLab.getTargetReference());
}

function ordinal(ref) {
  return ref.seq * 1_000 + ref.verse;
}

test("auto-scroll near Alma 36 keeps the target-line verse continuous", async ({ page }) => {
  await waitForLab(page);

  const initial = await targetReference(page);
  expect(initial.reference).toBe("Alma 36:8");

  await page.evaluate(() => window.__scriptureScrollerLab.startAutoScroll(96));

  const samples = [initial];
  let previousFirstSeq = (await snapshot(page)).loadedChapters[0]?.seq;
  let sawUnload = false;
  for (let i = 0; i < 320; i += 1) {
    await page.waitForTimeout(75);
    const current = await targetReference(page);
    const currentSnapshot = await snapshot(page);
    const previous = samples.at(-1);
    samples.push(current);

    const previousOrdinal = ordinal(previous);
    const currentOrdinal = ordinal(current);
    expect(currentOrdinal, `step ${i} moved backward from ${previous.reference} to ${current.reference}`).toBeGreaterThanOrEqual(previousOrdinal);
    expect(
      currentOrdinal - previousOrdinal,
      `step ${i} skipped from ${previous.reference} to ${current.reference}`,
    ).toBeLessThanOrEqual(3);

    const currentFirstSeq = currentSnapshot.loadedChapters[0]?.seq;
    if (Number.isFinite(previousFirstSeq) && currentFirstSeq > previousFirstSeq) {
      sawUnload = true;
    }
    previousFirstSeq = currentFirstSeq;
    if (current.bookTitle === "Alma" && current.chapter === 37) {
      expect(previous.reference, `entered Alma 37 from ${previous.reference}`).toBe("Alma 36:30");
      break;
    }
  }

  await page.evaluate(() => window.__scriptureScrollerLab.stopAutoScroll());
  expect(sawUnload).toBe(true);
  expect(samples.at(-1).bookTitle).toBe("Alma");
});
