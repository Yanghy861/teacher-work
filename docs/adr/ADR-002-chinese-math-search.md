# ADR-002 · Chinese/math local search strategy

- Status: Accepted for T08 Sol review
- Date: 2026-08-20
- Scope: T05 → T08; consumed later by T21–T32

## Context and evidence

T05 rebuilt 12,797 non-empty chunks from the T04 real sample set with `officeparser@7.5.1`. It measured raw FTS5 trigram, FTS5 plus normalization, application TokenExtractor, short-word fallback and exact title/filename matching. The benchmark and anonymous truth set are recorded in `docs/spike-results.md` under Spike B.

The observed tradeoff is material: the current broad TokenExtractor reached 6/6 positive queries but produced 30 false-positive fragments; normalized FTS5 had zero false positives in the recorded negative checks but was weak for short Chinese terms; the short-word fallback was useful for queries no longer than two normalized characters. The corpus had no positive examples for some requested terms such as `AMC8`, so absence in that corpus is not product coverage evidence.

## Decision

Freeze a deterministic two-level V1 path:

1. Level 1 uses SQLite FTS5 `trigram` with a versioned `SearchNormalizer` applied to both indexed text and query. Normalization may unify case, full-width/half-width forms and approved common mathematical Unicode forms, but the original text remains unchanged for display.
2. Queries whose normalized form is no longer than two characters use the short-word application fallback. Longer continuous Chinese, English/number identifiers and normalized math expressions prefer FTS5.
3. Level 2 `TokenExtractor` is only a candidate-recall helper. Every candidate must pass normalized-body or exact math-token verification before becoming a result. Broad single-character token matches are not accepted directly.
4. Title and filename matching is a separate exact-field path and must not contaminate body ranking. Results retain `file_id`, position and the original display snippet.

No vector database, embedding, Elasticsearch, Meilisearch, large NLP service or OCR is admitted to V1. `search.db` is derived and may be deleted/rebuilt from business data and real files.

## Frozen implementation contract

```ts
type SearchQuery = { text: string; scope?: string }
type SearchHit = {
  fileId: string
  position?: { type: string; value?: string | number }
  snippet: string
  source: 'body-fts' | 'short-word' | 'exact-title' | 'exact-filename'
}

interface SearchService {
  search(query: SearchQuery): Promise<SearchHit[]>
}
```

`SearchNormalizer` is versioned and testable; it never overwrites stored source text. `TokenExtractor` output is an implementation detail, not a business truth or third-party AST.

## Dependency and maintenance check

The selected search engine is SQLite FTS5 already provided by the workspace SQLite runtime; no additional search service dependency is introduced. The normalizer and candidate extractor remain repository-owned code. This keeps Electron packaging and Windows deployment within the existing SQLite validation boundary. Any future tokenizer must pass a new real Chinese/math benchmark and cannot be added merely because a query is absent from the current corpus.

## Consequences and Later items

Search behavior is predictable and rebuildable, with a clear false-positive guard. Complex formula tokenization, richer corpus coverage and a specialized local tokenizer are Later/known limitations. They must return to a new spike if they become correctness-critical for V1; they cannot be hidden behind a vague “semantic search” fallback.
