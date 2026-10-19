import * as Arc from '@portable/arc'
import * as MailAuth from '@portable/mail-auth'
import { describe, expect, test } from 'vite-plus/test'
import {
  buildMessage,
  decode,
  encode,
  fields,
  key,
  resinfos,
  signed,
  unfold,
  type Zone,
  zoneResolver,
} from './utils.js'

const message = buildMessage({ from: 'user@mail.example.com', to: 'rcpt@example.net' })

const envelope = {
  authservId: 'mx.example.net',
  ip: '198.51.100.1',
  helo: 'mail.example.com',
  sender: 'user@mail.example.com',
}

const authenticate = (
  input: string | Uint8Array | ReadableStream<Uint8Array>,
  zone: Zone,
  options: Partial<Parameters<typeof MailAuth.authenticate>[1]> = {},
) => MailAuth.authenticate(input, { ...envelope, resolver: zoneResolver(zone), ...options })

const rsaRecord = async () => (await key('rsa')).record

describe('DMARC alignment', () => {
  const run = async (
    dmarc: string,
    zone: Zone = { '_dmarc.example.com': { TXT: ['v=DMARC1; p=none'] } },
  ) =>
    authenticate(await signed(message, 'example.com'), {
      'test._domainkey.example.com': { TXT: [await rsaRecord()] },
      '_dmarc.mail.example.com': { TXT: [dmarc] },
      ...zone,
    })

  test('an organizational domain signature aligns under relaxed alignment', async () => {
    const result = await run('v=DMARC1; p=reject')
    expect(result.dkim[0]).toMatchObject({ result: 'pass', domain: 'example.com' })
    expect(result.dmarc).toMatchObject({
      result: 'pass',
      dkim: [{ domain: 'example.com', aligned: true }],
    })
  })

  test('an organizational domain signature does not align when the record has adkim=s', async () => {
    const result = await run('v=DMARC1; p=reject; adkim=s')
    expect(result.dkim[0]!.result).toBe('pass')
    expect(result.dmarc).toMatchObject({
      result: 'fail',
      dkim: [{ domain: 'example.com', aligned: false }],
    })
  })

  test('the tree walk stops at the author domain when the parent publishes no record', async () => {
    const result = await run('v=DMARC1; p=reject', {})
    expect(result.dmarc).toMatchObject({
      result: 'fail',
      policyDomain: 'mail.example.com',
      dkim: [{ aligned: false }],
    })
  })

  test('the tree walk finds an organizational domain the public suffix list would not', async () => {
    const from = buildMessage({ from: 'user@alice.blogspot.com' })
    const result = await authenticate(await signed(from, 'blogspot.com'), {
      'test._domainkey.blogspot.com': { TXT: [await rsaRecord()] },
      '_dmarc.blogspot.com': { TXT: ['v=DMARC1; p=reject'] },
    })
    expect(result.dmarc).toMatchObject({
      result: 'pass',
      policy: 'reject',
      policyDomain: 'blogspot.com',
    })
  })
})

