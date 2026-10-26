// Generates the package pages, sidebar and home page data from the repo READMEs.
// Usage: node scripts/gen.mjs [path to portable repo, default: the repo this site is in]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.mjs';
import { formatSnippets } from './snippets.mjs';

const repo = resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)));
const gh = 'https://github.com/portablejs/portable/blob/main';
const root = readFileSync(join(repo, 'README.md'), 'utf8');

// The root README lists the packages in an HTML table, with a header row for each group.
const groups = [];
const seen = new Set();
const text = (html) =>
  html
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
// Returns the first sentence of a package README's "Replaces" line, with each Markdown link
// replaced by its text and any trailing ", which …" or ", and covers …" clause removed.
const replaces = (name) => {
  const md = readFileSync(join(repo, 'packages', name, 'README.md'), 'utf8');
  const line = md.match(/^Replaces (.+)$/m)?.[1] ?? '';
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\.(\s.*)?$/, '')
    .replace(/, (which|and covers) .*$/, '');
};
for (const line of root.split('\n')) {
  const h = line.match(/^<tr><th[^>]*>(.+)<\/th><\/tr>$/);
  if (h) {
    groups.push({ title: text(h[1]), items: [] });
  }
  const m = line.match(
    /<a href="packages\/([\w-]+)">@portable\/[\w-]+<\/a><\/td><td>(.+)<\/td><\/tr>$/,
  );
  if (m && groups.length && !seen.has(m[1])) {
    seen.add(m[1]);
    groups.at(-1).items.push({ name: m[1], description: text(m[2]), replaces: replaces(m[1]) });
  }
}

// bytes, errors, and random are general helpers, not stream, encoding, or crypto packages, so
// the site lists them under Utilities.
const take = (name) => {
  for (const group of groups) {
    const index = group.items.findIndex((i) => i.name === name);
    if (index !== -1) {
      return group.items.splice(index, 1)[0];
    }
  }
};
groups.find((g) => g.title === 'Streams and bytes').title = 'Streams';
groups.push({ title: 'Utilities', items: [take('bytes'), take('errors'), take('random')] });

const descriptions = new Map(
  groups.flatMap((group) => group.items).map((item) => [item.name, item.description]),
);
const out = 'src/pages/packages';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of seen) {
  let md = readFileSync(join(repo, 'packages', name, 'README.md'), 'utf8');
  md = md.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, href) => {
    const sibling = href.match(/^\.\.\/([\w-]+)(?:\/README\.md)?(#.*)?$/);
    if (sibling) {
      return `](/packages/${sibling[1]}${sibling[2] ?? ''})`;
    }
    return `](${gh}/packages/${name}/${href.replace(/^\.\//, '')})`;
  });
  // Package READMEs link other packages by their absolute docs URL, which also works on npm. On
  // the site the link stays on the current host, so it works in previews too.
  md = md.replace(/\]\(https:\/\/portablejs\.com(\/packages\/[^)]*)\)/g, ']($1)');
  md = md.replace(/<!-- bench:(start|end) -->\n/g, '');
  // The benchmark table is HTML in the README, so Vocs doesn't style it. Vocs styles its own tables
  // through these data attributes, so the benchmark table gets them too.
  md = md.replace(
    /^<table>\n[\s\S]*?\n<\/table>$/gm,
    (table) =>
      `<div data-v-table-wrapper="true">${table
        .replace(/\n/g, '')
        .replace(/<(table|thead|tbody|tr|th|td)(?=[ >])/g, '<$1 data-v=""')
        .replace(/<code>/g, '<code data-v="true">')
        .replace(/ colspan=/g, ' colSpan=')}</div>`,
  );
  // The README draws each bar as an image of readme/benchmark-bar.svg on the docs site, which can't take the page's text color.
  // On the site the bar is an inline SVG, so `currentColor` is the text color in light and dark mode.
  md = md.replace(
    /<img src="https:\/\/portablejs\.com\/readme\/benchmark-bar\.svg" width="(\d+)" height="(\d+)" alt="" \/>/g,
    '<svg width="$1" height="$2" aria-hidden="true"><rect width="100%" height="100%" fill="currentColor" fill-opacity="0.4" /></svg>',
  );
  md = md.replace(
    /`((?:[^`\n\\]|\\.)*?\\`(?:[^`\n\\]|\\.)*?)`(?=[^`]|$)/g,
    (_, inner) => '`` ' + inner.replace(/\\`/g, '`') + ' ``',
  );
  // A block whose first line is a lone `// name` comment gets that name as its Vocs title bar.
  md = md.replace(/^```(\w+)\n\/\/ (\S+)\n/gm, '```$1 [$2]\n');
  md = toMdx(await formatSnippets(md));
  mkdirSync(join(out, name));
  const tabs = (current) =>
    `<nav className="package-tabs">${[
      ['Guide', ''],
      ['API', '/api'],
    ]
      .map(
        ([text, path]) =>
          `<a href={import.meta.env.BASE_URL + 'packages/${name}${path}'}${text === current ? ' aria-current="page"' : ''}>${text}</a>`,
      )
      .join('')}</nav>`;
  // Vocs writes `description` to the page's meta description tag, and og.mjs reads that tag for the OG
  // image text.
  const frontmatter = (description) =>
    `---\ndescription: ${JSON.stringify(description.replace(/`/g, ''))}\n---\n\n`;
  writeFileSync(
    join(out, name, 'index.mdx'),
    frontmatter(descriptions.get(name)) + md.replace(/^(# .+\n)/, `$1\n${tabs('Guide')}\n`),
  );
  writeFileSync(
    join(out, name, 'api.mdx'),
    frontmatter(`Every export of @portable/${name}, with its parameters, options, and types.`) +
      toMdx(await formatSnippets(api(name))).replace(/^(# .+\n)/, `$1\n${tabs('API')}\n`),
  );
}

// Vocs compiles .md as MDX, so braces and stray `<` outside code are escaped, as are pipes
// inside code spans in table rows, which GFM would otherwise read as cell borders.
function toMdx(md) {
  let fenced = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
      }
      if (fenced || /^\s*```/.test(line)) {
        return line;
      }
      const table = line.startsWith('|');
      return line
        .split(/(``.+?``|`[^`]+`)/)
        .map((part, i) => {
          if (i % 2) {
            return table ? part.replace(/(?<!\\)\|/g, '\\|') : part;
          }
          return part
            .replace(/[{}]/g, (c) => '\\' + c)
            .replace(
              /<(?!\/?(picture|source|img|br|a|sub|sup|details|summary|kbd|table|thead|tbody|tr|th|td|code|svg|rect|div)\b|!--)/g,
              '&lt;',
            );
        })
        .join('');
    })
    .join('\n');
}

writeFileSync('src/packages.json', JSON.stringify(groups, null, 2) + '\n');
console.log(`${seen.size} packages in ${groups.length} groups`);
