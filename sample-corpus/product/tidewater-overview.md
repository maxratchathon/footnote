---
title: Tidewater Overview
---

# Tidewater Overview

Tidewater is Halyard Labs' file sync product for teams working on large binary assets, such as game studios and video production houses. It syncs folders between machines and a Tidewater server, and keeps every version of every file.

## How sync works

Each machine runs the Tidewater agent, which watches selected folders. When a file changes, the agent splits it into content-defined blocks of roughly 4 MB, uploads only the blocks the server does not already have, and records a new version.

Because blocks are deduplicated across the whole workspace, renaming a 40 GB file or copying it into another folder uploads almost nothing.

## Workspaces and seats

Customers buy Tidewater per workspace. A workspace has a storage quota and a number of seats. The Team plan includes 2 TB and 10 seats; the Studio plan includes 20 TB and 50 seats. Extra storage is sold in 1 TB increments.

## Version history

Tidewater keeps every version for 90 days on the Team plan and 365 days on the Studio plan. After that, only the latest version and any version that has been pinned are kept. Pinned versions never expire and count toward the storage quota.
