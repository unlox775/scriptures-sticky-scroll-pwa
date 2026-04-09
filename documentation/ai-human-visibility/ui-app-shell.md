# Module Visibility Story: `ui.appShell`

## Module class
- **Type:** UI module
- **Owns browser pixels/DOM directly:** Yes (global shell, install button state, startup fallback UI)

## Mechanism story
`ui.appShell` is the global startup and shell coordinator. It initializes index data, binds global handlers, restores route state, registers service worker, and keeps install affordances coherent by platform context.

It is the module that decides whether users see the normal app, a restored route, or an initialization failure panel.

## Why this is tricky
- Startup is asynchronous and multi-stage; partial completion can leave shell in inconsistent state.
- Route restore and service worker registration are side effects that can fail independently.
- Install prompt behavior is platform-specific and event-driven.

## Detailed scenario walkthrough

### Scenario A: normal startup
1. App enters initialization -> `app_init_start`.
2. Index loads via backend data module.
3. Global event wiring completes.
4. Route is restored (or home rendered).
5. Service worker registration succeeds -> `service_worker_registered` (dev mode).
6. App finishes startup -> `app_init_complete`.

### Scenario B: startup failure
1. Startup begins -> `app_init_start`.
2. Any unrecoverable error throws.
3. `app_init_fail` emitted with `details.errorMessage`.
4. Shell renders fallback error panel.

## Signals to watch
- `app_init_start`
- `app_init_complete`
- `app_init_fail`
- `install_prompt_available`
- `install_prompt_accepted`
- `install_ios_instructions_shown`
- `service_worker_registered` (dev mode)

## Healthy sequence
`app_init_start` -> (routing/data events) -> `app_init_complete`

## Failure cues
- `app_init_fail` means startup aborted; inspect `errorMessage` and correlate with preceding backend events.

## Actionable debug checklist
1. Launch app with dev mode enabled and verify `app_init_start`.
2. Confirm startup reaches `app_init_complete`.
3. Trigger install prompt path (where supported) and verify install events.
4. Simulate or reproduce an init error and verify `app_init_fail` captures cause details.
