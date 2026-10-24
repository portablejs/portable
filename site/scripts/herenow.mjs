// Publishes dist/public to here.now as an anonymous site, which expires 24 hours after it is created.
// Usage: node scripts/herenow.mjs [state.json]
// The state file stores the site's slug, claim token, and expiry. When it holds a site that has more than an hour
// left, the script updates that site. Otherwise it creates a new one, and then writes the new site to the file.
// In GitHub Actions the site URL is written to the step outputs.
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

const dir = 'dist/public'
const stateFile = process.argv[2]
const walk = (d) =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  )
const files = walk(dir).map((p) => ({ path: relative(dir, p), size: statSync(p).size }))
const headers = {
  'content-type': 'application/json',
  'X-HereNow-Client': process.env.GITHUB_ACTIONS
    ? 'github-actions/docs-preview'
    : 'claude-code/direct-api',
}

async function publish(state) {
  const res = await fetch(`https://here.now/api/v1/publish${state ? `/${state.slug}` : ''}`, {
    method: state ? 'PUT' : 'POST',
    headers,
    body: JSON.stringify({ files, claimToken: state?.claimToken, displayName: 'Portable docs' }),
  })
  const site = await res.json()
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(site)}`)
  }
  const queue = [...site.upload.uploads]
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      for (let u; (u = queue.shift());) {
        for (let attempt = 1; ; attempt++) {
          try {
            const body = readFileSync(join(dir, u.path))
            const r = await fetch(u.url, {
              method: 'PUT',
              headers: u.headers,
              body,
              signal: AbortSignal.timeout(30_000),
            })
            if (r.ok) {
              break
            }
            throw new Error(`${u.path} ${r.status}`)
          } catch (error) {
            if (attempt === 3) {
              throw error
            }
          }
        }
      }
    }),
  )
  const claimToken = state?.claimToken ?? site.claimToken
  const fin = await fetch(site.upload.finalizeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ versionId: site.upload.versionId, claimToken }),
  })
  if (!fin.ok) {
    throw new Error(await fin.text())
  }
  return {
    slug: site.slug,
    siteUrl: site.siteUrl,
    claimToken,
    expiresAt: state?.expiresAt ?? site.expiresAt,
  }
}

const previous =
  stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : undefined
const reusable = previous && Date.parse(previous.expiresAt) - Date.now() > 60 * 60 * 1000
let site
try {
  site = await publish(reusable ? previous : undefined)
} catch (error) {
  if (!reusable) {
    throw error
  }
  console.warn(`Could not update ${previous.slug}, creating a new site: ${error.message}`)
  site = await publish()
}

if (stateFile) {
  writeFileSync(stateFile, JSON.stringify(site))
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${site.siteUrl}\n`)
}
console.log(site.siteUrl)
