# Book-boundary auto-scroll — Iteration Log

**Prompt slug:** `book-boundary-autoscroll`  
**Started:** 2026-10-29  
**Last updated:** 2026-10-29

See `20261029-160300_book-boundary-autoscroll-PROMPT.txt` for the full prompt history.

## Goals

- Reproduce Dave's iPhone auto-scroll break (~20 px/s) at Book of Mormon book boundaries.
- Explicit crossings: 3 Nephi → 4 Nephi, 4 Nephi → Mormon, and Mormon → Moroni (Ether sits between Mormon and Moroni in the canon sequence).
- Fix the infinite scroller/book-boundary loader minimally. No theme or look changes.
- Keep sticky-follow rules: fast fling (~900 px/s) still drops follow; slow scroll and auto-scroll keep follow on with the ribbon clamped on-screen.
- Add an automated continuity regression across those boundaries (ideally every BoM book boundary).
- Draft PR with before/after iPhone screenshots.

## Delivery Summary

### Prompt 1–2: Reproduce 3 Ne→4 Ne, 4 Ne→Mormon, Mormon→Moroni

| Item | Status | Where / Notes |
|------|--------|---------------|
| Spec + prompt pair | Done | `documentation/spec/20261029-160300_book-boundary-autoscroll.*` |
| iPhone Playwright harness | Done | 390×844, 20 px/s; frames in `documentation/debug-frames/book-boundary-*` |
| Root-cause fix | Done | V3 measured clones with the wrong box model and placed the next chapter before live height settled; seed/insert now snaps to neighbor live geometry |
| Continuity regression | Done | `tests/playwright/book-boundary-autoscroll.spec.mjs` covers every BoM book edge plus sticky-follow across 3 Ne→4 Ne |
| Sticky-follow across books | Done | Seq-based follow/ribbon visibility so slow auto-scroll keeps the ribbon on-screen |

## Current Findings

- The visible break was a **blank extra gap** (about 100px / ~5s at 20 px/s) between the last chapter of one book and the first chapter of the next. Auto-scroll itself kept running; the runway just had a hole or overlap.
- 3 Nephi 30 → 4 Nephi was the clearest case (2-verse closer + long 4 Nephi title card). The same measure/place bug existed at 4 Nephi → Mormon, Mormon → Ether, and Ether → Moroni.
- Canon sequence is Mormon → Ether → Moroni. Mormon does not jump to Moroni.
- Fast-fling sticky-follow disable at 900 px/s is unchanged.

## Next Actions

1. Keep the PR draft until before/after iPhone frames are in the body.
2. Soak-test the same crossings on a physical iPhone if needed.
