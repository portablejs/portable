/// <reference types="node" />
// Runs each package's benchmarks in its own Vitest run, one package at a time, and writes
// .bench/<package>.json and .bench/machine.json for scripts/readme-stats.ts. Pass package names to
// run only those. `pnpm bench` builds every package first, because the benchmarks import `dist/`.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const maxLoad = Number(process.env.BENCH_MAX_LOAD ?? 4)

const hasBench = (name: string) =>
  existsSync(`packages/${name}/test`) &&
  readdirSync(`packages/${name}/test`).some((file) => file.endsWith('.bench.ts'))

const names = process.argv.length > 2 ? process.argv.slice(2) : readdirSync('packages')
mkdirSync('.bench', { recursive: true })
writeFileSync(
  '.bench/machine.json',
  `${JSON.stringify({ node: process.version, cpu: cpus()[0]?.model.trim(), cores: cpus().length }, null, 2)}\n`,
)

let failed = 0
for (const name of names.filter(hasBench)) {
  while (loadavg()[0] > maxLoad) {
    console.log(`Load average ${loadavg()[0].toFixed(1)} is above ${maxLoad}, waiting.`)
    await sleep(30_000)
  }
  console.log(`\n${name}`)
  const { status, error } = spawnSync(
    'vp',
    [
      'test',
      'bench',
      '--run',
      '--no-file-parallelism',
      '--reporter=verbose',
      '--reporter=json',
      `--outputFile.json=.bench/${name}.json`,
      `packages/${name}/`,
    ],
    { stdio: 'inherit', env: { ...process.env, BENCH_DIST: '1' } },
  )
  if (error) {
    throw error
  }
  if (status !== 0) {
    failed++
  }
}
if (failed) {
  console.log(`\n${failed} package(s) had failing benchmarks. Their reports were still written.`)
  process.exitCode = 1
}
