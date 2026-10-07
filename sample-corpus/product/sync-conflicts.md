---
title: Sync Conflicts
---

# Sync Conflicts

A conflict happens when two machines change the same file before either has synced the other's change.

## How Tidewater resolves conflicts

Tidewater never silently overwrites work. The version that reaches the server first keeps the original file name. The other version is saved next to it as a conflict copy named `<name> (conflict <machine> <date>).<ext>`.

For files that are locked (see below), conflicts cannot happen: the second machine cannot save until the lock is released.

## File locking

Binary assets usually cannot be merged, so Tidewater supports exclusive locks. Lock a file before editing it:

```sh
# Lock a file so nobody else can change it
tidewater lock assets/hero.psd

# Release it when you're done
tidewater unlock assets/hero.psd
```

Locks expire automatically after 72 hours of inactivity. Workspace admins can break any lock from the admin console; the lock holder gets an email when that happens.

## Resolving a conflict copy

Open both files, keep the one you want, and delete the other. Conflict copies are regular files, so deleting one is synced like any other change. The admin console lists all open conflict copies in a workspace under Health → Conflicts.
