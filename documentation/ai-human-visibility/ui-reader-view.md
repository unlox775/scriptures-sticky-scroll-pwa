# Module Visibility Story: `ui.readerView`

## Mechanism story
`ui.readerView` is the orchestration shell around the reader engine. It owns the user-facing control states (open reader, start/stop auto-scroll, speed changes, chapter title context, back/home navigation), while `domain.readerEngine` owns the heavy control-loop logic.

In practice, `ui.readerView` is where the user can intentionally trigger transitions that should be visible in logs as high-level milestones.

## Why this is tricky
- User actions are asynchronous relative to the engine loop.
- A "reader opened" event can occur before buffer stabilization unless you wait for engine completion.
- Auto-scroll control events can be frequent; only state transitions should be high-signal at info level.

## Signals to watch
- `reader_open_start`
- `reader_open_ready`
- `reader_chapter_change`
- `reader_autoscroll_start`
- `reader_autoscroll_stop`
- `reader_autoscroll_speed_change` (dev mode)
- `reader_back_to_chapters`
- `reader_home_click`

## Healthy sequence (example)
1. `reader_open_start`
2. engine-side chapter/buffer events
3. `reader_open_ready`
4. optional `reader_autoscroll_start`
5. optional `reader_autoscroll_speed_change`
6. optional `reader_autoscroll_stop`

## Failure cues
- `reader_open_start` without `reader_open_ready` => correlate with `domain.readerEngine` load/jump failures.
- repeated start/stop chatter without anchor progression => control state mismatch or stalled engine.
