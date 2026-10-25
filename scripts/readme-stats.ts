// Writes the benchmark and stats tables in each package README, between `<!-- bench:start -->` and
// `<!-- bench:end -->`, from the tables in scripts/readme-tables.ts, the reports that `pnpm bench`
// writes to .bench/<package>.json and the sizes in .bench/sizes.json. `pnpm readme` produces all of
// them first. If a README has no markers, they are added at the end of its "Why use this" section.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Size } from './bundle-size.ts';
import { type Column, type Row, type Table, tables } from './readme-tables.ts';

type BenchTask = { name: string; throughput: { mean: number } };
type BenchReport = {
  testResults: {
    assertionResults: { fullName: string; benchmarks?: { tasks: BenchTask[] }[] | undefined }[];
  }[];
};
type Machine = { node: string; cpu: string; cores: number };
type PackageJson = {
  name: string;
  version?: string | undefined;
  main?: string | undefined;
  types?: string | undefined;
  typings?: string | undefined;
  exports?: unknown;
  dependencies?: Record<string, string> | undefined;
};

const readJson = <value>(path: string): value | undefined =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as value) : undefined;

const machine = readJson<Machine>('.bench/machine.json');
const sizes = readJson<Record<string, Record<string, Size>>>('.bench/sizes.json') ?? {};

const header = (column: Column) => column.header ?? column.name;

function opsPerSecond(hz: number): string {
  if (hz < 100) {
    return hz.toPrecision(3);
  }
  const step = 10 ** (Math.floor(Math.log10(hz)) - 2);
  return (Math.round(hz / step) * step).toLocaleString('en-US');
}

function taskFor(row: Row, column: Column): string | null {
  if (row.tasks && column.name in row.tasks) {
    return row.tasks[column.name]!;
  }
  return column.name;
}

