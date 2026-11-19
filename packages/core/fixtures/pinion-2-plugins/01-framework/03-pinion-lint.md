---
title: pinion-lint
status: doing
repo: pinion-lint
updated: 2026-11-18T11:20:00Z
---

`src/rules/plugin-shape.ts` needs to know that pinion 2.x has no vendor bundle, and about the new sandbox. Otherwise the linter flags every migrated plugin as "missing vendor bundle".

- [x] linter recognizes pinion 2.x
- [ ] stop flagging a missing vendor bundle on 2.x
- [ ] report sandbox version
- [ ] example site verified
- [ ] PR merged
- [ ] release published
