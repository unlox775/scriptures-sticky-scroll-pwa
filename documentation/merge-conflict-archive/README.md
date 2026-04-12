## Merge Conflict Archive

This folder preserves snapshots from the `origin/main` merge conflict triage so the branch can move forward while keeping a forensic trail.

### Layout

- `current-branch/`  
  The `:2` side from Git merge index (this branch's conflicted versions).
- `origin-main/`  
  The `:3` side from Git merge index (`origin/main` conflicted versions).
- `working-conflict/`  
  The conflict-marked working-tree files (with conflict markers) captured before final conflict picks.

These snapshots are intentionally committed for later review during planned code rewrite/refactor passes.
