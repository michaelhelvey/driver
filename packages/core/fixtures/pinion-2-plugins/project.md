---
title: pinion-2-plugins
repo: ~/dev/pinion/pinion
started: 2026-11-10
updated: 2026-11-19T07:38:00Z
---

Moving every plugin onto pinion 2.0's plugin runtime: a Rust sandbox, a Node preload, and the `@pinion/hooks` facade. Phase 00 shipped in #21 and `pinion@2.0.0` is published. The pinion-kit minor is merged; both canaries are on the example site now.

Two things need you: a docs review in `pinion-docs`, and a cold-build call on plugin-images. Nothing in phase 03 moves until both canaries are released.

## the done rule

A plugin is done when it's verified on the example site (build, dev server, watch mode, logs, a forced plugin error), its PR is merged, and its release is published. No checks after release — nobody installs a plugin the day it ships.

## decisions

- no vendor bundle in 2.0. plugins bundle everything; only `node:*` stays external. (11/17)
- plugin-images starts from `main` and replaces `async-thumbnails`, cherry-picking the resize and `srcset` commits.
- hook policy: queue only, no batching. nothing reaches a plugin while a page renders; queued events go after `renderDone`.
- `setMeta` is on the facade.
