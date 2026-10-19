import { fc, fuzz, mutated } from '@portable/fuzz'
import * as MailAuth from '@portable/mail-auth'
import { beforeAll, expect, test } from 'vite-plus/test'
import {
  buildMessage,
  encode,
  key,
  type Key,
  signed,
  unfold,
  type Zone,
  zoneResolver,
} from './utils.js'

let rsa: Key
let zone: Zone
let message: Uint8Array

beforeAll(async () => {
  rsa = await key('rsa')
  zone = {
    'test._domainkey.example.com': { TXT: [rsa.record] },
    'example.com': { TXT: ['v=spf1 ip4:192.0.2.1 -all'] },
    '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject'] },
  }
  const input = await signed(buildMessage(), 'example.com')
  const result = await MailAuth.authenticate(input, {
    resolver: zoneResolver(zone),
    authservId: 'mx.test',
    ip: '192.0.2.1',
    sender: 'a@example.com',
    seal: { domain: 'example.com', selector: 'test', privateKey: rsa.privateKey },
  })
  message = encode(result.headers + input)
})

function expectWellFormed(result: MailAuth.Result) {
  expect(result.headers.endsWith('\r\n')).toBe(true)
  expect(result.headers.slice(0, -2)).not.toMatch(/\r(?!\n)|(?<!\r)\n|\r\n(?![ \t]|[A-Z])/)
  for (const line of result.headers.split('\r\n'))
    expect(encode(line).length).toBeLessThanOrEqual(998)
  let depth = 0
  let quoted = false
  const value = unfold(result.authResults)
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '\\') i++
    else if (quoted) quoted = char !== '"'
    else if (char === '"' && depth === 0) quoted = true
    else if (char === '(') depth++
    else if (char === ')') depth--
    expect(depth).toBeGreaterThanOrEqual(0)
  }
  expect({ depth, quoted }).toEqual({ depth: 0, quoted: false })
}

test('authenticate settles with well-formed fields for a changed signed and sealed message', async () => {
  const headerLength = new TextDecoder().decode(message).indexOf('\r\n\r\n') + 4
  await fuzz(
    fc.asyncProperty(mutated(message, { within: headerLength }), async (input) => {
      const result = await MailAuth.authenticate(input, {
        resolver: zoneResolver(zone),
        authservId: 'mx.test',
        ip: '192.0.2.1',
        sender: 'a@example.com',
        seal: { domain: 'example.com', selector: 'test', privateKey: rsa.privateKey },
      })
      expectWellFormed(result)
      expect(result.headers.startsWith('ARC-Seal: ') || result.sealSkipReason !== undefined).toBe(
        true,
      )
    }),
    { scale: 0.25 },
  )
})

test('authenticate writes well-formed fields for any From field, sender and HELO name', async () => {
  const text = fc.string({
    unit: fc.oneof(
      fc.constantFrom('a', '@', '.', ' ', '(', ')', '\\', '"', ';', ':', ',', '<', '>', '=', 'é'),
      fc.string({ minLength: 1, maxLength: 1 }),
    ),
    maxLength: 40,
  })
  await fuzz(
    fc.asyncProperty(text, text, text, async (from, local, helo) => {
      const input = `From: ${from.replace(/[\r\n]/g, ' ')}\r\nSubject: x\r\n\r\nbody\r\n`
      const result = await MailAuth.authenticate(input, {
        resolver: zoneResolver({ 'example.com': { TXT: ['v=spf1 -all'] } }),
        authservId: 'mx.test',
        ip: '2001:db8::1',
        helo,
        sender: `${local}@example.com`,
      })
      expectWellFormed(result)
      expect(result.dmarc !== undefined).toBe(result.dmarcSkipReason === undefined)
    }),
    { scale: 0.5 },
  )
})
