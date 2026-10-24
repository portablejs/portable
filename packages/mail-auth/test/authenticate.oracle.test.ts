import { Buffer } from 'node:buffer'
import * as Arc from '@portable/arc'
import * as MailAuth from '@portable/mail-auth'
import { authenticate as upstreamAuthenticate, dkimSign, sealMessage } from 'mailauth'
import { describe, expect, test } from 'vite-plus/test'
import { buildMessage, key, resinfos, signed, type Zone, zoneResolver } from './utils.js'

const upstreamResolver = (zone: Zone) => {
  const resolver = zoneResolver(zone)
  const byType: Record<string, (name: string) => Promise<unknown>> = {
    TXT: resolver.resolveTxt,
    A: resolver.resolve4,
    AAAA: resolver.resolve6,
    MX: resolver.resolveMx,
    PTR: resolver.resolvePtr,
    CNAME: resolver.resolveCname,
  }
  return async (name: string, type: string) => {
    const lookup = byType[type]
    if (!lookup) throw Object.assign(new Error(type), { code: 'ENOTIMP' })
    return lookup(name)
  }
}

type Case = { message: string; zone: Zone; ip: string; sender: string; helo: string }

type Upstream = {
  headers: string
  dmarc: false | { status: { result: string } }
  dmarcSkipReason?: string
  spf: { status: { result: string } }
  arc: false | { status: { result: string } }
  dkim: { results: { status: { result: string } }[] }
}

async function upstream(c: Case): Promise<Upstream> {
  return (await upstreamAuthenticate(Buffer.from(c.message), {
    resolver: upstreamResolver(c.zone) as never,
    ip: c.ip,
    helo: c.helo,
    sender: c.sender,
    mta: 'mx.receiver.test',
    strict: true,
    disableBimi: true,
  })) as never
}

const ours = (c: Case) =>
  MailAuth.authenticate(c.message, {
    resolver: zoneResolver(c.zone),
    authservId: 'mx.receiver.test',
    ip: c.ip,
    helo: c.helo,
    sender: c.sender,
  })

/**
 * mailauth gives DKIM `neutral` for a problem with the key record, and `Dkim.verify` gives
 * `permerror`, as RFC 8601 section 2.7.1 describes. dkim's PARITY.md lists the cases.
 */
const keyProblem = (result: string): string => (result === 'neutral' ? 'permerror' : result)

/** mailauth adds `policy.dkim-rules`, which RFC 8601 doesn't register, so it is left out. */
const upstreamRows = (headers: string): string[] => {
  const field = /^Authentication-Results: (.*(?:\r\n[ \t].*)*)/m.exec(headers)![1]!
  return resinfos(field).map((row) =>
    row
      .replace(/^dkim=\w+/, (code) => `dkim=${keyProblem(code.slice(5))}`)
      .replace(/ policy\.dkim-rules=\S+/, ''),
  )
}

function prng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x80000000
  }
}

const spfRecords = [
  undefined,
  'v=spf1 ip4:192.0.2.1 -all',
  'v=spf1 -all',
  'v=spf1 ~all',
  'v=spf1 ?all',
  'v=spf1 include:missing.test -all',
  'v=spf1 ip4:300.0.0.1 -all',
  'SERVFAIL',
]
const dmarcRecords = [
  undefined,
  'v=DMARC1; p=reject',
  'v=DMARC1; p=quarantine; adkim=s; aspf=s',
  'v=DMARC1; p=none; sp=reject',
  'v=DMARC1; p=reject; t=y',
  'v=DMARC1; p=bogus',
  'SERVFAIL',
]
const froms = [
  'user@example.com',
  'User <user@mail.example.com>',
  'list: user@example.com;',
  'a@example.com, b@other.test',
  '',
  'TWO',
]

