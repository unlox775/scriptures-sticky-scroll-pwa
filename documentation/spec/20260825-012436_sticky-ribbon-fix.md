# Sticky Ribbon Fix Spec

**Created:** 2026-08-25 01:24 UTC  
**Status:** ✅ Complete  
**PR:** [#5](https://github.com/unlox775/scriptures-sticky-scroll-pwa/pull/5)

## Problem

The sticky verse/bookmark ribbon in reader mode drifts partially off-screen during scrolling (both manual and auto-scroll), then drifts back. This breaks the illusion that it's "following" the user.

## Goal

Fix the ribbon's sticky positioning so it:
1. **While sticky:** stays fully visible at its topmost on-screen point, never leaving the viewport
2. **While not sticky:** scrolls off normally with its verse
3. **Maintains:** the existing bounce/slide animation when transitioning between verses

## Progress

✅ Prompt logged to spec file  
✅ Investigated ribbon implementation in src/views/readerView.js  
✅ Reproduced drift behavior on live GitHub Pages  
✅ Implemented minimal fix with STICKY_RIBBON_TOP_INSET  
✅ Tested with computerUse subagent and captured screenshots  
✅ Opened pull request #5

## Changes Made

### Code Changes
- **src/views/readerView.js**: Added `STICKY_RIBBON_TOP_INSET = 8` constant and clamping logic
  - When ribbon is sticky (active), applies `Math.max(STICKY_RIBBON_TOP_INSET, top)` to prevent negative positioning
  - Ensures sticky ribbon never drifts above 8px from viewport top
  - Preserves existing CSS transition animation for verse-to-verse bounce/slide

### Build Artifacts
- **docs/**: Updated build artifacts from `npm run build`
- **documentation/spec/**: Added spec and prompt log files

## Testing Results

### Verified Behavior
✅ Sticky ribbon stays fully visible at topmost point during scroll  
✅ Verse-to-verse bounce/slide animation preserved  
✅ Non-sticky ribbons still scroll away normally  
✅ No regressions in existing functionality

### Test Artifacts
- Compared live GitHub Pages (before) vs local dev server (after)
- Screenshots captured showing drift elimination
- Verified smooth transitions and non-sticky behavior

## Technical Details

The fix works by:
1. Calculating the verse's natural ribbon position: `verseRect.top - scrollerRect.top + paddingTop + lineHeight * 0.2`
2. Checking if the ribbon is in sticky mode: `bookmark.id === activeStickyBookmarkId`
3. Clamping to minimum 8px when sticky: `Math.max(STICKY_RIBBON_TOP_INSET, top)`
4. CSS transitions (`transition: top 180ms ease`) provide smooth animation between positions

This ensures sticky ribbons stay visible while preserving the bounce animation when the active verse changes.