function benchTable(name: string, table: Table): string | undefined {
  const report = readJson<BenchReport>(`.bench/${name}.json`);
  if (!report) {
    return undefined;
  }
  const tests = report.testResults.flatMap((file) => file.assertionResults);
  const lines = [
    `| | ${table.columns.map(header).join(' | ')} |`,
    `| --- |${' ---: |'.repeat(table.columns.length)}`,
  ];
  for (const row of table.rows) {
    const test = tests.find(({ fullName }) =>
      typeof row.test === 'string' ? fullName.includes(row.test) : row.test.test(fullName),
    );
    if (!test) {
      console.warn(`${name}: no test matches ${row.test} for "${row.label}"`);
    }
    const tasks = test?.benchmarks?.flatMap((benchmark) => benchmark.tasks) ?? [];
    const cells = table.columns.map((column) => {
      const task = taskFor(row, column);
      const hz = task && tasks.find((candidate) => candidate.name === task)?.throughput.mean;
      return hz ? opsPerSecond(hz) : '–';
    });
    if (test && cells[0] === '–') {
      console.warn(`${name}: "${row.label}" has no result for us`);
    }
    lines.push(`| ${row.label} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

const packageName = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

/** The directory of `name` as Node would find it from `from`, with symlinks resolved. */
function findPackage(from: string, name: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    if (dirname(dir) === dir) {
      return undefined;
    }
  }
}

const packageJson = (dir: string) => readJson<PackageJson>(join(dir, 'package.json'))!;

/** Counts the packages installed with the column's imports, not counting the imported package. */
function dependencyCount(testDir: string, column: Column): number | undefined {
  const seen = new Set<string>();
  const queue = column.imports!.map(({ from }) => [testDir, packageName(from)]) satisfies [
    string,
    string,
  ][];
  while (queue.length) {
    const [from, name] = queue.shift()!;
    const dir = findPackage(from, name);
    if (!dir) {
      return undefined;
    }
    if (seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    for (const dependency of Object.keys(packageJson(dir).dependencies ?? {})) {
      queue.push([dir, dependency]);
    }
  }
  return seen.size - 1;
}

function typesOf(testDir: string, column: Column): string {
  const name = packageName(column.imports![0].from);
  const dir = findPackage(testDir, name);
  if (!dir) {
    return '–';
  }
  const json = packageJson(dir);
  if (
    json.types ||
    json.typings ||
    JSON.stringify(json.exports ?? {}).includes('"types"') ||
    existsSync(join(dir, 'index.d.ts')) ||
    (json.main !== undefined && existsSync(join(dir, json.main.replace(/\.[cm]?js$/, '.d.ts'))))
  ) {
    return 'included';
  }
  const typesName = `@types/${name.replace(/^@/, '').replace('/', '__')}`;
  return findPackage(testDir, typesName) ? `\`${typesName}\`` : 'none';
}

function versionOf(testDir: string, column: Column): string {
  const name = packageName(column.imports![0].from);
  if (name.startsWith('@portable/')) {
    return '–';
  }
  const dir = findPackage(testDir, name);
  return dir ? (packageJson(dir).version ?? '–') : '–';
}

const kB = (gzip: number) => `${(gzip / 1000).toFixed(gzip < 10_000 ? 1 : 0)} kB`;

function statsTable(name: string, table: Table): string {
  const testDir = resolve(`packages/${name}/test`);
  const measured = sizes[name] ?? {};
  const cell = (column: Column, library: () => string, platform: Record<'node' | 'web', string>) =>
    column.imports ? library() : platform[column.platform ?? 'web'];
  const rows = [
    [
      'Minified and gzipped',
      (column) =>
        cell(
          column,
          () => {
            const size = measured[column.name];
            if (!size) {
              return 'not measured';
            }
            return 'error' in size ? 'does not bundle' : kB(size.gzip);
          },
          { node: 'built in', web: 'built in' },
        ),
    ],
    [
      'Runtime dependencies',
      (column) =>
        cell(column, () => String(dependencyCount(testDir, column) ?? '–'), {
          node: '–',
          web: '–',
        }),
    ],
    [
      'Node built-ins used',
      (column) =>
        cell(
          column,
          () => {
            const size = measured[column.name];
            if (!size || 'error' in size) {
              return '–';
            }
            return size.builtins.length
              ? size.builtins.map((builtin) => `\`${builtin}\``).join(', ')
              : 'none';
          },
          { node: 'Node only', web: 'none' },
        ),
    ],
    [
      'TypeScript types',
      (column) => cell(column, () => typesOf(testDir, column), { node: '–', web: '–' }),
    ],
    [
      'Version compared',
      (column) => cell(column, () => versionOf(testDir, column), { node: '–', web: '–' }),
    ],
  ] satisfies [string, (column: Column) => string][];
  return [
    `| | ${table.columns.map(header).join(' | ')} |`,
    `| --- |${' --- |'.repeat(table.columns.length)}`,
    ...rows.map(([label, value]) => `| ${label} | ${table.columns.map(value).join(' | ')} |`),
  ].join('\n');
}

function block(name: string, table: Table): string | undefined {
  const bench = benchTable(name, table);
  if (!bench) {
    return undefined;
  }
  const runtime = machine
    ? `Node ${machine.node.replace(/^v/, '')}, on ${machine.cpu} (${machine.cores} cores)`
    : 'Node';
  return [
    bench,
    '',
    `Operations per second from \`pnpm bench\`, higher is better, in ${runtime}. A dash means the library has no equivalent.`,
    '',
    statsTable(name, table),
    '',
    'Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.',
  ].join('\n');
}

const start = '<!-- bench:start -->';
const end = '<!-- bench:end -->';
const markers = new RegExp(`${start}[\\s\\S]*?${end}`);

for (const [name, table] of Object.entries(tables)) {
  const path = `packages/${name}/README.md`;
  if (!existsSync(path)) {
    console.warn(`${name}: no README.md`);
    continue;
  }
  const content = block(name, table);
  if (!content) {
    console.warn(`${name}: no .bench/${name}.json, run pnpm bench ${name}`);
    continue;
  }
  const replacement = `${start}\n${content}\n${end}`;
  let text = readFileSync(path, 'utf8');
  if (markers.test(text)) {
    text = text.replace(markers, () => replacement);
  } else {
    const why = text.search(/^## Why/m);
    if (why < 0) {
      console.warn(`${name}: README.md has no "Why use this" section for the tables`);
      continue;
    }
    const next = text.slice(why + 1).search(/^## /m);
    const at = next < 0 ? text.length : why + 1 + next;
    text = `${text.slice(0, at).trimEnd()}\n\n${replacement}\n\n${text.slice(at)}`;
  }
  writeFileSync(path, text);
}
