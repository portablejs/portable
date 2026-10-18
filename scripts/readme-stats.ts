// Rewrites the package table in README.md from coverage/coverage-summary.json, each package's
// test/PARITY.md and .bench/report.json. `pnpm readme` produces all three first.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

type Speed = { test: string; theirs: string; label: string; ours?: string }

const speeds: Record<string, Speed> = {
  streams: { test: 'collects 6.8 MB into bytes', theirs: 'get-stream', label: 'collect bytes' },
  lines: { test: 'splits 1.7 MB', theirs: 'split2', label: 'split lines' },
  base64: { test: 'decodes 1 MB', theirs: 'base64-js', label: 'decode 1 MB' },
  'quoted-printable': {
    test: '512 KB of text with line breaks',
    theirs: 'libqp 3.0.1',
    label: 'encode',
  },
  charset: { test: 'windows-1251', theirs: 'iconv-lite', label: 'encode windows-1251' },
  'dns-packet': { test: 'decodes', theirs: 'dns-packet', label: 'decode' },
  'json-stream': { test: 'parses the rows', theirs: 'JSONStream', label: 'parse' },
  ndjson: { test: 'decodes 20,000 rows', theirs: 'ndjson', label: 'decode' },
  'image-size': { test: 'parses png/sample.png', theirs: 'image-size', label: 'PNG' },
  exif: { test: 'parses a phone JPEG', theirs: 'exif-parser', label: 'parse' },
  png: {
    test: 'decodes a 1024x1024 PNG',
    theirs: 'pngjs',
    label: 'decode',
    ours: '@portable/png (DecompressionStream)',
  },
  dns: { test: "resolveTxt('gmail.com')", theirs: 'tangerine', label: 'resolveTxt' },
  webhooks: { test: 'Standard Webhook', theirs: 'standardwebhooks', label: 'verify' },
  oauth1: { test: 'GET request', theirs: 'oauth-1.0a', label: 'sign a GET' },
  spf: { test: 'nested record', theirs: 'mailauth', label: 'check' },
}

type BenchTask = { name: string; throughput: { mean: number } }
type BenchReport = {
  testResults: {
    name: string
    assertionResults: { fullName: string; benchmarks?: { tasks: BenchTask[] }[] }[]
  }[]
}
type CoverageCount = { total: number; covered: number }
type Coverage = Record<string, { lines: CoverageCount; branches: CoverageCount }>

const readJson = <T>(path: string): T | undefined =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined

const coverage = readJson<Coverage>('coverage/coverage-summary.json')
const report = readJson<BenchReport>('.bench/report.json')

const percent = ({ covered, total }: CoverageCount) =>
  total === 0 ? '100%' : `${((100 * covered) / total).toFixed(1)}%`

function coverageOf(name: string) {
  const lines = { total: 0, covered: 0 }
  const branches = { total: 0, covered: 0 }
  for (const [file, summary] of Object.entries(coverage ?? {})) {
    if (!file.includes(`/packages/${name}/src/`)) continue
    lines.total += summary.lines.total
    lines.covered += summary.lines.covered
    branches.total += summary.branches.total
    branches.covered += summary.branches.covered
  }
  if (lines.total === 0) return { lines: '–', branches: '–' }
  return { lines: percent(lines), branches: percent(branches) }
}

const notApplicable = /^(not applicable|doesn't apply|skipped|n\/a)\b/i

function parityOf(name: string) {
  const path = `packages/${name}/test/PARITY.md`
  if (!existsSync(path)) return { cases: '–', issues: '–' }
  let covered = 0
  let skipped = 0
  let issues = 0
  let section = ''
  let table: 'tests' | 'issues' | 'other' | undefined
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('#')) section = line.replace(/^#+/, '').trim()
    if (!line.startsWith('|')) {
      table = undefined
      continue
    }
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (table === undefined) {
      if (cells[0]!.startsWith('Upstream test')) table = 'tests'
      else if (section === 'Known upstream issues') table = 'issues'
      else table = 'other'
    } else if (cells[0]!.startsWith('---')) continue
    else if (table === 'issues') issues++
    else if (table === 'tests' && notApplicable.test(cells[1] ?? '')) skipped++
    else if (table === 'tests') covered++
  }
  const total = covered + skipped
  return {
    cases: total === 0 ? '–' : `${covered} of ${total}, ${skipped} n/a`,
    issues: String(issues),
  }
}

function speedOf(name: string) {
  const speed = speeds[name]
  if (!speed) return 'not measured'
  const ours = speed.ours ?? `@portable/${name}`
  for (const file of report?.testResults ?? []) {
    if (!file.name.includes(`/packages/${name}/`)) continue
    for (const test of file.assertionResults) {
      if (!test.fullName.includes(speed.test)) continue
      const tasks = test.benchmarks?.flatMap((benchmark) => benchmark.tasks) ?? []
      const a = tasks.find((task) => task.name === ours)?.throughput.mean
      const b = tasks.find((task) => task.name === speed.theirs)?.throughput.mean
      if (!a || !b) continue
      const ratio = (a / b).toFixed(1)
      if (ratio === '1.0') return `as fast as ${speed.theirs} (${speed.label})`
      return a > b
        ? `${ratio}× faster than ${speed.theirs} (${speed.label})`
        : `${ratio}× the speed of ${speed.theirs} (${speed.label})`
    }
  }
  return 'not measured'
}

const header = [
  '| Layer | Package | Replaces | Status | Speed vs replaced library | Line coverage | Branch coverage | Upstream cases covered | Upstream bugs fixed |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
]

const readme = readFileSync('README.md', 'utf8')
const start = '<!-- packages:start -->'
const end = '<!-- packages:end -->'
const [before, rest] = readme.split(start)
const [table, after] = rest!.split(end)

const rows = table!
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .slice(2)
  .map((line) => {
    const [layer, pkg, replaces, status] = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const name = pkg!.match(/@portable\/([\w-]+)/)![1]!
    if (status !== 'Built') return [layer, pkg, replaces, status, '–', '–', '–', '–', '–']
    const { lines, branches } = coverageOf(name)
    const { cases, issues } = parityOf(name)
    return [layer, pkg, replaces, status, speedOf(name), lines, branches, cases, issues]
  })
  .map((cells) => `| ${cells.join(' | ')} |`)

writeFileSync('README.md', `${before}${start}\n${[...header, ...rows].join('\n')}\n${end}${after}`)
