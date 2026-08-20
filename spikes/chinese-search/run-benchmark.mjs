import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import { pathToFileURL } from 'node:url'

const supportedExtensions = new Set(['.pptx', '.docx', '.pdf', '.xlsx'])
const minimumChunks = 10_000
const topK = 10
const hotIterations = 20

const fixedQueries = [
  { id: 'rationalNumber', query: '有理数' },
  { id: 'quadraticEquation', query: '一元二次' },
  { id: 'function', query: '函数' },
  { id: 'geometry', query: '几何' },
  { id: 'circle', query: '圆' },
  { id: 'amc8', query: 'AMC8' },
  { id: 'p16', query: 'P16' },
  { id: 'absoluteValue', query: '|x|' },
  { id: 'angleAbc', query: '∠ABC' },
  { id: 'triangleAbc', query: '△ABC' },
  { id: 'xSquared', query: 'x²' },
]

const negativeQueries = [
  { id: 'negativeNonexistentChinese', query: '不存在的教学关键词' },
  { id: 'negativeNonexistentMath', query: 'Ω不存在' },
]

const mathNormalizationCases = [
  ['ＡＢＣ', 'abc'],
  ['x²', 'x^2'],
  ['x³', 'x^3'],
  ['−3 × 2', '-3 * 2'],
  ['∠ABC', 'angleabc'],
  ['△ABC', 'triangleabc'],
]

function option(args, name) {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`missing value for ${name}`)
  }
  return value
}

function printUsage() {
  console.log([
    'Usage:',
    '  node spikes/chinese-search/run-benchmark.mjs --samples <absolute-dir> --adapter <module> --truth <json> --output <absolute-json>',
    '  node spikes/chinese-search/run-benchmark.mjs --samples <absolute-dir> --adapter <module> --discover-truth',
    '',
    'The adapter must export async parse(filePath) -> { text, chunks, parseStatus }.',
    'The benchmark keeps raw text only in an ephemeral local SQLite file and never writes it to the report.',
  ].join('\n'))
}

async function collectFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(entryPath, files)
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(entryPath)
    }
  }
  return files
}

function sampleId(index) {
  return `sample-${String(index + 1).padStart(3, '0')}`
}

function chunkId(sample, index) {
  return `${sample}:chunk-${String(index + 1).padStart(4, '0')}`
}

async function loadAdapter(adapterArgument) {
  const adapterPath = isAbsolute(adapterArgument) ? adapterArgument : resolve(adapterArgument)
  const module = await import(pathToFileURL(adapterPath).href)
  const parse = typeof module.parse === 'function' ? module.parse : module.default?.parse
  if (typeof parse !== 'function') {
    throw new Error('adapter_parse_export_missing')
  }
  return parse
}

function replaceMathEquivalents(value) {
  return value
    .replaceAll('²', '^2')
    .replaceAll('³', '^3')
    .replaceAll('⁰', '^0')
    .replaceAll('¹', '^1')
    .replaceAll('⁴', '^4')
    .replaceAll('⁵', '^5')
    .replaceAll('⁶', '^6')
    .replaceAll('⁷', '^7')
    .replaceAll('⁸', '^8')
    .replaceAll('⁹', '^9')
    .replaceAll('−', '-')
    .replaceAll('－', '-')
    .replaceAll('×', '*')
    .replaceAll('＊', '*')
    .replaceAll('÷', '/')
    .replaceAll('·', '*')
    .replaceAll('≤', '<=')
    .replaceAll('≥', '>=')
    .replaceAll('≠', '!=')
    .replaceAll('∠', 'angle')
    .replaceAll('△', 'triangle')
}

