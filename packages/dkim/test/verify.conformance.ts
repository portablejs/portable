import * as Dkim from '@portable/dkim'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import {
  canonicalBodyRelaxed,
  canonicalBodySimple,
  dnsError,
  ed25519Record,
  encode,
  fixture,
  fixtureText,
  importPrivate,
  pkcs1,
  privatePem,
  randomChunks,
  referenceSign,
  resolverFrom,
  rsaRecord,
  spki,
  stream,
  utf8,
} from './utils.js'

const D = 'example.com'
const S = 'sel'
const KEY = `${S}._domainkey.${D}`
const HEADERS = [
  'From: Joe <joe@example.com>',
  'To: suzie@example.net',
  'Subject: Is dinner ready?',
  'Date: Fri, 11 Jul 2003 21:00:37 -0700',
]
const BODY = 'Hi.\r\n\r\nWe lost the game.  Are you hungry yet?\r\n\r\nJoe.\r\n'

let rsa: CryptoKey
let rsaSha1: CryptoKey
let small: CryptoKey
let ed: CryptoKey
let rsaRec: string
let edRec: string

beforeAll(async () => {
  rsa = await importPrivate(await privatePem('rsa'))
  rsaSha1 = await importPrivate(await privatePem('rsa'), 'SHA-1')
  small = await importPrivate(await privatePem('small'))
  ed = await importPrivate(await privatePem('ed25519'))
  rsaRec = await rsaRecord()
  edRec = await ed25519Record()
})

type Std = {
  algorithm?: string
  c?: string
  h?: string
  names?: string
  d?: string
  s?: string
  rawTags?: string
  key?: () => CryptoKey
  headers?: readonly string[]
  body?: string
  suffix?: string
  length?: number
}

/**
 * A message signed by the reference signer, with `extra` tags before h=. Mirrors mailauth's `std`.
 */
function std(extra = '', o: Std = {}): Promise<string> {
  const algorithm = o.algorithm ?? 'rsa-sha256'
  const c = o.c ?? 'relaxed/relaxed'
  const h = o.h ?? 'from:to:subject:date'
  const tags =
    o.rawTags ??
    `v=1; a=${algorithm}; c=${c}; d=${o.d ?? D}; s=${o.s ?? S};${extra} h=${h}; bh=%BH%; b=`
  return referenceSign({
    headers: o.headers ?? HEADERS,
    body: o.body ?? BODY,
    c,
    algorithm,
    key: o.key?.() ?? rsa,
    prefix: `DKIM-Signature: ${tags}`,
    suffix: o.suffix,
    names: (o.names ?? h).split(':'),
    length: o.length,
  })
}

async function run(
  message: string,
  records: Parameters<typeof resolverFrom>[0],
  options: Partial<Dkim.verify.Options> = {},
) {
  const log: string[] = []
  const results = await Dkim.verify(encodeBinary(message), {
    resolver: resolverFrom(records, log),
    ...options,
  })
  return { log, results, result: results[0]! }
}

const encodeBinary = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

type Case = {
  title: string
  message: () => Promise<string>
  records: () => Parameters<typeof resolverFrom>[0]
  now?: Date
  result: Dkim.Result.Code
  reason?: string
  /** The verifier makes no DNS query. */
  noDns?: boolean
  testing?: boolean
}

const key = (record: () => string) => () => ({ [KEY]: [record()] })

