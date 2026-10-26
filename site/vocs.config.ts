import { defineConfig } from 'vocs/config';
import groups from './src/packages.json' with { type: 'json' };

const guides = [
  ['streams', 'Streams'],
  ['encodings', 'Encodings'],
  ['data-formats', 'Text and data formats'],
  ['email', 'Email'],
  ['networking', 'DNS and networking'],
  ['crypto', 'Crypto and auth'],
  ['realtime', 'Realtime'],
  ['images', 'Images'],
  ['concurrency', 'Concurrency and timing'],
  ['utilities', 'Utilities'],
  ['errors', 'Errors'],
];

// GitHub Pages serves the site from /portable, and previews serve it from the root.
const basePath = process.env.DOCS_BASE_PATH ?? '';

export default defineConfig({
  title: 'Portable',
  ...(basePath && { basePath }),
  renderStrategy: 'full-static',
  description: 'Web-standard building blocks for any JavaScript runtime.',
  logoUrl: { light: `${basePath}/logo-light.svg`, dark: `${basePath}/logo-dark.svg` },
  iconUrl: `${basePath}/favicon.svg`,
  accentColor: '#fc7c00',
  colorScheme: 'light dark',
  topNav: [
    { text: 'Docs', link: '/getting-started', match: (path) => path !== '/' },
    { text: 'GitHub', link: 'https://github.com/portablejs/portable' },
  ],
  sidebar: [
    {
      text: 'Introduction',
      items: [
        { text: 'Getting started', link: '/getting-started' },
        { text: 'Conventions', link: '/conventions' },
        { text: 'Recommended packages', link: '/recommended' },
      ],
    },
    {
      text: 'Guides',
      items: guides.map(([slug, text]) => ({ text, link: `/guides/${slug}` })),
    },
    {
      text: 'Examples',
      // The examples are static pages outside Vocs, so the links load them in a new tab.
      items: [{ text: 'Bluesky stream', link: `${basePath}/examples/bluesky/`, external: true }],
    },
    {
      text: 'Packages',
      items: groups
        .flatMap((group) => group.items.map((item) => item.name))
        .sort()
        .map((name) => ({ text: name, link: `/packages/${name}` })),
    },
  ],
});