export function normalizeSearchText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return replaceMathEquivalents(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function addNgrams(tokens, value, minLength, maxLength) {
  const characters = [...value]
  for (let length = minLength; length <= maxLength; length += 1) {
    for (let index = 0; index + length <= characters.length; index += 1) {
      tokens.add(characters.slice(index, index + length).join(''))
    }
  }
}

export function extractTokens(value) {
  const normalized = normalizeSearchText(value)
  const tokens = new Set()
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? []
  for (const run of cjkRuns) {
    addNgrams(tokens, run, 1, 3)
  }

  for (const match of normalized.matchAll(/[a-z0-9]+(?:\^[0-9]+)?/gu)) {
    tokens.add(match[0])
  }
  for (const match of normalized.matchAll(/\|[^|\s]{1,32}\|/gu)) {
    tokens.add(match[0])
  }

  const symbolRuns = normalized.match(/[a-z0-9]+(?:\^[0-9]+)?/gu) ?? []
  for (const run of symbolRuns) {
    if (run.includes('^')) {
      tokens.add(run)
    }
  }

  if (normalized.length > 0 && !cjkRuns.some((run) => run === normalized)) {
    tokens.add(normalized)
  }
  return [...tokens]
}

function createCorpusChunk(sample, extension, index, chunk) {
  const text = typeof chunk?.text === 'string' ? chunk.text : ''
  return {
    id: chunkId(sample, index),
    sampleId: sample,
    extension,
    positionType: typeof chunk?.positionType === 'string' ? chunk.positionType : 'unknown',
    rawText: text,
    normalizedText: normalizeSearchText(text),
  }
}

async function loadCorpus(files, parse) {
  const chunks = []
  const sampleSummaries = []
  for (const [index, filePath] of files.entries()) {
    const sample = sampleId(index)
    const extension = extname(filePath).toLowerCase()
    const result = await parse(filePath)
    const parsedChunks = Array.isArray(result?.chunks) ? result.chunks : []
    let sampleChunkCount = 0
    for (const chunk of parsedChunks) {
      const corpusChunk = createCorpusChunk(sample, extension, sampleChunkCount, chunk)
      if (corpusChunk.rawText.trim().length === 0) {
        continue
      }
      chunks.push(corpusChunk)
      sampleChunkCount += 1
    }
    sampleSummaries.push({
      sampleId: sample,
      extension,
      parseStatus: result?.parseStatus === 'indexed' || result?.parseStatus === 'no_text'
        ? result.parseStatus
        : 'unknown',
      chunkCount: sampleChunkCount,
    })
  }
  return { chunks, sampleSummaries }
}

function createSchema(db) {
  db.pragma('journal_mode = DELETE')
  db.exec(`
    CREATE TABLE chunks (
      id INTEGER PRIMARY KEY,
      chunk_id TEXT NOT NULL UNIQUE,
      sample_id TEXT NOT NULL,
      extension TEXT NOT NULL,
      position_type TEXT NOT NULL,
      filename_key TEXT NOT NULL,
      title_key TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL
    );
    CREATE INDEX chunks_sample_idx ON chunks (sample_id);
    CREATE INDEX chunks_filename_idx ON chunks (filename_key);
    CREATE INDEX chunks_title_idx ON chunks (title_key);
    CREATE VIRTUAL TABLE fts_raw USING fts5(
      raw_text,
      content='chunks',
      content_rowid='id',
      tokenize='trigram'
    );
    CREATE VIRTUAL TABLE fts_normalized USING fts5(
      normalized_text,
      content='chunks',
      content_rowid='id',
      tokenize='trigram'
    );
  `)
}

function populateDatabase(db, chunks) {
  const insertChunk = db.prepare(`
    INSERT INTO chunks (
      chunk_id, sample_id, extension, position_type, filename_key, title_key, raw_text, normalized_text
    ) VALUES (@id, @sampleId, @extension, @positionType, @filenameKey, @titleKey, @rawText, @normalizedText)
  `)
  const insert = db.transaction((items) => {
    for (const chunk of items) {
      insertChunk.run({
        ...chunk,
        filenameKey: chunk.sampleId,
        titleKey: chunk.sampleId,
      })
    }
  })
  insert(chunks)
  db.exec(`
    INSERT INTO fts_raw (rowid, raw_text)
      SELECT id, raw_text FROM chunks;
    INSERT INTO fts_normalized (rowid, normalized_text)
      SELECT id, normalized_text FROM chunks;
  `)
}

function buildTokenIndex(chunks) {
  const index = new Map()
  for (const [numericId, chunk] of chunks.entries()) {
    for (const token of extractTokens(chunk.normalizedText)) {
      let postings = index.get(token)
      if (postings === undefined) {
        postings = new Map()
        index.set(token, postings)
      }
      postings.set(numericId, (postings.get(numericId) ?? 0) + 1)
    }
  }
  return index
}

function ftsQueryValue(query) {
  return `"${query.replaceAll('"', '""')}"`
}

function mapRows(rows) {
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    sampleId: row.sample_id,
    positionType: row.position_type,
  }))
}

