# ADR-001 · DocumentParser Adapter and officeparser candidate

- Status: Proposed for T08 Sol review
- Date: 2026-08-20
- Scope: T04 → T08; consumed later by T22 and T27–T30

## Context and evidence

T04 ran `officeparser@7.3.0` against 40 external sanitized samples: PPTX 10, DOCX 14, PDF 14 and XLSX 2. The result was 35 `indexed`, 5 `no_text`, 0 `parse_failed`, 12,512 non-empty chunks and 219,662 text characters. Five scan PDFs remained `no_text`; OCR was explicitly disabled. PPTX/PDF/XLSX positions were usable, while DOCX heading paths were not stable and must not be assumed. The Electron 43.4.1 / Node 24.18.1 smoke loaded the adapter for PPTX, text PDF and XLSX successfully.

The evidence and reproducible command are recorded in `docs/spike-results.md` under Spike A. The adapter itself is the only place that imports the third-party AST.

## Decision

Adopt `officeparser` exactly at `7.3.0` as the Phase 2 parser candidate, behind the repository-owned `DocumentParser` contract. Do not expose `OfficeParser` AST objects to business code, SQLite or search code. Keep OCR disabled in V1. Parsing, batch Hash and indexing run in Worker/controlled background code; Electron Main only coordinates short state transactions.

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

- `officeparser@7.3.0` declares MIT, Node `>=18.0.0`, and the upstream `harshankur/officeParser` repository in its installed manifest.
- Direct dependencies include PDF.js and Tesseract resources. OCR is off for V1, but packaging must still recheck resource loading, optional native packages, size and license notices before release.
- The adapter was loaded in the current Electron 43.4.1 runtime; this is a smoke result, not a final packaged-app guarantee. T42 must repeat packaging and Windows validation.
- The manifest and lockfile pin the direct candidate to `7.3.0`; upgrades require a new sample run and review of the adapter contract.

## Rejected and Later alternatives

- Direct use of third-party AST: rejected because it couples business persistence to a replaceable library.
- OCR for scans/images: rejected for V1; preserve `no_text` and do not invent text.
- A different parser or a parser-wide rewrite: Later until a new real-sample spike demonstrates better coverage without breaking the contract.

## Consequences and known limits

Later tasks can implement format-specific adapters without changing SearchService. They must preserve original text for display, return positions where the parser actually provides them, and keep parse failures file-scoped. Formula fidelity, complex tables, DOCX heading paths and packaged resource loading remain explicit risks; none is silently marked solved by this ADR.
