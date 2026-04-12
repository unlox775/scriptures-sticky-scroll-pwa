# Module Visibility Story: `ui.readerEngine`

This document is the deep mechanism walkthrough for the reader engine that currently lives on the UI side of the architecture.

## 1) UI module role and boundary

This is a **UI module** because it directly owns browser geometry and scroll behavior (`scrollTop`, pixel thresholds, layout measurements, DOM insert/remove compensation).

### Owns

- Chapter sequence within a single work (for example Book of Mormon only).
- Which chapter chunks are currently rendered.
- Buffer policy around current viewport:
  - minimum: ~3 viewport heights above/below (`minScreens = 3`)
  - maximum: ~6 viewport heights before trimming (`maxScreens = 6`)
- Chapter load lifecycle:
  - attempt / success / failure / skip (cooldown, already-loaded, in-flight)
- Scroll anchor capture and jump alignment orchestration.

### Depends on
- UI-provided scroller/content handles.
- Data access/book cache module.

### Does not own
- Header buttons, user prompts, install UX, bookmark picker UX.
- Home/books/chapters/history view composition.

## 2) Why this module is still called out separately from `ui.readerView`

`ui.readerView` owns user-facing controls and panel composition. `ui.readerEngine` owns the continuous-scroll control loop and chapter window mechanics.

Both are UI modules today, but their responsibilities differ:

- `ui.readerView`: interaction shell and controls (open/start/stop/speed/navigation)
- `ui.readerEngine`: threshold checks, load/prepend/append/trim, anchor capture, continuity compensation

### Target split (future)
The long-term architecture can extract a browser-agnostic `backend.readerPlanner` (sequence planning/state transitions) and keep pixel/layout work in `ui.readerEngine`. That split does not exist yet and is tracked in refactors.

## 3) Why this is technically tricky

The reader is not just "append next chapter while scrolling." It is a control loop:

1. Measure dynamic runtime geometry (actual rendered heights).
2. Decide whether more content is needed above/below.
3. Load and insert chunks while preserving current reading position.
4. Trim excess chunks so memory/DOM does not grow forever.
5. Avoid oscillation (load-and-immediately-remove loops).

The hard parts are:

- **Runtime layout is dynamic**: line wrapping means chapter pixel heights are unknown until rendered.
- **Prepend compensation**: inserting content above shifts everything down; scrollTop must be compensated.
- **Trim compensation**: removing content above requires subtracting removed height from scrollTop.
- **Control-loop stability**: if trim policy is too eager, you can append then immediately trim and never advance.
- **Boundary semantics**: end-of-book is not end-of-work; Jacob -> Enos should keep flowing. Only end-of-work should stop.

---

## 4) Concrete scenario walkthrough (1 Nephi 4 -> 5 -> 6)

The numbers below are realistic example values for explanation. Actual values vary by device/font.

### 3.1 Scenario setup

- Work: Book of Mormon
- Start location: `1 Nephi 4` (mid-chapter)
- Chapters:
  - 1 Nephi 4: 38 verses
  - 1 Nephi 5: 22 verses
  - 1 Nephi 6: 6 verses
- Example viewport (`vh`): `852px` (large iPhone class)
- Buffer thresholds:
  - `minBuffer = 3 * 852 = 2556px`
  - `maxBuffer = 6 * 852 = 5112px`

Example rendered heights (illustrative):

- chapter 4 block: ~2518px
- chapter 5 block: ~1608px
- chapter 6 block: ~496px

Initial loaded set might be seq(4), seq(5), maybe seq(6) depending on prior steps.

### 3.2 Manual scroll down through chapter 4 toward chapter 5

As user scrolls downward, module repeatedly emits:

- `reader_buffer_state`
  - includes `topBuffer`, `bottomBuffer`, `minBuffer`, `maxBuffer`, `minSeq`, `maxSeq`, `scrollTop`

When `bottomBuffer < minBuffer`, loop emits threshold crossing then extends bottom:

1. `reader_buffer_threshold_crossed` (`direction=append`, includes `activeBuffer`, `threshold`)
2. `reader_chapter_load_attempt` for next seq
3. `reader_chapter_load_success` when inserted (`chapterPixelHeight`, `verseCount`)
4. next `reader_buffer_state` shows increased bottom context

If chapter was already present, expect:

- `reader_chapter_load_skip` with reason `already-loaded`

### 3.3 Crossing from chapter 5 to chapter 6

