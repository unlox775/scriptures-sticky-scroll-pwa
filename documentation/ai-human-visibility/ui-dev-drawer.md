# Module Visibility Story: `ui.devDrawer`

## Module type
**UI module** (debug surface component)

## Mechanism story
`ui.devDrawer` is the human-visible diagnostics panel. It does not create telemetry;
it is the place where telemetry is inspected and exported. It owns:

- opening/closing the drawer
- switching tabs (Storage vs Logs)
- selecting log sessions
- copying logs for AI/human troubleshooting

The module’s value is operational: when something is unclear in runtime behavior,
this is where you capture a bounded evidence package.

## Why this is tricky
- live log streams can race with session selection changes
- copy/export actions must preserve context (which session was selected)
- debug UX should help, not add noise; events should represent deliberate user actions

## Exhaustive walkthrough

### Scenario A — Open drawer and inspect latest session
1. User taps bug icon.
2. Drawer opens on active tab.
3. If Logs tab is selected, module loads sessions and defaults to latest.
4. User changes session selection to an older run.
5. Viewer refreshes entries for that session.

Expected events:
- `debug_drawer_open`
- `debug_tab_change` (if tab switched)
- `debug_session_select`

### Scenario B — Export logs for AI debugging
1. User selects target session in Logs tab.
2. User taps Copy logs.
3. Clipboard write succeeds or fails.

Expected events:
- `debug_copy_logs` (success path, includes selected session + entry count)
- OR `debug_copy_logs_failed` (failure path)

## Signals to watch
- `dev_mode_enabled`
- `debug_drawer_open`
- `debug_drawer_close`
- `debug_tab_change`
- `debug_session_select`
- `debug_copy_logs`
- `debug_copy_logs_failed`

## Healthy sequence
`debug_drawer_open` -> optional `debug_tab_change` -> optional `debug_session_select` -> optional `debug_copy_logs`

## Failure cues
- repeated copy failures => clipboard permissions/environment issue
- session changes without visible entry refresh => rendering or data-binding issue in log panel

## Actionable debug checklist
1. Enable dev mode and open drawer; confirm `debug_drawer_open`.
2. Switch tabs twice; confirm `debug_tab_change` per switch.
3. Select a non-latest session; confirm `debug_session_select`.
4. Copy logs and confirm either `debug_copy_logs` or `debug_copy_logs_failed`.

## Operator quick-start (how to turn logging on)
1. Open **Visibility** tab in the debug drawer.
2. Check the module(s) you want (`ui.readerView`, `ui.readerEngine`, etc.).  
   - Any checked module auto-enables global visibility.
3. Pick verbosity:
   - `minimal`: milestones and high-level lifecycle events
   - `standard`: normal debugging flow (default for most investigations)
   - `deep`: high-detail loop diagnostics (buffer/anchor/control-loop detail)
4. Switch to **Logs** tab and interact with the app (scroll/open/close/navigate).
5. Confirm the selected log session is the latest one (top of session selector).