// The cases of mailauth's test/dkim/verify-rfc-compliance-test.js, with the results of its
// strict mode, except where PARITY.md lists a difference.
const cases: Case[] = [
  {
    title: 'a valid rsa-sha256 signature',
    message: () => std(),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'a valid ed25519-sha256 signature',
    message: () => std('', { algorithm: 'ed25519-sha256', key: () => ed }),
    records: key(() => edRec),
    result: 'pass',
  },
  {
    title: 'an rsa-sha1 signature (RFC 8301 section 3.1)',
    message: () => std('', { algorithm: 'rsa-sha1', key: () => rsaSha1 }),
    records: key(() => rsaRec),
    result: 'policy',
    reason: 'weak algorithm',
    noDns: true,
  },
  {
    title: 'an rsa-sha1 signature with a key that only allows sha256',
    message: () => std('', { algorithm: 'rsa-sha1', key: () => rsaSha1 }),
    records: key(() => rsaRec.replace('k=rsa;', 'h=sha256; k=rsa;')),
    result: 'policy',
    reason: 'weak algorithm',
  },
  {
    title: 'a signature with a hash the key h= tag does not list',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 'h=sha1; k=rsa;')),
    result: 'permerror',
    reason: 'inappropriate hash algorithm',
  },
  {
    title: 'a signature with a key h= tag that lists the hash',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 'h=sha1:sha256; k=rsa;')),
    result: 'pass',
  },
  {
    title: 'a key that is not meant for email',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 's=foo; k=rsa;')),
    result: 'permerror',
    reason: 'key not for email',
  },
  {
    title: 'a key with s=email',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 's=email; k=rsa;')),
    result: 'pass',
  },
  {
    title: 'a signature that does not sign From',
    message: () => std('', { h: 'to:subject:date' }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'From field not signed',
    noDns: true,
  },
  {
    title: 'a signature that does not sign From, with From replaced after signing',
    message: async () =>
      (await std('', { h: 'to:subject:date' })).replace(
        'From: Joe <joe@example.com>',
        'From: CEO <ceo@example.com>',
      ),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'From field not signed',
  },
  {
    title: 'a signature with an empty h= tag',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=${S}; h=; bh=%BH%; b=`,
        names: '',
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
  },
  {
    title: 'an i= domain that is not under d=',
    message: () => std(' i=user@evil.test;'),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'domain mismatch',
    noDns: true,
  },
  {
    title: 'a subdomain i= with a key that has t=s',
    message: () => std(' i=user@sub.example.com;'),
    records: key(() => rsaRec.replace('k=rsa;', 't=s; k=rsa;')),
    result: 'permerror',
    reason: 'domain mismatch',
  },
  {
    title: 'the d= domain in i= with a key that has t=s',
    message: () => std(' i=user@example.com;'),
    records: key(() => rsaRec.replace('k=rsa;', 't=s; k=rsa;')),
    result: 'pass',
  },
  {
    title: 'a signature without v=',
    message: () =>
      std('', {
        rawTags: `a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature missing required tag',
    noDns: true,
  },
  {
    title: 'a signature with v=2',
    message: () =>
      std('', {
        rawTags: `v=2; a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'incompatible version',
  },
  {
    title: 'a signature without h=',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=${S}; bh=%BH%; b=`,
        names: 'from:to:subject:date',
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature missing required tag',
  },
  {
    title: 'a signature with a duplicate tag (RFC 6376 section 3.2)',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; d=evil.test; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
  },
  {
    title: 'a signature with upper case tag names',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; D=${D}; S=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature missing required tag',
  },
  {
    title: 'a key with a duplicate tag',
    message: () => std(),
    records: key(() => rsaRec.replace('p=', 'p=; p=')),
    result: 'permerror',
    reason: 'key syntax error',
  },
  {
    title: 'a key with v= that is not the first tag',
    message: () => std(),
    records: key(() => rsaRec.replace('v=DKIM1; k=rsa;', 'k=rsa; v=DKIM1;')),
    result: 'permerror',
    reason: 'unknown key version',
  },
  {
    title: 'a key with v=dkim1 in lower case',
    message: () => std(),
    records: key(() => rsaRec.replace('v=DKIM1', 'v=dkim1')),
    result: 'permerror',
    reason: 'unknown key version',
  },
  {
    title: 'a key with v=DKIM 1',
    message: () => std(),
    records: key(() => rsaRec.replace('v=DKIM1', 'v=DKIM 1')),
    result: 'permerror',
    reason: 'unknown key version',
  },
  {
    title: 'an ed25519 key without k=, which defaults to rsa',
    message: () => std('', { algorithm: 'ed25519-sha256', key: () => ed }),
    records: key(() => edRec.replace(' k=ed25519;', '')),
    result: 'permerror',
    reason: 'inappropriate key algorithm',
  },
  {
    title: 'an rsa signature with an ed25519 key',
    message: () => std(),
    records: key(() => edRec),
    result: 'permerror',
    reason: 'inappropriate key algorithm',
  },
  {
    title: 'an ed25519-sha256 signature made and verified with an RSA key',
    message: () => std('', { algorithm: 'ed25519-sha256' }),
    records: key(() => rsaRec),
    result: 'permerror',
    reason: 'inappropriate key algorithm',
  },
  {
    title: 'an ed25519 key published as SubjectPublicKeyInfo (RFC 8463 section 4.2)',
    message: () => std('', { algorithm: 'ed25519-sha256', key: () => ed }),
    records: key(() => edRec.replace(/p=.*/, `p=${edSpki}`)),
    result: 'permerror',
    reason: 'invalid public key',
  },
  {
    title: 'an ed25519-sha1 signature',
    message: () => std('', { algorithm: 'ed25519-sha1', key: () => ed }),
    records: key(() => edRec),
    result: 'neutral',
    reason: 'unknown algorithm',
    noDns: true,
  },
  {
    title: 'a 512 bit RSA key',
    message: () => std('', { key: () => small }),
    records: key(() => smallRec),
    result: 'policy',
    reason: 'weak key',
  },
  {
    title: 'a key published as a bare RSAPublicKey',
    message: () => std(),
    records: key(() => `v=DKIM1; k=rsa; p=${rsaPkcs1}`),
    result: 'pass',
  },
  ...["n=it's", 'n=see(below', 'n=a\\b'].map((tag): Case => ({
    title: `a key with ${tag}`,
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', `k=rsa; ${tag};`)),
    result: 'pass',
  })),
  ...[
    " z=From:O'Brien=20<ob@example.com>;",
    ' z=Subject:(hi;',
    ' z=Subject:a\\b;',
    ' z=Subject:b=3Dx;',
  ].map((tag): Case => ({
    title: `a signature with${tag}`,
    message: () => std(tag),
    records: key(() => rsaRec),
    result: 'pass',
  })),
  {
    title: 'a signature with an unknown tag that holds " b="',
    message: () => std(' xnote=see b=here;'),
    records: key(() => rsaRec),
    result: 'pass',
  },
  ...[' ;', ' x-note=1;', ' xnote;', ' 1x=2;'].map((tag): Case => ({
    title: `a signature with the invalid tag-spec "${tag.trim()}" (RFC 6376 section 3.2)`,
    message: () => std(tag),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
    noDns: true,
  })),
  {
    title: 'a signature with folding whitespace around tags and values',
    message: () => std(' n =\r\n  two  words \r\n ;'),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'a key with a colon and spaces in a value',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 'k=rsa; n=see: notes (1);')),
    result: 'pass',
  },
  {
    title: 'a key record with a trailing semicolon',
    message: () => std(),
    records: key(() => `${rsaRec};`),
    result: 'pass',
  },
  {
    title: 'a key record with a tag-spec without "="',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 'k=rsa; n;')),
    result: 'permerror',
    reason: 'key syntax error',
  },
  {
    title: 'a signature with whitespace between b and "="',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b =`,
      }),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'a signature where b= is not the last tag',
    message: () => std('', { suffix: '; xfoo=bar' }),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'an x= that is equal to t= (RFC 6376 section 3.5)',
    message: () => std(' t=1700000000; x=1700000000;'),
    records: key(() => rsaRec),
    now: new Date(1600000000000),
    result: 'neutral',
    reason: 'invalid expiration',
  },
  {
    title: 'an x= that is before t=',
    message: () => std(' t=1700000000; x=1690000000;'),
    records: key(() => rsaRec),
    now: new Date(1600000000000),
    result: 'neutral',
    reason: 'invalid expiration',
  },
  {
    title: 'an expired signature',
    message: () => std(' t=1000000000; x=1000000100;'),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature expired',
    noDns: true,
  },
  ...[' t=0x10;', ' x=abc;', ' l=-1;', ' t=1234567890123;'].map((tag): Case => ({
    title: `a signature with${tag}`,
    message: () => std(tag),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
    noDns: true,
  })),
  {
    title: 'a hexadecimal l=',
    message: () => std(' l=0x10;', { length: 16 }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
  },
  {
    title: 'a body hash mismatch (RFC 6376 section 6.1.3 step 3)',
    message: async () => (await std()).replace('Joe.', 'Bob.'),
    records: key(() => rsaRec),
    result: 'fail',
    reason: 'body hash did not verify',
  },
  {
    title: 'a header hash mismatch',
    message: async () => (await std()).replace('Is dinner ready?', 'Is lunch ready?'),
    records: key(() => rsaRec),
    result: 'fail',
    reason: 'signature did not verify',
  },
  {
    title: 'a signature without d=',
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=relaxed/relaxed; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature missing required tag',
  },
  {
    title: 'a signature with an unknown algorithm',
    message: () => std('', { algorithm: 'rsa-sha512' }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'unknown algorithm',
  },
  {
    title: 'a signature with an unknown canonicalization',
    message: () => std('', { c: 'foo/relaxed' }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'unknown canonicalization',
  },
  {
    title: 'a signature with an unknown query method',
    message: () => std(' q=foo/bar;'),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'unsupported query method',
  },
  {
    title: 'a signature with q=dns/txt',
    message: () => std(' q=dns/txt;'),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'a d= that is not a domain name',
    message: () => std('', { d: 'exa_mple.com' }),
    records: () => ({ [`${S}._domainkey.exa_mple.com`]: [rsaRec] }),
    result: 'neutral',
    reason: 'signature syntax error',
    noDns: true,
  },
  ...['example..com', `${'a'.repeat(64)}.com`, `${`${'a'.repeat(60)}.`.repeat(4)}com`].map(
    (d): Case => ({
      title: `a d= that can't be a DNS name: ${d.slice(0, 20)}…`,
      message: () => std('', { d }),
      records: () => ({ [`${S}._domainkey.${d}`]: [rsaRec] }),
      result: 'neutral',
      reason: 'signature syntax error',
      noDns: true,
    }),
  ),
  {
    title: 'a key lookup that fails with EBADNAME',
    message: () => std(),
    records: () => ({ [KEY]: dnsError('EBADNAME', KEY) }),
    result: 'permerror',
    reason: 'no key',
  },
  {
    title: 'a key lookup that fails with ENODATA',
    message: () => std(),
    records: () => ({ [KEY]: dnsError('ENODATA', KEY) }),
    result: 'permerror',
    reason: 'no key',
  },
  {
    title: 'a key lookup that fails with ENOTFOUND',
    message: () => std(),
    records: () => ({}),
    result: 'permerror',
    reason: 'no key',
  },
  {
    title: 'a key lookup that fails with ESERVFAIL',
    message: () => std(),
    records: () => ({ [KEY]: dnsError('ESERVFAIL', KEY) }),
    result: 'temperror',
    reason: 'key lookup failed: ESERVFAIL',
  },
  {
    title: 'a revoked key (empty p=)',
    message: () => std(),
    records: key(() => 'v=DKIM1; k=rsa; p='),
    result: 'permerror',
    reason: 'key revoked',
  },
  {
    title: 'a key without p=',
    message: () => std(),
    records: key(() => 'v=DKIM1; k=rsa'),
    result: 'permerror',
    reason: 'key syntax error',
  },
  {
    title: 'a key of an unknown type',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa', 'k=dsa')),
    result: 'permerror',
    reason: 'unknown key type',
  },
  {
    title: 'a key with a p= that is not base64',
    message: () => std(),
    records: key(() => 'v=DKIM1; k=rsa; p=!!!'),
    result: 'permerror',
    reason: 'invalid public key',
  },
  {
    title: 'a key with a p= that is not a key',
    message: () => std(),
    records: key(() => 'v=DKIM1; k=rsa; p=AAAA'),
    result: 'permerror',
    reason: 'invalid public key',
  },
  {
    title: 'a key split over several strings of one TXT record',
    message: () => std(),
    records: () => ({ [KEY]: [[rsaRec.slice(0, 100), rsaRec.slice(100)]] }),
    result: 'pass',
  },
  ...['', 'relaxed/', 'relaxed/relaxed/x', '/relaxed'].map((c): Case => ({
    title: `a signature with c=${c}`,
    message: () =>
      std('', {
        rawTags: `v=1; a=rsa-sha256; c=${c}; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
    noDns: true,
  })),
  ...['relaxed', 'Relaxed/Simple', 'simple/relaxed', 'relaxed / relaxed', 'simple'].map(
    (c): Case => ({
      title: `a signature with c=${c}`,
      message: () =>
        std('', {
          c: c.replaceAll(' ', '').toLowerCase(),
          rawTags: `v=1; a=rsa-sha256; c=${c}; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
        }),
      records: key(() => rsaRec),
      result: 'pass',
    }),
  ),
  {
    title: 'a signature without c=, which is simple/simple',
    message: () =>
      std('', {
        c: 'simple/simple',
        rawTags: `v=1; a=rsa-sha256; d=${D}; s=${S}; h=from:to:subject:date; bh=%BH%; b=`,
      }),
    records: key(() => rsaRec),
    result: 'pass',
  },
  {
    title: 'a key in testing mode (t=y)',
    message: () => std(),
    records: key(() => rsaRec.replace('k=rsa;', 't=y; k=rsa;')),
    result: 'pass',
    testing: true,
  },
  {
    title: 'a signature with a b= that is not base64',
    message: async () => (await std()).replace(/b=[A-Za-z0-9+/]{4}/, 'b=!!!!'),
    records: key(() => rsaRec),
    result: 'neutral',
    reason: 'signature syntax error',
    noDns: true,
  },
]

