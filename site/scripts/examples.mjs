// Builds each page in examples/ into public/examples/, where Vocs serves it as a static file.
// The code blocks are highlighted at build time with @pierre/highlights.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeToHtml } from '@pierre/highlights';
import { tokyoNight } from '@pierre/highlights/themes';
import { build } from 'vite';

const site = fileURLToPath(new URL('..', import.meta.url));
const unescape = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
const highlight = {
  name: 'highlight',
  transformIndexHtml: (html) =>
    html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
      const text = unescape(code);
      const lang = text.startsWith('npm ') ? 'bash' : 'ts';
      return new TextDecoder().decode(codeToHtml(text, { lang, theme: tokyoNight }));
    }),
};

for (const name of readdirSync(`${site}examples`)) {
  await build({
    configFile: false,
    logLevel: 'warn',
    root: `${site}examples/${name}`,
    base: './',
    resolve: { conditions: ['src', 'module', 'browser', 'development|production'] },
    plugins: [highlight],
    build: { outDir: `${site}public/examples/${name}`, emptyOutDir: true, target: 'es2022' },
  });
}
