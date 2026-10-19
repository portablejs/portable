// Writes .bench/sizes.json: for each column of each package's tables in scripts/readme-tables.ts,
// the imports a caller uses, bundled for the browser, minified and gzipped, and the Node built-ins
// the bundle needs. Our packages are bundled from `dist/`, so run `pnpm build` first. Pass package
// names to measure only those and keep the other entries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build, type Rollup } from 'vite-plus'
import { type Import, tables } from './readme-tables.ts'

export type Size = { gzip: number; builtins: string[] } | { error: string }

async function measure(name: string, imports: readonly Import[]): Promise<Size> {
  const dir = resolve(`packages/${name}/test`)
  const entry = `${dir}/__size_entry.js`
  const builtins = new Set<string>()
  const code = [
    ...imports.map(({ from }, i) => `import * as m${i} from '${from}'`),
    `globalThis.__size = [${imports
      .flatMap(({ use }, i) =>
        use ? use.map((name) => `m${i}[${JSON.stringify(name)}]`) : [`m${i}`],
      )
      .join(', ')}]`,
  ].join('\n')
  try {
    const output = (await build({
      configFile: false,
      logLevel: 'silent',
      root: dir,
      build: {
        write: false,
        minify: true,
        modulePreload: false,
        rollupOptions: { input: entry, preserveEntrySignatures: 'strict' },
      },
      plugins: [
        {
          name: 'size-entry',
          enforce: 'pre',
          resolveId(source) {
            if (source === entry) return entry
            if (!isBuiltin(source)) return null
            builtins.add(source.replace(/^node:/, '').split('/')[0]!)
            return { id: source, external: true }
          },
          load(id) {
            return id === entry ? code : null
          },
        },
      ],
    })) as Rollup.RollupOutput
    const bundle = output.output
      .filter((file): file is Rollup.OutputChunk => file.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n')
    if (/\bBuffer\b/.test(bundle) && !builtins.has('buffer')) builtins.add('Buffer')
    return { gzip: gzipSync(bundle).length, builtins: [...builtins].sort() }
  } catch (error) {
    return { error: String((error as Error).message ?? error).split('\n')[0]! }
  }
}

const only = process.argv.slice(2)
const sizes: Record<string, Record<string, Size>> = only.length && existsSync('.bench/sizes.json')
  ? JSON.parse(readFileSync('.bench/sizes.json', 'utf8'))
  : {}
for (const [name, { columns }] of Object.entries(tables)) {
  if (only.length && !only.includes(name)) continue
  sizes[name] = {}
  for (const column of columns)
    if (column.imports) sizes[name][column.name] = await measure(name, column.imports)
  console.log(name)
}

mkdirSync('.bench', { recursive: true })
writeFileSync('.bench/sizes.json', `${JSON.stringify(sizes, null, 2)}\n`)
