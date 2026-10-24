// Bundles every package into one Worker and runs it in workerd through Miniflare. The Worker
// imports every entry point in each package's `exports`, then runs the checks in checks.ts.
// Because it imports every module, a module that calls `setTimeout` or `crypto.getRandomValues`
// at the top level fails here as it would on Cloudflare. `@cloudflare/vitest-pool-workers` supports only
// Vitest 4, so this runs outside Vitest until it supports Vitest 5.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { build, type Rollup } from 'vite-plus'

const root = resolve(import.meta.dirname, '../../..')
const tool = resolve(root, 'tools/workers')
const entry = resolve(tool, 'src/__entry.ts')

const specifiers = readdirSync(resolve(root, 'packages')).flatMap((name) => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'packages', name, 'package.json'), 'utf8'))
  return Object.keys(pkg.exports ?? {}).map((path: string) => pkg.name + path.slice(1))
})

const code = [
  ...specifiers.map((specifier, i) => `import * as m${i} from '${specifier}'`),
  `import { checks } from './checks.ts'`,
  `const modules = { ${specifiers.map((s, i) => `${JSON.stringify(s)}: m${i}`).join(', ')} }`,
  `export default {
    async fetch() {
      const results = {}
      for (const [name, module] of Object.entries(modules))
        results[name] = Object.keys(module).length > 0 ? 'pass' : 'no exports'
      for (const [name, check] of Object.entries(checks)) {
        try {
          await check()
          results[name] = 'pass'
        } catch (error) {
          results[name] = String(error?.stack ?? error)
        }
      }
      return Response.json(results)
    },
  }`,
].join('\n')

const output = (await build({
  configFile: false,
  logLevel: 'error',
  root: tool,
  resolve: { conditions: ['src', 'workerd', 'worker', 'browser', 'module'] },
  build: {
    write: false,
    minify: false,
    target: 'esnext',
    modulePreload: false,
    rollupOptions: {
      input: entry,
      preserveEntrySignatures: 'strict',
      output: { format: 'es', codeSplitting: false },
    },
  },
  plugins: [
    {
      name: 'workers-entry',
      enforce: 'pre',
      resolveId: (source) => (source === entry ? entry : null),
      load: (id) => (id === entry ? code : null),
    },
  ],
})) as Rollup.RollupOutput

const chunks = output.output.filter((file): file is Rollup.OutputChunk => file.type === 'chunk')
if (chunks.length !== 1) throw new Error(`Expected one chunk, got ${chunks.length}`)

// Line numbers in a workerd stack trace refer to the bundle. Set WORKERS_BUNDLE=<path> to save
// the bundle and look them up.
if (process.env.WORKERS_BUNDLE) writeFileSync(process.env.WORKERS_BUNDLE, chunks[0]!.code)
const miniflare = new Miniflare({
  modules: true,
  script: chunks[0]!.code,
  compatibilityDate: '2026-07-01',
})
let failed = 0
try {
  const response = await miniflare.dispatchFetch('https://worker.example/')
  const results = (await response.json()) as Record<string, string>
  for (const [name, result] of Object.entries(results)) {
    if (result === 'pass') console.log(`✓ ${name}`)
    else {
      failed++
      console.log(`✗ ${name}\n  ${result.replaceAll('\n', '\n  ')}`)
    }
  }
  console.log(`\n${Object.keys(results).length - failed} passed, ${failed} failed in workerd`)
} finally {
  await miniflare.dispose()
}
process.exitCode = failed > 0 ? 1 : 0
