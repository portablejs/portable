// Publishes dist/public to here.now and prints the site URL.
// Usage: node scripts/herenow.mjs [slug [claimToken]]
// With HERENOW_API_KEY set, the site belongs to that account and doesn't expire, and a slug alone is enough to
// update it. Without a key, the site is anonymous and expires after 24 hours, and updating it needs its claim token.
// In GitHub Actions the slug and URL are written to the step outputs, and the claim token is not printed.
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dir = 'dist/public'
const [slug, claimToken] = process.argv.slice(2)
const key = process.env.HERENOW_API_KEY
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const files = walk(dir).map((p) => ({ path: relative(dir, p), size: statSync(p).size }))
const headers = {
  'content-type': 'application/json',
  'X-HereNow-Client': process.env.GITHUB_ACTIONS ? 'github-actions/docs-preview' : 'claude-code/direct-api',
  ...(key && { authorization: `Bearer ${key}` }),
}

const res = await fetch(`https://here.now/api/v1/publish${slug ? `/${slug}` : ''}`, {
  method: slug ? 'PUT' : 'POST',
  headers,
  body: JSON.stringify({ files, claimToken, displayName: process.env.HERENOW_TITLE ?? 'Portable docs' }),
})
const site = await res.json()
if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(site)}`)
const queue = [...site.upload.uploads]
await Promise.all(
  Array.from({ length: 16 }, async () => {
    for (let u; (u = queue.shift()); ) {
      const r = await fetch(u.url, { method: 'PUT', headers: u.headers, body: readFileSync(join(dir, u.path)) })
      if (!r.ok) throw new Error(`${u.path} ${r.status}`)
    }
  }),
)
const fin = await fetch(site.upload.finalizeUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify({ versionId: site.upload.versionId, claimToken: claimToken ?? site.claimToken }),
})
if (!fin.ok) throw new Error(await fin.text())

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `slug=${site.slug}\nurl=${site.siteUrl}\n`)
  console.log(site.siteUrl)
} else {
  const { slug: s, siteUrl, claimUrl, claimToken: token, expiresAt } = site
  console.log(JSON.stringify({ slug: s, siteUrl, claimUrl, claimToken: token, expiresAt }))
}
