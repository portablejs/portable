import * as Dkim from '@portable/dkim'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import {
  binary,
  ed25519Record,
  encode,
  fixture,
  fixtureText,
  importPublic,
  privatePem,
  randomChunks,
  referenceVerify,
  resolverFrom,
  rsaRecord,
  stream,
  tagsOf,
} from './utils.js'

const MSG =
  'From: Andris <andris@example.com>\r\nTo: x@example.net\r\nSubject: test\r\nDate: Thu, 01 Jan 2026 00:00:00 +0000\r\n\r\nHello world\r\n'
const CUSTOM = 'From: a@example.com\r\nX-Custom: one\r\nSubject: s\r\nX-Priority: 1\r\n\r\nbody\r\n'

let rsaPem: string
let edPem: string
let rsaPublic: CryptoKey
let edPublic: CryptoKey
let resolver: Dkim.Resolver

beforeAll(async () => {
  rsaPem = await privatePem('rsa')
  edPem = await privatePem('ed25519')
  rsaPublic = await importPublic('rsa')
  edPublic = await importPublic('ed25519')
  const rsa = await rsaRecord()
  resolver = resolverFrom({
    's._domainkey.example.com': [rsa],
    't._domainkey.example.com': [rsa],
    'ed._domainkey.example.com': [await ed25519Record()],
    's._domainkey.xn--nnelik-oxa.ee': [rsa],
  })
})

const base = (options: Partial<Dkim.sign.Options> = {}): Dkim.sign.Options => ({
  domain: 'example.com',
  selector: 's',
  privateKey: rsaPem,
  ...options,
})

async function signed(options: Partial<Dkim.sign.Options> = {}, message = MSG) {
  const field = await Dkim.sign(message, base(options))
  return { field, tags: tagsOf(field), out: field + message }
}

const results = async (message: string | Uint8Array) =>
  (await Dkim.verify(message, { resolver })).map((r) => r.result)

describe('the signature field', () => {
  test('signs with rsa-sha256, relaxed/relaxed and the time of signing by default', async () => {
    const before = Math.floor(Date.now() / 1000)
    const { field, tags, out } = await signed()
    expect(field).toMatch(
      /^DKIM-Signature: v=1; a=rsa-sha256; c=relaxed\/relaxed; d=example\.com; s=s;/,
    )
    expect(field.endsWith('\r\n')).toBe(true)
    expect(Object.keys(tags)).toEqual(['v', 'a', 'c', 'd', 's', 't', 'h', 'bh', 'b'])
    expect(Number(tags.t)).toBeGreaterThanOrEqual(before)
    expect(Number(tags.t)).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000))
    expect(tags.h).toBe('Date: Subject: To: From')
    expect(await referenceVerify(out, rsaPublic)).toBe(true)
    expect(await results(out)).toEqual(['pass'])
  })

  test('folds lines at 76 characters', async () => {
    const { field } = await signed({
      headers: ['From', 'To', 'Subject', 'Date', 'Message-ID', 'Cc'],
    })
    const lines = field.slice(0, -2).split('\r\n')
    expect(lines.length).toBeGreaterThan(3)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(76)
    for (const line of lines.slice(1)) expect(line).toMatch(/^ \S/)
  })

  test('signs with ed25519-sha256 for an Ed25519 key', async () => {
    const { tags, out } = await signed({ privateKey: edPem, selector: 'ed' })
    expect(tags.a).toBe('ed25519-sha256')
    expect(await referenceVerify(out, edPublic)).toBe(true)
    expect(await results(out)).toEqual(['pass'])
  })

  test('writes t= and x=', async () => {
    const { tags, out } = await signed({
      now: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-02T00:00:00Z'),
    })
    expect(tags.t).toBe('1767225600')
    expect(tags.x).toBe('1767312000')
    expect(await referenceVerify(out, rsaPublic)).toBe(true)
    const [result] = await Dkim.verify(out, { resolver, now: new Date('2026-01-01T12:00:00Z') })
    expect(result!.result).toBe('pass')
  })

  test('gives the same field whatever the chunking of the message', async () => {
    const options = base({ now: new Date(1e12) })
    const expected = await Dkim.sign(MSG, options)
    for (const seed of [1, 2, 3, 4]) {
      const chunks = randomChunks(encode(MSG), seed, 8)
      expect(await Dkim.sign(stream(chunks), options)).toBe(expected)
    }
    expect(await Dkim.sign(encode(MSG), options)).toBe(expected)
  })

  test('uses the hasher option for the body hash', async () => {
    const seen = new Array<Uint8Array>()
    const hasher = (): Dkim.Hasher => ({
      update: (data) => seen.push(data.slice()),
      digest: async () => {
        const all = new Uint8Array(seen.reduce((n, c) => n + c.length, 0))
        let at = 0
        for (const c of seen) {
          all.set(c, at)
          at += c.length
        }
        return new Uint8Array(await crypto.subtle.digest('SHA-256', all))
      },
    })
    const { out } = await signed({ hasher })
    expect(seen.map(binary).join('')).toBe('Hello world\r\n')
    expect(await results(out)).toEqual(['pass'])
  })
})

