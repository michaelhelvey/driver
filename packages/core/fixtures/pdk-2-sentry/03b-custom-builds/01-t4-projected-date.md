---
title: t4-projected-date
status: todo
repo: t4-projected-date
updated: 2026-11-17T20:54:00Z
---

A subagent audit found nothing broken today: just dead `jose` / otel externals and two Sentry call sites in `src/config.ts`. No `node_modules` in the zip, so every external has to come from the runtime or a layer.

- [ ] bump pdk 2.x, drop the std-deps layer
- [ ] `vite.config.ts`: drop the externals list, add imported deps
- [ ] `src/config.ts:143,155` + test mocks to facade
- [ ] drop unused powertools `event-handler` / `parameters`
- [ ] alpha verified
- [ ] PR merged
- [ ] beta deploy green
