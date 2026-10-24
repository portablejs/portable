// Generates an API reference page per package from the exports' JSDoc, as ox does with api-extractor.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)))
const ts = createRequire(join(repo, 'package.json'))('typescript')

const pascal = (s) => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())
const printer = ts.createPrinter({ removeComments: true })

export function api(name) {
  const pkg = JSON.parse(readFileSync(join(repo, 'packages', name, 'package.json'), 'utf8'))
  const entries = Object.entries(pkg.exports).filter(([key]) => key !== './internal')
  const files = entries.map(([, value]) => join(repo, 'packages', name, value.src))
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    exactOptionalPropertyTypes: true,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  })
  const checker = program.getTypeChecker()
  const ns = pascal(name)
  let md = `# @portable/${name}\n\n`
  for (const [i, file] of files.entries()) {
    const sub = entries[i][0]
    if (files.length > 1) {
      md += `## \`@portable/${name}${sub.slice(1)}\`\n\n`
    }
    const source = program.getSourceFile(file)
    const symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(source))
    const sections = { Functions: [], Classes: [], Constants: [], Errors: [], Types: [] }
    for (const exported of symbols) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const decls = symbol.declarations ?? []
      const doc = ts.displayPartsToString(symbol.getDocumentationComment(checker))
      const tags = symbol
        .getJsDocTags(checker)
        .map((t) => ({ name: t.name, text: ts.displayPartsToString(t.text) }))
      const fn = decls.filter(ts.isFunctionDeclaration)
      const cls = decls.find(ts.isClassDeclaration)
      const variable = decls.find(ts.isVariableDeclaration)
      const alias = decls.find(ts.isTypeAliasDeclaration)
      let section
      let signature = ''
      if (fn.length) {
        section = 'Functions'
        const overloads = fn.filter((d) => !d.body)
        signature = (overloads.length ? overloads : fn)
          .map((d) =>
            print(
              ts.factory.updateFunctionDeclaration(
                d,
                stripExport(d.modifiers),
                d.asteriskToken,
                d.name,
                d.typeParameters,
                d.parameters,
                d.type,
                undefined,
              ),
            ),
          )
          .join('\n')
      } else if (cls) {
        const heritage = cls.heritageClauses?.map((h) => h.getText()).join(' ') ?? ''
        section = /\bextends\s+[\w.]*Error\b/.test(heritage) ? 'Errors' : 'Classes'
        const ctors = cls.members.filter(ts.isConstructorDeclaration)
        const ctorSigs = (
          ctors.filter((c) => !c.body).length ? ctors.filter((c) => !c.body) : ctors
        ).map(
          (c) =>
            `  constructor(${c.parameters.map((p) => print(ts.factory.updateParameterDeclaration(p, undefined, p.dotDotDotToken, p.name, p.questionToken, p.type, p.initializer))).join(', ')})`,
        )
        const props = cls.members
          .filter(
            (m) =>
              (ts.isPropertyDeclaration(m) || ts.isGetAccessor(m)) &&
              !m.modifiers?.some(
                (x) =>
                  x.kind === ts.SyntaxKind.PrivateKeyword ||
                  x.kind === ts.SyntaxKind.ProtectedKeyword,
              ) &&
              !ts.isPrivateIdentifier(m.name),
          )
          .map(
            (m) =>
              `  ${m.modifiers?.some((x) => x.kind === ts.SyntaxKind.ReadonlyKeyword) || ts.isGetAccessor(m) ? 'readonly ' : ''}${m.name.getText()}: ${m.type ? m.type.getText() : checker.typeToString(checker.getTypeAtLocation(m))}`,
          )
        signature = `class ${symbol.name} ${heritage} {\n${[...ctorSigs, ...props].join('\n')}\n}`
      } else if (variable) {
        section = 'Constants'
        signature = `const ${symbol.name}: ${variable.type ? variable.type.getText() : checker.typeToString(checker.getTypeAtLocation(variable), undefined, ts.TypeFormatFlags.NoTruncation)}`
      } else if (alias) {
        section = 'Types'
        signature = print(
          ts.factory.updateTypeAliasDeclaration(
            alias,
            stripExport(alias.modifiers),
            alias.name,
            alias.typeParameters,
            alias.type,
          ),
        )
      } else {
        continue
      }

      let entry = `### \`${ns}.${symbol.name}\`\n\n`
      if (doc) {
        entry += `${doc}\n\n`
      }
      entry += '```ts\n' + signature.replace(/\n{2,}/g, '\n') + '\n```\n\n'
      const options = optionsOf(symbol, decls, checker)
      if (options.length) {
        entry += '| Option | Type | Default | Description |\n| --- | --- | --- | --- |\n'
        for (const o of options) {
          entry += `| \`${o.name}\` | \`${cell(o.type)}\` | ${!o.default ? '' : o.default.includes('`') ? cell(o.default) : `\`${cell(o.default)}\``} | ${cell(o.doc)} |\n`
        }
        entry += '\n'
      }
      const throws = tags.filter((t) => t.name === 'throws')
      if (throws.length) {
        entry += '**Throws**\n\n'
        for (const t of throws) {
          entry += `- ${t.text.replace(/^\{(\w+)\}\s*/, '`$1` ')}\n`
        }
        entry += '\n'
      }
      for (const t of tags.filter((t) => t.name === 'example')) {
        entry += `${t.text.trim()}\n\n`
      }
      sections[section].push(entry)
    }
    for (const [title, entries] of Object.entries(sections)) {
      if (!entries.length) {
        continue
      }
      md +=
        `${files.length > 1 ? '###' : '##'} ${title}\n\n` +
        (files.length > 1 ? entries.map((e) => e.replace(/^### /, '#### ')) : entries).join('')
    }
  }
  return md
}

function stripExport(modifiers) {
  return modifiers?.filter(
    (m) => m.kind !== ts.SyntaxKind.ExportKeyword && m.kind !== ts.SyntaxKind.DeclareKeyword,
  )
}

function print(node) {
  return printer.printNode(
    ts.EmitHint.Unspecified,
    node,
    node.getSourceFile?.() ?? ts.createSourceFile('x.ts', '', ts.ScriptTarget.ESNext),
  )
}

// The `<name>.Options` type that a function or class declares in its namespace.
function optionsOf(symbol, decls, checker) {
  const module = decls.find(ts.isModuleDeclaration)
  if (!module?.body || !ts.isModuleBlock(module.body)) {
    return []
  }
  const alias = module.body.statements.find(
    (s) => ts.isTypeAliasDeclaration(s) && s.name.text === 'Options',
  )
  if (!alias) {
    return []
  }
  const type = checker.getTypeAtLocation(alias.name)
  return checker.getPropertiesOfType(type).map((p) => {
    const tags = p.getJsDocTags(checker)
    return {
      name: p.name,
      type: checker
        .typeToString(
          checker.getTypeOfSymbolAtLocation(p, alias),
          alias,
          ts.TypeFormatFlags.NoTruncation,
        )
        .replace(/ \| undefined$/, ''),
      default: tags.find((t) => t.name === 'default')
        ? ts.displayPartsToString(tags.find((t) => t.name === 'default').text)
        : '',
      doc: ts.displayPartsToString(p.getDocumentationComment(checker)),
    }
  })
}

function cell(text) {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}
