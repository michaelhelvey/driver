---
title: plugin-katex
status: todo
repo: plugin-katex
updated: 2026-11-17T20:54:00Z
---

A subagent audit found nothing broken today: just dead `jose` / font externals and two hook call sites in `src/config.ts`. No `node_modules` in the package, so every external has to come from pinion or the vendor bundle.

- [ ] bump pinion 2.x, drop the vendor bundle
- [ ] `vite.config.ts`: drop the externals list, add imported deps
- [ ] `src/config.ts:143,155` + test mocks to facade
- [ ] drop unused `katex/contrib` / `mhchem`
- [ ] example site verified
- [ ] PR merged
- [ ] release published
