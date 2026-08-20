# ADR-004 · Crash-safe file, transaction and task recovery

- Status: Accepted for T08 Sol review
- Date: 2026-08-20
- Scope: T07 → T08; consumed later by T14–T31 and T39–T41

## Context and evidence

T07 ran the crash harness twice over eight fault points: partial copy to `.tmp`, complete validation before atomic rename, SQLite transaction before commit, committed `processing`, Hash, parse output, index output and a corrupt-input queue. All 16 child processes reached a checkpoint and were actually terminated with `SIGKILL`; all 16 recovery scenarios passed. The harness rejects roots outside the fixed workspace temp directory and stores only synthetic data. Full evidence and limitations are in `docs/spike-results.md` under Spike D.

## Decision

Freeze the following state machine and ordering for production:

```text
pending → processing → completed
pending → processing → failed   (file-scoped; queue continues)
processing --startup recovery--> pending
completed --startup recovery--> completed (never redo)
```

For a formal managed file, write inside the target object directory as `.tmp`, close the handle, check readability/size/Hash, then atomically rename on the same local volume. Only after the final file is readable may a short SQLite transaction commit its business status. Startup scans incomplete `.tmp` files and orphaned formal files: promote only a fully validated temporary result, otherwise isolate/remove the incomplete temporary result; never label a half-file successful.

For SQLite, use explicit short transactions and let SQLite roll back an uncommitted transaction after a process crash. On startup, reset persisted `processing` work to `pending`; do not redo `completed` work. Parse, Hash and index work remains in Worker/background tasks. Search index output is derived: write a complete temporary index and atomically replace it, or delete/rebuild it; one failed item does not block later queue items.

## Dependency, license and compatibility check

The harness uses the existing `better-sqlite3@13.0.3` workspace dependency and the Electron 43.4.1/Node runtime ABI smoke evidence already recorded by T02/T03. No new recovery library is introduced. The observed Windows local-volume rename and SQLite recovery are evidence for this ordering only; external WPS handles, cross-volume/network shares, antivirus interference and packaged release behavior require later validation.

## Consequences and known limits

The ordering prevents a half-written formal file or an uncommitted transaction from being treated as success and keeps long work out of Electron Main. A crash after a successful rename but before metadata commit can leave an orphan formal file, so startup reconciliation must report or adopt it only after validation. Windows `EPERM`/`EBUSY` requires bounded retry/backoff; if retries fail, retain recoverable temporary state and leave the existing formal file untouched. Token-level AI continuation and a general workflow engine remain outside V1.