Because chapter 6 is short (6 verses), loop may load it early to satisfy min-buffer.

Expected healthy chain:

1. `reader_buffer_state` (bottomBuffer declining)
2. `reader_chapter_load_attempt` (target=1 Nephi 6)
3. `reader_chapter_load_success`
4. `reader_buffer_state` (bottomBuffer improved)

If still short, loop can immediately attempt next chapter in same pass.

### 3.4 Scrolling upward (hard direction)

When scrolling up and `topBuffer < minBuffer`, module emits threshold crossing then prepends previous chunks.

Process:

1. `reader_buffer_threshold_crossed` (`direction=prepend`)
2. Attempt prepend (`reader_chapter_load_attempt`, mode=prepend)
3. Insert chapter at top
4. Measure delta in `content.scrollHeight`
5. Increase `scroller.scrollTop` by delta (position compensation)

If prepend does not change min seq:

- `reader_buffer_blocked` (direction=prepend)

### 3.5 Trimming and anti-oscillation

After extensions, loop trims if buffers exceed max.

- Trim-top path:
  - remove first chunk
  - subtract removedHeight from scrollTop
- Trim-bottom path:
  - remove last chunk (no top compensation needed)

To prevent same-pass oscillation:

- if chunk was newly prepended/appended this pass, trim is skipped:
  - `reader_buffer_trim_skipped`

This guard directly addresses load-loop behavior where a new chapter could be dropped immediately.

### 3.6 Cross-book continuity

Sequence is chapter-by-chapter across all books in current work metadata. So:

- Jacob 7 -> Enos 1 is a normal next-seq load.
- Stop only when `maxSeq === sequence.length - 1`.

At true start/end limits, module emits:

- `reader_buffer_boundary` (`start-of-work` or `end-of-work`)

---

## 5) Event glossary for this module

- `reader_open_start` / `reader_open_ready` / `reader_open_fail`
- `reader_buffer_state`
- `reader_chapter_load_attempt`
- `reader_chapter_load_success`
- `reader_chapter_load_failure`
- `reader_chapter_load_skip`
- `reader_buffer_blocked`
- `reader_buffer_trim_skipped`
- `reader_chunk_trimmed`
- `reader_buffer_threshold_crossed`
- `reader_buffer_boundary`
- `reader_jump_attempt` / `reader_jump_done` / `reader_jump_fail`
- `reader_capture_anchor_miss`
- `reader_autoscroll_tick` (dev-sampled)

---

## 6) Healthy vs unhealthy signatures

### Healthy

- Repeating `reader_buffer_state` with occasional load successes near thresholds.
- `reader_chapter_load_skip` mostly `already-loaded` or short cooldown after real failure.
- Rare `reader_buffer_blocked` (transient), not sustained.

### Unhealthy

- Many `reader_chapter_load_attempt` + `failure` for same seq.
- Repeated `reader_buffer_blocked` same direction/target with no seq advancement.
- Frequent trim/load churn with no net seq progress.

Use `refs.seq`, `refs.bookId`, `refs.chapter`, and `details.state` to isolate where control loop lost forward progress.

---

## 7) Actionable debug checklist (layman walkthrough)

1. Open reader at `1 Nephi 4`, scroll near middle.
2. Confirm `reader_buffer_state` appears with:
   - `metrics.vh`
   - `metrics.minBuffer` and `metrics.maxBuffer`
   - `metrics.topBuffer` and `metrics.bottomBuffer`
3. Scroll down until `metrics.bottomBuffer` drops below `metrics.minBuffer`.
4. Confirm chain:
   - `reader_buffer_threshold_crossed` (`direction=append`)
   - `reader_chapter_load_attempt`
   - `reader_chapter_load_success` (inspect `chapterPixelHeight`, `verseCount`)
5. Keep scrolling down until trim occurs and confirm:
   - `reader_chunk_trimmed` with `metrics.removedHeight`
6. Scroll back up until `topBuffer < minBuffer` and confirm prepend chain:
   - `reader_buffer_threshold_crossed` (`direction=prepend`)
   - `reader_chapter_load_attempt` (mode=prepend)
   - `reader_chapter_load_success`
7. If progress stalls:
   - Check for repeated `reader_chapter_load_failure`
   - Check repeated `reader_buffer_blocked` same seq/direction
   - Check `reader_buffer_boundary` to ensure you are not at true end-of-work
