---
title: On-call
---

# On-call

Engineers on the Sync and Server teams join the on-call rotation after their first three months.

## Rotation

Shifts are one week long and hand over on Tuesdays at 15:00 UTC, inside core hours, so the outgoing and incoming engineers can talk live. There is always a primary and a secondary. The secondary takes pages the primary has not acknowledged within 10 minutes.

## Pay

On-call is paid at a flat 450 EUR per week as primary and 200 EUR per week as secondary. If you are paged outside your working hours, you can also start late the next day; no need to ask.

## Severity levels

- **SEV1**: data loss, or sync down for more than one workspace. Page immediately, open an incident channel, and post a status page update within 20 minutes.
- **SEV2**: degraded sync or a single workspace down. Page during working hours; outside them, page only for Studio plan customers.
- **SEV3**: everything else. Ticket, no page.

## After an incident

Every SEV1 and SEV2 gets a written review within five working days. Reviews are blameless and focus on what made the failure possible, not who triggered it.
