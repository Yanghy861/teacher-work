# ADR-003 · Office/WPS refresh reconciliation and optional watcher

- Status: Accepted for T08 Sol review
- Date: 2026-08-20
- Scope: T06 → T08; consumed later by T18 and T24/T31

## Context and evidence

T06 used WPS Office `12.1.0.28043` on Windows 11 25H2/build `26200` with WPS-created temporary DOCX, PPTX and XLSX files. The Chokidar experiment recorded add/change/unlink, lock-file and `.tmp` behavior, stable samples, readability retries, Hash decisions and same-file task merging. A follow-up XLSX run observed one save during a simulated task and one `task_recheck`; a final-scan pass showed why the close path needs a final read after pending work drains. Microsoft Office was not installed in this environment, so this ADR makes no Microsoft Office claim.

Evidence and commands are in `docs/spike-results.md` under Spike C. The executable `run-reconciliation-probe.mjs` additionally proved that startup, focus-return, reopen and manual-refresh checks detect new Hashes without receiving any watcher event, while concurrent triggers and repeated checks are deduplicated. WPS automatic recovery, a fixed large-file threshold and “exit exactly during a write” are not V1 real-time event commitments.

## Decision

Make refresh reconciliation authoritative. A managed file is checked on workspace startup in the background, when the workbench regains focus after launching an external editor, before reopening the file, and on explicit “refresh materials”. Startup/focus checks may use size+mtime as a cheap filter; any required Hash and stable read run outside Electron Main. Manual refresh and reopen force a targeted check. A missed watcher event therefore delays detection but cannot permanently lose an update.

Adopt `chokidar` exactly at `4.0.3` only as the initial optional acceleration candidate, used from Main/Worker coordination. Keep Node `fs.watch` as a later A/B comparison. A watcher event only marks a managed file dirty; it never directly parses, hashes or writes search data, and production correctness must pass with the watcher disabled.

The initial configurable defaults and allowed tuning range are:

| Parameter | Default | Initial tuning range/meaning |
|---|---:|---|
| `debounceMs` | 400 | 300–500 ms; merge raw dirty events |
| `stableSamples` | 3 | at least 3 identical samples |
| `stableIntervalMs` | 150 | 100–150 ms between samples |
| `readRetryMs` | 200 | 100–200 ms when a writer holds an intermediate state |
| `readRetries` | 5 | 3–5 attempts |
| `taskDurationMs` | implementation-controlled | not a user-facing stability criterion; only one in-flight task per file |

The production state sequence is `authoritative refresh or optional raw event → pending check/dirty → coalesce → repeated size+mtime/readable samples → SHA-256 → no-op or one rebuild task`. If a file changes or receives another trigger during its task, keep one pending-check bit and perform one post-task stability/Hash recheck. An unchanged Hash clears the state without reparse. Lock files, `.tmp` files and out-of-scope extensions are filtered from watcher acceleration; a Windows rename may arrive as `unlink` plus `add`, but reconciliation does not rely on that event pattern.

## Dependency, license and compatibility check

- `chokidar@4.0.3` declares MIT, Node `>=14.16.0`, and the upstream `paulmillr/chokidar` repository in its installed manifest.
- It is pure JavaScript in this checkout and does not add an Electron native-module ABI requirement. The real Windows/WPS run is the compatibility evidence; Microsoft Office and final packaged-app behavior remain separate checks.
- The optional candidate is pinned to `4.0.3`; changing it requires watcher regression tests and a representative WPS save smoke, not an exhaustive WPS internal-event matrix.

## Consequences and known limits

No fixed two- or three-second sleep and no watcher event becomes the correctness rule. Correctness comes from explicit reconciliation, readable repeated samples and Hash deduplication. The accepted V1 consistency boundary is eventual: if a file is edited entirely outside the workbench while it remains in the background and the optional watcher misses it, search may remain stale until startup, focus-return, reopen or manual refresh. The UI must expose update state and a refresh action. Auto-recovery, fixed large-file performance and save-in-progress exit event semantics require separate work only if a later product promise needs immediate detection.
