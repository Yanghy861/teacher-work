# ADR-001 · DocumentParser Adapter and officeparser candidate

- Status: Accepted for T08 Sol review
- Date: 2026-08-20
- Scope: T04 → T08; consumed later by T22 and T27–T30

## Context and evidence

T04 reran `officeparser@7.5.1` against 40 external sanitized samples: PPTX 10, DOCX 14, PDF 14 and XLSX 2. The result was 35 `indexed`, 5 `no_text`, 0 `parse_failed`, 12,797 non-empty chunks and 222,881 text characters. Five scan PDFs remained `no_text`; OCR was explicitly disabled. PPTX/PDF/XLSX positions were usable, while DOCX heading paths were not stable and must not be assumed. Three invalid OOXML fixtures (non-ZIP, truncated ZIP and ZIP missing the required document part) each became `parse_failed` with a structured error code. The Electron 43.4.1 / Node 24.18.1 smoke loads the same adapter and resolved PDF.js worker.

The evidence and reproducible command are recorded in `docs/spike-results.md` under Spike A. The adapter itself is the only place that imports the third-party AST.

## Decision

Adopt `officeparser` exactly at `7.5.1` as the Phase 2 parser candidate, behind the repository-owned `DocumentParser` contract. Do not expose `OfficeParser` AST objects to business code, SQLite or search code. Keep OCR disabled in V1. Parsing, batch Hash and indexing run in Worker/controlled background code; Electron Main only coordinates short state transactions.

The stable contract is:

```ts
type ParseStatus = 'indexed' | 'no_text' | 'parse_failed'

type ParseChunk = {
  text: string
  positionType: string
  positionValue?: string | number
  heading?: string
}

type ParseResult = {
  text: string
  chunks: ParseChunk[]
  parseStatus: ParseStatus
}

interface DocumentParser {
  parse(filePath: string): Promise<ParseResult>
}
```

`diagnostics` may remain an internal audit field, but it is not a business persistence contract. A textless scan is `no_text`, not a parser failure. A thrown/invalid adapter result is `parse_failed`. DOCX heading absence is represented by a document-level fallback position rather than guessed structure.

## Dependency, license and compatibility check

- `officeparser@7.5.1` declares MIT, Node `>=18.0.0`, and the upstream `harshankur/officeParser` repository in its installed manifest.
- Its manifest still declares `pdfjs-dist@6.1.200`; an exact package override resolves `6.2.108`, which is outside GHSA-hq66-cqwq-w95j. Official-registry audit reports 0 high/0 critical, and the malicious PDF JavaScript canary remains false. `spikes/document-parser/security-disposition.json` records the reproducible disposition.
- Direct dependencies include PDF.js and Tesseract resources. OCR is off for V1, but packaging must still recheck resource loading, optional native packages, size, license notices and PDF worker version equality before release.
- The adapter was loaded in the current Electron 43.4.1 runtime; this is a smoke result, not a final packaged-app guarantee. T42 must repeat packaging and Windows validation.
- The manifest and lockfile pin the direct candidate to `7.5.1` and resolved PDF.js to `6.2.108`; upgrades require a new sample/security run and review of the adapter contract.

## Rejected and Later alternatives

- Direct use of third-party AST: rejected because it couples business persistence to a replaceable library.
- OCR for scans/images: rejected for V1; preserve `no_text` and do not invent text.
- A different parser or a parser-wide rewrite: Later until a new real-sample spike demonstrates better coverage without breaking the contract.

## Consequences and known limits

Later tasks can implement format-specific adapters without changing SearchService. They must preserve original text for display, return positions where the parser actually provides them, and keep parse failures file-scoped. Formula fidelity, complex tables, DOCX heading paths and packaged resource loading remain explicit risks; none is silently marked solved by this ADR.
