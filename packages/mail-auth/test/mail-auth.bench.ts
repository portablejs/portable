import { Buffer } from 'node:buffer'
import * as Arc from '@portable/arc'
import * as MailAuth from '@portable/mail-auth'
import { authenticate as upstreamAuthenticate } from 'mailauth'
import { expect, test } from 'vite-plus/test'
import { encode, fixtureText, key, signed, type Zone, zoneResolver } from './utils.js'

const rsa = await key('rsa')
const zone = {
  'test._domainkey.example.com': { TXT: [rsa.record] },
  'example.com': { TXT: ['v=spf1 ip4:192.0.2.0/24 include:_spf.example.com -all'] },
  '_spf.example.com': { TXT: ['v=spf1 ip4:198.51.100.0/24 -all'] },
  '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject'] },
} satisfies Zone
const resolver = zoneResolver(zone)
const upstreamResolver = async (name: string, type: string) => {
  if (type !== 'TXT') throw Object.assign(new Error(type), { code: 'ENODATA' })
  return resolver.resolveTxt(name)
}
const pkcs8 = Uint8Array.from(atob(rsa.privateKey.replace(/-----[^-]+-----|\s/g, '')), (char) =>
  char.charCodeAt(0),
)
const cryptoKey = await crypto.subtle.importKey(
  'pkcs8',
  pkcs8,
  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  false,
  ['sign'],
)

const text = (await fixtureText('message1.eml')).replace(/\r?\n/g, '\r\n')
const head = text
  .slice(0, text.indexOf('\r\n\r\n') + 4)
  .replace(/^From: .*$/m, 'From: Andris <andris@example.com>')
const body = text.slice(head.length)
const large = await signed(head + body.repeat(Math.ceil(250_000 / body.length)), 'example.com')
const largeSealed = encode(
  (await Arc.seal(large, {
    domain: 'example.com',
    selector: 'test',
    privateKey: cryptoKey,
    authResults: 'mx.sealer.example; dkim=pass header.i=@example.com',
  })) + large,
)

const envelope = { ip: '192.0.2.1', helo: 'mail.example.com', sender: 'bounce@example.com' }

test('authenticates a 250 KB message with a DKIM signature and an ARC set within 25% of mailauth', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/mail-auth', async () => {
      const result = await MailAuth.authenticate(largeSealed, {
        ...envelope,
        resolver,
        authservId: 'mx.example.net',
      })
      if (result.dmarc?.result !== 'pass' || result.arc.result !== 'pass') throw new Error('fail')
    }),
    bench('mailauth', async () => {
      const result = await upstreamAuthenticate(Buffer.from(largeSealed), {
        ...envelope,
        resolver: upstreamResolver as never,
        mta: 'mx.example.net',
        strict: true,
        disableBimi: true,
      })
      if ((result.dmarc as { status: { result: string } }).status.result !== 'pass')
        throw new Error('fail')
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/mail-auth'), {
    delta: 0.25,
  })
})

const small = await signed(
  'From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\nHello\r\n',
  'example.com',
)

test('authenticates and seals a short message within 25% of mailauth', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/mail-auth', async () => {
      await MailAuth.authenticate(small, {
        ...envelope,
        resolver,
        authservId: 'mx.example.net',
        seal: { domain: 'example.com', selector: 'test', privateKey: cryptoKey },
      })
    }),
    bench('mailauth', async () => {
      await upstreamAuthenticate(Buffer.from(small), {
        ...envelope,
        resolver: upstreamResolver as never,
        mta: 'mx.example.net',
        strict: true,
        disableBimi: true,
        seal: { signingDomain: 'example.com', selector: 'test', privateKey: rsa.privateKey },
      })
    }),
  )
  expect(result.get('mailauth')).not.toBeFasterThan(result.get('@portable/mail-auth'), {
    delta: 0.25,
  })
})
