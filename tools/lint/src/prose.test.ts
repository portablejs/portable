import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vite-plus/test';
import {
  findCodePackageName,
  findMadeUpActor,
  findMissingSerialComma,
  findRuledOutWord,
} from './prose.js';

// Rejects prose built around a made-up actor (see `findMadeUpActor`) in Markdown and source. The
// rows of the table in AGENTS.md contain the pattern without quotes, so the test skips them.
//
// Also rejects a list without a serial comma (see `findMissingSerialComma`) in Markdown outside
// code blocks, in comments, in test names, and in package descriptions. It skips the first column
// of the tables in AGENTS.md, which holds the sentences to avoid, and of the tables in PARITY.md,
// which holds upstream test names.
//
// The test also rejects an em dash, AI vocabulary, or a figurative word (see `findRuledOutWord`) in
// Markdown, comments, and test names. It skips AGENTS.md, which lists the words.
//
// Last, it rejects a package name in a code span (see `findCodePackageName`) in Markdown, comments,
// and test names, outside the first column of the tables in AGENTS.md.

const root = join(import.meta.dirname, '../../..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.git', 'fixtures'].includes(entry.name)) {
      return [];
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return path === join(root, 'site/src/pages/packages') ? [] : walk(path);
    }
    return /\.(?:md|mdx|ts)$/.test(entry.name) ? [path] : [];
  });
}

const files = [
  join(root, 'README.md'),
  join(root, 'AGENTS.md'),
  ...['docs', '.changeset', 'packages', 'scripts', 'site/src', 'tools'].flatMap((dir) =>
    walk(join(root, dir)),
  ),
].filter((file) => file !== join(root, 'tools/lint/src/prose.ts'));

test('no prose describes a made-up app, caller, or user', () => {
  const found: string[] = [];
  for (const file of files) {
    const agents = file === join(root, 'AGENTS.md');
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (agents && line.startsWith('|')) {
          return;
        }
        const phrase = findMadeUpActor(line);
        if (phrase) {
          found.push(`${relative(root, file)}:${index + 1}: ${phrase}`);
        }
      });
  }
  expect(found).toEqual([]);
});

const testName = /\b(?:describe|it|test)(?:\.\w+)*\(\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/;

// Returns the prose in `file`: each Markdown line, and each comment and test name in source, but
// not the lines in a fenced code block.
function proseLines(file: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let fenced = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const markdown = /\.mdx?$/.test(file);
      const comment = markdown ? undefined : /^\s*(?:\/\/|\/\*\*|\*)(.*)$/.exec(line)?.[1];
      const text = markdown ? line : comment;
      if (text !== undefined && /^\s*(?:```|~~~)/.test(text)) {
        fenced = !fenced;
        return;
      }
      if (fenced) {
        return;
      }
      const name = markdown ? undefined : testName.exec(line)?.[2];
      for (const prose of [text, name]) {
        if (prose === undefined) {
          continue;
        }
        const cells = /(?:AGENTS|PARITY)\.md$/.test(file) && prose.startsWith('|');
        lines.push({ line: index + 1, text: cells ? prose.slice(prose.indexOf('|', 1)) : prose });
      }
    });
  return lines;
}

test('every list of three or more items has a serial comma', () => {
  const found: string[] = [];
  for (const file of files) {
    for (const { line, text } of proseLines(file)) {
      const list = findMissingSerialComma(text);
      if (list) {
        found.push(`${relative(root, file)}:${line}: ${list}`);
      }
    }
  }
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifest = join(root, 'packages', dir, 'package.json');
    const { description } = JSON.parse(readFileSync(manifest, 'utf8')) as {
      description?: string | undefined;
    };
    const list = description === undefined ? undefined : findMissingSerialComma(description);
    if (list) {
      found.push(`${relative(root, manifest)}: ${list}`);
    }
  }
  expect(found).toEqual([]);
});

test('no prose uses an em dash, AI vocabulary, or a figurative verb', () => {
  const found: string[] = [];
  for (const file of files.filter((file) => file !== join(root, 'AGENTS.md'))) {
    for (const { line, text } of proseLines(file)) {
      const word = findRuledOutWord(text);
      if (word) {
        found.push(`${relative(root, file)}:${line}: ${word}`);
      }
    }
  }
  expect(found).toEqual([]);
});

test('no prose puts a package name in a code span', () => {
  const found: string[] = [];
  for (const file of files) {
    for (const { line, text } of proseLines(file)) {
      const name = findCodePackageName(text);
      if (name) {
        found.push(`${relative(root, file)}:${line}: ${name}`);
      }
    }
  }
  expect(found).toEqual([]);
});

test('findCodePackageName finds package names and skips subpaths', () => {
  expect(findCodePackageName('Errors extend the classes in `@portable/errors`.')).toBe(
    '`@portable/errors`',
  );
  expect(findCodePackageName('It takes `@noble/hashes` as a peer.')).toBe('`@noble/hashes`');
  expect(findCodePackageName("Pass the `ws` package's class.")).toBe('`ws` package');
  expect(findCodePackageName('- [`lines`](/packages/lines) splits bytes.')).toBe(
    '[`lines`](/packages/lines',
  );
  expect(findCodePackageName('Import `@portable/streams/node` in Node.')).toBeUndefined();
  expect(findCodePackageName('The [`Spf.check`](../spf/README.md) result.')).toBeUndefined();
  expect(findCodePackageName('Never write "`@portable/errors`".')).toBeUndefined();
  expect(findCodePackageName('Errors extend the classes in @portable/errors.')).toBeUndefined();
});

test('findRuledOutWord skips code spans and quotations', () => {
  expect(findRuledOutWord('The cache absorbs the burst of reads.')).toBe('absorbs');
  expect(findRuledOutWord('It stops — and then waits.')).toBe('—');
  expect(findRuledOutWord('A crucial step.')).toBe('crucial');
  expect(findRuledOutWord('Never write "lands" or `seam`.')).toBeUndefined();
  expect(findRuledOutWord('The landscape of islands.')).toBeUndefined();
});

test('findMissingSerialComma finds lists and skips clauses', () => {
  expect(findMissingSerialComma('`fetch`, `Request` and `Response` are global.')).toBe(
    '`fetch`, `Request` and `Response`',
  );
  expect(findMissingSerialComma('A row ends at CRLF, LF or CR.')).toBe('ends at CRLF, LF or CR.');
  expect(findMissingSerialComma('A row ends at CRLF, LF, or CR.')).toBeUndefined();
  expect(findMissingSerialComma('It rejects "a, b and c" as written.')).toBeUndefined();
  expect(findMissingSerialComma('Use `f(a, b)` and `g`.')).toBeUndefined();
  expect(findMissingSerialComma('When it aborts, `encode` and `decode` reject.')).toBeUndefined();
  expect(findMissingSerialComma('`exports`, whether or not it has one.')).toBeUndefined();
  expect(
    findMissingSerialComma('Names are signed, sorted by name and then value.'),
  ).toBeUndefined();
});
