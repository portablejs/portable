import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vite-plus/test'

// Type-checks every TypeScript example a reader might copy: the code blocks in the site's pages and
// the package READMEs, and the JSDoc `@example` blocks in package source. Examples leave out the
// code around them, such as the `request` of a fetch handler, so when an example uses a name it
// doesn't import or declare, the test declares it: a missing `@portable/*` namespace is imported,
// a capitalized name becomes a class with `any` members, and any other name gets its type from
// `conventional` or `any`.

const root = join(import.meta.dirname, '../../..')

type Example = { file: string; line: number; code: string; dir: string }

function walk(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path, extension)
    return extension.test(entry.name) ? [path] : []
  })
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

type Package = { name: string; dir: string; exports: Record<string, { src: string }> }

function packages(): Package[] {
  const result: Package[] = []
  for (const dir of readdirSync(join(root, 'packages'))) {
    const file = join(root, 'packages', dir, 'package.json')
    if (!existsSync(file)) continue
    const json = JSON.parse(readFileSync(file, 'utf8'))
    result.push({ name: json.name, dir: join(root, 'packages', dir), exports: json.exports ?? {} })
  }
  return result
}

function examples(list: readonly Package[]): Example[] {
  const result: Example[] = []
  const fence = /^```(?:ts|typescript)[^\S\n]*\n([\s\S]*?)^```/gm
  const markdown = [
    // site/src/pages/packages holds pages that gen.mjs generates from the READMEs.
    ...walk(join(root, 'site/src/pages'), /\.mdx?$/).filter(
      (file) => !file.includes('/pages/packages/'),
    ),
    ...list.map((pkg) => join(pkg.dir, 'README.md')).filter((file) => existsSync(file)),
  ]
  for (const file of markdown) {
    const text = readFileSync(file, 'utf8')
    const test = join(dirname(file), 'test')
    const dir = existsSync(test) ? test : dirname(file)
    for (const match of text.matchAll(fence))
      result.push({ file, line: lineOf(text, match.index) + 1, code: match[1]!, dir })
  }
  const jsdoc = /^[^\S\n]*\* ```ts\n([\s\S]*?)^[^\S\n]*\* ```/gm
  for (const pkg of list) {
    if (!existsSync(join(pkg.dir, 'src'))) continue
    const test = join(pkg.dir, 'test')
    for (const file of walk(join(pkg.dir, 'src'), /\.ts$/)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(jsdoc)) {
        const code = match[1]!.replace(/^[^\S\n]*\*(?: |$)/gm, '')
        result.push({ file, line: lineOf(text, match.index) + 1, code, dir: test })
      }
    }
  }
  return result
}

// Examples that span files import from './worker.ts' and the like. `rewriteRelativeImports`
// rewrites the specifier to `local:worker.ts`, and `localModules` declares that module with each
// named import as an `any` type and an `any` value.
function rewriteRelativeImports(code: string): string {
  return code.replace(/(from\s+)'\.\.?\/([^']*)'/g, "$1'local:$2'")
}

