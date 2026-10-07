---
title: CLI Reference
---

# CLI Reference

The `tidewater` command-line tool ships with the agent. Every command accepts `--workspace <id>` to target a workspace other than the default.

## tidewater status

Shows sync state for the current folder: files waiting to upload, files waiting to download, and any open conflicts. Add `--json` for machine-readable output.

## tidewater lock / unlock

Takes or releases an exclusive lock on one or more files. Fails with exit code 3 if someone else already holds the lock. See Sync Conflicts for details.

## tidewater pin

Pins the current version of a file so it is never removed by version-history expiry:

```sh
tidewater pin renders/final_cut_v7.mov --note "Delivered to client"
```

## tidewater restore

Restores a previous version. Use `tidewater history <file>` to list versions, then `tidewater restore <file> --version <n>`. Restoring creates a new version rather than deleting newer ones.

## tidewater doctor

Checks the agent's configuration, disk space, clock skew and connection to the server, and prints a report to attach to support tickets. Clock skew over 30 seconds is reported as an error, because it breaks conflict detection.