let edSpki: string
let smallRec: string
let rsaPkcs1: string
beforeAll(async () => {
  edSpki = await spki('ed25519')
  smallRec = await rsaRecord('small')
  rsaPkcs1 = await pkcs1('rsa')
})

describe('RFC compliance cases', () => {
  for (const c of cases) {
    test(`${c.title}`, async () => {
      const { result, log } = await run(await c.message(), c.records(), c.now ? { now: c.now } : {})
      expect({ result: result.result, reason: result.reason }).toEqual({
        result: c.result,
        reason: c.reason,
      })
      expect(result.testing).toBe(c.testing ?? false)
      expect(c.noDns ? log : []).toEqual([])
    })
  }
})

describe('the result object', () => {
  test('reports the domain, selector, algorithm, identity and signature', async () => {
    const message = await std(' i=joe@sub.example.com;')
    const { result } = await run(message, { [KEY]: [rsaRec] })
    const b = /b=([^;\r]+)\r\n/.exec(message)![1]
    expect(result).toEqual({
      result: 'pass',
      domain: 'example.com',
      selector: 'sel',
      algorithm: 'rsa-sha256',
      identity: 'joe@sub.example.com',
      signature: b,
      testing: false,
    })
  })

  test('uses @ and d= as the identity when there is no i=', async () => {
    const { result } = await run(await std(), { [KEY]: [rsaRec] })
    expect(result.identity).toBe('@example.com')
  })

  test('decodes a dkim-quoted-printable i=', async () => {
    const { result } = await run(await std(' i=j=C3=B5gi@example.com;'), { [KEY]: [rsaRec] })
    expect(result).toMatchObject({ result: 'pass', identity: 'jõgi@example.com' })
  })

  test('gives an empty array for a message without signatures', async () => {
    const { results, log } = await run(`${HEADERS.join('\r\n')}\r\n\r\n${BODY}`, {})
    expect(results).toEqual([])
    expect(log).toEqual([])
  })

  test('gives one result per signature, in header order', async () => {
    const first = await std('', { s: 'one', algorithm: 'ed25519-sha256', key: () => ed })
    const both = await referenceSign({
      headers: first.slice(0, first.indexOf('\r\n\r\n')).split(/\r\n(?![ \t])/),
      body: BODY,
      c: 'relaxed/relaxed',
      algorithm: 'rsa-sha256',
      key: rsa,
      prefix: `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=${D}; s=two; h=from:to; bh=%BH%; b=`,
      names: ['from', 'to'],
    })
    const { results } = await run(both, {
      [`one._domainkey.${D}`]: [edRec],
      [`two._domainkey.${D}`]: [rsaRec],
    })
    expect(results.map((r) => [r.selector, r.algorithm, r.result])).toEqual([
      ['two', 'rsa-sha256', 'pass'],
      ['one', 'ed25519-sha256', 'pass'],
    ])
  })

  test('looks up a key once for signatures that share it', async () => {
    const first = await std()
    const both = `DKIM-Signature: ${first.slice(first.indexOf(':') + 1, first.indexOf('\r\nFrom:'))}\r\n${first}`
    const { results, log } = await run(both, { [KEY]: [rsaRec] })
    expect(results.map((r) => r.result)).toEqual(['pass', 'pass'])
    expect(log).toEqual([KEY])
  })
})

