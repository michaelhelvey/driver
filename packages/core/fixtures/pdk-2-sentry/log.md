---
title: log
---

## 2026-11-17T20:51:00Z

Phase 00 complete: #46 merged as `3a24ff6`, deploy_beta 44154822350 green, `@transport4/pdk@2.0.0` and `@transport4/sentry@2.0.0` published.

## 2026-11-18T11:20:00Z

pulse-scanner: started teaching `platform-awareness.ts` that pdk 2.x has no std-deps layer.

## 2026-11-18T16:40:00Z

Asked in #platform whether `CT-597-lambda` in t4-user-info is merging soon. It changes which treatment that repo gets.

## 2026-11-19T06:15:00Z

platform-framework minor merged as #48 and released. `FRAMEWORK_EXTERNALS` is gone. Opened the docs PR in t4-agent-skills (#31).

## 2026-11-19T07:02:00Z

auth-platform alpha deploy is green, but authorizer cold start went 652 → 941ms. It's `SENTRY_TIMEOUT_RESERVE_MS`. Need a call from you in `02.2`.

## 2026-11-19T07:38:00Z

t4-transit-times is on alpha. Traffic and config look right; waiting for the forced crash to land in Sentry before I call it alpha verified.
