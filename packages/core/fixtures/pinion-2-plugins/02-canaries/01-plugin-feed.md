---
title: plugin-feed
status: doing
repo: plugin-feed
pr: "#88"
updated: 2026-11-19T07:38:00Z
---

Picked as the first canary: it uses hooks, no vendor bundle, and it's small. On the example site now.

- [x] bump pinion 2.x
- [x] drop hand-written hook shims, use facade
- [ ] example site verified
- [ ] PR merged
- [ ] release published

## right now

Builds and config look right. Waiting for the forced error to show up in the overlay.

## verification

~~~sh
PINION_FORCE_PLUGIN_ERROR=plugin-feed pinion build examples/blog
pinion doctor --plugin plugin-feed --since 15m
# → one new error: Error: forced plugin error (canary)
~~~
