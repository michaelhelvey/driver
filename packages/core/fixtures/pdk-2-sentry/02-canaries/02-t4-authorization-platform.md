---
title: t4-authorization-platform
status: needs-you
ask: authorizer cold start +290ms — keep 500ms reserve, or drop to 200ms?
repo: t4-authorization-platform
pr: "#204"
updated: 2026-11-19T07:02:00Z
---

Alpha deploy is green and traces flow end to end, Django → auth-engine. But the authorizer's cold start regressed.

- before: **652ms** init (pdk 2.0, no reserve)
- now: **941ms** init with `SENTRY_TIMEOUT_RESERVE_MS=500`
- with `200`: **688ms**, measured at 1769MB

## options

1. **keep 500ms.** safest; crash reports survive even slow sentry.io round trips. +290ms on every cold start.
2. **drop to 200ms.** p99 sentry.io RTT from us-east-1 is 140ms over the last week. we'd lose a crash report on a very bad day.

I'd pick **200ms**. Telemetry is best-effort by design, and the authorizer is in front of every request.

## progress

- [x] both functions: `sentryDSN`, drop hand-set DSN env + `overrides.layers`
- [x] auth-engine: delete `src/sentry.ts`, use facade
- [ ] shrink `SENTRY_TIMEOUT_RESERVE_MS`, re-measure at 1769MB
- [x] Django: cherry-pick tracing commits (`1a354de`, `d00f673`, `ab2b98f`)
- [x] auth-engine SDK: cherry-pick `traceData` (`13fdcc8`)
- [ ] delete `pt-1351-sentry-tracing-metrics` after merge
- [ ] alpha verified
- [ ] PR merged
- [ ] beta deploy green
