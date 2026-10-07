---
title: Deploys
---

# Deploys

The Tidewater server deploys from the `main` branch. Agent releases follow a separate, slower schedule.

## Server deploys

Every merge to `main` deploys to staging automatically. Production deploys run from the deploy dashboard and roll out in three waves: 5% of workspaces, then 25%, then everyone, with 30 minutes between waves. Error rates are compared automatically and a wave halts if they rise by more than 0.5 percentage points.

## Deploy freeze

There are no production deploys on Fridays after 12:00 UTC, on weekends, or during the twice-yearly company gathering. Fixes for SEV1 incidents are exempt.

## Agent releases

Agent releases ship every four weeks. A release goes to the internal "dogfood" workspace first, then to beta customers a week later, then to everyone. The agent auto-updates unless a workspace admin has pinned a version.

## Rollbacks

Roll back a server deploy from the dashboard; it takes about four minutes. Database migrations must be backwards compatible with the previous release so that rollbacks never need a migration.
