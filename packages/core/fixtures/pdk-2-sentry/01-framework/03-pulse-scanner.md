---
title: pulse-scanner
status: doing
repo: t4-pulse-dashboard
updated: 2026-11-18T11:20:00Z
---

`packages/core/src/scanner/platform-awareness.ts` needs to know that pdk 2.x has no std-deps layer, and about the new telemetry layer. Otherwise Pulse flags every migrated repo as "missing std-deps".

- [x] scanner recognizes pdk 2.x
- [ ] stop flagging missing std-deps on 2.x
- [ ] report telemetry layer version
- [ ] alpha verified
- [ ] PR merged
- [ ] beta deploy green