describe('d= values that are not host names', () => {
  for (const separator of ['/', '?', '#', '\\', '@', ':', ' ']) {
    const d = `${D}${separator}x.attacker.test`
    test(`d=${d} gives a syntax error without a key query`, async () => {
      const { result, log } = await run(await std('', { d }), {
        [`${S}._domainkey.${d}`]: [rsaRec],
      })
      expect(result).toMatchObject({ result: 'neutral', reason: 'signature syntax error' })
      expect(log).toEqual([])
    })
  }
})

describe('EAI (RFC 8616)', () => {
  const message = () =>
    referenceSign({
      headers: ['From: Joe <joe@bücher.example>', ...HEADERS.slice(1)].map(utf8),
      body: BODY,
      c: 'relaxed/relaxed',
      algorithm: 'rsa-sha256',
      key: rsa,
      prefix: `DKIM-Signature: ${utf8(`v=1; a=rsa-sha256; c=relaxed/relaxed; d=bücher.example; s=${S}; h=from:to:subject:date; bh=%BH%; b=`)}`,
      names: ['from', 'to', 'subject', 'date'],
    })

  test('looks up the key of a U-label d= under its A-label and reports A-labels', async () => {
    const { result, log } = await run(await message(), {
      [`${S}._domainkey.xn--bcher-kva.example`]: [rsaRec],
    })
    expect(log).toEqual([`${S}._domainkey.xn--bcher-kva.example`])
    expect(result).toMatchObject({
      result: 'pass',
      domain: 'xn--bcher-kva.example',
      identity: '@xn--bcher-kva.example',
    })
  })
})

