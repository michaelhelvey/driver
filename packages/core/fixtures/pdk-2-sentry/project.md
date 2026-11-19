---
title: pdk-2-sentry
repo: ~/dev/t4/t4-platform-lambda
started: 2026-11-10
updated: 2026-11-19T07:38:00Z
---

Moving every lambda onto pdk 2.0's telemetry layer: a Rust Sentry extension, a Node preload, and the `@transport4/sentry` facade. Phase 00 shipped in #46 and `@transport4/pdk@2.0.0` is published. The framework minor is merged; both canaries are on alpha now.

Two things need you: a docs review in `t4-agent-skills`, and a cold-start call on auth-platform. Nothing in phase 03 moves until both canaries are green on beta.

## the done rule

A repo is done when it's verified on alpha (traffic, config, logs, Sentry, a forced crash), its PR is merged, and its beta deploy is green. No beta checks — beta has no meaningful traffic.

## decisions

- no std-deps layer in 2.0. apps bundle everything; only `@aws-sdk/*` stays external. (11/17)
- auth-platform starts from `main` and replaces `pt-1351-sentry-tracing-metrics`, cherry-picking the Django and `traceData` commits.
- send policy: hold only, no batching. nothing goes upstream while an invoke runs; buffered events go after `runtimeDone`.
- `setTags` is on the facade.
