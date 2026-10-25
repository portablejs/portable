import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vite-plus/test';

// Safari has no `ReadableStream.prototype[Symbol.asyncIterator]`, so `for await` over a stream
// throws there, while `for await` over a generator or an array works in every browser. A lint
// rule sees only syntax and can't tell the two apart, so this test reads package code with the
// TypeScript checker and reports a `for await` only when the value can be a `ReadableStream`.

const root = join(import.meta.dirname, '../../..');

const options = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
  customConditions: ['src'],
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  skipLibCheck: true,
} satisfies ts.CompilerOptions;

function sources(): string[] {
  const files: string[] = [];
  for (const dir of readdirSync(join(root, 'packages'))) {
    const src = join(root, 'packages', dir, 'src');
    let entries: string[];
    try {
      entries = readdirSync(src, { recursive: true, encoding: 'utf8' });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(join(src, entry));
      }
    }
  }
  return files;
}

function canBeStream(checker: ts.TypeChecker, type: ts.Type): boolean {
  const parts = type.isUnion() || type.isIntersection() ? type.types : [type];
  return parts.some(
    (part) =>
      part.getSymbol()?.getName() === 'ReadableStream' ||
      checker.getApparentType(part).getProperty('getReader') !== undefined,
  );
}

function check(program: ts.Program, files: readonly string[]): string[] {
  const checker = program.getTypeChecker();
  const problems: string[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (
        ts.isForOfStatement(node) &&
        node.awaitModifier &&
        canBeStream(checker, checker.getTypeAtLocation(node.expression))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        problems.push(`${relative(root, file)}:${line + 1}: for await over a ReadableStream`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return problems;
}

test('package code never uses for await over a ReadableStream', () => {
  const files = sources();
  expect(check(ts.createProgram(files, options), files)).toEqual([]);
}, 120_000);

test('reports for await over a stream and allows it over other iterables', () => {
  const file = join(root, 'virtual.ts');
  const code = [
    'declare const stream: ReadableStream<Uint8Array>',
    'declare const either: ReadableStream<number> | number[]',
    'declare const generator: AsyncGenerator<number>',
    'async function f() {',
    '  for await (const chunk of stream) chunk',
    '  for await (const value of either) value',
    '  for await (const value of generator) value',
    '  for await (const value of [1, 2]) value',
    '}',
  ].join('\n');
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === file
      ? ts.createSourceFile(name, code, ts.ScriptTarget.ES2022)
      : getSourceFile(name, ...rest);
  expect(check(ts.createProgram([file], options, host), [file])).toEqual([
    'virtual.ts:5: for await over a ReadableStream',
    'virtual.ts:6: for await over a ReadableStream',
  ]);
});
