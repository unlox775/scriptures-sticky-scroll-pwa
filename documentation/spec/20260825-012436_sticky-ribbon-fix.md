# Sticky Ribbon Fix Spec

**Created:** 2026-08-25 01:24 UTC  
**Status:** 🚧 In progress

## Problem

The sticky verse/bookmark ribbon in reader mode drifts partially off-screen during scrolling (both manual and auto-scroll), then drifts back. This breaks the illusion that it's "following" the user.

## Goal

Fix the ribbon's sticky positioning so it:
1. **While sticky:** stays fully visible at its topmost on-screen point, never leaving the viewport
2. **While not sticky:** scrolls off normally with its verse
3. **Maintains:** the existing bounce/slide animation when transitioning between verses

## Progress

✅ Prompt logged to spec file  
🚧 Investigating ribbon implementation  
⏭️ Reproduce the drift behavior  
⏭️ Implement fix  
⏭️ Test with screenshots  
⏭️ Open pull request

## Changes Made

(To be updated as work progresses)

## Next Actions

- Investigate ribbon code in src/ files
- Check scroller-lab.html and scroller-v3-lab.html
- Run app and reproduce drift
- Implement minimal fix
- Test and document with screenshots
