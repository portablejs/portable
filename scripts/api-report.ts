// Writes packages/<name>/api.md: the declarations that each public entry point exports, without
// JSDoc or function bodies, so a pull request's diff shows every change to the public API.
// tools/lint/src/apiReport.test.ts fails when a report doesn't match the source. Run `pnpm api` to
// rewrite them all, or pass package names to rewrite only those.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const root = join(import.meta.dirname, '..');
const packagesDir = join(root, 'packages');

type PackageJson = {
  name: string;
  private?: boolean | undefined;
  exports?: Record<string, { src: string }> | undefined;
};

type Entry = { subpath: string; file: string };

// A top-level statement in a package's source, found by its file and name.
type Declaration = { file: string; name: string };

const printer = ts.createPrinter({ removeComments: true });

function readPackage(name: string): PackageJson {
  return JSON.parse(readFileSync(join(packagesDir, name, 'package.json'), 'utf8')) as PackageJson;
}

// The public entry points of a package. `./internal` is left out, because only other `@portable/*`
// packages import it.
function entriesOf(name: string): Entry[] {
  return Object.entries(readPackage(name).exports ?? {})
    .filter(([subpath]) => subpath !== './internal')
    .map(([subpath, target]) => ({ subpath, file: join(packagesDir, name, target.src) }));
}

export function packageNames(): string[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        const json = readPackage(name);
        return !json.private && json.exports !== undefined;
      } catch {
        return false;
      }
    })
    .sort();
}

// The package directory that `file` belongs to, such as `streams`.
function packageOf(file: string): string | undefined {
  const path = relative(packagesDir, file);
  return path.startsWith('..') ? undefined : path.split(sep)[0];
}

function createProgram(names: readonly string[]): ts.Program {
  const { config } = ts.readConfigFile(join(root, 'tsconfig.base.json'), (path) =>
    ts.sys.readFile(path),
  );
  const { options } = ts.convertCompilerOptionsFromJson(config.compilerOptions, root);
  const files = names.flatMap((name) => entriesOf(name).map((entry) => entry.file));
  return ts.createProgram(files, { ...options, noEmit: true });
}

// The top-level statement of the source file that contains `node`.
function topLevel(node: ts.Node): ts.Node {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    current = current.parent;
  }
  return current;
}

function statementNames(statement: ts.Node): string[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name &&
    ts.isIdentifier(statement.name)
  ) {
    return [statement.name.text];
  }
  return [];
}

const declarationCache = new Map<string, ts.SourceFile>();

// The declaration file that `tsc` emits for `file`. Every package sets `isolatedDeclarations`, so
// each file can be emitted on its own.
function declarationFile(file: string, options: ts.CompilerOptions): ts.SourceFile {
  let result = declarationCache.get(file);
  if (!result) {
    const { outputText } = ts.transpileDeclaration(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { ...options, removeComments: true },
    });
    result = ts.createSourceFile(`${file}.d.ts`, outputText, ts.ScriptTarget.Latest, true);
    declarationCache.set(file, result);
  }
  return result;
}

function print(declaration: Declaration, options: ts.CompilerOptions): string {
  const source = declarationFile(declaration.file, options);
  const statements = source.statements.filter((statement) =>
    statementNames(statement).includes(declaration.name),
  );
  if (statements.length === 0) {
    throw new Error(`No declaration of ${declaration.name} in ${declaration.file}`);
  }
  // A function's or class's namespace holds its `Options` type, so the namespace is printed after
  // the function or class it belongs to.
  const namespaces = statements.filter(ts.isModuleDeclaration);
  return [...statements.filter((statement) => !ts.isModuleDeclaration(statement)), ...namespaces]
    .map((statement) =>
      printer
        .printNode(ts.EmitHint.Unspecified, statement, source)
        .replace(/^export /, '')
        .replace(/^declare /, '')
        .replace(/^(?: {4})+/gm, (indent) => ' '.repeat(indent.length / 2)),
    )
    .join('\n');
}

const key = (declaration: Declaration): string => `${declaration.file}\0${declaration.name}`;

function byName(a: Declaration, b: Declaration): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.file < b.file ? -1 : 1;
}