function createSearchContext(db, tokenIndex) {
  const rawStatement = db.prepare(`
    SELECT c.chunk_id, c.sample_id, c.position_type
    FROM fts_raw f
    JOIN chunks c ON c.id = f.rowid
    WHERE f.raw_text MATCH ?
    ORDER BY bm25(fts_raw) ASC, c.id ASC
    LIMIT ?
  `)
  const normalizedStatement = db.prepare(`
    SELECT c.chunk_id, c.sample_id, c.position_type
    FROM fts_normalized f
    JOIN chunks c ON c.id = f.rowid
    WHERE f.normalized_text MATCH ?
    ORDER BY bm25(fts_normalized) ASC, c.id ASC
    LIMIT ?
  `)
  const metadataStatement = db.prepare(`
    SELECT chunk_id, sample_id, position_type
    FROM chunks
    WHERE filename_key = ? OR title_key = ?
    ORDER BY id ASC
    LIMIT ?
  `)

  function runFts(statement, query, limit, normalizeQuery) {
    const searchValue = normalizeQuery ? normalizeSearchText(query) : query
    if ([...searchValue].length < 3) {
      return []
    }
    try {
      return mapRows(statement.all(ftsQueryValue(searchValue), limit))
    } catch {
      return []
    }
  }

  function runTokenSearch(query, limit) {
    const queryTokens = extractTokens(query)
    const scores = new Map()
    for (const token of queryTokens) {
      for (const [numericId, count] of tokenIndex.get(token) ?? []) {
        scores.set(numericId, (scores.get(numericId) ?? 0) + count)
      }
    }
    return [...scores.entries()]
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .slice(0, limit)
      .map(([numericId]) => tokenIndex.chunkRows[numericId])
  }

  return {
    rawTrigram: (query, limit) => runFts(rawStatement, query, limit, false),
    normalizedTrigram: (query, limit) => runFts(normalizedStatement, query, limit, true),
    tokenExtractor: runTokenSearch,
    shortWordFallback: (query, limit) => {
      const normalized = normalizeSearchText(query)
      return [...normalized].length <= 2 ? runTokenSearch(query, limit) : []
    },
    titleFilenameExact: (query, limit) => {
      const normalized = normalizeSearchText(query)
      return mapRows(metadataStatement.all(normalized, normalized, limit))
    },
  }
}

function attachTokenRows(tokenIndex, chunks) {
  tokenIndex.chunkRows = chunks.map((chunk) => ({
    chunkId: chunk.id,
    sampleId: chunk.sampleId,
    positionType: chunk.positionType,
  }))
  return tokenIndex
}

function unique(values) {
  return [...new Set(values)]
}

function truthForQuery(query, truthMap) {
  const truth = truthMap.get(query.id)
  if (truth === undefined) {
    throw new Error(`truth_missing:${query.id}`)
  }
  return {
    expectation: truth.expectation === 'negative' ? 'negative' : 'positive',
    expectedSampleIds: unique(Array.isArray(truth.expectedSampleIds) ? truth.expectedSampleIds : []),
    expectedChunkIds: unique(Array.isArray(truth.expectedChunkIds) ? truth.expectedChunkIds : []),
    note: typeof truth.note === 'string' ? truth.note : undefined,
  }
}