async function makeCase(seed: number): Promise<Case> {
  const random = prng(seed)
  const pick = <value>(items: readonly value[]): value =>
    items[Math.floor(random() * items.length)]!
  const from = pick(froms)
  let message = buildMessage({ from: from || 'x@example.com' })
  if (from === '') message = message.replace(/^From: .*\r\n/m, '')
  if (from === 'TWO')
    message = message.replace(/^From: .*\r\n/m, 'From: a@example.com\r\nFrom: b@example.com\r\n')
  const zone: Zone = { 'test._domainkey.example.com': { TXT: [(await key('rsa')).record] } }
  const signing =
    from === ''
      ? 'none'
      : pick(['none', 'example.com', 'mail.example.com', 'other.test', 'broken', 'sha1'])
  if (signing === 'example.com' || signing === 'other.test' || signing === 'broken')
    message = await signed(message, signing === 'broken' ? 'example.com' : signing)
  if (signing === 'mail.example.com') {
    message = await signed(message, signing)
    zone['test._domainkey.mail.example.com'] = { TXT: [(await key('rsa')).record] }
  }
  if (signing === 'sha1') {
    const { signatures } = await dkimSign(Buffer.from(message), {
      signatureData: [
        {
          signingDomain: 'example.com',
          selector: 'test',
          privateKey: (await key('rsa')).privateKey,
          algorithm: 'rsa-sha1',
        },
      ],
    })
    message = signatures + message
  }
  if (signing === 'broken') message = message.replace('body', 'changed')
  // A changed body fails an rsa-sha1 signature in mailauth and gives policy in Dkim.verify,
  // which checks the algorithm first. Both are failures, so the cases leave the combination out.
  const arc = pick(signing === 'sha1' ? ['none', 'pass'] : ['none', 'none', 'pass', 'fail'])
  if (arc !== 'none') {
    const fields = await Arc.seal(message, {
      domain: 'example.com',
      selector: 'test',
      privateKey: (await key('rsa')).privateKey,
      authResults:
        'mx.sealer.test; spf=pass smtp.mailfrom=example.com; dkim=pass header.i=@example.com',
    }).catch(() => '')
    message = fields + message
    if (arc === 'fail') message = message.replace(/body\r\n$/, 'tampered\r\n')
  }
  for (const [name, records] of [
    ['example.com', spfRecords],
    ['_dmarc.example.com', dmarcRecords],
    ['_dmarc.other.test', dmarcRecords],
  ] as const) {
    const record = pick(records)
    if (record === undefined) continue
    zone[name] = {
      ...zone[name],
      ...(record === 'SERVFAIL' ? { TXT: 'ESERVFAIL' } : { TXT: [record] }),
    }
  }
  const sender = pick(['bounce@example.com', 'user@mail.example.com', ''])
  return {
    message,
    zone,
    ip: pick(['192.0.2.1', '198.51.100.7', '2001:db8::1']),
    sender,
    helo: 'example.com',
  }
}

describe('mailauth strict mode agrees with authenticate', () => {
  test('on the result of each method and on Authentication-Results without comments', async () => {
    for (let seed = 1; seed <= 400; seed++) {
      const c = await makeCase(seed)
      const [theirs, mine] = await Promise.all([upstream(c), ours(c)])
      expect({
        seed,
        spf: mine.spf.result,
        dkim: mine.dkim.map((entry) => entry.result),
        arc: mine.arc.result,
        dmarc: mine.dmarc?.result,
        dmarcSkipReason: mine.dmarcSkipReason,
        rows: resinfos(mine.authResults),
      }).toEqual({
        seed,
        spf: theirs.spf.status.result,
        dkim: theirs.dkim.results
          .map((entry) => keyProblem(entry.status.result))
          .filter((result) => result !== 'none'),
        arc: theirs.arc && theirs.arc.status.result,
        dmarc: theirs.dmarc ? theirs.dmarc.status.result : undefined,
        dmarcSkipReason: theirs.dmarcSkipReason,
        rows: upstreamRows(theirs.headers),
      })
    }
  })
})

describe('mailauth and authenticate interoperate', () => {
  test('mailauth passes the ARC sets authenticate seals, and the other way around', async () => {
    const { privateKey, record } = await key('rsa')
    const zone = { 'test._domainkey.example.com': { TXT: [record] } } satisfies Zone
    let message = buildMessage()
    const results: string[] = []
    for (let hop = 1; hop <= 4; hop++) {
      if (hop % 2 === 1) {
        const result = await MailAuth.authenticate(message, {
          resolver: zoneResolver(zone),
          authservId: `mx${hop}.test`,
          ip: '192.0.2.1',
          sender: 'a@example.com',
          seal: { domain: 'example.com', selector: 'test', privateKey },
        })
        results.push(`ours ${result.arc.result}`)
        message = result.headers + message
      } else {
        const theirs = (await upstreamAuthenticate(Buffer.from(message), {
          resolver: upstreamResolver(zone) as never,
          ip: '192.0.2.1',
          sender: 'a@example.com',
          mta: `mx${hop}.test`,
          strict: true,
          disableBimi: true,
          seal: { signingDomain: 'example.com', selector: 'test', privateKey },
        })) as unknown as Upstream
        results.push(`mailauth ${theirs.arc && theirs.arc.status.result}`)
        message = theirs.headers + message
      }
    }
    const last = await ours({ message, zone, ip: '192.0.2.1', sender: '', helo: 'x.test' })
    results.push(`ours ${last.arc.result} i=${last.arc.instance}`)
    expect(results).toEqual([
      'ours none',
      'mailauth pass',
      'ours pass',
      'mailauth pass',
      'ours pass i=4',
    ])
    const sealed = await sealMessage(Buffer.from(message), {
      signingDomain: 'example.com',
      selector: 'test',
      privateKey,
      authResults: 'mx5.test; arc=pass',
      cv: 'pass',
    })
    expect(sealed.toString()).toMatch(/^ARC-Seal: i=5;/)
  })
})
