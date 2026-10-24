import { Buffer } from 'node:buffer'
import { createHash, createPrivateKey, sign as nodeSign } from 'node:crypto'
import * as Arc from '@portable/arc'
import { arc, sealMessage } from 'mailauth/lib/arc/index.js'
import { dkimVerify } from 'mailauth/lib/dkim/verify.js'
import { expect, test } from 'vite-plus/test'
import { encode, fixture, keyPair, resolverFrom, stream } from './utils.js'

const resolver = resolverFrom({
  's._domainkey.one.example': 'k1',
  's._domainkey.two.example': 'k2',
})
const mailauthResolver = (name: string) => resolver.resolveTxt(name)
const k1 = (await keyPair('k1')).pem
const k2 = (await keyPair('k2')).pem

const text = new TextDecoder().decode(await fixture('message1.eml')).replace(/\r?\n/g, '\r\n')
const head = text.slice(0, text.indexOf('\r\n\r\n') + 4)
const body = text.slice(head.length)
const large = encode(head + body.repeat(Math.ceil(250_000 / body.length)))

const chunked = (bytes: Uint8Array): Uint8Array[] => {
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length; i += 65536) chunks.push(bytes.subarray(i, i + 65536))
  return chunks
}

const first = {
  domain: 'one.example',
  selector: 's',
  privateKey: k1,
  authResults: 'mx.one.example; spf=pass',
}
const once = new Uint8Array([...encode(await Arc.seal(large, first)), ...large])
const twice = new Uint8Array([
  ...encode(
    await Arc.seal(once, {
      domain: 'two.example',
      selector: 's',
      privateKey: k2,
      authResults: 'mx.two.example; arc=pass',
      chainValidation: 'pass',
    }),
  ),
  ...once,
])
const twiceChunks = chunked(twice)
const largeChunks = chunked(large)
const nodeKey = createPrivateKey(k1)

test('verifies a 250 KB message with two ARC sets within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/arc', async () => {
      const { result } = await Arc.verify(stream(twiceChunks), { resolver })
      if (result !== 'pass') throw new Error(result)
    }),
    bench('mailauth', async () => {
      const verified = await dkimVerify(Buffer.from(twice), {
        resolver: mailauthResolver,
        strict: true,
      })
      const { status } = await arc(verified.arc as never, {
        resolver: mailauthResolver,
        strict: true,
      })
      if (status.result !== 'pass') throw new Error(status.result)
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/arc'), { delta: 0.25 })
})

test('seals a 250 KB message within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/arc', async () => {
      await Arc.seal(stream(largeChunks), first)
    }),
    bench('mailauth', async () => {
      await sealMessage(Buffer.from(large), {
        signingDomain: 'one.example',
        selector: 's',
        privateKey: k1,
        authResults: 'mx.one.example; spf=pass',
      })
    }),
    bench('node:crypto, hash and two signatures only', () => {
      createHash('sha256').update(large).digest()
      nodeSign('sha256', large.subarray(0, 512), nodeKey)
      nodeSign('sha256', large.subarray(512, 1024), nodeKey)
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/arc'), { delta: 0.25 })
})

const small = encode('From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\nHello\r\n')
const smallSealed = new Uint8Array([...encode(await Arc.seal(small, first)), ...small])

test('seals and verifies a short message within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/arc', async () => {
      await Arc.seal(small, first)
      await Arc.verify(smallSealed, { resolver })
    }),
    bench('mailauth', async () => {
      await sealMessage(Buffer.from(small), {
        signingDomain: 'one.example',
        selector: 's',
        privateKey: k1,
        authResults: 'mx.one.example; spf=pass',
      })
      const verified = await dkimVerify(Buffer.from(smallSealed), {
        resolver: mailauthResolver,
        strict: true,
      })
      await arc(verified.arc as never, { resolver: mailauthResolver, strict: true })
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/arc'), { delta: 0.25 })
})
