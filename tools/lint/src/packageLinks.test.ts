import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { findUnlinkedMentions } from './packageLinks.js';

// Checks that the root README, the package READMEs, and the site's own pages link each Portable
// package they mention to its page (see `findUnlinkedMentions`).

const root = join(import.meta.dirname, '../../..');
const names = new Set(
  readdirSync(join(root, 'packages')).filter((name) =>
    existsSync(join(root, 'packages', name, 'package.json')),
  ),
);
const pages = join(root, 'site/src/pages');
const files = [
  { file: 'README.md', self: undefined },
  ...[...names].map((name) => ({ file: `packages/${name}/README.md`, self: name })),
  ...readdirSync(pages)
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => ({ file: `site/src/pages/${file}`, self: undefined })),
  ...readdirSync(join(pages, 'guides')).map((file) => ({
    file: `site/src/pages/guides/${file}`,
    self: undefined,
  })),
];

test('every page links the packages it mentions', () => {
  const found: string[] = [];
  for (const { file, self } of files) {
    const markdown = readFileSync(join(root, file), 'utf8');
    for (const { line, name } of findUnlinkedMentions(markdown, { names, self })) {
      found.push(`${file}:${line + 1}: @portable/${name}`);
    }
  }
  expect(found).toEqual([]);
});

test('findUnlinkedMentions finds the first plain mention in each block', () => {
  const options = { names: new Set(['dkim', 'mail', 'streams']), self: 'mail' };
  const find = (markdown: string) =>
    findUnlinkedMentions(markdown, options).map(({ line, name }) => `${line}:${name}`);
  expect(find('Sign it with @portable/dkim, as @portable/dkim does.')).toEqual(['0:dkim']);
  expect(find('Sign it with [@portable/dkim](../dkim/README.md).\nThen @portable/dkim')).toEqual(
    [],
  );
  expect(find('Sign it with @portable/dkim.\n\nThen @portable/dkim.')).toEqual([
    '0:dkim',
    '2:dkim',
  ]);
  expect(find('- @portable/dkim\n- @portable/dkim')).toEqual(['0:dkim', '1:dkim']);
  expect(find('This is @portable/mail.')).toEqual([]);
  expect(find('Import `@portable/streams` from @portable/streams/node.')).toEqual([]);
  expect(find('# @portable/streams\n```ts\n@portable/streams\n```')).toEqual([]);
  expect(find('| @portable/streams | 1.2 kB |')).toEqual([]);
  expect(find('Use @portable/other.')).toEqual([]);
});
