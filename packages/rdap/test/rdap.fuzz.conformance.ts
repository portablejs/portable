import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import * as Rdap from '@portable/rdap'
import { expect, test } from 'vite-plus/test'
import { recorded, server } from './utils.js'

const errors = [
  Rdap.InvalidInputError,
  Rdap.NotFoundError,
  Rdap.ResponseError,
  Rdap.UnsupportedError,
]

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Every path to a value in `json`, the root included. */
function paths(json: Json, path: (string | number)[] = []): (string | number)[][] {
  const out = [path]
  if (Array.isArray(json)) json.forEach((value, i) => out.push(...paths(value, [...path, i])))
  else if (json && typeof json === 'object')
    for (const [key, value] of Object.entries(json)) out.push(...paths(value, [...path, key]))
  return out
}

function replace(json: Json, path: readonly (string | number)[], value: Json): Json {
  if (path.length === 0) return value
  const [key, ...rest] = path
  const copy = (Array.isArray(json) ? [...json] : { ...(json as object) }) as Record<
    string | number,
    Json
  >
  copy[key!] = replace(copy[key!]!, rest, value)
  return copy
}

/** `original` with up to three values swapped for random JSON. */
function changed(original: Json): fc.Arbitrary<Json> {
  const all = paths(original)
  return fc
    .array(fc.tuple(fc.nat(all.length - 1), fc.jsonValue({ maxDepth: 2 }) as fc.Arbitrary<Json>), {
      minLength: 1,
      maxLength: 3,
    })
    .map((edits) =>
      edits.reduce((json, [index, value]) => {
        const path = all[index]!
        try {
          return replace(json, path, value)
        } catch {
          return json
        }
      }, original),
    )
}

const registry = 'https://rdap.verisign.com/com/v1/domain/google.com'
const registrar = 'https://rdap.markmonitor.com/rdap/domain/GOOGLE.COM'

test('a domain lookup gives a result or a documented error for any registry response', async () => {
  await fuzz(
    fc.asyncProperty(changed(recorded[registry] as Json), async (json) => {
      const { fetch } = server({ [registry]: json })
      const result = await outcomeAsync(errors, () => Rdap.domain('google.com', { fetch }))
      expect('value' in result ? result.value.name : 'error').not.toBe('')
    }),
  )
})

test('a broken registrar response is reported in referral.error', async () => {
  await fuzz(
    fc.asyncProperty(changed(recorded[registrar] as Json), async (json) => {
      const { fetch } = server({ [registrar]: json })
      const result = await Rdap.domain('google.com', { fetch })
      expect(result.name).toBe('google.com')
      expect(result.referral?.url).toBe(registrar)
    }),
  )
})

test('ip and asn lookups give a result or a documented error for any response', async () => {
  const ip = 'https://rdap.arin.net/registry/ip/8.8.8.8'
  const asn = 'https://rdap.arin.net/registry/autnum/15169'
  await fuzz(
    fc.asyncProperty(
      changed(recorded[ip] as Json),
      changed(recorded[asn] as Json),
      async (ipJson, asnJson) => {
        const { fetch } = server({ [ip]: ipJson, [asn]: asnJson })
        await outcomeAsync(errors, () => Rdap.ip('8.8.8.8', { fetch }))
        await outcomeAsync(errors, () => Rdap.asn(15169, { fetch }))
      },
    ),
  )
})
