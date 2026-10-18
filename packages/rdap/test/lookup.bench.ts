import * as NodeRdap from 'node-rdap'
import { afterAll, beforeAll, expect, test, vi } from 'vite-plus/test'
import * as Rdap from '@portable/rdap'
import { bootstrap, recorded } from './utils.js'

const bodies = new Map(
  Object.entries({ ...bootstrap, ...recorded }).map(([url, json]) => [url, JSON.stringify(json)]),
)

async function fetch(url: string): Promise<Response> {
  const body = bodies.get(url)
  return new Response(body ?? null, { status: body ? 200 : 404 })
}

const json = async (url: string) => (await fetch(url)).json()

beforeAll(async () => {
  vi.stubGlobal('fetch', fetch)
  await Rdap.domain('google.com', { fetch, follow: false })
  await Rdap.ip('193.0.6.139', { fetch })
  await Rdap.asn(15169, { fetch })
  await NodeRdap.domain('google.com')
  await NodeRdap.ip('193.0.6.139')
  await NodeRdap.autnum(15169)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

test('normalizes a Verisign domain response within 25% of node-rdap', async ({ bench }) => {
  const url = 'https://rdap.verisign.com/com/v1/domain/google.com'
  const result = await bench.compare(
    bench('@portable/rdap', async () => {
      await Rdap.domain('google.com', { fetch, follow: false })
    }),
    bench('node-rdap', async () => {
      await NodeRdap.domain('google.com')
    }),
    bench('fetch and response.json()', async () => {
      await json(url)
    }),
  )
  expect(result.get('node-rdap')).not.toBeFasterThan(result.get('@portable/rdap'), { delta: 0.25 })
})

test('follows the Verisign referral to MarkMonitor within 25% of node-rdap plus a fetch', async ({
  bench,
}) => {
  const registrar = 'https://rdap.markmonitor.com/rdap/domain/GOOGLE.COM'
  const result = await bench.compare(
    bench('@portable/rdap', async () => {
      await Rdap.domain('google.com', { fetch })
    }),
    bench('node-rdap plus a fetch', async () => {
      await NodeRdap.domain('google.com')
      await json(registrar)
    }),
  )
  expect(result.get('node-rdap plus a fetch')).not.toBeFasterThan(result.get('@portable/rdap'), {
    delta: 0.25,
  })
})

test('normalizes a RIPE network response with 16 entities within 25% of node-rdap', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/rdap', async () => {
      await Rdap.ip('193.0.6.139', { fetch })
    }),
    bench('node-rdap', async () => {
      await NodeRdap.ip('193.0.6.139')
    }),
    bench('fetch and response.json()', async () => {
      await json('https://rdap.db.ripe.net/ip/193.0.6.139')
    }),
  )
  expect(result.get('node-rdap')).not.toBeFasterThan(result.get('@portable/rdap'), { delta: 0.25 })
})

test('normalizes an ARIN autnum response within 25% of node-rdap', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/rdap', async () => {
      await Rdap.asn(15169, { fetch })
    }),
    bench('node-rdap', async () => {
      await NodeRdap.autnum(15169)
    }),
    bench('fetch and response.json()', async () => {
      await json('https://rdap.arin.net/registry/autnum/15169')
    }),
  )
  expect(result.get('node-rdap')).not.toBeFasterThan(result.get('@portable/rdap'), { delta: 0.25 })
})
