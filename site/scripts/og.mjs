// Renders a 1200x630 OG image for every page in dist/public after `vocs build`, and adds og:image
// and twitter:image tags for the image to each page. GitHub Pages serves only static files, so the
// images are built here instead of by a `/api/og` route. The tags are added here too, because Vocs
// copies the source of the `ogImageUrl` function into the client bundle, where it can't read
// DOCS_BASE_PATH.
// Usage: node scripts/og.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImageResponse } from '@takumi-rs/image-response/wasm'
import { createElement as h } from 'react'

const dist = 'dist/public'
const accent = '#fc7c00'
// Crawlers need an absolute image URL. Previews leave DOCS_SITE_URL unset because the here.now URL
// isn't known until the site is published, so a preview's tags hold a path without a host.
const site = process.env.DOCS_SITE_URL ?? process.env.DOCS_BASE_PATH ?? ''

// Vocs ships Geist for its own OG route. Its package exports only `dist/`, so the font is read by
// path from beside the resolved entry point.
const font = readFileSync(
  join(dirname(fileURLToPath(import.meta.resolve('vocs'))), 'server/fonts/geist.woff2'),
)
const module = readFileSync(
  fileURLToPath(import.meta.resolve('@takumi-rs/wasm/takumi_wasm_bg.wasm')),
)
const logo = `data:image/svg+xml;base64,${readFileSync('public/logo-dark.svg').toString('base64')}`

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// Returns the path of each page's index.html, such as `guides/errors/index.html`.
function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // `*.d` directories hold the RSC payloads of the root and 404 routes, not pages.
      return ['assets', 'og', 'RSC'].includes(entry.name) || entry.name.endsWith('.d')
        ? []
        : pages(path)
    }
    return entry.name === 'index.html' ? [relative(dist, path)] : []
  })
}

function image({ title, description }) {
  const scoped = /^(@portable\/)(.+)$/.exec(title)
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 80,
        backgroundColor: '#121212',
        backgroundImage:
          'linear-gradient(#ffffff0a 1px, transparent 1px), linear-gradient(90deg, #ffffff0a 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        color: '#ffffff',
        fontFamily: 'Geist',
      },
    },
    h('div', { style: { display: 'flex' } }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 } },
      // A package page's title is its npm name, set smaller than other titles so that the longest,
      // @portable/quoted-printable, fits on one line.
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: scoped ? 56 : 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.1,
          },
        },
        scoped
          ? [h('span', { key: 'scope', style: { color: accent } }, scoped[1]), scoped[2]]
          : title === 'Portable'
            ? [title, h('span', { key: 'dot', style: { color: accent } }, '.')]
            : title,
      ),
      description &&
        h('div', { style: { fontSize: 32, lineHeight: 1.4, color: '#a3a3a3' } }, description),
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      h('img', { src: logo, width: 36, height: 36, style: { width: 36, height: 36 } }),
      h('div', { style: { fontSize: 32, fontWeight: 600 } }, 'Portable'),
    ),
  )
}

const list = pages(dist)
for (const page of list) {
  const html = readFileSync(join(dist, page), 'utf8')
  const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Portable').replace(
    / – Portable$/,
    '',
  )
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '')
  const name = `og/${dirname(page) === '.' ? 'index' : dirname(page)}.png`
  const out = join(dist, name)
  const response = new ImageResponse(image({ title, description }), {
    module,
    fonts: [{ name: 'Geist', data: font }],
    width: 1200,
    height: 630,
    format: 'png',
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, new Uint8Array(await response.arrayBuffer()))
  const tags = `<meta property="og:image" content="${site}/${name}"/><meta name="twitter:image" content="${site}/${name}"/>`
  writeFileSync(join(dist, page), html.replace('</head>', `${tags}</head>`))
}
console.log(`${list.length} OG images`)
