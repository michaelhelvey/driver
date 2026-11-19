---
title: verification harness + alpha e2e
status: done
repo: t4-platform-lambda
pr: "#46"
updated: 2026-11-17T17:26:00Z
---

- [x] fake Runtime API harness
- [x] fake ingest (auth + byte-identical bodies)
- [x] alpha e2e numbers

Init avg on alpha: auth0 1055 → 652, entra 998 → 872, oidc 741 → 568, alarm 782 → 492 ms.
