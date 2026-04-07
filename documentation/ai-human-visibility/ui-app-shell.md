# Module Visibility Story: `ui.appShell`

## Mechanism story
Bootstraps app startup, service worker registration, and install prompt handling.

## Signals to watch
- `app_init_start|app_init_complete|app_init_fail`
- `install_prompt_available|install_prompt_accepted|install_ios_instructions_shown`
- `service_worker_registered`
