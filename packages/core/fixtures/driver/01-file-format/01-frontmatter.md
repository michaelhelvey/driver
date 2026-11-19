---
title: frontmatter fields
status: done
updated: 2026-11-19T06:10:00Z
---

Kept it small. Everything else goes in the body.

- `title` — required
- `status` — `todo` · `doing` · `needs-you` · `blocked` · `done` · `skipped`
- `ask` — one line, only when `needs-you`
- `blocked_on` — one line, free text
- `blocked_by` — a task id like `03.1`, optional
- `repo`, `pr`, `updated` — optional

Step progress (`2/5`) isn't a field: it's counted from the `- [ ]` / `- [x]` lines in the body.
