import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vite-plus/test';

// Lint rules see one file at a time, so they can't tell a package's public API from a helper that
// one module exports to another. This test reads each package's entry points with the TypeScript
// checker and checks the conventions in AGENTS.md that apply only to the public API.

const root = join(import.meta.dirname, '../../..');
const booleanNames = /^(is|has|can)[A-Z]/;
// Standard names for functions that return a boolean, from the platform or from common use, such
// as `crypto.subtle.verify`.
const allowedBooleanNames = new Set([
  'contains',
  'equal',
  'is',
  'needsRehash',
  'timingSafeEqual',
  'verify',
]);

type Entry = { name: string; subpath: string; file: string };

function entries(): Entry[] {
  const result: Entry[] = [];
  for (const dir of readdirSync(join(root, 'packages'))) {
    let json: {
      name: string;
      private?: boolean | undefined;
      exports?: Record<string, { src: string }> | undefined;
    };
    try {
      json = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (json.private) {
      continue;
    }
    for (const [subpath, target] of Object.entries(json.exports ?? {})) {
      if (subpath.includes('internal')) {
        continue;
      }
      result.push({ name: json.name, subpath, file: join(root, 'packages', dir, target.src) });
    }
  }
  return result;
}

function check(): string[] {
  const list = entries();
  const program = ts.createProgram(
    list.map((entry) => entry.file),
    {
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
    },
  );
  const checker = program.getTypeChecker();
  const problems: string[] = [];
  for (const entry of list) {
    const source = program.getSourceFile(entry.file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) {
      problems.push(`${entry.name} ${entry.subpath}: can't read the entry point`);
      continue;
    }
    const prefix = `${entry.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const name = `${prefix} ${exported.name}`;
      const isValue = (symbol.flags & ts.SymbolFlags.Value) !== 0;
      const docs = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
      const tags = new Set(symbol.getJsDocTags(checker).map((tag) => tag.name));
      if (!isValue && !(symbol.flags & ts.SymbolFlags.Type)) {
        continue;
      }
      if (!docs) {
        problems.push(`${name}: no JSDoc`);
      } else if (isValue && !tags.has('example')) {
        problems.push(`${name}: no @example`);
      } else if (!isValue && tags.has('example')) {
        problems.push(`${name}: @example on a type`);
      }
      if (!(symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable))) {
        continue;
      }
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!declaration) {
        continue;
      }
      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      if (type.getConstructSignatures().length > 0) {
        continue;
      }
      for (const signature of type.getCallSignatures()) {
        for (const parameter of signature.getParameters()) {
          const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
          const types = parameterType.isUnion() ? parameterType.types : [parameterType];
          const nonUndefined = types.filter((part) => !(part.flags & ts.TypeFlags.Undefined));
          if (
            nonUndefined.length > 0 &&
            nonUndefined.every((part) => part.flags & ts.TypeFlags.BooleanLike)
          ) {
            problems.push(`${name}: positional boolean parameter \`${parameter.name}\``);
          }
        }
        const returns =
          checker.getAwaitedType(signature.getReturnType()) ?? signature.getReturnType();
        const predicate = checker.getTypePredicateOfSignature(signature);
        const returnParts = (returns.isUnion() ? returns.types : [returns]).filter(
          (part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
        );
        const returnsBoolean =
          returnParts.length > 0 &&
          returnParts.every((part) => part.flags & ts.TypeFlags.BooleanLike);
        if (
          (returnsBoolean || predicate) &&
          !booleanNames.test(exported.name) &&
          !allowedBooleanNames.has(exported.name)
        ) {
          problems.push(`${name}: returns a boolean but doesn't start with is, has or can`);
        }
      }
    }
  }
  return [...new Set(problems)].sort();
}

test('public exports have JSDoc, boolean names and no positional booleans', () => {
  expect(check()).toEqual([]);
}, 120_000);
