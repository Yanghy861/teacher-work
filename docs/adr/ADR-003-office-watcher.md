# ADR-003 · Office/WPS watcher event strategy

- Status: Proposed for T08 Sol review
- Date: 2026-08-20
- Scope: T06 → T08; consumed later by T18 and T24/T31

## Context and evidence

T06 used WPS Office `12.1.0.28043` on Windows 11 25H2/build `26200` with WPS-created temporary DOCX, PPTX and XLSX files. The Chokidar experiment recorded add/change/unlink, lock-file and `.tmp` behavior, stable samples, readability retries, Hash decisions and same-file task merging. A follow-up XLSX run observed one save during a simulated task and one `task_recheck`; a final-scan pass showed why the close path needs a final read after pending work drains. Microsoft Office was not installed in this environment, so this ADR makes no Microsoft Office claim.

Evidence and commands are in `docs/spike-results.md` under Spike C. WPS automatic recovery, a fixed large-file threshold and “exit exactly during a write” were not stably triggered and remain unclaimed.

## Decision

Adopt `chokidar` exactly at `4.0.3` as the initial watcher candidate, used from Main/Worker coordination only. Keep Node `fs.watch` as a later A/B comparison, not as an untested production contract. The watcher marks a managed file dirty; it never directly parses, hashes or writes search data from the raw event callback.

The initial configurable defaults and allowed tuning range are:

| Parameter | Default | Initial tuning range/meaning |
|---|---:|---|
| `debounceMs` | 400 | 300–500 ms; merge raw dirty events |
| `stableSamples` | 3 | at least 3 identical samples |
| `stableIntervalMs` | 150 | 100–150 ms between samples |
| `readRetryMs` | 200 | 100–200 ms when a writer holds an intermediate state |
| `readRetries` | 5 | 3–5 attempts |
| `taskDurationMs` | implementation-controlled | not a user-facing stability criterion; only one in-flight task per file |

The production state sequence is `raw event → dirty → debounce → repeated size+mtime/readable samples → SHA-256 → no-op or one rebuild task`. If a file changes during its task, keep one dirty bit and perform one post-task stability/Hash recheck. An unchanged Hash clears dirty without reparse. Lock files, `.tmp` files and out-of-scope extensions are filtered from managed-file work; a Windows rename may arrive as `unlink` plus `add` and must be normalized as an event combination.

## Dependency, license and compatibility check

- `chokidar@4.0.3` declares MIT, Node `>=14.16.0`, and the upstream `paulmillr/chokidar` repository in its installed manifest.
- It is pure JavaScript in this checkout and does not add an Electron native-module ABI requirement. The real Windows/WPS run is the compatibility evidence; Microsoft Office and final packaged-app behavior remain separate checks.
- The direct candidate is pinned to `4.0.3`; changing it requires rerunning the WPS save matrix and reviewing Windows rename/temp semantics.

## Consequences and known limits

No fixed two- or three-second sleep becomes the correctness rule. The watcher can be tuned per supported application while correctness comes from readable repeated samples and Hash deduplication. WPS auto-recovery, large-file performance and save-in-progress exit semantics are Later/known limits until separately reproduced; production must not infer them from this ADR.
