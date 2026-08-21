# Lean V1 Windows Acceptance

## Delivery format

- Delivery: unpacked Windows portable directory (`dir` target), not an installer.
- Candidate path used for the final package: `release-l12/win-unpacked/教师工作台.exe`.
- Toolchain: Electron `43.4.1`, electron-builder `26.15.3`, Windows build `26200`.
- Packaging is local and reproducible through `npm run package:portable`; the build uses the checked-in Electron distribution and does not publish or push anything.
- No uninstaller is provided. The workspace is outside the portable directory, so uninstall behavior is not applicable; removing the portable directory does not target the workspace.

## Windows verification

The packaged executable was launched from the final `release-l12/win-unpacked` directory on the current Windows machine.

1. First launch: the window titled `教师工作台` opened successfully.
2. Workspace creation: with an empty isolated app-data root, first launch created `TeacherWorkspace`, `data/workspace.db`, and the derived search directory. The UI reported `工作区已连接 · schema v7`.
3. Normal exit: the packaged window closed with `Alt+F4`, and the application window was absent on the subsequent window enumeration.
4. Reopen: launching the same executable again opened one window and restored the same schema-v7 workspace connection.
5. Uninstall: not applicable because this delivery is a portable directory with no uninstaller. Workspace data is stored outside the package directory.

## Four smoke flows

The representative acceptance suites were rerun after the L12 packaging changes:

| Flow | Evidence | Result |
|---|---|---|
| Import, manage, and open materials | `tests/phase1-acceptance.test.ts` | PASS |
| Search materials | `tests/phase2-acceptance.test.ts` | PASS |
| Fake-provider lesson prep: select material -> lecture/exercise/homework -> edit/save | `tests/phase3-acceptance.test.ts` | PASS |
| Backup -> restore to a new directory -> rebuild search index | `tests/backup-restore.test.ts` | PASS |

The combined smoke command completed with 4 test files and 13 tests passing. The full suite completed with 24 test files and 70 tests passing.

## Security and package audit

- Renderer source has no direct Node, SQLite, arbitrary filesystem, or API-key access. Renderer calls go through the typed `window.teacherWorkbench` Preload API.
- Browser security remains `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Runtime dependencies required by production are packaged, including `better-sqlite3` native resources and `officeparser`; the packaged executable successfully initialized the workspace database.
- No API key, real teaching material, workspace database, `search.db`, cache, backup, ciphertext, or log file was present in the final package root or packaged application payload.
- No `--no-sandbox` flag or development server was used for the packaged launch. `ELECTRON_RENDERER_URL` was not set.
- The final package contains only the Electron runtime, the asar application payload, and required unpacked native resources. Build output and package directories remain ignored and are not committed.

## Known limitations / Later

- V1 delivers one unsigned portable directory; installer UX, signing, auto-update, and upgrade matrices remain Later.
- There is no uninstaller because the selected delivery is portable.
- Real provider calls, OCR, live file watchers, vector search, streaming AI output, persistent workflow checkpoints, incremental/cloud/encrypted backup, and large-scale stress matrices remain outside Lean V1.
- The packaged runtime may create its own platform diagnostics outside the committed repository; these are not part of the delivery payload and are not committed.

## Commands

All required L12 gates passed:

```text
npm test                 # 24 files / 70 tests
npm run typecheck        # passed
npm run lint             # passed
npm run build            # passed
npm run package:portable # passed; electron-builder dir target
git diff --check         # passed
```
