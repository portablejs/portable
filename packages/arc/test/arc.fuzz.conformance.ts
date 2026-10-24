import * as Arc from '@portable/arc'
import { cuts, fc, fuzz, mutated, outcomeAsync, split } from '@portable/fuzz'
import { beforeAll, expect, test } from 'vite-plus/test'
import { baseMessage, encode, keyPair, resolverFrom, stream } from './utils.js'

const records = { 's._domainkey.one.example': 'k1', 's._domainkey.two.example': 'k1' }
let chain: Uint8Array
let headerLength: number

const sealOnce = async (message: Uint8Array, domain: string, authResults: string) => {
  const arc = await Arc.verify(message, { resolver: resolverFrom(records) })
  const fields = await Arc.seal(message, {
    domain,
    selector: 's',
    privateKey: (await keyPair('k1')).privateKey,
    authResults,
    chainValidation: arc.result,
    now: new Date('2024-01-01T00:00:00Z'),
  })
  return new Uint8Array([...encode(fields), ...message])
}

beforeAll(async () => {
  const once = await sealOnce(encode(baseMessage), 'one.example', 'mx.one.example; spf=pass')
  chain = await sealOnce(once, 'two.example', 'mx.two.example; arc=pass')
  headerLength = new TextDecoder().decode(chain).indexOf('\r\n\r\n') + 4
})

test('verify settles with pass, fail or none for a changed chain', async () => {
  await fuzz(
    fc.asyncProperty(mutated(chain, { within: headerLength }), async (message) => {
      const result = await Arc.verify(message, { resolver: resolverFrom(records) })
      expect(['pass', 'fail', 'none']).toContain(result.result)
      expect(result.sets.length > 0).toBe(result.result === 'pass')
      expect(result.reason === undefined).toBe(result.result !== 'fail')
    }),
    { scale: 0.5 },
  )
})

test('verify gives the same result however the message is chunked', async () => {
  await fuzz(
    fc.asyncProperty(mutated(chain, { within: headerLength }), cuts, async (message, at) => {
      const whole = await Arc.verify(message, { resolver: resolverFrom(records) })
      const chunked = await Arc.verify(stream(split(message, at)), {
        resolver: resolverFrom(records),
      })
      expect(chunked).toEqual(whole)
    }),
    { scale: 0.25 },
  )
})

test('seal refuses an authResults value or writes a set that verifies', async () => {
  const text = fc.string({
    unit: fc.constantFrom('a', ' ', '\t', '\r', '\n', ';', '=', ':', 'é', '(', ')'),
    maxLength: 24,
  })
  await fuzz(
    fc.asyncProperty(text, async (authResults) => {
      const sealed = await outcomeAsync([RangeError], () =>
        sealOnce(chain, 'one.example', authResults),
      )
      if ('error' in sealed) {
        return
      }
      const result = await Arc.verify(sealed.value, { resolver: resolverFrom(records) })
      expect(result).toMatchObject({ result: 'pass', instance: 3 })
    }),
    { scale: 0.5 },
  )
})
