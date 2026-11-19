---
title: t4-transit-times
status: doing
repo: t4-transit-times
pr: "#112"
updated: 2026-11-19T07:38:00Z
---

Picked as the first canary: it has a DSN, no std-deps, and it's small. On alpha now.

- [x] bump pdk 2.x
- [x] drop `@sentry/*` externals/deps, use facade
- [ ] alpha verified
- [ ] PR merged
- [ ] beta deploy green

## right now

Traffic and config look right. Waiting for the forced crash to show up in Sentry.

## verification

~~~sh
aws lambda invoke --function-name t4-transit-times-alpha-api \
  --payload '{"__t4_force_crash":true}' /dev/null
sentry issue list -p t4-transit-times --query "is:unresolved" --period 15m
# → one new issue: Error: forced crash (t4 canary)
~~~
