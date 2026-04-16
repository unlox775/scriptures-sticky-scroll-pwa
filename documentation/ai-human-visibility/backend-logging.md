# Module Visibility Story: `backend.logging`

## Module type and boundary
- **Type:** Backend module
- **Owns:** structured event envelope normalization, log session persistence contracts, session retrieval, and bounded export payloads for debugging and AI sharing.
- **Does not own:** UI rendering of logs, filter controls, or any user-facing debug panel composition.

## Mechanism story
`backend.logging` is the diagnostics data pipeline for this app:

1. Runtime producers emit structured telemetry (`module`, `event`, `summary`, optional `metrics/refs/details`).
2. Logger normalizes payload shape and writes entries into the active session in IndexedDB.
3. Debug UI loads sessions and entries for in-app browsing/filtering.
4. Copy/export helpers produce bounded payloads (`getLogsForCopy`, `getLogsForAiShare`) to support AI-human debugging handoff.

## Why this is tricky
- Legacy, non-structured log calls must still be ingested safely.
- Logging must not break core app behavior if persistence fails.
- Export payloads must stay bounded and machine-usable.
- Session lifecycle must remain stable across refreshes and app restarts.

## Scenario walkthrough

### Scenario A: Standard structured event lifecycle
1. Module emitter calls logger with structured telemetry envelope.
2. Logger normalizes and appends event to current session.
3. Debug drawer log viewer reads session entries and shows module/event sequence.

Expected event story:
- Producer event (for example `ui.readerEngine` `reader_buffer_state`)
- Persisted entry appears in selected session

### Scenario B: Legacy fallback event
1. Legacy call arrives without explicit module/event fields.
2. Logger normalizes event to fallback module `backend.logging` and event `legacy_log`.
3. Entry remains searchable/filterable in debug log viewer.

### Scenario C: AI-share export
1. User triggers `Copy AI-share`.
2. Logger gathers current/selected session entries via `getLogsForAiShare`.
3. Export payload includes `version`, `channel`, `retrievalReady`, session metadata, and entries.

## Signals to watch
- Structured entries with explicit `module/event` fields.
- Fallback `backend.logging / legacy_log` entries (should be rare over time).
- Export payload envelope fields (`version`, `channel`, `retrievalReady`).

## Healthy sequence
- Session exists and accepts entries throughout runtime.
- Structured entries dominate.
- Export functions return consistent JSON envelope with bounded list of entries.

## Failure cues and likely causes
- Missing entries in viewer after known actions -> persistence/read path issue.
- High volume of `legacy_log` -> producer modules bypassing telemetry envelope.
- Export missing session metadata -> logger session lookup drift.

## Actionable debug checklist
1. Trigger a few known UI actions and confirm corresponding structured entries exist.
2. Verify module filter includes backend and UI module IDs.
3. Use "Copy full" and "Copy AI-share" and confirm payload contains session metadata and entries.
4. Confirm fallback `legacy_log` entries are minimal and targeted for future cleanup if they grow.
