import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vite-plus/test';

// Checks each package's package.json, test package, changeset and README against the rules in
// AGENTS.md "Package rules". A missing dependency passes every other check in the workspace,
// because pnpm links every workspace package, and fails only when someone installs the published
// package.

const root = join(import.meta.dirname, '../../..');
const names = readdirSync(join(root, 'packages')).filter((name) =>
  existsSync(join(root, 'packages', name, 'package.json')),
);
const rootReadme = readFileSync(join(root, 'README.md'), 'utf8');

// smtp needs a TCP socket API, which browsers don't have, so it lists the runtimes that do.
const runtimes: Record<string, { description: RegExp; readme: string }> = {
  smtp: {
    description: /, in any JavaScript runtime that has a TCP socket API\.$/,
    readme: 'Cloudflare Workers, Deno, Bun and Node 24+.',
  },
};
const defaultRuntimes = {
  description: /, in any JavaScript runtime\.$/,
  readme: 'Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.',
};

const fieldOrder = [
  'name',
  'description',
  'scripts',
  '[!start-pkg]',
  'version',
  'type',
  'sideEffects',
  'license',
  'repository',
  'keywords',
  'engines',
  'files',
  'dependencies',
  'exports',
  'main',
  'module',
  'types',
];

type Manifest = {
  name?: string | undefined;
  description?: string | undefined;
  type?: string | undefined;
  sideEffects?: boolean | undefined;
  license?: string | undefined;
  private?: boolean | undefined;
  repository?: { directory?: string | undefined } | undefined;
  engines?: { node?: string | undefined } | undefined;
  dependencies?: Record<string, string> | undefined;
  devDependencies?: Record<string, string> | undefined;
  exports?: Record<string, unknown> | undefined;
  main?: string | undefined;
  module?: string | undefined;
  types?: string | undefined;
};

function read(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
    .map((entry) => join(dir, entry));
}

/** The `@portable/*` packages that a package's source imports or re-exports, types included. */
function imported(name: string): string[] {
  const found = new Set<string>();
  for (const file of sources(join(root, 'packages', name, 'src'))) {
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
      const match = /^@portable\/([^/]+)/.exec(fileName);
      if (match && match[1] !== name) {
        found.add(`@portable/${match[1]}`);
      }
    }
  }
  return [...found].sort();
}

describe.each(names)('%s', (name) => {
  const dir = join(root, 'packages', name);
  const manifest = read(join(dir, 'package.json'));
  const runs = runtimes[name] ?? defaultRuntimes;

  test('package.json fields are in the order of packages/mail/package.json', () => {
    const keys = Object.keys(manifest);
    expect(keys).toEqual(fieldOrder.filter((key) => key !== 'dependencies' || keys.includes(key)));
  });

  test('package.json describes the published package', () => {
    expect(manifest.name).toBe(`@portable/${name}`);
    expect(manifest.description).toMatch(/^[A-Z]/);
    expect(manifest.description).toMatch(runs.description);
    expect(manifest.type).toBe('module');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.license).toBe('MIT');
    expect(manifest.repository?.directory).toBe(`packages/${name}`);
    expect(manifest.engines?.node).toBe('>=24');
  });

  test('each entry file has an exports entry, and each entry points at its files', () => {
    const entries = readdirSync(join(dir, 'src/exports')).filter((file) => file.endsWith('.ts'));
    const expected = Object.fromEntries(
      entries.map((file) => {
        const base = file.slice(0, -'.ts'.length);
        return [
          base === 'index' ? '.' : `./${base}`,
          {
            src: `./src/exports/${base}.ts`,
            types: `./dist/exports/${base}.d.ts`,
            default: `./dist/exports/${base}.js`,
          },
        ];
      }),
    );
    expect(manifest.exports).toEqual(expected);
    expect(manifest.main).toBe('./dist/exports/index.js');
    expect(manifest.module).toBe('./dist/exports/index.js');
    expect(manifest.types).toBe('./dist/exports/index.d.ts');
  });

  test('dependencies are the @portable packages its source imports, as workspace:*', () => {
    const dependencies = manifest.dependencies ?? {};
    expect(Object.keys(dependencies).sort()).toEqual(imported(name));
    for (const range of Object.values(dependencies)) {
      expect(range).toBe('workspace:*');
    }
  });

  test('the test directory is a private package that depends on the package', () => {
    const tests = read(join(dir, 'test/package.json'));
    expect(tests.name).toBe(`@portable/${name}-test`);
    expect(tests.private).toBe(true);
    expect(tests.devDependencies?.[`@portable/${name}`]).toBe('workspace:*');
  });

  test('the first release has a changeset', () => {
    const changeset = join(root, '.changeset', `${name}-initial.md`);
    expect(existsSync(changeset)).toBe(true);
    expect(readFileSync(changeset, 'utf8')).toContain(`'@portable/${name}':`);
  });

  test('the README starts with the name and the runtimes, and the root README lists it', () => {
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    const [title, description] = readme.split('\n\n', 2);
    expect(title).toBe(`# @portable/${name}`);
    expect(description).toContain(runs.readme);
    expect(readme).toMatch(/^## Why use this over /m);
    expect(rootReadme).toContain(`<a href="packages/${name}"><code>@portable/${name}</code></a>`);
  });
});