function evaluateResults(results, truth) {
  const resultSamples = unique(results.map((result) => result.sampleId))
  const resultChunks = new Set(results.map((result) => result.chunkId))
  const expectedSamples = new Set(truth.expectedSampleIds)
  const expectedChunks = new Set(truth.expectedChunkIds)
  const foundSamples = resultSamples.filter((sample) => expectedSamples.has(sample))
  const foundChunks = [...resultChunks].filter((chunk) => expectedChunks.has(chunk))
  const sampleRecall = expectedSamples.size === 0 ? null : foundSamples.length / expectedSamples.size
  const fragmentRecall = expectedChunks.size === 0 ? null : foundChunks.length / expectedChunks.size
  const falsePositiveCount = truth.expectation === 'negative' ? results.length : 0
  const judgment = truth.expectation === 'negative'
    ? (results.length === 0 ? 'pass' : 'false_positive')
    : (foundSamples.length > 0 || foundChunks.length > 0 ? 'hit' : 'miss')
  return {
    expectation: truth.expectation,
    expectedSampleIds: truth.expectedSampleIds,
    expectedChunkIds: truth.expectedChunkIds,
    resultSampleIds: resultSamples,
    ranked: results,
    recallAtK: sampleRecall,
    fragmentRecallAtK: fragmentRecall,
    falsePositiveCount,
    judgment,
    note: truth.note,
  }
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileValue))
  return Math.round(sorted[index] * 1000) / 1000
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 1000) / 1000
}

function queryVariant(context, variantId, query, limit) {
  return context[variantId](query, limit)
}

function discoverTruth(corpusChunks, queries) {
  const result = {}
  for (const query of queries) {
    const normalized = normalizeSearchText(query.query)
    const matching = corpusChunks.filter((chunk) => chunk.normalizedText.includes(normalized))
    const samples = unique(matching.map((chunk) => chunk.sampleId))
    const representativeChunks = []
    for (const sample of samples) {
      const first = matching.find((chunk) => chunk.sampleId === sample)
      if (first !== undefined) {
        representativeChunks.push(first.id)
      }
    }
    result[query.id] = {
      query: query.query,
      matchChunkCount: matching.length,
      expectedSampleIds: samples,
      representativeChunkIds: representativeChunks,
    }
  }
  return result
}

async function measureVariant(variantId, dbPath, tokenIndex, queries, truthMap) {
  const coldDb = new Database(dbPath, { readonly: true })
  const coldContext = createSearchContext(coldDb, tokenIndex)
  const coldQuery = queries[0]
  const coldStartedAt = performance.now()
  queryVariant(coldContext, variantId, coldQuery.query, topK)
  const coldFirstQueryMs = elapsed(coldStartedAt)
  coldDb.close()

  const hotDb = new Database(dbPath, { readonly: true })
  const hotContext = createSearchContext(hotDb, tokenIndex)
  const timings = []
  const queryReports = []
  for (const query of queries) {
    const firstStartedAt = performance.now()
    const firstResults = queryVariant(hotContext, variantId, query.query, topK)
    const firstMs = elapsed(firstStartedAt)
    const hotSamples = []
    let latestResults = firstResults
    for (let iteration = 0; iteration < hotIterations; iteration += 1) {
      const startedAt = performance.now()
      latestResults = queryVariant(hotContext, variantId, query.query, topK)
      hotSamples.push(elapsed(startedAt))
      timings.push(hotSamples[hotSamples.length - 1])
    }
    const truth = truthForQuery(query, truthMap)
    queryReports.push({
      ...query,
      latencyMs: {
        first: firstMs,
        hotP50: percentile(hotSamples, 0.5),
        hotP95: percentile(hotSamples, 0.95),
      },
      evaluation: evaluateResults(latestResults, truth),
    })
  }
  hotDb.close()
  const hitQueries = queryReports.filter((report) => report.evaluation.judgment === 'hit').length
  const negativeFalsePositives = queryReports.reduce(
    (total, report) => total + report.evaluation.falsePositiveCount,
    0,
  )
  return {
    variant: variantId,
    coldFirstQueryMs,
    hotP50Ms: percentile(timings, 0.5),
    hotP95Ms: percentile(timings, 0.95),
    fixedQueryHitCount: hitQueries,
    negativeFalsePositiveCount: negativeFalsePositives,
    queries: queryReports,
  }
}

