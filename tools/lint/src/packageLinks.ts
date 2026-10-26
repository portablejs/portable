// Finds a mention of a Portable package, such as @portable/streams, that isn't a link to the
// package's page. A paragraph, list item, or table row links the first mention of each package,
// and later mentions in the same block can stay plain text. Headings, code, raw HTML lines, the
// package's own README, and the first cell of a table row (the stats tables list a package there)
// are skipped. A subpath such as `@portable/streams/node` is code, not a mention.

/** A mention of a package that needs a link, by line and column, counted from 0. */
export type Mention = { line: number; column: number; name: string };

const mention = /(?<![\w/.-])@portable\/([a-z0-9-]+)(?![\w/-])/g;
const links = [/\[[^\]]*\]\([^)]*\)/g, /<a [^>]*>.*?<\/a>/g];
const code = [/\x60[^\x60]*\x60/g, /https?:\/\/[^\s)]+/g];

/** Returns each first mention, in a block, of a package in `names` that isn't a link. */
export function findUnlinkedMentions(
  markdown: string,
  options: { names: ReadonlySet<string>; self?: string | undefined },
): Mention[] {
  const found: Mention[] = [];
  let fenced = false;
  let block = new Set<string>();
  markdown.split('\n').forEach((line, index) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      block = new Set();
      return;
    }
    if (fenced || /^\s*$/.test(line) || /^\s*</.test(line) || line.startsWith('#')) {
      block = new Set();
      return;
    }
    if (/^\s*(?:[-*]|\d+\.) /.test(line) || line.startsWith('|')) {
      block = new Set();
    }
    let text = line;
    for (const mask of code) {
      text = text.replace(mask, (span) => ' '.repeat(span.length));
    }
    for (const mask of links) {
      text = text.replace(mask, (span: string, offset: number) => {
        for (const match of line.slice(offset, offset + span.length).matchAll(mention)) {
          block.add(match[1]!);
        }
        return ' '.repeat(span.length);
      });
    }
    if (line.startsWith('|')) {
      const end = text.indexOf('|', 1);
      text = ' '.repeat(end + 1) + text.slice(end + 1);
    }
    for (const match of text.matchAll(mention)) {
      const name = match[1]!;
      if (name === options.self || !options.names.has(name) || block.has(name)) {
        continue;
      }
      block.add(name);
      found.push({ line: index, column: match.index, name });
    }
  });
  return found;
}
