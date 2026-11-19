---
title: sentryDSN back in the pdk
status: done
repo: t4-platform-lambda
pr: "#46"
updated: 2026-11-17T20:51:00Z
---

Done: merged in #46, beta green.

- [x] telemetry layer zips shipped in `@transport4/pdk`; one LayerVersion per arch per stack
- [x] DSN rewrite + `SENTRY_UPSTREAM_DSN` + `SENTRY_ORG_ID` + `NODE_OPTIONS`
- [x] `PlatformPythonLambda`: extension only, no preload
- [x] this repo's authorizers opted in
