// Rewrites the package table in README.md from coverage/coverage-summary.json, each package's
// test/PARITY.md and .bench/report.json. `pnpm readme` produces all three first.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Size } from './bundle-size.ts'

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
  jsonl: { test: 'decodes 20,000 rows', theirs: 'ndjson', label: 'decode' },
  'mime-headers': {
    test: 'decodeWords of 200 Q-encoded subjects',
    theirs: 'libmime 5.4.9',
    label: 'decode encoded words',
  },
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
const sizes =
  readJson<Record<string, { ours: Size; upstream: Record<string, Size> }>>('.bench/sizes.json')

const kB = ({ gzip, nodeOnly }: Size) =>
  `${(gzip / 1000).toFixed(gzip < 10_000 ? 1 : 0)} kB${nodeOnly ? ' (Node only)' : ''}`

function sizeOf(name: string) {
  const size = sizes?.[name]
  if (!size) return 'not measured'
  const upstream = Object.entries(size.upstream).map(([label, s]) => `${kB(s)} ${label}`)
  return `${kB(size.ours)} vs ${upstream.join(', ')}`
}

function sizeLine(name: string) {
  const size = sizes?.[name]
  if (!size) return undefined
  const upstream = Object.entries(size.upstream).map(([label, s]) => `${kB(s)} for ${label}`)
  const list =
    upstream.length === 1
      ? upstream[0]
      : `${upstream.slice(0, -1).join(', ')} and ${upstream.at(-1)}`
  const note = Object.values(size.upstream).some((s) => s.nodeOnly)
    ? ' "Node only" marks a library that imports Node builtins or uses `Buffer`, so it needs polyfills in a browser.'
    : ''
  return `Bundled for the browser, minified and gzipped, \`@portable/${name}\` is ${kB(size.ours)}, against ${list}.${note}`
}

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
      const hz = (label: string) => tasks.find((task) => task.name === label)?.throughput.mean
      const a = hz(ours)
      const b = hz(speed.theirs)
      if (!a || !b) continue
      const noble = hz(`${ours} with @noble/hashes`)
      if (noble)
        return `${(a / b).toFixed(1)}× default, ${(noble / b).toFixed(1)}× with noble vs ${speed.theirs} (${speed.label})`
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
  '| Layer | Package | Replaces | Status | Speed vs replaced library | Size, gzipped | Line coverage | Branch coverage | Upstream cases covered | Upstream bugs fixed |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
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
    if (status !== 'Built') return [layer, pkg, replaces, status, '–', '–', '–', '–', '–', '–']
    const { lines, branches } = coverageOf(name)
    const { cases, issues } = parityOf(name)
    return [
      layer,
      pkg,
      replaces,
      status,
      speedOf(name),
      sizeOf(name),
      lines,
      branches,
      cases,
      issues,
    ]
  })
  .map((cells) => `| ${cells.join(' | ')} |`)

writeFileSync('README.md', `${before}${start}\n${[...header, ...rows].join('\n')}\n${end}${after}`)

const sizeStart = '<!-- size:start -->'
const sizeEnd = '<!-- size:end -->'
for (const name of Object.keys(sizes ?? {})) {
  const path = `packages/${name}/README.md`
  const line = sizeLine(name)
  if (!existsSync(path) || !line) continue
  const text = readFileSync(path, 'utf8')
  const pattern = new RegExp(`${sizeStart}[\\s\\S]*?${sizeEnd}`)
  if (pattern.test(text))
    writeFileSync(path, text.replace(pattern, `${sizeStart}\n${line}\n${sizeEnd}`))
}
