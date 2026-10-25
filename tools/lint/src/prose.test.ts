import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { findMadeUpActor } from '../../../scripts/prose.js';

// Rejects prose built around a made-up actor (see `findMadeUpActor`) in Markdown and source. The
// rows of the table in AGENTS.md quote the pattern without quotes, so they are skipped.

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
].filter((file) => file !== join(root, 'scripts/prose.ts'));

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
        const phrase = findMadeUpActor(line);
        if (phrase) {
          found.push(`${relative(root, file)}:${index + 1}: ${phrase}`);
        }
      });
  }
  expect(found).toEqual([]);
});