describe('body length (l=)', () => {
  const total = (c: string) =>
    (c.endsWith('simple') ? canonicalBodySimple(BODY) : canonicalBodyRelaxed(BODY)).length

  test('reports the content after l=0 as unsigned', async () => {
    const message = (await std(' l=0;', { length: 0 })) + 'APPENDED\r\n'
    const { result } = await run(message, { [KEY]: [rsaRec] })
    expect(result).toMatchObject({ result: 'pass', bodyLength: 0 })
    expect(result.unsignedBodyBytes).toBe(total('relaxed') + 'APPENDED\r\n'.length)
  })

  test('gives neutral for an l= larger than the canonicalized body (RFC 6376 section 3.5)', async () => {
    const { result } = await run(await std(' l=1000;', { length: 1000 }), { [KEY]: [rsaRec] })
    expect(result).toMatchObject({
      result: 'neutral',
      reason: 'l= is longer than the body',
      bodyLength: 1000,
      unsignedBodyBytes: 0,
    })
  })

  test('accepts an l= equal to the canonicalized body length', async () => {
    for (const c of ['relaxed/relaxed', 'simple/simple']) {
      const length = total(c)
      const { result } = await run(await std(` l=${length};`, { length, c }), { [KEY]: [rsaRec] })
      expect(result).toMatchObject({ result: 'pass', bodyLength: length, unsignedBodyBytes: 0 })
    }
  })

  test('counts content added after l= in LF line endings', async () => {
    for (const c of ['relaxed/relaxed', 'simple/simple']) {
      const signed = await std(' l=5;', { length: 5, c, body: 'Hi.\r\n' })
      const { result } = await run(signed + 'LINE ONE\nLINE TWO\n', { [KEY]: [rsaRec] })
      expect(result).toMatchObject({ result: 'pass', bodyLength: 5, unsignedBodyBytes: 20 })
    }
  })

  test('accepts a body hashed with l= by mailauth for each canonicalization', async () => {
    for (const c of ['relaxed/relaxed', 'simple/simple', 'relaxed/simple', 'simple/relaxed']) {
      const { result } = await run(await std(' l=20;', { length: 20, c }), { [KEY]: [rsaRec] })
      expect(result.result).toBe('pass')
    }
  })
})