describe('Authentication-Results', () => {
  const zone = async (): Promise<Zone> => ({
    'test._domainkey.mail.example.com': { TXT: [await rsaRecord()] },
    'mail.example.com': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] },
    '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=reject'] },
  })

  test('reports each method with its properties', async () => {
    const result = await authenticate(await signed(message, 'mail.example.com'), await zone())
    const b = result.dkim[0]!.signature.slice(0, 8)
    expect(resinfos(result.authResults)).toEqual([
      `dkim=pass header.d=mail.example.com header.i=@mail.example.com header.s=test header.a=rsa-sha256 header.b=${b.includes('/') ? `"${b}"` : b}`,
      'spf=pass smtp.mailfrom=mail.example.com',
      'arc=none smtp.remote-ip=198.51.100.1',
      'dmarc=pass policy.dmarc=reject header.from=mail.example.com',
    ])
    expect(result.authResults).toMatch(/^mx\.example\.net;\r\n dkim=pass /)
    expect(unfold(result.authResults)).toContain(
      'spf=pass (mx.example.net: domain of user@mail.example.com designates 198.51.100.1 as permitted sender)',
    )
    expect(unfold(result.authResults)).toContain('dmarc=pass (p=REJECT arc=none)')
  })

  test('writes only the Authentication-Results field without a seal, and no Received-SPF', async () => {
    const result = await authenticate(await signed(message, 'mail.example.com'), await zone())
    expect(result.headers).toBe(`Authentication-Results: ${result.authResults}\r\n`)
  })

  test('reports dkim=none for an unsigned message', async () => {
    const result = await authenticate(message, await zone())
    expect(resinfos(result.authResults)[0]).toBe('dkim=none')
    expect(result.dmarc!.result).toBe('pass')
  })

  test('reports each signature on its own, with the reason for a failure', async () => {
    const input = await signed(await signed(message, 'example.com', 'other'), 'mail.example.com')
    const result = await authenticate(input.replace('body', 'changed'), await zone())
    expect(result.dkim).toHaveLength(2)
    const rows = resinfos(result.authResults).filter((row) => row.startsWith('dkim='))
    expect(rows.map((row) => row.split(' ')[1])).toEqual([
      'header.d=mail.example.com',
      'header.d=example.com',
    ])
    expect(result.authResults).toContain('dkim=fail (body hash did not verify)')
  })

  test('reports the HELO identity of a bounce as smtp.helo', async () => {
    const result = await authenticate(
      message,
      {
        'mail.example.com': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] },
      },
      { sender: '' },
    )
    expect(result.spf).toMatchObject({ result: 'pass', identity: 'helo' })
    expect(resinfos(result.authResults)[1]).toBe('spf=pass smtp.helo=mail.example.com')
  })

  test('quotes an IPv6 smtp.remote-ip', async () => {
    const input = await MailAuth.authenticate(message, {
      ...envelope,
      ip: '2001:db8::1',
      resolver: zoneResolver({}),
    })
    expect(resinfos(input.authResults)[2]).toBe('arc=none smtp.remote-ip="2001:db8::1"')
  })

  test('keeps every line within 998 octets and every comment balanced', async () => {
    for (const local of [
      'a'.repeat(1100),
      'ü'.repeat(600),
      '('.repeat(700),
      `"${'word '.repeat(300)}"`,
    ]) {
      const result = await authenticate(
        message,
        {},
        {
          helo: `${'h'.repeat(1000)}.example`,
          sender: `${local}@mail.example.com`,
        },
      )
      for (const line of result.headers.split('\r\n'))
        expect(encode(line).length, `${line.slice(0, 60)}`).toBeLessThanOrEqual(998)
      expect(resinfos(result.authResults).map((row) => row.split(' ')[0])).toEqual([
        'dkim=none',
        'spf=none',
        'arc=none',
        'dmarc=none',
      ])
    }
  })

  test('writes reasons in comments, with parentheses escaped', async () => {
    const result = await authenticate(message, {
      'mail.example.com': { TXT: ['v=spf1 include:(x) -all'] },
    })
    expect(result.spf.result).toBe('permerror')
    const spf = result.authResults.split(';').find((row) => row.includes('spf='))!
    expect(spf.replace(/\\[()\\]/g, '')).toMatch(/^[^()]*\([^()]*\)[^()]*$/)
  })
})