describe('private keys', () => {
  test('takes a PKCS #8 PEM, a PKCS #1 PEM, a JWK or a CryptoKey', async () => {
    const pkcs1 = await fixtureText('rfc8463-rsa.key.txt')
    const keyResolver = resolverFrom({
      'test._domainkey.football.example.com': [
        (JSON.parse(await fixtureText('rfc8463-dns.json')) as Record<string, { TXT: string[][] }>)[
          'test._domainkey.football.example.com'
        ]!.TXT[0]!,
      ],
    })
    const field = await Dkim.sign(MSG, {
      domain: 'football.example.com',
      selector: 'test',
      privateKey: pkcs1,
    })
    expect((await Dkim.verify(field + MSG, { resolver: keyResolver }))[0]!.result).toBe('pass')

    const extractable = await crypto.subtle.importKey(
      'pkcs8',
      Uint8Array.from(atob(rsaPem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign'],
    )
    const jwk = await crypto.subtle.exportKey('jwk', extractable)
    for (const privateKey of [extractable, jwk]) {
      const { out } = await signed({ privateKey })
      expect(await results(out)).toEqual(['pass'])
    }
  })

  test('takes the RFC 8463 Ed25519 key and gives its body hash', async () => {
    const seed = await fixtureText('rfc8463-ed25519.key.txt')
    const pkcs8 = btoa(atob('MC4CAQAwBQYDK2VwBCIEIA==') + atob(seed.trim()))
    const message = binary(await fixture('rfc8463-signed.eml'))
    const unsigned = message.slice(message.indexOf('\nFrom:') + 1)
    const field = await Dkim.sign(unsigned, {
      domain: 'football.example.com',
      selector: 'brisbane',
      privateKey: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----`,
      headers: ['from', 'to', 'subject', 'date', 'message-id', 'from', 'subject', 'date'],
      now: new Date(1528637909000),
    })
    expect(tagsOf(field).bh).toBe('2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=')
    const zone = JSON.parse(await fixtureText('rfc8463-dns.json')) as Record<
      string,
      { TXT: string[][] }
    >
    const results = await Dkim.verify(field + unsigned, {
      resolver: resolverFrom(
        Object.fromEntries(Object.entries(zone).map(([n, { TXT }]) => [n, TXT])),
      ),
      now: new Date(1528637909000),
    })
    expect(results.map((r) => r.result)).toEqual(['pass'])
  })

  test('refuses anything that is not an RSA or Ed25519 private signing key', async () => {
    const ecdsa = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
    ])
    const sha1 = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-1',
        modulusLength: 1024,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      false,
      ['sign'],
    )
    for (const privateKey of [
      '',
      'not a pem key',
      await fixtureText('public-rsa.pem.txt'),
      ecdsa.privateKey,
      sha1.privateKey,
      rsaPublic,
    ])
      await expect(Dkim.sign(MSG, base({ privateKey }))).rejects.toThrow(RangeError)
    await expect(
      Dkim.sign(MSG, base({ privateKey: undefined as unknown as string })),
    ).rejects.toThrow(TypeError)
  })

  test('refuses an RSA key under 1024 bits (RFC 8301 section 3.2)', async () => {
    await expect(Dkim.sign(MSG, base({ privateKey: await privatePem('small') }))).rejects.toThrow(
      RangeError,
    )
  })
})

describe('options', () => {
  for (const [title, options] of [
    ['a d= with a semicolon', { domain: 'example.com; l=0; x=1' }],
    ['an s= with a semicolon', { selector: 's; i=@evil.example' }],
    ['a d= with a line break', { domain: 'example.com\r\nBcc: victim@example.net' }],
    ['a d= with a space', { domain: 'exa mple.com' }],
    ['a d= with a trailing dot', { domain: 'example.com.' }],
    ['a single label d=', { domain: 'localhost' }],
    ['an s= with an underscore', { selector: 's_1' }],
    ['a d= with a control character', { domain: 'no\x01de.ee' }],
    ['an unknown canonicalization', { canonicalization: 'relaxed/foo' }],
    ['a canonicalization without a body part', { canonicalization: 'relaxed' }],
    ['a header list without From', { headers: ['Subject', 'X-Custom'] }],
    ['a header name with a semicolon', { headers: ['From', 'X;b=x'] }],
    ['a header name with a space', { headers: ['From', 'X Y'] }],
    ['an identity outside d=', { identity: 'user@evil.example' }],
    ['an identity that would break out of its tag', { identity: 'user@example.com; l=0' }],
    ...[
      'x@@example.com',
      'a@exa_mple.example.com',
      'a@example.com.',
      'a..b@example.com',
      'no-at-sign',
    ].map((identity) => [`the identity ${identity}`, { identity }] as const),
    ['an expiry equal to the signing time', { now: new Date(1e12), expiresAt: new Date(1e12) }],
    [
      'an expiry before the signing time',
      { now: new Date(1e12), expiresAt: new Date(1e12 - 1000) },
    ],
    [
      'an expiry less than a second after',
      { now: new Date(1e12), expiresAt: new Date(1e12 + 500) },
    ],
    ['a signing time before 1970', { now: new Date('1960-01-01T00:00:00Z') }],
    ['an invalid Date', { now: new Date(Number.NaN) }],
    ['a signing time with more than 12 digits', { now: new Date(1e15) }],
  ] as const) {
    test(`refuses ${title} with a RangeError`, async () => {
      await expect(Dkim.sign(MSG, base(options as Partial<Dkim.sign.Options>))).rejects.toThrow(
        RangeError,
      )
    })
  }

  for (const [title, options] of [
    ['a missing d=', { domain: undefined }],
    ['a missing s=', { selector: undefined }],
    ['a signing time that is not a Date', { now: 1e12 }],
    ['a header list that is not an array', { headers: 'From:Subject' }],
  ] as const) {
    test(`refuses ${title} with a TypeError`, async () => {
      await expect(
        Dkim.sign(MSG, base(options as unknown as Partial<Dkim.sign.Options>)),
      ).rejects.toThrow(TypeError)
    })
  }

  test('converts U-labels to lower-case A-labels', async () => {
    for (const [input, expected] of [
      ['õnnelik.ee', 'xn--nnelik-oxa.ee'],
      ['ÕNNELIK.ee', 'xn--nnelik-oxa.ee'],
      ['faß.de', 'xn--fa-hia.de'],
      ['xn--nnelik-oxa.ee', 'xn--nnelik-oxa.ee'],
      ['Example.COM', 'example.com'],
    ]) {
      const { tags, out } = await signed({ domain: input!, selector: 'sõber' })
      expect(tags.d).toBe(expected)
      expect(tags.s).toBe('xn--sber-0qa')
      expect(await referenceVerify(out, rsaPublic)).toBe(true)
    }
  })

  test('takes each canonicalization', async () => {
    for (const canonicalization of [
      'relaxed/relaxed',
      'relaxed/simple',
      'simple/relaxed',
      'simple/simple',
    ] as const) {
      const { tags, out } = await signed({ canonicalization })
      expect(tags.c).toBe(canonicalization)
      expect(await referenceVerify(out, rsaPublic)).toBe(true)
      expect(await results(out)).toEqual(['pass'])
    }
  })
})

describe('the h= list', () => {
  test('lists the fields of the message bottom-up', async () => {
    const { tags, out } = await signed({ headers: ['From', 'X-Custom', 'Subject'] }, CUSTOM)
    expect(tags.h).toBe('Subject: X-Custom: From')
    expect(await referenceVerify(out, rsaPublic)).toBe(true)
  })

  test('signs every field of a name listed once', async () => {
    const message = 'Received: a\r\nReceived: b\r\n' + CUSTOM
    const { tags } = await signed({ headers: ['From', 'Received'] }, message)
    expect(tags.h).toBe('From: Received: Received')
  })

  test('leaves out names the message does not have', async () => {
    const { tags } = await signed({ headers: ['From', 'X-Absent', 'Subject', 'Reply-To'] }, CUSTOM)
    expect(tags.h).toBe('Subject: From')
    expect((await signed({}, CUSTOM)).tags.h).toBe('Subject: From')
  })

  test('keeps the case of the field names in the message', async () => {
    const { tags } = await signed(
      { headers: ['FROM', 'subject'] },
      'from: a@example.com\r\nSUBJECT: s\r\n\r\nx',
    )
    expect(tags.h).toBe('SUBJECT: from')
  })

  describe('over-signing (RFC 6376 section 8.15)', () => {
    test('lists a repeated name more times than the message has the field', async () => {
      for (const canonicalization of ['relaxed/relaxed', 'simple/simple'] as const) {
        const { field, tags, out } = await signed(
          { canonicalization, headers: ['From', 'From', 'Subject', 'Subject'] },
          CUSTOM,
        )
        expect(tags.h).toBe('Subject: From: From: Subject')
        expect(await referenceVerify(out, rsaPublic)).toBe(true)
        expect(await results(out)).toEqual(['pass'])
        expect(await results(field + 'From: other@example.net\r\n' + CUSTOM)).toEqual(['fail'])
        expect(await results(out.replace('\r\n\r\n', '\r\nSubject: other\r\n\r\n'))).toEqual([
          'fail',
        ])
        expect(await results(field + 'X-Custom: two\r\n' + CUSTOM)).toEqual(['pass'])
      }
    })

    test('over-signs a repeated name the message does not have', async () => {
      const { field, tags, out } = await signed(
        { headers: ['From', 'Reply-To', 'Reply-To', 'reply-to'] },
        CUSTOM,
      )
      expect(tags.h).toBe('From: Reply-To: Reply-To: Reply-To')
      expect(await results(out)).toEqual(['pass'])
      expect(await results(field + 'Reply-To: other@example.net\r\n' + CUSTOM)).toEqual(['fail'])
    })

    test('adds no names when the message has as many fields as listed', async () => {
      const message = 'Received: a\r\nReceived: b\r\n' + CUSTOM
      let { tags, out, field } = await signed(
        { headers: ['From', 'Received', 'Received'] },
        message,
      )
      expect(tags.h).toBe('From: Received: Received')
      expect(await results(out)).toEqual(['pass'])
      ;({ tags, out, field } = await signed(
        { headers: ['From', 'Received', 'Received', 'Received'] },
        message,
      ))
      expect(tags.h).toBe('From: Received: Received: Received')
      expect(await results(out)).toEqual(['pass'])
      expect(await results(field + 'Received: c\r\n' + message)).toEqual(['fail'])
    })
  })
})

describe('i=', () => {
  test('writes the identity as dkim-quoted-printable (RFC 6376 section 2.11)', async () => {
    for (const canonicalization of ['relaxed/relaxed', 'simple/simple'] as const) {
      for (const [identity, encoded] of [
        ['jõgi@example.com', 'j=C3=B5gi@example.com'],
        ['日本@example.com', '=E6=97=A5=E6=9C=AC@example.com'],
        ['tag=41b@example.com', 'tag=3D41b@example.com'],
        ['user@mail.example.com', 'user@mail.example.com'],
        ['@mail.example.com', '@mail.example.com'],
        ['"a b"@example.com', '"a=20b"@example.com'],
      ]) {
        const { tags, out } = await signed({ canonicalization, identity: identity! })
        expect(tags.i).toBe(encoded)
        expect(await referenceVerify(out, rsaPublic)).toBe(true)
        const [result] = await Dkim.verify(out, { resolver })
        expect(result).toMatchObject({ result: 'pass', identity })
      }
    }
  })
})

describe('messages', () => {
  for (const [title, message] of [
    ['a message without a body', 'From: user@example.com\r\nSubject: test'],
    [
      'headers that end with a line break but no empty line',
      'From: user@example.com\r\nSubject: test\r\n',
    ],
    ['a message with an empty body', 'From: user@example.com\r\nSubject: test\r\n\r\n'],
  ]) {
    test(`signs and verifies ${title}`, async () => {
      const { tags, out } = await signed({}, message)
      expect(tags.bh).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')
      expect(await results(out)).toEqual(['pass'])
    })
  }

  for (const [title, input] of <[string, string][]>[
    ['a message without From', 'Subject: s\r\n\r\nbody\r\n'],
    ['an input with no field that can be signed', 'X-Foo: bar'],
    ['an input that is not a message', 'Hello world, this is not a message'],
    ['an empty input', ''],
    [
      'a message whose From follows a leading empty line (RFC 5322 section 2.1)',
      '\r\nFrom: fake@bank.example\r\n\r\nbody\r\n',
    ],
  ]) {
    test(`refuses ${title} with InvalidInputError`, async () => {
      const error = await Dkim.sign(input, base()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Dkim.InvalidInputError)
      expect((error as Error).name).toBe('Dkim.InvalidInputError')
    })
  }

  // nodemailer's "DKIM signatures verified by mailauth" cases: raw messages signed here and
  // verified by an independent implementation.
  const cases = [
    ['a body without a final line break', 'From: a@example.com\r\nSubject: x\r\n\r\nabc'],
    [
      'a body with trailing whitespace only lines',
      'From: a@example.com\r\nSubject: x\r\n\r\nabc \t\r\n  \r\n\t\r\n\r\n',
    ],
    ['a body of a single byte', 'From: a@example.com\r\nSubject: x\r\n\r\nA'],
    ['a body of empty lines only', 'From: a@example.com\r\nSubject: x\r\n\r\n\r\n\r\n'],
    ['LF line endings', 'From: a@example.com\nSubject: x\n\nline 1\nline 2\n'],
    [
      'tabs and runs of spaces in the body',
      'From: a@example.com\r\nSubject: x\r\n\r\na \t b   c\t\r\n\td\r\n',
    ],
    [
      'a folded header with tabs',
      'From: a@example.com\r\nSubject: first\r\n\tsecond  \r\n \t third\r\n\r\nbody\r\n',
    ],
    [
      'a UTF-8 header with an ideographic space',
      'From: a@example.com\r\nSubject: 日本\u3000語\r\n\r\nbody\r\n',
    ],
    [
      '8-bit header bytes',
      Uint8Array.from('From: a@example.com\r\nSubject: j\xf5geva\r\n\r\nbody\r\n', (c) =>
        c.charCodeAt(0),
      ),
    ],
    [
      'duplicate header fields',
      'Subject: first\r\nFrom: a@example.com\r\nSubject: second\r\n\r\nbody\r\n',
    ],
  ] satisfies [string, string | Uint8Array][]
  for (const [title, message] of cases) {
    test(`signs a message with ${title}`, async () => {
      for (const canonicalization of ['relaxed/relaxed', 'simple/simple'] as const) {
        const field = await Dkim.sign(message, base({ canonicalization }))
        const bytes = typeof message === 'string' ? encode(message) : message
        const out = binary(encode(field)) + binary(bytes)
        const crlf = !/(^|[^\r])\n/.test(out)
        expect(crlf ? await referenceVerify(out, rsaPublic) : true).toBe(true)
        const all = new Uint8Array([...encode(field), ...bytes])
        expect(await results(all)).toEqual(['pass'])
        expect(await results(new Uint8Array([...all, ...encode('more\r\n')]))).toEqual(['fail'])
      }
    })
  }

  test('signs the multipart fixture message', async () => {
    for (const name of ['message1.eml', 'nodemailer-message1.eml']) {
      const message = await fixture(name)
      const field = await Dkim.sign(message, base())
      expect(await results(new Uint8Array([...encode(field), ...message]))).toEqual(['pass'])
    }
  })

  test('gives a signature that fails once a signed header changes', async () => {
    const { out } = await signed({}, 'From: a@example.com\r\nSubject: x\r\n\r\nabc\r\n')
    expect(await results(out.replace('Subject: x', 'Subject: y'))).toEqual(['fail'])
  })
})

describe('header smuggling', () => {
  // A line some mail readers show as part of the field above it. Whatever the verifier does
  // with it, the signature must not pass.
  const message = 'From: real@example.com\r\nSubject: hello\r\n\r\nbody\r\n'
  for (const bytes of [
    '\x0b',
    '\x0c',
    '\r',
    '\xa0',
    '\xc2\xa0',
    '\xe3\x80\x80',
    '\xe2\x80\xa8',
    '\xe2\x81\x9f',
  ]) {
    test(`a line that starts with ${JSON.stringify(bytes)} after a signed field fails`, async () => {
      const field = await Dkim.sign(message, base())
      const tampered = (field + message).replace(
        'From: real@example.com\r\n',
        `From: real@example.com\r\n${bytes}, evil@attacker.test\r\n`,
      )
      expect(await results(Uint8Array.from(tampered, (c) => c.charCodeAt(0)))).toEqual(['fail'])
    })
  }

  test('a folded From whose colon is on the continuation line is signed', async () => {
    const folded = 'From\r\n : boss@example.com\r\nSubject: t\r\n\r\nbody\r\n'
    const field = await Dkim.sign(folded, base())
    expect(tagsOf(field).h).toBe('Subject: From')
    expect(await results(field + folded)).toEqual(['pass'])
  })

  test('a field added above with a leading space is part of the signed field', async () => {
    const field = await Dkim.sign(message, base())
    const tampered = (field + message).replace(
      'Subject: hello\r\n',
      'Subject: hello\r\n , world\r\n',
    )
    expect(await results(tampered)).toEqual(['fail'])
  })
})

describe('signal', () => {
  test('rejects at once for an aborted signal', async () => {
    const signal = AbortSignal.abort()
    await expect(Dkim.sign(MSG, base({ signal }))).rejects.toBe(signal.reason)
  })

  test('rejects with the reason and cancels the message when the signal aborts the read', async () => {
    const controller = new AbortController()
    let cancelled = false
    const message = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encode('From: a@example.com\r\n\r\nbody'))
      },
      pull: () => new Promise<void>(() => {}),
      cancel() {
        cancelled = true
      },
    })
    const pending = Dkim.sign(message, base({ signal: controller.signal }))
    setTimeout(() => controller.abort(), 10)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toBe(true)
  })
})
