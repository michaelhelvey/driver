---
title: plugin-images
status: needs-you
ask: image plugin cold build +290ms — keep 500ms reserve, or drop to 200ms?
repo: plugin-images
pr: "#140"
updated: 2026-11-19T07:02:00Z
---

The example site builds and page context flows end to end, resize → srcset. But the plugin's cold build regressed.

- before: **652ms** init (pinion 2.0, no reserve)
- now: **941ms** init with `HOOK_TIMEOUT_RESERVE_MS=500`
- with `200`: **688ms**, measured on the 2,000-image fixture site

## options

1. **keep 500ms.** safest; error reports survive even a slow asset server. +290ms on every cold build.
2. **drop to 200ms.** p99 asset server RTT on the CI runners is 140ms over the last week. we'd lose an error report on a very bad day.

I'd pick **200ms**. Error reporting is best-effort by design, and image builds are on every page.

## progress

- [x] both entry points: manifest `hooks`, drop hand-set env + `overrides.sandbox`
- [x] resize worker: delete `src/hooks.ts`, use facade
- [ ] shrink `HOOK_TIMEOUT_RESERVE_MS`, re-measure on the fixture site
- [x] resize: cherry-pick context commits (`5be21c0`, `e8d4a17`, `0f93c6b`)
- [x] srcset: cherry-pick `pageMeta` (`9a6e3d2`)
- [ ] delete `async-thumbnails` after merge
- [ ] example site verified
- [ ] PR merged
- [ ] release published
