import * as Dns from '@portable/dns'
import { fc, fuzz, mutated, outcomeAsync } from '@portable/fuzz'
import { test } from 'vite-plus/test'
import { recorded, responses } from './utils.js'

const lookups = [
  'resolve4',
  'resolve6',
  'resolveCname',
  'resolveNs',
  'resolvePtr',
  'resolveMx',
  'resolveTxt',
  'resolveSrv',
  'resolveSoa',
  'resolveCaa',
  'resolveNaptr',
] as const
const lookup = fc.constantFrom(...lookups)

/** A resolver whose one endpoint answers every request with `body`. */
const answering = (body: Uint8Array) =>
  Dns.create({
    endpoints: ['https://dns.example/dns-query'],
    fetch: async () =>
      new Response(body.slice(), { headers: { 'content-type': 'application/dns-message' } }),
  })

const recording = fc.constantFrom(...responses.map((entry) => entry.query.split(' ')[0]!))
const body = fc.constantFrom(...recorded.values()).chain((bytes) => mutated(bytes))

test('a lookup resolves or rejects with QueryError for any response body', async () => {
  await fuzz(
    fc.asyncProperty(body, recording, lookup, async (body, name, method) => {
      await outcomeAsync([Dns.QueryError], () => answering(body)[method](name) as Promise<unknown>)
    }),
    { scale: 3 },
  )
})

test('a lookup resolves or rejects with QueryError for any name', async () => {
  const name = fc.string({
    unit: fc.oneof(
      fc.constantFrom('a', 'Z', '0', '-', '_', '.', '..', '\\', '*', '@', ' ', 'ü', '\0'),
      fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
    ),
    maxLength: 300,
  })
  await fuzz(
    fc.asyncProperty(name, lookup, async (name, method) => {
      const resolver = answering(recorded.values().next().value!)
      await outcomeAsync([Dns.QueryError], () => resolver[method](name) as Promise<unknown>)
    }),
  )
})

test('reverse rejects with QueryError for anything that is not an IP address', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.oneof(fc.ipV4(), fc.ipV6(), fc.string({ maxLength: 40 })),
      async (address) => {
        await outcomeAsync([Dns.QueryError], () =>
          answering(recorded.values().next().value!).reverse(address),
        )
      },
    ),
  )
})
