# Module Visibility Story: `ui.homeView`

## Mechanism story
`ui.homeView` renders the launch surface: works and bookmark cards. It dispatches user intent toward work drill-down, bookmark-open, or history.

## Signals to watch
- `home_render_done`
- `home_open_work_click`
- `home_open_bookmark_click`
- `home_view_history_click`

## Healthy sequence
render_done then user intent clicks into downstream view/module events.
