import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readRepositoryFile(relativePath) {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

function check(id, pass, detail) {
  return { id, pass, detail }
}

async function main() {
  const requireDone = process.argv.includes('--require-done')
  const [spikes, status, packageText, lockText, ...adrs] = await Promise.all([
    readRepositoryFile('docs/spike-results.md'),
    readRepositoryFile('implementation-tasks/STATUS.md'),
    readRepositoryFile('package.json'),
    readRepositoryFile('package-lock.json'),
    ...['ADR-001-document-parser.md', 'ADR-002-chinese-math-search.md', 'ADR-003-office-watcher.md', 'ADR-004-crash-recovery.md']
      .map((fileName) => readRepositoryFile(join('docs/adr', fileName))),
  ])
  const packageJson = JSON.parse(packageText)
  const lockJson = JSON.parse(lockText)
  const requiredSections = ['Spike A：文档解析', 'Spike B：中文/数学混合搜索', 'Spike C：Office/WPS 保存事件', 'Spike D：强杀与恢复']
  const checks = [
    ...requiredSections.map((section) => check(`spike-section:${section}`, spikes.includes(`## ${section}`), 'section present')),
    check('spikes-all-done', (spikes.match(/状态：`DONE`/g) ?? []).length >= 4 && !spikes.includes('状态：`PENDING`'), 'four spike statuses are DONE and none is PENDING'),
    check('spike-a-method', spikes.includes('run-spike.mjs') && spikes.includes('12,512'), 'Spike A has command and measured result'),
    check('spike-b-method', spikes.includes('run-benchmark.mjs') && spikes.includes('FTS5 trigram'), 'Spike B has command and measured result'),
    check('spike-c-method', spikes.includes('run-experiment.mjs') && spikes.includes('chokidar@4.0.3'), 'Spike C has runner and candidate'),
    check('spike-d-method', spikes.includes('run-harness.mjs') && spikes.includes('SIGKILL'), 'Spike D has harness and real kill evidence'),
    check('adr-count', adrs.length === 4, 'four ADR files loaded'),
    ...adrs.map((adr, index) => check(`adr-${String(index + 1).padStart(3, '0')}`, [
      'Status: Proposed for T08 Sol review',
      '## Context and evidence',
      '## Decision',
      '## Consequences',
    ].every((marker) => adr.includes(marker)), 'decision, evidence and limits are present')),
    check('parser-pinned', packageJson.devDependencies?.officeparser === '7.3.0', 'officeparser exact version in package manifest'),
    check('watcher-pinned', packageJson.devDependencies?.chokidar === '4.0.3', 'chokidar exact version in package manifest'),
    check('lock-pinned', lockJson.packages?.['']?.devDependencies?.officeparser === '7.3.0'
      && lockJson.packages?.['']?.devDependencies?.chokidar === '4.0.3', 'direct candidates exact in lockfile'),
    check('phase-status', ['T04', 'T05', 'T06', 'T07'].every((task) => new RegExp(`\\| ${task} .*\\| DONE \\|`).test(status)), 'T04-T07 are DONE'),
    check('t08-status', requireDone
      ? /\| T08 .*\| DONE \|/.test(status)
      : /\| T08 .*\| (TODO|IN_PROGRESS) \|/.test(status), requireDone ? 'T08 is DONE' : 'T08 is not falsely marked DONE before finalization'),
  ]
  const passed = checks.filter((item) => item.pass).length
  const report = {
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
