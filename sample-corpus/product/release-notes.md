---
title: Release Notes
---

# Release Notes

## Tidewater 4.2

- Selective sync: choose subfolders to keep online-only, downloaded on first open.
- `tidewater doctor` now checks clock skew.
- Fixed an issue where locks were not released when the agent crashed. Locks held by a crashed agent are now released after 15 minutes instead of 72 hours.

## Tidewater 4.1

- Studio plan version history extended from 180 to 365 days.
- The admin console shows storage use per top-level folder.
- Dropped support for macOS 12.

## Tidewater 4.0

- New block-level deduplication across the whole workspace, replacing per-file deduplication. Existing workspaces were migrated over two weeks; customers saw storage use drop by 31% on average.
- Exclusive file locking, previously in beta, is now generally available.
- The minimum agent version for connecting to the server is now 3.8.
