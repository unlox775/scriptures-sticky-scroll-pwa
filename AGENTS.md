**ALWAYS APPEND NEW USER PROMPTS TO THE ACTIVE PROMPT LOG BEFORE MAKING CHANGES.**
**ALWAYS RUN `npm run build` (OR REQUESTED BUILD CMD) AND COMMIT RESULTING CHANGES AFTER EVERY CODE UPDATE, UNLESS THE USER EXPLICITLY ASKS YOU NOT TO.**

# Collaboration Playbook

This file documents how we keep human + agent collaboration transparent and auditable.

## Spec & Prompt Logging

- Maintain spec/prompt pairs under `documentation/spec/` (e.g., `20260309-120000_scripture-pwa-standard-works.*`).
- Every material update must append to the corresponding pair under `documentation/spec/`:
  - `YYYYMMDD-HHMMSS_slug.md` — living Markdown changelog describing what changed, what remains undone, and follow-up actions.
  - `YYYYMMDD-HHMMSS_slug-PROMPT.txt` — plaintext transcript capturing **every** user prompt or follow-up, appended newest-last and kept verbatim (no formatting edits). Captures the whole agentic process.
- Use 24-hour UTC timestamps (retrieved via `date -u +%Y%m%d-%H%M%S`) to keep ordering unambiguous.
- Slugs should be short and hyphenated (e.g., `scripture-pwa-standard-works`).
- For each new instruction, append the raw transcript to the prompt log before writing code.
- Spec files should clearly list:
  - ✅ Done (call out tangible code or configuration changes)
  - 🚧 In progress / placeholders
  - ⏭️ Next actions or dependencies

## Status Reporting

- `documentation/README.md` holds the live traffic-light view of feature readiness. Update it whenever a status meaningfully changes.
- Architecture and design notes live under `documentation/` (e.g., `documentation/architecture.md`, `documentation/layout_modes.md`).

## Source Layout Conventions

- Build artifacts for GitHub Pages live in `docs/`.
- Runtime source: `src/` (main.js, bookmarks.js, data.js, readerEngine.js, styles.css).
- Data pipeline: `scripts/build-scripture-data.mjs`; outputs to `public/data/`.
- Specs and prompt logs: `documentation/spec/`.
