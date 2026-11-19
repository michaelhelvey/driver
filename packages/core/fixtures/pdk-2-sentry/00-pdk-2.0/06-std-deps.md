---
title: remove the std-deps layer from 2.0
status: done
repo: t4-platform-lambda
pr: "#46"
updated: 2026-11-17T20:51:00Z
---

Scope changed mid-flight: you decided 2.0 has no std-deps layer at all, so the first three steps were skipped.

- [x] this repo's lambdas bundle every dependency
- [x] remove `@transport4/pdk/std-deps`, `stdDeps`, `lambdaStandardDepsLayerArn`
- [x] freeze `layer/nodejs` at main's contents for pdk 1.x

Laptop cold start went 250/395/506ms → 126/136/146ms for authorizer / oidc-waypoint / cloudwatch-alarm-handler.
