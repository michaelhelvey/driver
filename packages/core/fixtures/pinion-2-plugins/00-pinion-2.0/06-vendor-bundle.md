---
title: remove the vendor bundle from 2.0
status: done
repo: pinion
pr: "#21"
updated: 2026-11-17T20:51:00Z
---

Scope changed mid-flight: you decided 2.0 has no vendor bundle at all, so the first three steps were skipped.

- [x] this repo's built-in plugins bundle every dependency
- [x] remove `pinion/vendor`, `vendorDeps`, `vendorBundlePath`
- [x] freeze `vendor/node` at main's contents for pinion 1.x

Laptop cold build went 250/395/506ms → 126/136/146ms for markdown / images / feed.