function localModules(codes: readonly string[]): string {
  const modules = new Map<string, Set<string>>()
  for (const code of codes)
    for (const match of code.matchAll(
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(local:[^']*)'/g,
    )) {
      const names = modules.get(match[2]!) ?? new Set()
      for (const name of match[1]!.split(',')) {
        const local = name
          .replace(/^\s*type\s+/, '')
          .trim()
          .split(/\s+/)[0]
        if (local) names.add(local)
      }
      modules.set(match[2]!, names)
    }
  return [...modules]
    .map(([module, names]) => {
      const exports = [...names].map(
        (name) => `export type ${name} = any; export declare const ${name}: any`,
      )
      return `declare module '${module}' { ${exports.join('; ')} }`
    })
    .join('\n')
}

// Names that examples use for a value of a fixed type.
const conventional: Record<string, string> = {
  bytes: 'Uint8Array',
  request: 'Request',
  response: 'Response',
  signal: 'AbortSignal',
}

const ambient = `
declare module 'cloudflare:sockets'
declare module 'cloudflare:workers' {
  export class DurableObject<env = any> {
    ctx: { storage: { kv: { get<value>(key: string): value | undefined; put(key: string, value: unknown): void } } }
    env: env
    constructor(ctx: any, env: env)
  }
}
// lib.dom.d.ts doesn't declare these. Workers and Node accept duplex on a request, and Workers
// accepts webSocket on a response.
interface RequestInit {
  duplex?: 'half' | undefined
}
interface ResponseInit {
  webSocket?: unknown
}
// Deno has no types package on npm.
declare namespace Deno {
  type Conn = any
  type TcpConn = any
}
declare const Deno: any
`

function check(): string[] {
  const list = packages()
  const namespaces = new Map<string, Package>()
  for (const pkg of list) {
    const short = pkg.name.replace('@portable/', '')
    namespaces.set(short.replaceAll('-', '').toLowerCase(), pkg)
  }
  const isNamespace = (name: string) => /^[A-Z]/.test(name) && namespaces.has(name.toLowerCase())

  const all = examples(list)
  const files = new Map<string, { example: Example; code: string }>()
  all.forEach((example, index) => {
    files.set(join(example.dir, `__example${index}.ts`), {
      example,
      code: rewriteRelativeImports(example.code),
    })
  })
  const ambientFile = join(root, '__examples.d.ts')
  let ambientCode = `${ambient}\n${localModules([...files.values()].map((entry) => entry.code))}`

  const options = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2024.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['node'],
    typeRoots: [join(root, 'node_modules/@types')],
    customConditions: ['src'],
    strict: true,
    noImplicitAny: false,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
  } satisfies ts.CompilerOptions

  // `@portable/*` imports resolve to each package's source, through the `src` condition of its
  // `exports`, whether or not the example's directory depends on the package.
  function resolvePortable(specifier: string): string | undefined {
    const match = /^(@portable\/[^/]+)(\/.*)?$/.exec(specifier)
    const pkg = match && list.find((candidate) => candidate.name === match[1])
    const target = pkg?.exports[`.${match?.[2] ?? ''}`]
    return pkg && target ? join(pkg.dir, target.src) : undefined
  }

  function compile() {
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile.bind(host)
    const fileExists = host.fileExists.bind(host)
    const readFile = host.readFile.bind(host)
    host.getSourceFile = (file, language) => {
      if (file === ambientFile) return ts.createSourceFile(file, ambientCode, language)
      const entry = files.get(file)
      return entry ? ts.createSourceFile(file, entry.code, language) : getSourceFile(file, language)
    }
    host.fileExists = (file) => file === ambientFile || files.has(file) || fileExists(file)
    host.readFile = (file) =>
      file === ambientFile ? ambientCode : (files.get(file)?.code ?? readFile(file))
    host.resolveModuleNameLiterals = (literals, containingFile, redirect, compilerOptions) =>
      literals.map((literal) => {
        const portable = resolvePortable(literal.text)
        if (portable)
          return {
            resolvedModule: { resolvedFileName: portable, extension: ts.Extension.Ts },
          }
        return ts.resolveModuleName(
          literal.text,
          containingFile,
          compilerOptions,
          host,
          undefined,
          redirect,
        )
      })
    return ts.createProgram([ambientFile, ...files.keys()], options, host)
  }

  // The first compile collects the names each example uses without declaring them and the
  // libraries it imports that aren't installed. The loop after it declares them, and the second
  // compile reports the errors that remain.
  for (const entry of files.values())
    if (hasTopLevelReturn(entry.code)) entry.code = wrapInFunction(entry.code)
  const undeclared = new Map<string, Set<string>>()
  for (const diagnostic of ts.getPreEmitDiagnostics(compile())) {
    const file = diagnostic.file
    if (!file || !files.has(file.fileName) || diagnostic.start === undefined) continue
    const name = file.text.slice(diagnostic.start, diagnostic.start + diagnostic.length!)
    // If only an example imports a library, such as cborg in rpc's README, the library isn't
    // installed, so the test declares it as an untyped module.
    if (diagnostic.code === 2307 && !name.includes('@portable/'))
      ambientCode += `\ndeclare module ${name}`
    if (![2304, 2503, 2552, 18004].includes(diagnostic.code)) continue
    const names = undeclared.get(file.fileName) ?? new Set()
    undeclared.set(file.fileName, names.add(name))
  }
  for (const [file, entry] of files) {
    for (const name of undeclared.get(file) ?? []) {
      const pkg = isNamespace(name) ? namespaces.get(name.toLowerCase()) : undefined
      entry.code += pkg
        ? `\nimport * as ${name} from '${pkg.name}'`
        : /^[A-Z]/.test(name)
          ? `\ndeclare class ${name} {\n  constructor(...args: any[])\n  [key: string]: any\n}`
          : `\ndeclare let ${name}: ${conventional[name] ?? 'any'}`
    }
  }

  const problems: string[] = []
  for (const diagnostic of ts.getPreEmitDiagnostics(compile())) {
    const entry = diagnostic.file && files.get(diagnostic.file.fileName)
    if (!entry || diagnostic.start === undefined) continue
    const line =
      entry.example.line + diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start).line
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
    problems.push(`${relative(root, entry.example.file)}:${line} ${message}`)
  }
  return [...new Set(problems)]
}

// Some examples show only the body of a fetch handler and return a `Response` at the top level,
// which TypeScript rejects outside a function.
function hasTopLevelReturn(code: string): boolean {
  const visit = (node: ts.Node): boolean =>
    ts.isReturnStatement(node) ||
    (!ts.isFunctionLike(node) && ts.forEachChild(node, visit) === true)
  return visit(ts.createSourceFile('example.ts', code, ts.ScriptTarget.ES2022))
}

// Keeps the imports at the top and puts the rest in an async function on the same lines, so line
// numbers don't change.
function wrapInFunction(code: string): string {
  const source = ts.createSourceFile('example.ts', code, ts.ScriptTarget.ES2022)
  const imports = source.statements.filter((statement) => ts.isImportDeclaration(statement))
  const end = imports.length > 0 ? imports[imports.length - 1]!.end : 0
  return `${code.slice(0, end)}; async function example() {${code.slice(end)}\n}\n`
}

test('TypeScript examples type-check', () => {
  expect(check()).toEqual([])
}, 120_000)