async function measureMetadataControl(dbPath, tokenIndex) {
  const db = new Database(dbPath, { readonly: true })
  const context = createSearchContext(db, tokenIndex)
  const startedAt = performance.now()
  const ranked = context.titleFilenameExact('sample-001', topK)
  const elapsedMs = elapsed(startedAt)
  db.close()
  return {
    queryClass: 'anonymous_filename_or_title_exact',
    query: 'sample-001',
    expectedSampleIds: ['sample-001'],
    ranked,
    hit: ranked.some((result) => result.sampleId === 'sample-001'),
    elapsedMs,
  }
}

function countExpectation(truthMap) {
  let positive = 0
  let negative = 0
  for (const truth of truthMap.values()) {
    if (truth.expectation === 'negative') {
      negative += 1
    } else {
      positive += 1
    }
  }
  return { positive, negative }
}

function validateTruth(truthDocument, queries, chunks) {
  if (truthDocument?.schemaVersion !== 1 || !Array.isArray(truthDocument.queries)) {
    throw new Error('truth_schema_invalid')
  }
  const knownChunkIds = new Set(chunks.map((chunk) => chunk.id))
  const truthMap = new Map(truthDocument.queries.map((entry) => [entry.id, entry]))
  for (const query of queries) {
    const entry = truthMap.get(query.id)
    if (entry === undefined) {
      throw new Error(`truth_missing:${query.id}`)
    }
    for (const chunkIdValue of entry.expectedChunkIds ?? []) {
      if (!knownChunkIds.has(chunkIdValue)) {
        throw new Error(`truth_chunk_missing:${query.id}`)
      }
    }
  }
  return truthMap
}

