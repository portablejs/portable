// Renders the benchmark and stats tables that `scripts/readme-stats.ts` writes to each package
// README. Both tables have one row per library, so a library that has no equivalent for a benchmark
// is left out instead of filling a column with dashes, and the tables stay narrow enough for the
// docs site and GitHub on a phone.

/** One benchmark: what it does and the operations per second of each library that ran it. */
export type Benchmark = { label: string; results: readonly { library: string; hz: number }[] };

/** One library's stats. Each value is already formatted for the table. */
export type Stats = {
  library: string;
  version: string;
  size: string;
  dependencies: string;
  builtins: string;
  types: string;
};

export function opsPerSecond(hz: number): string {
  if (hz < 100) {
    return hz.toPrecision(3);
  }
  const step = 10 ** (Math.floor(Math.log10(hz)) - 2);
  return (Math.round(hz / step) * step).toLocaleString('en-US');
}

const barWidth = 12;
const eighths = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/** A bar of `barWidth` characters, at least one eighth wide, for `hz` against the fastest result. */
function bar(hz: number, fastest: number): string {
  const total = Math.max(1, Math.round((hz / fastest) * barWidth * 8));
  return '█'.repeat(Math.floor(total / 8)) + eighths[total % 8];
}

/** How `hz` compares with `ours`, such as "1.9× slower", with a no-break space so the cell doesn't wrap. */
function relative(hz: number, ours: number): string {
  const ratio = hz > ours ? hz / ours : ours / hz;
  if (ratio < 1.05) {
    return 'same';
  }
  const times =
    ratio < 10 ? ratio.toFixed(1) : Number(ratio.toPrecision(2)).toLocaleString('en-US');
  return `${times}×\u00a0${hz > ours ? 'faster' : 'slower'}`;
}

/**
 * Renders one row per library that ran each benchmark, fastest first, with a bar scaled to the
 * fastest result and the speed compared with `ours`. The benchmark's label is on its first row only.
 */
export function benchTable(ours: string, benchmarks: readonly Benchmark[]): string {
  const lines = [
    '| Benchmark | Library | Ops/s | Relative | |',
    '| --- | --- | ---: | --- | --- |',
  ];
  for (const { label, results } of benchmarks) {
    if (results.length === 0) {
      continue;
    }
    const sorted = [...results].sort((a, b) => b.hz - a.hz);
    const fastest = sorted[0].hz;
    const baseline = results.find(({ library }) => library === ours)?.hz;
    sorted.forEach(({ library, hz }, index) => {
      const name = library === ours ? `**${library}**` : library;
      const compared = library === ours || baseline === undefined ? '' : relative(hz, baseline);
      lines.push(
        `| ${index === 0 ? label : ''} | ${name} | ${opsPerSecond(hz)} | ${compared} | ${bar(hz, fastest)} |`,
      );
    });
  }
  return lines.join('\n');
}

export function statsTable(stats: readonly Stats[]): string {
  return [
    '| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...stats.map(
      ({ library, version, size, dependencies, builtins, types }) =>
        `| ${library} | ${version} | ${size} | ${dependencies} | ${builtins} | ${types} |`,
    ),
  ].join('\n');
}

export const benchNote = (ours: string, runtime: string) =>
  `Operations per second from \`pnpm bench\`, higher is better, in ${runtime}. Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with ${ours}, and the bars are scaled to the fastest library.`;

export const statsNote =
  'Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.';
