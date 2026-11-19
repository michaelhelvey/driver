---
title: billing-ledger-v2
repo: ~/dev/acme/billing
started: 2026-11-02
updated: 2026-11-19T06:58:00Z
---

Replacing the hand-rolled invoice ledger with a real double-entry model. Schema is merged; the backfill (`02.2`) is written, tested, and **waiting on your review**.

Cutover is blocked on prod read-replica access — I drafted the infra ask in `03.2`. Nothing is on fire.