describe('authservId', () => {
  test('is written as given when it is a token', async () => {
    const result = await authenticate(message, {}, { authservId: 'mx.example.com' })
    expect(result.headers).toMatch(/^Authentication-Results: mx\.example\.com;\r\n/)
  })

  test('throws a RangeError when it is not a token', async () => {
    for (const authservId of [
      'mx.example; dkim=pass header.d=bank.example',
      '',
      'mx example',
      'mx.exämple',
    ])
      await expect(authenticate(message, {}, { authservId })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('Author domain', () => {
  const run = (from: string) =>
    authenticate(
      `${from}Subject: x\r\n\r\nhi\r\n`,
      {
        '_dmarc.bank.example': { TXT: ['v=DMARC1; p=reject'] },
      },
      { helo: 'h.attacker.example', sender: 'x@attacker.example', ip: '192.0.2.1' },
    )

  test('is the domain of the mailbox in a group (RFC 6854)', async () => {
    const result = await run('From: Bank: CEO <ceo@bank.example>;\r\n')
    expect(result.dmarc).toMatchObject({ result: 'fail', policy: 'reject', domain: 'bank.example' })
    expect(result.authResults).toContain('dmarc=fail')
  })

  test.for([
    ['From: a@bank.example, b@other.example\r\n', 'multiple-author-domains'],
    ['', 'no-author-domain'],
    ['From: undisclosed-recipients:;\r\n', 'no-author-domain'],
    ['From: "Bank CEO" <ceo@bank.example;>, a@attacker.example\r\n', 'invalid-author-domain'],
    [
      'From: "Bank Security" <security@bank.example>\r\nFrom: news@bank.example\r\n',
      'multiple-from-fields',
    ],
    ['\r\nFrom: ceo@bank.example\r\n', 'no-author-domain'],
    ['\nFrom: ceo@bank.example\n', 'no-author-domain'],
  ] as const)('DMARC is skipped for %j: %s', async ([from, reason]) => {
    const result = await run(from)
    expect(result.dmarc).toBeUndefined()
    expect(result.dmarcSkipReason).toBe(reason)
    expect(result.authResults).not.toContain('dmarc=')
  })

  test('several mailboxes of one domain in one From field are checked', async () => {
    const result = await run('From: a@bank.example, B@Bank.Example\r\n')
    expect(result.dmarc!.result).toBe('fail')
    expect(result.dmarcSkipReason).toBeUndefined()
  })

  test('a From field folded over lines with bare LF line ends is read', async () => {
    const result = await run('From: Bank\n <ceo@bank.example>\n')
    expect(result.dmarc).toMatchObject({ domain: 'bank.example' })
  })
})

describe('ARC', () => {
  const seal = async (): Promise<MailAuth.authenticate.Options['seal']> => ({
    domain: 'example.com',
    selector: 'test',
    privateKey: (await key('rsa')).privateKey,
  })
  const arcZone = async (): Promise<Zone> => ({
    'test._domainkey.example.com': { TXT: [await rsaRecord()] },
    'ed._domainkey.example.com': { TXT: [(await key('ed25519')).record] },
  })

  test('seals a new message with cv=none and these results as the ARC-Authentication-Results', async () => {
    const result = await authenticate(message, await arcZone(), { seal: await seal() })
    const [as, ams, aar, ar] = fields(result.headers)
    expect(as).toMatch(/^ARC-Seal: i=1; a=rsa-sha256; t=\d+; cv=none; d=example\.com; s=test;/)
    expect(ams).toMatch(/^ARC-Message-Signature: i=1;/)
    expect(aar).toBe(
      `ARC-Authentication-Results: i=1; ${result.authResults.replace(/\r\n(?=[ \t])/g, '')}`,
    )
    expect(ar).toBe(`Authentication-Results: ${result.authResults.replace(/\r\n(?=[ \t])/g, '')}`)
    const next = await authenticate(result.headers + message, await arcZone(), {
      authservId: 'mx.next.example',
    })
    expect(next.arc).toMatchObject({ result: 'pass', instance: 1 })
  })

  test('seals with an Ed25519 key', async () => {
    const result = await authenticate(message, await arcZone(), {
      seal: { ...(await seal())!, selector: 'ed', privateKey: (await key('ed25519')).privateKey },
    })
    expect(result.headers).toMatch(/^ARC-Seal: i=1; a=ed25519-sha256;/)
    const next = await authenticate(result.headers + message, await arcZone())
    expect(next.arc.result).toBe('pass')
  })

  test('reports what the newest sealer recorded in the arc=pass comment', async () => {
    const zone: Zone = {
      ...(await arcZone()),
      'test._domainkey.mail.example.com': { TXT: [await rsaRecord()] },
      'mail.example.com': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] },
      '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=reject'] },
    }
    const input = await signed(message, 'mail.example.com')
    const first = await authenticate(input, zone, { seal: await seal() })
    const second = await authenticate(first.headers + input, zone, {
      ip: '2001:db8::1',
      authservId: 'mx.next.example',
    })
    expect(resinfos(second.authResults)[2]).toBe('arc=pass smtp.remote-ip="2001:db8::1"')
    expect(unfold(second.authResults)).toContain(
      'arc=pass (i=1 spf=pass dkim=pass dkdomain=mail.example.com dmarc=pass fromdomain=mail.example.com)',
    )
    expect(unfold(second.authResults)).toContain('dmarc=pass (p=REJECT arc=pass)')
  })

  test.for([
    ['dkim=pass header.i.x=1', 'i=1 dkim=pass'],
    ['dmarc=pass header.from.toString.z=1', 'i=1 dmarc=pass'],
    [
      'spf=pass value.x=1; dkim=pass value.y=1; dmarc=pass value.z=1',
      'i=1 spf=pass dkim=pass dmarc=pass',
    ],
    ['dkim=pass; value=evil', 'i=1 dkim=pass'],
    ['dkim=pass header.i=@ok.example', 'i=1 dkim=pass dkdomain=ok.example'],
    [
      'dkim=pass header.i = "@ok.example" (comment; dkim=fail)',
      'i=1 dkim=pass dkdomain=ok.example',
    ],
    ['dkim=pass header.d=evil.example/x', 'i=1 dkim=pass'],
    ['dkim=pa(ss) header.i=@x.example; spf=pass', 'i=1 spf=pass dkim=pa dkdomain=x.example'],
    [
      'dmarc=pass header.from=(x)bank.example; spf=pass (a) smtp.mailfrom=x',
      'i=1 spf=pass dmarc=pass fromdomain=bank.example',
    ],
    ['spf=pass) x; dkim=pass', 'i=1 dkim=pass'],
  ] as const)(
    'copies only keywords and host names from a crafted AAR: %s',
    async ([crafted, comment]) => {
      const fields = await Arc.seal(message, {
        domain: 'example.com',
        selector: 'test',
        privateKey: (await key('rsa')).privateKey,
        authResults: `mx.evil.example; ${crafted}`,
      })
      const result = await authenticate(fields + message, await arcZone())
      expect(result.arc.result).toBe('pass')
      const row = unfold(result.authResults)
        .split('; ')
        .find((part) => part.startsWith('arc='))!
      expect(row).toBe(`arc=pass (${comment}) smtp.remote-ip=198.51.100.1`)
    },
  )

  test('reads a large AAR without running out of stack', async () => {
    const fields = await Arc.seal(message, {
      domain: 'example.com',
      selector: 'test',
      privateKey: (await key('rsa')).privateKey,
      authResults: `mx.evil.example; ${'('.repeat(50_000)}${'spf=pass; '.repeat(5000)}`,
    })
    const result = await authenticate(fields + message, await arcZone())
    expect(result.arc.result).toBe('pass')
  })

  test('seals a broken chain with cv=fail and its own results', async () => {
    const head = 'From: a@example.com\r\nTo: b@example.net\r\nSubject: hi\r\n\r\n'
    const first = await Arc.seal(`${head}original\r\n`, {
      domain: 'example.com',
      selector: 'test',
      privateKey: (await key('rsa')).privateKey,
      authResults: 'mx1.sealer.example; arc=none',
    })
    const broken = `${first}${head}tampered\r\n`
    const result = await authenticate(broken, await arcZone(), { seal: await seal() })
    expect(result.arc).toMatchObject({ result: 'fail', reason: 'i=1 ams body hash did not verify' })
    expect(result.authResults).toContain('arc=fail (i=1 ams body hash did not verify)')
    expect(result.headers).toMatch(/^ARC-Seal: i=2;[^]*?cv=fail/)
    expect(result.headers).toContain('ARC-Authentication-Results: i=2; mx.example.net;')
    const next = await authenticate(result.headers + broken, await arcZone())
    expect(next.arc.result).toBe('fail')
  })

  test('does not seal a chain whose newest seal says cv=fail, and says why', async () => {
    const result = await authenticate(message, await arcZone(), { seal: await seal() })
    const failed = result.headers.replace('cv=none', 'cv=fail')
    const again = await authenticate(failed + message, await arcZone(), { seal: await seal() })
    expect(again.arc.result).toBe('fail')
    expect(again.headers).toBe(`Authentication-Results: ${again.authResults}\r\n`)
    expect(again.sealSkipReason).toMatch(/cv=fail/)
  })

  test('does not add a 51st ARC set (RFC 8617 section 4.2.1)', { timeout: 60_000 }, async () => {
    const zone = await arcZone()
    const options = { seal: await seal() }
    let input = message
    for (let i = 1; i <= 50; i++) {
      const result = await authenticate(input, zone, options)
      expect(result.sealSkipReason, `i=${i}`).toBeUndefined()
      expect(result.headers.startsWith(`ARC-Seal: i=${i};`), `i=${i}`).toBe(true)
      input = result.headers + input
    }
    const result = await authenticate(input, zone, options)
    expect(result.arc).toMatchObject({ result: 'pass', instance: 50 })
    expect(result.headers).not.toContain('ARC-Seal:')
    expect(result.sealSkipReason).toBe('The message has 50 ARC sets, the most RFC 8617 allows.')
  })
})

describe('input', () => {
  test('reads a stream, bytes or a string with the same result', async () => {
    const zone = { 'test._domainkey.example.com': { TXT: [await rsaRecord()] } }
    const input = await signed(buildMessage(), 'example.com')
    const bytes = encode(input)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.subarray(i, i + 7))
        controller.close()
      },
    })
    const results = await Promise.all(
      [input, bytes, stream].map((message) => authenticate(message, zone)),
    )
    expect(results[0]!.dkim[0]!.result).toBe('pass')
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
  })

  test('reads bare LF line ends as CRLF', async () => {
    const zone = { 'test._domainkey.example.com': { TXT: [await rsaRecord()] } }
    const input = (await signed(buildMessage(), 'example.com')).replaceAll('\r\n', '\n')
    const result = await authenticate(input, zone)
    expect(result.dkim[0]!.result).toBe('pass')
    expect(decode(encode(result.headers))).not.toMatch(/(?<!\r)\n/)
  })

  test('rejects with signal.reason, before and during the lookups', async () => {
    const reason = new Error('stop')
    await expect(authenticate(message, {}, { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
    const controller = new AbortController()
    const resolver = zoneResolver({})
    const slow: MailAuth.Resolver = {
      ...resolver,
      resolveTxt: (name) =>
        new Promise((_, reject) => {
          controller.abort(reason)
          setTimeout(() => reject(new Error(`late ${name}`)), 50)
        }),
    }
    await expect(
      MailAuth.authenticate(message, { ...envelope, resolver: slow, signal: controller.signal }),
    ).rejects.toBe(reason)
  })

  test('throws a RangeError for an ip that is not an IP address', async () => {
    await expect(authenticate(message, {}, { ip: 'mail.example.com' })).rejects.toBeInstanceOf(
      RangeError,
    )
  })
})
