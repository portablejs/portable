// Reformats the TypeScript and JavaScript code blocks in Markdown to a narrower line width than
// the repo's, so docs snippets fit the page without scrolling sideways.
import { format } from 'prettier';

const options = { singleQuote: true, semi: true, trailingComma: 'all', printWidth: 72 };

export async function formatSnippets(md) {
  const blocks = [...md.matchAll(/^```(ts|js|tsx)([^\n]*)\n([\s\S]*?)^```$/gm)];
  let out = md;
  for (const [block, lang, meta, code] of blocks) {
    try {
      const parser = lang === 'js' ? 'babel' : 'typescript';
      const formatted = await format(code, { ...options, parser });
      out = out.replace(block, '```' + lang + meta + '\n' + formatted + '```');
    } catch {
      // Snippets that aren't valid code on their own, such as fragments with `...`, stay as written.
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  for (const file of process.argv.slice(2)) {
    writeFileSync(file, await formatSnippets(readFileSync(file, 'utf8')));
  }
}