function report(name: string, program: ts.Program): string {
  const checker = program.getTypeChecker();
  const options = program.getCompilerOptions();
  const sections: string[] = [];
  for (const entry of entriesOf(name)) {
    const source = program.getSourceFile(entry.file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) {
      throw new Error(`Can't read ${entry.file}`);
    }
    const exported = new Map<string, Declaration>();
    const reexports = new Map<string, string[]>();
    const renamed: string[] = [];
    for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const node = target.declarations?.[0];
      if (!node) {
        throw new Error(`${name} exports ${symbol.name} without a declaration`);
      }
      const file = node.getSourceFile().fileName;
      const owner = packageOf(file);
      if (owner !== name) {
        const from = owner ? readPackage(owner).name : file;
        reexports.set(from, [...(reexports.get(from) ?? []), symbol.name]);
        continue;
      }
      if (target.name !== symbol.name) {
        renamed.push(`export { ${target.name} as ${symbol.name} };`);
      }
      const declaration = { file, name: target.name } satisfies Declaration;
      exported.set(key(declaration), declaration);
    }

    // Collects the types and values that an export refers to if the entry point doesn't export them.
    // The report lists them too, because the export's signature can't be read without their shape.
    const referenced = new Map<string, Declaration>();
    const queue = [...exported.values()];
    const seen = new Set(queue.map(key));
    while (queue.length > 0) {
      const declaration = queue.shift() as Declaration;
      const statements = (program.getSourceFile(declaration.file)?.statements ?? []).filter(
        (statement) => statementNames(statement).includes(declaration.name),
      );
      const visit = (node: ts.Node): void => {
        if (ts.isBlock(node)) {
          return;
        }
        const reference = ts.isTypeReferenceNode(node)
          ? node.typeName
          : ts.isExpressionWithTypeArguments(node) || ts.isTypeQueryNode(node)
            ? ts.isTypeQueryNode(node)
              ? node.exprName
              : node.expression
            : undefined;
        if (reference) {
          let symbol = checker.getSymbolAtLocation(reference);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            symbol = checker.getAliasedSymbol(symbol);
          }
          for (const found of symbol?.declarations ?? []) {
            const file = found.getSourceFile().fileName;
            if (packageOf(file) !== name || file.endsWith('.d.ts')) {
              continue;
            }
            const statement = topLevel(found);
            for (const statementName of statementNames(statement)) {
              const next = { file, name: statementName } satisfies Declaration;
              if (!seen.has(key(next))) {
                seen.add(key(next));
                referenced.set(key(next), next);
                queue.push(next);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement)) {
          statement.typeParameters?.forEach(visit);
          statement.parameters.forEach(visit);
          if (statement.type) {
            visit(statement.type);
          }
        } else if (ts.isVariableStatement(statement)) {
          for (const variable of statement.declarationList.declarations) {
            if (variable.type) {
              visit(variable.type);
            }
          }
        } else if (ts.isClassDeclaration(statement)) {
          statement.heritageClauses?.forEach(visit);
          for (const member of statement.members) {
            const isPrivate =
              ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private ||
              (member.name && ts.isPrivateIdentifier(member.name));
            if (!isPrivate) {
              visit(member);
            }
          }
        } else {
          visit(statement);
        }
      }
    }

    const blocks = [...exported.values()].sort(byName).map((d) => print(d, options));
    const lines = [...reexports.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([from, names]) => `export { ${names.sort().join(', ')} } from '${from}';`);
    let code = [...lines, ...renamed.sort(), ...blocks].join('\n\n');
    if (referenced.size > 0) {
      code +=
        '\n\n// Not exported, but used by the exports above.\n\n' +
        [...referenced.values()]
          .sort(byName)
          .map((d) => print(d, options))
          .join('\n\n');
    }
    const specifier = `${readPackage(name).name}${entry.subpath.slice(1)}`;
    sections.push(`## ${specifier}\n\n\`\`\`ts\n${code}\n\`\`\`\n`);
  }
  return (
    `# ${readPackage(name).name} API\n\n` +
    '`pnpm api` generates this file from the source. It lists the declarations that each public ' +
    "entry point exports. Don't edit it by hand.\n\n" +
    sections.join('\n')
  );
}

// The report for each package in `names`, keyed by package directory name.
export function apiReports(names: readonly string[] = packageNames()): Map<string, string> {
  const program = createProgram(names);
  return new Map(names.map((name) => [name, report(name, program)]));
}

export const reportPath = (name: string): string => join(packagesDir, name, 'api.md');

if (import.meta.main) {
  const names = process.argv.slice(2);
  for (const [name, text] of apiReports(names.length > 0 ? names : packageNames())) {
    writeFileSync(reportPath(name), text);
  }
}
