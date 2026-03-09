# Layout Modes (Visual Description)

## Mode 1: Home

```
+------------------------------------------------------+
| Header: [Home] Scripture Reader                      |
+------------------------------------------------------+
| Scripture Collections                                |
| [Book of Mormon] [Old Testament] [New Testament] ... |
|                                                      |
| Bookmarks                                            |
| - Daily Reading    1 Nephi 7:12   [Set Active][Open] |
|   history: 2026-03-09 -> 1 Nephi 7:12                |
| - Family Study     Alma 5:14      [Set Active][Open] |
+------------------------------------------------------+
```

- Main purpose: quickly jump to collections or resume bookmark locations.

## Mode 2: Browse Books (Drill-Down)

```
+------------------------------------------------------+
| Header: [Home] Book of Mormon > Books                |
+------------------------------------------------------+
| [1 Nephi] [2 Nephi] [Jacob] [Enos] ...               |
| (book tiles with chapter counts)                     |
+------------------------------------------------------+
```

- Main purpose: choose a specific book in the selected standard work.

## Mode 3: Chapter Tile Grid

```
+------------------------------------------------------+
| Header: [Home] Book of Mormon > 1 Nephi > Chapters   |
+------------------------------------------------------+
| [1] [2] [3] [4] [5] [6] [7] ...                     |
| (compact grid tiles, not a long vertical list)       |
+------------------------------------------------------+
```

- Main purpose: jump to a chapter quickly.

## Mode 4: Reader (Infinite Scroll + Auto-Scroll)

```
+------------------------------------------------------+
| Header: [Home] Book of Mormon > 1 Nephi              |
+------------------------------------------------------+
| Bookmark: [Daily Reading v] [+ New] [Chapters]       |
| [Start Auto-Scroll] -> expands to:                   |
| [STOP] [Speed slider ---------------------] 90 px/s  |
| Reference: 1 Nephi 7:12        Bookmark follow: on   |
+------------------------------------------------------+
| Reader viewport (scrollable):                        |
|                                                      |
|   1 Nephi 7                                          |
|   1 ...                                              |
|   2 ...                                              |
|   3 ...                                              |
|                                                      |
|   (continuous chapter loading above/below)           |
|                                                      |
|   1 Nephi 8                                          |
|   ...                                                |
+------------------------------------------------------+
```

### Anchor Behavior

- The app tracks the verse near **25% from top** of the reading viewport as the current reading point.
- When chapters are added/removed above or below, scroll offset is corrected to keep the reading anchor stable.
- On orientation change / resize, the same reference is re-positioned back to ~25% from top.
