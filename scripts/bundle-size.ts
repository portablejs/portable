// Writes .bench/sizes.json: each package and each library it replaces, bundled for the browser,
// minified and gzipped. Ours is read from `dist/`, so run `pnpm build` first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build, type Rollup } from 'vite-plus'

const upstreams: Record<string, Record<string, string>> = {
  streams: { 'get-stream': 'get-stream', merge2: 'merge2' },
  lines: { split2: 'split2' },
  base64: { libbase64: 'libbase64', 'base64-js': 'base64-js', 'js-base64': 'js-base64' },
  'quoted-printable': { libqp: 'libqp', 'quoted-printable': 'quoted-printable' },
  charset: { 'iconv-lite': 'iconv-lite' },
  'dns-packet': { 'dns-packet': 'dns-packet' },
  'json-stream': { JSONStream: 'JSONStream', 'json-stream-stringify': 'json-stream-stringify' },
  jsonl: { ndjson: 'ndjson' },
  'mime-headers': {
    libmime: 'libmime',
    addressparser: 'nodemailer/lib/addressparser',
    'email-addresses': 'email-addresses',
  },
  'image-size': { 'image-size': 'image-size' },
  exif: { 'exif-parser': 'exif-parser', 'exif-reader': 'exif-reader' },
  png: { pngjs: 'pngjs' },
  dns: { tangerine: 'tangerine' },
  webhooks: {
    standardwebhooks: 'standardwebhooks',
    svix: 'svix',
    stripe: 'stripe',
    '@octokit/webhooks-methods': '@octokit/webhooks-methods',
  },
  oauth1: { 'oauth-1.0a': 'oauth-1.0a', oauth: 'oauth' },
  spf: { mailauth: 'mailauth/lib/spf/index.js' },
}

export type Size = { gzip: number; nodeOnly: boolean }

async function measure(name: string, specifier: string): Promise<Size> {
  const dir = resolve(`packages/${name}/test`)
  const entry = `${dir}/__size_entry.js`
  let nodeOnly = false
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
          nodeOnly = true
          return { id: source, external: true }
        },
        load(id) {
          if (id !== entry) return null
          return `import * as m from '${specifier}'\nglobalThis.__size = m`
        },
      },
    ],
  })) as Rollup.RollupOutput
  const code = output.output
    .filter((file): file is Rollup.OutputChunk => file.type === 'chunk')
    .map((chunk) => chunk.code)
    .join('\n')
  if (/\bBuffer\b/.test(code)) nodeOnly = true
  return { gzip: gzipSync(code).length, nodeOnly }
}

const sizes: Record<string, { ours: Size; upstream: Record<string, Size> }> = {}
for (const [name, libraries] of Object.entries(upstreams)) {
  const upstream: Record<string, Size> = {}
  for (const [label, specifier] of Object.entries(libraries))
    upstream[label] = await measure(name, specifier)
  sizes[name] = { ours: await measure(name, `@portable/${name}`), upstream }
}

mkdirSync('.bench', { recursive: true })
writeFileSync('.bench/sizes.json', `${JSON.stringify(sizes, null, 2)}\n`)
