# AI-to-Human Visibility — Module Story Library

This folder replaces the single-file visibility spec with a module-by-module story set.

## Why this format

Visibility docs are only useful if they help a human understand:

1. what the module is doing over time,
2. why that behavior is tricky,
3. what exact actions to perform to trigger behavior,
4. what exact events/metrics should appear in logs, and
5. what abnormal sequences imply.

A single summary table cannot carry that burden for complex mechanisms (especially infinite scrolling).

## How to use this folder

- Start with this README for envelope contract and global guidance.
- Then read module docs (one file per module).
- For complex modules, follow scenario walkthroughs exactly and compare your captured logs against expected event chains.

## Document contract for each module file

Every module file should include:

1. **Mechanism story**
2. **Why this is tricky**
3. **Scenario walkthrough(s)** with concrete numbers/actions
4. **Expected event chain** (healthy)
5. **Failure cues and interpretation**
6. **Actionable debug checklist**

## Current module docs

### UI

- `ui-reader-view.md`
- `ui-home-view.md`
- `ui-books-view.md`
- `ui-chapters-view.md`
- `ui-history-view.md`
- `ui-dev-drawer.md`
- `ui-app-shell.md`

### Domain

- `domain-reader-engine.md`
- `domain-routing.md`
- `domain-data-access.md`
- `domain-bookmarks.md`

