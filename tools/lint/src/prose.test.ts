import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vite-plus/test';

// Rejects prose built around a made-up actor, such as "an app that supports older browsers adds
// its own" or "a caller who wants a few tries writes a counter". Say "if you support older
// browsers, add them yourself" instead. Text in double quotes is skipped, so a rule can quote the
// pattern, and so are the rows of the table in AGENTS.md, which quote it without quotes.

const root = join(import.meta.dirname, '../../..');

const pattern =
  /\b(?:an?|any|each|every) (?:app|application|caller|user|program|developer|consumer)s? (?:that|who) /i;

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
].filter((file) => file !== import.meta.filename);

test('no prose describes a made-up app, caller or user', () => {
  const found: string[] = [];
  for (const file of files) {
    const agents = file === join(root, 'AGENTS.md');
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (agents && line.startsWith('|')) {
          return;
        }
        const match = pattern.exec(line.replaceAll(/"[^"]*"/g, ''));
        if (match) {
          found.push(`${relative(root, file)}:${index + 1}: ${match[0]}`);
        }
      });
  }
  expect(found).toEqual([]);
});
