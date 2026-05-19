# Non-Verse Sacred Text

**Prompt slug:** `non-verse-sacred-text`  
**Started:** 2026-05-19  
**Last updated:** 2026-05-19

See `20260519-181520_non-verse-sacred-text-PROMPT.txt` for the raw prompt history.

## Problem

Some sacred text in the standard works is not currently represented in the reader because the app normalizes and renders verse records only. Examples include the short chapter prefaces at the top of some Book of Mormon chapters, such as Alma 33, Alma 34, and Alma 36.

These passages are not footnotes or modern study helps. They are part of the scripture text experience and need first-class representation once a source is available.

## Current Understanding

### ✅ Done

- Created this dedicated spec and prompt log so the non-verse sacred text work is tracked separately from existing specs.
- Audited the current data build path. `scripts/build-scripture-data.mjs` normalizes only `chapter.verses` / `section.verses` into the app payload.
- Audited the installed `@bencrowder/scriptures-json` package. Its helper scripts know how to copy optional `heading` fields, and the Book of Mormon JSON does include some book/chapter heading fields.
- Confirmed the current build drops available source fields such as `book.heading`, `book.full_title`, `book.full_subtitle`, and `chapter.heading`.
- Confirmed the known Alma source split: Alma 36 includes `chapter.heading` (`The commandments of Alma to his son Helaman.`), while Alma 33 and Alma 34 have only `chapter`, `reference`, and `verses` in the installed package.
- Audited the reader assumptions. `src/scriptureScroller.js`, `src/views/readerView.js`, and `src/scrollerLab.js` currently locate display/anchor/bookmark targets through `.lab-verse` elements and numeric `data-verse` values.
- Identified the "Alma to his son" chapter headings in the current package:
  - Alma 36: `The commandments of Alma to his son Helaman.`
  - Alma 38: `The commandments of Alma to his son Shiblon.`
  - Alma 39: `The commandments of Alma to his son Corianton.`
- Implemented ordered `chapter.blocks` output in `scripts/build-scripture-data.mjs`, preserving available book titles, subtitles, book headings, chapter headings, and verse blocks.
- Updated `src/scriptureScroller.js` to render shared `.scripture-block` elements, including non-verse heading/title/subtitle blocks.
- Updated anchor detection, unload anchoring, scroller lab diagnostics, and bookmark ribbon lookup to use shared scripture blocks while preserving direct verse targeting.
- Fixed stale book payload caching by versioning generated book URLs from `data/index.json` and fetching book payloads with `cache: "no-cache"`.
- Browser-verified `scroller-lab.html#/alma/36/1` renders `The commandments of Alma to his son Helaman.` above Alma 36:1.

### 🚧 In Progress / Placeholders

- Determine whether non-verse sacred text occurs only at chapter boundaries or can appear inside a chapter body.
- Acquire or generate a supplemental source for missing blocks that are not present in the package, including the requested Alma 33 and Alma 34 top-of-chapter text if confirmed as in scope.

## Findings

### Source Data

The current app output is effectively verse-only because the build script keeps only `verses`. The raw Book of Mormon JSON is richer than the generated app payload: it includes `full_title`, `full_subtitle`, and `heading` fields on some books, plus `heading` fields on some chapters.

However, the source coverage is partial. Alma 36 has a `chapter.heading` value, but Alma 33 and Alma 34 do not. The package's own `scripts/make-flat.py` and `scripts/make-reference.py` contain conditional support for headings, so the format can represent this class of text when it is present.

Implication: this work has two layers:

- Preserve available non-verse text already present in `@bencrowder/scriptures-json`.
- Add a richer upstream or local supplemental source for missing chapter prefaces/summaries not present in the package.

### Reader Model

The infinite scroller loads and unloads whole chapters. That is good news: if the missing text belongs at the start of a chapter, it can be added inside the chapter DOM without changing chapter-level preload/unload boundaries.

The fragile part is not chapter loading; it is the assumption that every meaningful reader anchor is a numbered verse. Current behavior depends on:

- `renderChapter()` rendering only `chapter.verses`.
- `alignToVerse()` targeting `.lab-verse[data-verse="N"]`.
- `findAnchor()` and scroller lab telemetry choosing the nearest `.lab-verse`.
- Bookmark ribbons resolving only to `.lab-verse[data-verse="N"]`.

### Recommended Model

Use ordered chapter content blocks while keeping `verses` available for compatibility:

```js
{
  chapter: 33,
  reference: "Alma 33",
  blocks: [
    {
      type: "heading",
      role: "chapter-preface",
      key: "chapter-heading",
      reference: "Alma 33",
      text: "..."
    },
    {
      type: "verse",
      key: "verse-1",
      verse: 1,
      reference: "Alma 33:1",
      text: "..."
    }
  ],
  verses: [...]
}
```

This keeps the scroller's chapter-window architecture intact. The chapter is still the unit of loading, measuring, preloading, and unloading, but the rendered chapter body is now an ordered list of content blocks instead of a verse-only list.

### Placement Guidance

For the known Alma examples, prefer treating the preface as part of the chapter it introduces, before verse 1. Do not attach it to the previous chapter: that would make direct navigation to the chapter miss part of its opening sacred text, and it would complicate cross-book/chapter boundaries.

Only introduce a separate "mid-chapter gap" concept if source audit proves that non-verse sacred text can appear between numbered verses. Even then, it should still be represented as a block inside the owning chapter, not as a separate loading unit.

### UI / Behavior Notes

- Render non-verse sacred text with a distinct class, for example `.scripture-block-heading`, but include a shared block class such as `.scripture-block` for anchor detection.
- Update anchor detection to choose nearest `.scripture-block`, then report a verse reference when the block is a verse and a chapter-level reference when it is a heading.
- Keep direct verse routes unchanged. `#/alma/33/1` should still align to verse 1, while a future chapter-only route could align to the chapter preface/header.
- Bookmarks should continue to target verses first. If chapter-level bookmarks are added later, they can target a block key rather than overloading `verse: 0`.
- External links can stay chapter-level for non-verse blocks.

### ⏭️ Next Actions

- Identify the authoritative source for the missing chapter prefaces/superscriptions and confirm license/usage constraints.
- Build a source audit list: all non-verse sacred text blocks currently present in `@bencrowder/scriptures-json`, all known missing blocks, their references, and whether each appears before verse 1 or between numbered verses.
- Add focused tests around Alma 36/38/39 and any supplemental Alma 33/34 text once the source text is available.
