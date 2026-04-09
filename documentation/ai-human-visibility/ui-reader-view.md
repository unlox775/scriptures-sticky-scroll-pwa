# Module Visibility Story: `ui.readerView` (UI module)

## Module type and boundary
- **Type:** UI module
- **Owns:** reader panel composition, reader control interactions, and UI-level navigation actions from reader context.
- **Does not own:** pixel-threshold buffering logic (owned by `ui.readerEngine`) or backend data/routing/bookmark persistence contracts.

## Mechanism story
`ui.readerView` is the visual coordinator for reading interactions. It controls:

- entry into reader mode from navigation/bookmark flows
- reader toolbar actions (auto-scroll start/stop/speed)
- reader-level navigation (back to chapters, home)
- display-level context updates (chapter header/status surfaces)

This module does **not** decide pixel-threshold logic itself; it coordinates with `ui.readerEngine` for scroll mechanics and backend modules for state/persistence. Its job is to ensure UI intent and UI state transitions are explicit and observable.

## Why this is tricky
- UI controls are asynchronous around backend operations.
- A user action can succeed in the UI and fail in backend prep (for example load failure).
- Rapid toggle actions can create noisy control chatter unless interpreted as state transitions.

## In-depth scenario walkthrough

### Scenario A: open reader from chapter tile
1. User taps chapter tile in `ui.chaptersView`.
2. `ui.readerView` begins opening and emits `reader_open_start`.
3. `ui.readerEngine` performs load/jump preparation.
4. UI transitions to active reader state and emits `reader_open_ready`.

Expected evidence:
- `reader_open_start` then `reader_open_ready`
- optional `reader_chapter_change` soon after anchor stabilizes

### Scenario B: auto-scroll control cycle
1. User taps auto-scroll start.
2. UI emits `reader_autoscroll_start` with speed.
3. User adjusts speed slider.
4. UI emits `reader_autoscroll_speed_change` (dev-mode gated).
5. User taps stop.
6. UI emits `reader_autoscroll_stop`.

Expected evidence:
- start -> optional speed changes -> stop
- no duplicate start without intervening stop under normal usage

## Signals to watch
- `reader_open_start`
- `reader_open_ready`
- `reader_chapter_change`
- `reader_autoscroll_start`
- `reader_autoscroll_stop`
- `reader_autoscroll_speed_change`
- `reader_back_to_chapters`
- `reader_home_click`

## Healthy sequence
Open flow:
1. `reader_open_start`
2. backend reader prep events
3. `reader_open_ready`

Control flow:
1. `reader_autoscroll_start`
2. zero or more `reader_autoscroll_speed_change`
3. `reader_autoscroll_stop`

## Failure cues
- `reader_open_start` without `reader_open_ready`: backend prep failure or unresolved load/jump path.
- repeated start/stop toggles without backend anchor movement: likely control misuse or stalled backend loop.

## Actionable debug checklist
1. Trigger reader open from chapters and verify start/ready pair.
2. Trigger auto-scroll start, change speed twice, stop; verify ordered control events.
3. If open never reaches ready, correlate with `ui.readerEngine` failures in the same time window.
