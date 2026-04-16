# AI-to-Human Visibility — Module Story Library

This folder is the runtime explanation corpus for the app. It intentionally separates modules into two explicit types:

1. **UI modules** (front-end, browser/visual concerns)
2. **Backend modules** (app logic and data behavior, expected to stay UI-agnostic)

This naming is deliberate: we avoid hand-wavy "domain" labels in module IDs and docs where that obscures the front-end/back-end split.

## Core definitions (razor-sharp)

### UI module
A module is a UI module if it owns or directly reasons about browser/visual concerns, including any of:
- pixels, heights, widths, viewport
- scrollTop/DOM layout measurements
- click/gesture/input handlers
- direct DOM rendering and visual component state

UI modules are integration-testable in browser context; they are not expected to be browser-agnostic.

### Backend module
A module is a backend module if it owns application logic/state transitions/data contracts and can be reasoned about independently of browser geometry.

Backend modules **must not** use visual primitives (pixels, scroll offsets, DOM geometry) in their conceptual contract. They should be unit-testable without a browser runtime.

### Current architectural reality note
The current `readerEngine` implementation is classified as a **UI module** because it directly owns viewport geometry and scroll compensation behavior (`scrollTop`, measured heights, DOM insertion/removal).  
A future split may extract a browser-agnostic backend planner, but that backend module does not exist yet.

## Why this format

Visibility docs are only useful if they help a human understand:

1. what the module is doing over time,
2. why that behavior is tricky,
3. what exact actions to perform to trigger behavior,
4. what exact events/metrics should appear in logs, and
5. what abnormal sequences imply.

A single summary table cannot carry that burden for complex mechanisms.

## Required depth contract for each module file

Every module file must include:

1. **Mechanism story** (full narrative, not one-paragraph shorthand)
2. **Why this is tricky**
3. **Scenario walkthrough(s)** with concrete values/actions
4. **Expected event chain** (healthy)
5. **Failure cues and interpretation**
6. **Actionable debug checklist**
7. **Module boundary statement** (what belongs in this module vs adjacent modules)

If a file only lists event names without explaining behavior flow, it fails this standard.

## Current module docs

### UI modules

- `ui-app-shell.md`
- `ui-home-view.md`
- `ui-books-view.md`
- `ui-chapters-view.md`
- `ui-reader-view.md`
- `ui-reader-engine.md`
- `ui-history-view.md`
- `ui-dev-drawer.md`

### Backend modules

- `backend-routing.md`
- `backend-data-access.md`
- `backend-bookmarks.md`
- `backend-ui-session-state.md`