describe('header section', () => {
  test('reads a message that starts with an empty line as having no header fields', async () => {
    const { results } = await run('\r\n' + (await std()), { [KEY]: [rsaRec] })
    expect(results).toEqual([])
  })

  test('verifies a simple body with an LF right after a CRLF', async () => {
    const signed = await std('', { c: 'simple/simple', body: 'x\r\n\r\ny\r\n' })
    const { result } = await run(signed.replace('x\r\n\r\ny\r\n', 'x\r\n\ny\r\n'), {
      [KEY]: [rsaRec],
    })
    expect(result.result).toBe('pass')
  })

  test('verifies a message with LF line endings throughout', async () => {
    const signed = await std()
    const { result } = await run(signed.replaceAll('\r\n', '\n'), { [KEY]: [rsaRec] })
    expect(result.result).toBe('pass')
  })

  test('verifies a message without a body', async () => {
    const signed = await std('', { body: '' })
    for (const message of [signed, signed.slice(0, -2), signed.slice(0, -4)]) {
      const { result } = await run(message, { [KEY]: [rsaRec] })
      expect(result.result).toBe('pass')
    }
  })

  test('does not read an ARC-Message-Signature as a DKIM-Signature', async () => {
    const signed = await std()
    const { results } = await run(signed.replace('DKIM-Signature:', 'ARC-Message-Signature:'), {
      [KEY]: [rsaRec],
    })
    expect(results).toEqual([])
  })
})

