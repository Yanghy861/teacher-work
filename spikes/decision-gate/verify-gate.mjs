import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runReconciliationProbe } from '../office-watcher/run-reconciliation-probe.mjs'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function check(id, pass, detail) {
  return { id, pass: Boolean(pass), detail }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'))
}

function taskStatus(statusText, task) {
  const row = statusText.split(/\r?\n/).find((line) => line.startsWith(`| ${task} `))
  return row?.match(/\|\s*(TODO|IN_PROGRESS|BLOCKED|DONE)\s*\|/)?.[1]
}

function spikeStatus(spikeText, title) {
  const sectionStart = spikeText.indexOf(`## ${title}`)
  if (sectionStart === -1) {
    return undefined
  }
  const section = spikeText.slice(sectionStart, sectionStart + 300)
  return section.match(/状态：`(TODO|IN_PROGRESS|BLOCKED|DONE)`/)?.[1]
}

function runFixtureProbe() {
  const tempRoot = mkdtempSync(join(repoRoot, 'tmp', 'gate-fixtures-'))
  const reportPath = join(tempRoot, 'report.json')
  try {
    let stdout = ''
    try {
      stdout = execFileSync(process.execPath, [
        join(repoRoot, 'spikes', 'document-parser', 'run-fixture-probe.mjs'),
        '--output',
        reportPath,
      ], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      return { report: undefined, detail: `fixture probe failed: ${error instanceof Error ? error.message : 'unknown error'}` }
    }
    return {
      report: JSON.parse(readFileSync(reportPath, 'utf8')),
      detail: stdout.trim() || 'fixture probe completed',
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function main() {
  const requireDone = process.argv.includes('--require-done')
  const spikes = readFileSync(join(repoRoot, 'docs', 'spike-results.md'), 'utf8')
  const status = readFileSync(join(repoRoot, 'implementation-tasks', 'STATUS.md'), 'utf8')
  const packageJson = readJson('package.json')
  const lockJson = readJson('package-lock.json')
  const securityPath = join(repoRoot, 'spikes', 'document-parser', 'security-disposition.json')
  const security = (() => {
    try { return JSON.parse(readFileSync(securityPath, 'utf8')) } catch { return undefined }
  })()
  const fixture = runFixtureProbe()
  const reconciliation = await runReconciliationProbe()
  const adrFiles = [
    'ADR-001-document-parser.md',
    'ADR-002-chinese-math-search.md',
    'ADR-003-office-watcher.md',
    'ADR-004-crash-recovery.md',
  ]
  const adrs = adrFiles.map((fileName) => readFileSync(join(repoRoot, 'docs', 'adr', fileName), 'utf8'))
  const checks = [
    ...[
      'Spike A：文档解析',
      'Spike B：中文/数学混合搜索',
      'Spike C：Office/WPS 刷新核对',
      'Spike D：强杀与恢复',
    ].map((title) => check(`spike-section:${title}`, spikes.includes(`## ${title}`), 'section present')),
    check('spikes-status-consistent', [
      'Spike A：文档解析',
      'Spike B：中文/数学混合搜索',
      'Spike C：Office/WPS 刷新核对',
      'Spike D：强杀与恢复',
    ].every((title) => spikeStatus(spikes, title) === 'DONE'), 'all four spike sections are DONE'),
    check('spike-a-method', spikes.includes('run-spike.mjs') && spikes.includes('12,797') && spikes.includes('officeparser@7.5.1'), 'Spike A has current command, result and parser version'),
    check('spike-b-method', spikes.includes('run-benchmark.mjs') && spikes.includes('FTS5 trigram') && spikes.includes('officeparser@7.5.1'), 'Spike B has current command, result and parser version'),
    check('spike-c-method', spikes.includes('run-reconciliation-probe.mjs')
      && spikes.includes('watcher 只是可选加速器')
      && spikes.includes('chokidar@4.0.3'), 'Spike C has authoritative refresh probe and optional watcher candidate'),
    check('spike-d-method', spikes.includes('run-harness.mjs') && spikes.includes('SIGKILL'), 'Spike D has harness and real kill evidence'),
    check('adr-count', adrs.length === 4, 'four ADR files loaded'),
    ...adrs.map((adr, index) => check(`adr-${String(index + 1).padStart(3, '0')}`,
      /^- Status: Accepted for T08 Sol review$/m.test(adr)
        && ['## Context and evidence', '## Decision', '## Consequences'].every((marker) => adr.includes(marker)),
      'ADR has final status, decision, evidence and limits')),
    check('parser-pinned', packageJson.devDependencies?.officeparser === '7.5.1', 'officeparser exact version in package manifest'),
    check('watcher-pinned', packageJson.devDependencies?.chokidar === '4.0.3', 'chokidar exact version in package manifest'),
    check('pdfjs-override', packageJson.overrides?.officeparser?.['pdfjs-dist'] === '6.2.108', 'PDF.js security override is exact'),
    check('lock-pinned', lockJson.packages?.['']?.devDependencies?.officeparser === '7.5.1'
      && lockJson.packages?.['']?.devDependencies?.chokidar === '4.0.3'
      && lockJson.packages?.['node_modules/pdfjs-dist']?.version === '6.2.108', 'direct candidates and resolved PDF.js exact in lockfile'),
    check('security-disposition', security?.schemaVersion === 1
      && security.status === 'clean'
      && security.advisory === 'GHSA-hq66-cqwq-w95j'
      && security.fixedVersion === '6.2.108'
      && security.resolvedPdfjsDist === '6.2.108'
      && security.maliciousPdfProbe === 'passed', 'security disposition records clean audit, fixed dependency and malicious probe'),
    check('fixture-probe', fixture.report?.status === 'passed'
      && fixture.report?.invalidOoxmlFixtures?.length === 3
      && fixture.report.invalidOoxmlFixtures.every((item) => item.pass && item.observedParseStatus === 'parse_failed')
      && fixture.report.maliciousPdfProbe?.pass === true, fixture.detail),
    check('t06-refresh-reconciliation', reconciliation.status === 'passed'
      && reconciliation.watcherRequiredForCorrectness === false
      && reconciliation.checks?.missedWatcherChangeDetected === true
      && reconciliation.checks?.concurrentTriggersCoalesced === true
      && reconciliation.checks?.acceptedHashDoesNotRepeat === true,
    `refresh probe ${reconciliation.status}; watcher required=${reconciliation.watcherRequiredForCorrectness}`),
    check('phase-status', ['T04', 'T05', 'T06', 'T07'].every((task) => taskStatus(status, task) === 'DONE'), 'T04-T07 are DONE'),
    check('t08-status', requireDone ? taskStatus(status, 'T08') === 'DONE' : taskStatus(status, 'T08') !== 'DONE', requireDone ? 'T08 is DONE' : 'T08 is not falsely marked DONE before finalization'),
  ]
  const passed = checks.filter((item) => item.pass).length
  const report = {
    schemaVersion: 2,
    status: passed === checks.length ? 'passed' : 'failed',
    passed,
    failed: checks.length - passed,
    checks,
    requireDone,
  }
  console.log(JSON.stringify(report))
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`decision_gate_error ${error instanceof Error ? error.name : 'unknown_error'}`)
  process.exitCode = 2
})