async function writeReport(report, outputArgument) {
  const serialized = JSON.stringify(report, null, 2) + '\n'
  if (outputArgument === undefined) {
    process.stdout.write(serialized)
    return
  }
  if (!isAbsolute(outputArgument)) {
    throw new Error('output_must_be_absolute')
  }
  await mkdir(dirname(outputArgument), { recursive: true })
  await writeFile(outputArgument, serialized, 'utf8')
  console.log(`wrote_machine_report ${report.schemaVersion}`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    printUsage()
    return
  }
  const samplesArgument = option(args, '--samples')
  const adapterArgument = option(args, '--adapter')
  const truthArgument = option(args, '--truth')
  const outputArgument = option(args, '--output')
  const discoverTruthMode = args.includes('--discover-truth')
  if (samplesArgument === undefined || adapterArgument === undefined) {
    printUsage()
    process.exitCode = 2
    return
  }
  if (!isAbsolute(samplesArgument)) {
    throw new Error('samples_must_be_absolute')
  }
  if (!discoverTruthMode && (truthArgument === undefined || outputArgument === undefined)) {
    throw new Error('truth_and_output_required')
  }

  const samplesDirectory = resolve(samplesArgument)
  const sampleStats = await stat(samplesDirectory).catch(() => undefined)
  if (sampleStats?.isDirectory() !== true) {
    throw new Error('sample_directory_missing')
  }
  const files = await collectFiles(samplesDirectory)
  const parse = await loadAdapter(adapterArgument)
  const corpus = await loadCorpus(files, parse)
  if (corpus.chunks.length < minimumChunks) {
    await writeReport({
      schemaVersion: 1,
      status: 'blocked',
      reason: 'real_chunk_count_below_T05_gate',
      sampleCount: files.length,
      chunkCount: corpus.chunks.length,
      minimumChunks,
    }, outputArgument)
    process.exitCode = 2
    return
  }

  if (discoverTruthMode) {
    process.stdout.write(JSON.stringify({
      schemaVersion: 1,
      status: 'truth_candidates',
      sampleCount: files.length,
      chunkCount: corpus.chunks.length,
      fixedQueries: discoverTruth(corpus.chunks, fixedQueries),
      negativeQueries: discoverTruth(corpus.chunks, negativeQueries),
    }, null, 2) + '\n')
    return
  }

  const truthDocument = JSON.parse(await readFile(resolve(truthArgument), 'utf8'))
  const allQueries = [...fixedQueries, ...negativeQueries]
  const truthMap = validateTruth(truthDocument, allQueries, corpus.chunks)
  const tokenIndex = attachTokenRows(buildTokenIndex(corpus.chunks), corpus.chunks)
  const outputPath = resolve(outputArgument)
  await mkdir(dirname(outputPath), { recursive: true })
  const dbPath = `${outputPath}.${process.pid}.sqlite`
  let db
  let indexElapsedMs
  try {
    const indexStartedAt = performance.now()
    db = new Database(dbPath)
    createSchema(db)
    populateDatabase(db, corpus.chunks)
    db.pragma('optimize')
    indexElapsedMs = elapsed(indexStartedAt)
    db.close()
    db = undefined

    const variantIds = [
      'rawTrigram',
      'normalizedTrigram',
      'tokenExtractor',
      'shortWordFallback',
      'titleFilenameExact',
    ]
    const variants = []
    for (const variantId of variantIds) {
      variants.push(await measureVariant(variantId, dbPath, tokenIndex, allQueries, truthMap))
    }
    const metadataControl = await measureMetadataControl(dbPath, tokenIndex)
    const databaseStats = await stat(dbPath)
    const normalizerChecks = mathNormalizationCases.map(([input, expected]) => ({
      inputClass: input.length === 0 ? 'empty' : 'math_or_width_sample',
      expected,
      actual: normalizeSearchText(input),
      pass: normalizeSearchText(input) === expected,
    }))
    const truthExpectation = countExpectation(truthMap)
    await writeReport({
      schemaVersion: 1,
      status: 'completed',
      benchmark: 'T05-Spike-B',
      corpus: {
        sampleCount: files.length,
        indexedSampleCount: corpus.sampleSummaries.filter((summary) => summary.parseStatus === 'indexed').length,
        noTextSampleCount: corpus.sampleSummaries.filter((summary) => summary.parseStatus === 'no_text').length,
        chunkCount: corpus.chunks.length,
        minimumChunks,
        chunkGatePass: corpus.chunks.length >= minimumChunks,
        positionTypeCounts: Object.fromEntries(
          [...corpus.chunks.reduce((counts, chunk) => {
            counts.set(chunk.positionType, (counts.get(chunk.positionType) ?? 0) + 1)
            return counts
          }, new Map())],
        ),
      },
      index: {
        storage: 'temporary SQLite FTS5 file; deleted after report generation',
        ftsTokenizer: 'trigram',
        indexElapsedMs,
        databaseBytes: databaseStats.size,
        rawTextKeptOnlyForBenchmark: true,
        tokenCount: tokenIndex.size,
      },
      normalizer: {
        version: 1,
        ruleSummary: 'NFKC + lowercase + math symbol equivalents + whitespace canonicalization',
        doesNotMutateDisplayText: true,
        checks: normalizerChecks,
        allChecksPass: normalizerChecks.every((check) => check.pass),
      },
      metadataControl,
      truth: {
        source: 'manually reviewed minimum truth file; IDs are anonymous sample/chunk IDs',
        positiveQueryCount: truthExpectation.positive,
        negativeQueryCount: truthExpectation.negative,
      },
      variants,
      limitations: [
        'The supplied sample filenames are anonymized; title/filename exact-match is measured against generated ordinal keys, not semantic teacher titles.',
        'Minimum truth labels are conservative relevance anchors; results outside them are unjudged for positive queries, while every negative result is counted as a false positive.',
        'No vector index, Elasticsearch, Meilisearch, or external NLP service is used.',
      ],
    }, outputArgument)
  } finally {
    if (db !== undefined && db.open) {
      db.close()
    }
    await unlink(dbPath).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(`benchmark_error ${error instanceof Error ? error.message : 'unknown_error'}`)
  process.exitCode = 2
})
