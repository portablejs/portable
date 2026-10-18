import { Buffer } from 'node:buffer'
import { createHash, createPrivateKey, sign as nodeSign } from 'node:crypto'
import * as Dkim from '@portable/dkim'
import { dkimSign } from 'mailauth/lib/dkim/sign.js'
import { dkimVerify } from 'mailauth/lib/dkim/verify.js'
import DKIM from 'nodemailer/lib/dkim'
import { expect, test } from 'vite-plus/test'
import { chunked, encode, fixture, privatePem, resolverFrom, rsaRecord, stream } from './utils.js'

const rsaPem = await privatePem('rsa')
const resolver = resolverFrom({ 'rsa._domainkey.example.com': [await rsaRecord()] })
const mailauthResolver = (name: string) => resolver.resolveTxt(name)

const message1 = await fixture('message1.eml')
const split = message1.indexOf(13) >= 0 ? '\r\n\r\n' : '\n\n'
const text = new TextDecoder().decode(message1)
const head = text.slice(0, text.indexOf(split) + split.length)
const body = text.slice(head.length)
const large = encode(head + body.repeat(Math.ceil(250_000 / body.length)))
const chunks = chunked(large, 65536)

const options = { domain: 'example.com', selector: 'rsa', privateKey: rsaPem }
const signed = new Uint8Array([...encode(await Dkim.sign(large, options)), ...large])
const signedChunks = chunked(signed, 65536)
const nodeKey = createPrivateKey(rsaPem)

function nodemailerSign(input: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = new DKIM({
      domainName: 'example.com',
      keySelector: 'rsa',
      privateKey: rsaPem,
    }).sign(Buffer.from(input))
    output.on('data', () => {})
    output.on('error', reject)
    output.on('end', resolve)
  })
}

test('signs a 250 KB message within 25% of mailauth and nodemailer', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dkim', async () => {
      await Dkim.sign(stream(chunks), options)
    }),
    bench('mailauth', async () => {
      await dkimSign(Buffer.from(large), {
        signatureData: [{ signingDomain: 'example.com', selector: 'rsa', privateKey: rsaPem }],
      })
    }),
    bench('nodemailer', async () => {
      await nodemailerSign(large)
    }),
    bench('node:crypto, hash and sign only', () => {
      createHash('sha256').update(large).digest()
      nodeSign('sha256', large.subarray(0, 512), nodeKey)
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/dkim'), { delta: 0.25 })
  expect(result.get('nodemailer')).not.toBeFasterThan(result.get('@portable/dkim'), {
    delta: 0.25,
  })
})

test('verifies a 250 KB message within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dkim', async () => {
      await Dkim.verify(stream(signedChunks), { resolver })
    }),
    bench('mailauth', async () => {
      await dkimVerify(Buffer.from(signed), { resolver: mailauthResolver, strict: true })
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/dkim'), { delta: 0.25 })
})

const small = encode('From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\nHello\r\n')
const smallSigned = new Uint8Array([...encode(await Dkim.sign(small, options)), ...small])

test('signs and verifies a short message within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dkim', async () => {
      await Dkim.sign(small, options)
      await Dkim.verify(smallSigned, { resolver })
    }),
    bench('mailauth', async () => {
      await dkimSign(Buffer.from(small), {
        signatureData: [{ signingDomain: 'example.com', selector: 'rsa', privateKey: rsaPem }],
      })
      await dkimVerify(Buffer.from(smallSigned), { resolver: mailauthResolver, strict: true })
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/dkim'), { delta: 0.25 })
})
