import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/scriptures-sticky-scroll-pwa/scroller-lab.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173/scriptures-sticky-scroll-pwa/",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
