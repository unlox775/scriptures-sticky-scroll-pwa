# Auto-scroll screen wake lock

Spec Status: resolved
Created: 2026-11-24T14:11:57Z
Product: scriptures-sticky-scroll-pwa

## Request

The iPhone screen goes to sleep after about five to ten minutes of watching auto-scroll. Keep the screen awake while auto-scroll is running, using the same approach as Web Whisper Harness.

## Approach (ported from web-whisper-harness `apps/web-whisper-pwa/src/wakeLock.ts`)

1. `navigator.wakeLock.request('screen')` while auto-scroll is active.
2. Re-acquire on `visibilitychange` → visible and `pageshow` if auto-scroll is still on.
3. Release the lock (and pause the video fallback) when auto-scroll stops, when the user drags/wheels/keys to cancel, or when the app is hidden.
4. iOS Safari / standalone PWA fallback (API missing or unreliable, including pre-iOS 18.4 standalone): a muted, `playsinline`, looping 16×16 video-only MP4 (NoSleep.js-style). iOS uses the video even when the Wake Lock API exists, because iOS auto-releases the sentinel. Chrome/desktop with a working API does not play the clip unless the request fails.
5. Acquire from the Auto scroll tap in the same turn so the video `play()` still has the user gesture.

Hook only: `AutoScrollController.connect` / `open` / `stop`. No scroller or ribbon logic changes.

## Debug proof

- `window.__wakeLockState` is always published (`status`: `held` | `released`, plus `method`, `desiredActive`, `hasSentinel`, `videoPlaying`).
- On-screen chip only when `?debug` is in the query string, e.g. `/?debug#/r/book-of-mormon/1-ne/4/1`. Normal UI is unchanged.

## Status

- ✅ `src/wakeLock.js` + `src/wakeLockVideo.js`
- ✅ Start/stop hooks in `src/autoScrollController.js`
- ✅ Debug-only chip CSS
- ✅ Unit tests in `tests/unit/wakeLock.test.mjs`
- ✅ iPhone 13 Playwright screenshots: `documentation/qa/pr-wake-lock-held-iphone.png`, `documentation/qa/pr-wake-lock-released-iphone.png`
- ✅ Auto-scroll measured at 19.95 px/s with a saved 20 px/s / slider center
- ⏭️ Draft PR, then squash-merge and Pages `docs/` deploy

## Resolution

Playwright Chromium, iPhone 13 emulation, `/?debug#/r/book-of-mormon/1-ne/4/1`.

- While auto-scrolling: `window.__wakeLockState.status === "held"`, method `video`, chip `Wake lock: held · video`.
- After Stop: status `released`, chip `Wake lock: released`. Chip is absent without `?debug`.
- Headless Chromium exposed `navigator.wakeLock` but did not keep a sentinel (typical for this environment). The iOS path still held via the muted looping video fallback, which is the important path for Dave's iPhone.