describe('input', () => {
  test('takes a ReadableStream in any chunking, a Uint8Array or a string', async () => {
    const message = await std()
    const bytes = encode(message)
    const resolver = resolverFrom({ [KEY]: [rsaRec] })
    for (const seed of [1, 2, 3]) {
      const results = await Dkim.verify(stream(randomChunks(bytes, seed, 16)), { resolver })
      expect(results.map((r) => r.result)).toEqual(['pass'])
    }
    expect((await Dkim.verify(stream([bytes]), { resolver }))[0]!.result).toBe('pass')
    expect((await Dkim.verify(message, { resolver }))[0]!.result).toBe('pass')
    expect((await Dkim.verify(bytes, { resolver }))[0]!.result).toBe('pass')
  })

  test('cancels the stream when no signature needs the body', async () => {
    let cancelled = false
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('From: a@example.com\r\nSubject: x\r\n\r\n'))
      },
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(1024))
      },
      cancel() {
        cancelled = true
      },
    })
    expect(await Dkim.verify(body, { resolver: resolverFrom({}) })).toEqual([])
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThan(3)
  })

  test('rejects a stream of chunks that are not Uint8Array', async () => {
    const resolver = resolverFrom({})
    await expect(
      Dkim.verify(stream(['From: a\r\n\r\n' as unknown as Uint8Array]), { resolver }),
    ).rejects.toThrow(TypeError)
  })

  test('rejects a missing resolver', async () => {
    await expect(Dkim.verify('', {} as Dkim.verify.Options)).rejects.toThrow(TypeError)
  })

  test('rejects with the reason when the signal aborts a key lookup', async () => {
    const controller = new AbortController()
    const resolver: Dkim.Resolver = { resolveTxt: () => new Promise(() => {}) }
    const pending = Dkim.verify(await std(), { resolver, signal: controller.signal })
    const reason = new Error('stop')
    setTimeout(() => controller.abort(reason), 10)
    await expect(pending).rejects.toBe(reason)
  })

  test('rejects with the reason and cancels the message when the signal aborts the read', async () => {
    const controller = new AbortController()
    let cancelled = false
    const message = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          encode(
            `DKIM-Signature: v=1; a=rsa-sha256; d=${D}; s=${S}; h=from; bh=AAAA; b=AAAA\r\nFrom: a@example.com\r\n\r\n`,
          ),
        )
      },
      pull: () => new Promise<void>(() => {}),
      cancel() {
        cancelled = true
      },
    })
    const pending = Dkim.verify(message, {
      resolver: resolverFrom({ [KEY]: [rsaRec] }),
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 10)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toBe(true)
  })

  test('rejects at once for an aborted signal', async () => {
    const signal = AbortSignal.abort()
    await expect(Dkim.verify(await std(), { resolver: resolverFrom({}), signal })).rejects.toBe(
      signal.reason,
    )
  })

  test('uses the hasher option for the body hash', async () => {
    let updates = 0
    const hasher = (): Dkim.Hasher => {
      const chunks: Uint8Array[] = []
      return {
        update(data) {
          updates++
          chunks.push(data.slice())
        },
        async digest() {
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
          let at = 0
          for (const c of chunks) {
            all.set(c, at)
            at += c.length
          }
          return new Uint8Array(await crypto.subtle.digest('SHA-256', all))
        },
      }
    }
    const results = await Dkim.verify(await std(), {
      resolver: resolverFrom({ [KEY]: [rsaRec] }),
      hasher,
    })
    expect(results[0]!.result).toBe('pass')
    expect(updates).toBeGreaterThan(0)
  })
})

describe('the RFC 8463 example message', () => {
  test('passes both its Ed25519 and its RSA signature', async () => {
    const zone = JSON.parse(await fixtureText('rfc8463-dns.json')) as Record<
      string,
      { TXT: string[][] }
    >
    const records = Object.fromEntries(Object.entries(zone).map(([name, { TXT }]) => [name, TXT]))
    const results = await Dkim.verify(await fixture('rfc8463-signed.eml'), {
      resolver: resolverFrom(records),
      now: new Date(1528637909000),
    })
    expect(results.map((r) => [r.selector, r.algorithm, r.result, r.identity])).toEqual([
      ['brisbane', 'ed25519-sha256', 'pass', '@football.example.com'],
      ['test', 'rsa-sha256', 'pass', '@football.example.com'],
    ])
  })
})
