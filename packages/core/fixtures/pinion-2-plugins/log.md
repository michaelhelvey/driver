---
title: log
---

## 2026-11-17T20:51:00Z

Phase 00 complete: #21 merged as `7c1e0b9`, CI run 3318 green, `pinion@2.0.0` and `@pinion/hooks@2.0.0` published.

## 2026-11-18T11:20:00Z

pinion-lint: started teaching `rules/plugin-shape.ts` that pinion 2.x has no vendor bundle.

## 2026-11-18T16:40:00Z

Asked in #plugins whether `async-render` in plugin-embeds is merging soon. It changes which treatment that plugin gets.

## 2026-11-19T06:15:00Z

pinion-kit minor merged as #23 and released. `KIT_EXTERNALS` is gone. Opened the docs PR in pinion-docs (#17).

## 2026-11-19T07:02:00Z

plugin-images is on the example site, but its cold build went 652 → 941ms. It's `HOOK_TIMEOUT_RESERVE_MS`. Need a call from you in `02.2`.

## 2026-11-19T07:38:00Z

plugin-feed is on the example site. Builds and config look right; waiting for the forced error to show up in the overlay before I call it verified.
