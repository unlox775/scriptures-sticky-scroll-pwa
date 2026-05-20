# Infinite Scroller V3 Lab — Iteration Log

**Prompt slug:** `infinite-scroller-v3`  
**Started:** 2026-05-19  
**Last updated:** 2026-05-20

See `20260519-185616_infinite-scroller-v3-PROMPT.txt` for the full prompt history.

## Goals

- Build a V3 infinite scroller as an isolated lab/playground, not as production PWA behavior yet.
- Preserve iOS/macOS inertial scroll momentum by avoiding programmatic `scrollTop` changes during load/unload work.
- Prototype a large fixed virtual canvas with top/bottom spacer regions and sequential measured chapter insertion.
- Keep upward loads sequential from the seed chapter so the engine never guesses a far-away chapter from pixel distance.
- Add a V3 lab with right-side stats/events and a narrower, mostly static minimap showing a larger viewport-distance window.

## Research Notes

- iOS Safari momentum scrolling is known to be interrupted by programmatic `scrollTop` writes during inertia.
- Common virtual-scroller compensation techniques that mutate `scrollTop` can stutter or stop momentum on iOS.
- The V3 prototype should therefore treat `scrollTop` as browser-owned after initial jump alignment and mutate spacer height / rendered content positions instead.

## Delivery Summary

### Prompt 1: Build isolated V3 momentum-preserving lab

| Item | Status | Where / Notes |
|------|--------|---------------|
| New V3 spec/prompt pair | Done | `documentation/spec/20260519-185616_infinite-scroller-v3.*` |
| V3 scroller engine | In progress | `src/scriptureScrollerV3.js`; lab-only normal-flow runway with measured chapter insertion and no scrollTop compensation during load/unload |
| V3 lab page | In progress | `scroller-v3-lab.html`, `src/scrollerV3Lab.js`, `src/scrollerV3Lab.css`; visually closer to V2 with reader cards, sticky chapter headers, red 25% line, right-side telemetry |
| Static-window minimap | In progress | 30-screen minimap window now visible in the lab; red viewport starts near center for middle-of-work jumps and near top for beginning-of-work jumps |
| Production PWA integration | Not started | Explicitly deferred |
| Build verification | Done | `npm run build` passes after V3 lab changes |
| Browser verification | Partial | Checked with Cursor browser MCP, not direct Playwright: `Alma 36:1` and `1 Nephi 1:1` boot routes render correctly with telemetry/minimap visible |
| Automated Playwright verification | Blocked | Do not run direct Playwright in this sandbox; needs Docker/POC sandbox or manual browser verification |

## Current Findings

- The first absolute-positioned V3 attempt was rejected because it drifted from V2 visual behavior and made anchor math fragile.
- The current V3 lab uses normal-flow chapters, large top/bottom spacer runway regions, and measured insertion that reduces spacer height instead of compensating with scrollTop writes.
- Browser checks now show `Alma 36:1` renders in the middle-of-work mode with the right telemetry/minimap visible, a 30-screen minimap, and a centered red viewport.
- Browser checks now show `1 Nephi 1:1` renders in beginning-of-work mode with top spacer at zero and the minimap viewport near the top.
- Updated the V3 runway to 100,000,000 px and changed the minimap default to 60 viewport heights with a lab prompt control for live tuning.
- Rebuilt V3 around fixed-coordinate absolute chapter blocks. The requested virtual runway remains 100,000,000 px, but Chrome clamps actual element heights around 33.5M px, so the lab currently maps the virtual runway onto a 30,000,000 px browser-safe canvas with the seed chapter near the physical midpoint.
- Loaded chapter heights and top coordinates are recorded after measurement; add/remove now inserts/removes absolutely positioned chapter blocks instead of changing normal-flow layout.
- Minimap bricks now remain briefly as fading ghost blocks for about one second after their chapters unload, making removals visible instead of disappearing instantly.
- Added an experimental edge spring for true work boundaries. When the first or last chapter is loaded and scrolling drifts beyond the real work edge in the outward direction, V3 samples scroll velocity, emits edge spring telemetry, and animates `scrollTop` back to the valid boundary. The spring now cancels on jumps and when scrolling returns inside the valid work bounds.
- Fast internal-scroller automation is not yet proven because the available browser scroll command targets the page body, not the nested reader scroller. This needs Docker/POC Playwright or manual device/browser testing.

## Open Design Questions

- How should V3 map a 100,000,000 px logical runway onto browser-specific physical height limits on Safari/iOS versus Chrome?
- Should measured coordinates be persisted across sessions, or treated as per-viewport/runtime data because font metrics and reader width can change?
- How aggressive should preloading be for high-velocity scrolls: 10 screens, 25 screens, or adaptive based on observed velocity?
- On resize, should the lab fully re-seed from the current top/anchor chapter, or remeasure all loaded chapters and keep the current virtual origin?
