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

const barWidth = 160;

/**
 * An image of a one-pixel SVG stretched to a width in pixels for `hz` against the fastest result, at
 * least 2. Block characters such as `█` leave gaps between them and render at different heights in
 * different fonts, and GitHub strips `data:` URLs and inline `<svg>`, so the bar is a file on the
 * docs site. An absolute URL works on GitHub, npm, and JSR, which resolve relative paths differently.
 */
function bar(hz: number, fastest: number): string {
  const width = Math.max(2, Math.round((hz / fastest) * barWidth));
  return `<img src="https://portablejs.com/readme/benchmark-bar.svg" width="${width}" height="12" alt="" />`;
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

/** Converts a Markdown label, such as "`Buffer` (Node)", to HTML for a cell. */
function html(markdown: string): string {
  return markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Renders an HTML table, because a Markdown table has no cell that spans columns. Each benchmark
 * has a heading row that spans the table, then one row per library that ran it, fastest first, with
 * the speed compared with `ours` and a bar scaled to the fastest result.
 */
export function benchTable(ours: string, benchmarks: readonly Benchmark[]): string {
  const lines = [
    '<table>',
    '<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>',
    '<tbody>',
  ];
  for (const { label, results } of benchmarks) {
    if (results.length === 0) {
      continue;
    }
    lines.push(`<tr><th colspan="4" align="left">${html(label)}</th></tr>`);
    const sorted = [...results].sort((a, b) => b.hz - a.hz);
    const fastest = sorted[0].hz;
    const baseline = results.find(({ library }) => library === ours)?.hz;
    for (const { library, hz } of sorted) {
      const compared = library === ours || baseline === undefined ? '' : relative(hz, baseline);
      lines.push(
        `<tr><td>${html(library)}</td><td align="right">${opsPerSecond(hz)}</td><td>${compared}</td><td>${bar(hz, fastest)}</td></tr>`,
      );
    }
  }
  lines.push('</tbody>', '</table>');
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
