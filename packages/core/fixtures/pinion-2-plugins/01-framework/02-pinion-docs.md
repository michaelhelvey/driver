---
title: pinion-docs
status: needs-you
ask: "review #17 — docs only, 4 files"
repo: pinion-docs
pr: "#17"
updated: 2026-11-19T06:15:00Z
---

`guides/writing-plugins/*` still taught authors to import `KIT_EXTERNALS`. Anyone following it on a pinion 2.x plugin would write a build config that doesn't compile.

## what changed

- `guides/writing-plugins/index.md` — bundling section rewritten
- `guides/writing-plugins/build.md` — externals list removed
- `guides/writing-plugins/hooks.md` — new: manifest `hooks` + the facade
- `guides/writing-plugins/vendor.md` — deleted

## verification

~~~sh
rg -n "KIT_EXTERNALS|vendor bundle|vendorDeps" guides/
# → no matches
~~~

- [x] PR open
- [ ] **you:** review #17
- [ ] PR merged
