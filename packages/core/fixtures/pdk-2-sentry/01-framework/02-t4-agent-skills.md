---
title: t4-agent-skills
status: needs-you
ask: "review #31 — docs only, 4 files"
repo: t4-agent-skills
pr: "#31"
updated: 2026-11-19T06:15:00Z
---

`skills/platform-framework/*` still taught agents to import `FRAMEWORK_EXTERNALS`. Any agent following it on a pdk 2.x repo would write a build config that doesn't compile.

## what changed

- `skills/platform-framework/SKILL.md` — bundling section rewritten
- `skills/platform-framework/reference/build.md` — externals list removed
- `skills/platform-framework/reference/sentry.md` — new: `sentryDSN` + the facade
- `skills/platform-framework/reference/layers.md` — deleted

## verification

~~~sh
rg -n "FRAMEWORK_EXTERNALS|std-deps|stdDeps" skills/
# → no matches
~~~

- [x] PR open
- [ ] **you:** review #31
- [ ] PR merged
