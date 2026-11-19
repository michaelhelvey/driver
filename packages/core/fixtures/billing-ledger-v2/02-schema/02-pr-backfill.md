---
title: PR 2 — backfill historical invoices
status: needs-you
ask: "review #412, then run the staging dry-run (3 commands)"
pr: "#412"
updated: 2026-11-18T17:26:00Z
---

Backfills `ledger_entries` from 14 months of `invoice_lines`. Idempotent — keyed on `(invoice_id, line_no)`.

## verification

~~~sh
bun scripts/backfill-dry-run.ts --env staging --since 2025-09-01
# → 182,334 lines · 0 mismatches · 3 skipped
~~~

- [x] dry run clean against a local copy of staging
- [ ] **you:** review #412
