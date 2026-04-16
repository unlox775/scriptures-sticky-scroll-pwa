# React Rebuild Follow-up TODOs

This list intentionally captures deferred features after the broad React rewrite.
These are **not** implemented in this pass; current priority is stable infinite
scroll across all books within a selected work.

## Priority: immediate after stable work-level infinite scroll

- [ ] Re-add current reading anchor tracking (for example 25% viewport probe) and show "current at" reference in UI.
- [ ] Re-add sticky bookmark ribbons/markers in reader viewport.
- [ ] Re-add bookmark auto-follow update logic tied to anchor changes.
- [ ] Re-add explicit auto-scroll controls (start/stop/speed) with safe manual-override behavior.

## Priority: developer diagnostics and observability parity

- [ ] Rebuild debug drawer (storage/logs/objects/visibility) as React components.
- [ ] Reconnect visibility module toggles and verbosity presets to React runtime flow.
- [ ] Re-add session log viewer controls (filters, session picker, copy visible/full/AI-share).
- [ ] Re-validate telemetry event coverage against `documentation/ai-human-visibility/*.md`.

## Priority: routing/session continuity parity

- [ ] Reintroduce persisted route/UI session restore (`last screen`, debug drawer state, active debug tab).
- [ ] Re-enable history route restore and deep-link behavior where required.

## Priority: reader behavior hardening

- [ ] Add prepend support for reverse scrolling (load previous chapter/book when scrolling upward).
- [ ] Add buffer trimming policy to cap DOM size during very long reading sessions.
- [ ] Add reader integration tests for cross-book transitions (Mosiah -> Alma and similar boundaries).

