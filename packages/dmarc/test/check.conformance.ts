import * as Dmarc from '@portable/dmarc'
import { describe, expect, test } from 'vite-plus/test'
import {
  check,
  dmarcQueries,
  dnsError,
  pass,
  type Query,
  withRecord,
  type Zone,
  zoneResolver,
} from './utils.js'

const reject = withRecord('v=DMARC1; p=reject')

describe('Dmarc.check', () => {
  test('returns the result, policy, record and alignment of each identifier', async () => {
    const result = await check(withRecord('v=DMARC1; p=quarantine; rua=mailto:d@example.com'), {
      from: 'example.com',
      spf: { result: 'pass', domain: 'bounce.other.test' },
      dkim: [pass('example.com'), { result: 'fail', domain: 'example.com' }],
    })
    expect(result).toEqual({
      result: 'pass',
      domain: 'example.com',
      policy: 'quarantine',
      disposition: 'none',
      policyDomain: 'example.com',
      record: {
        text: 'v=DMARC1; p=quarantine; rua=mailto:d@example.com',
        p: 'quarantine',
        adkim: 'r',
        aspf: 'r',
        t: 'n',
        psd: 'u',
        rua: ['mailto:d@example.com'],
        ruf: [],
        fo: '0',
      },
      spf: { domain: 'bounce.other.test', aligned: false },
      dkim: [
        { domain: 'example.com', aligned: true },
        { domain: 'example.com', aligned: false },
      ],
    })
  })

  test('sets the disposition to the policy only for fail', async () => {
    const failed = await check(withRecord('v=DMARC1; p=reject'), { from: 'example.com' })
    expect(failed).toMatchObject({ result: 'fail', policy: 'reject', disposition: 'reject' })
    const passed = await check(reject, { from: 'example.com', spf: pass('example.com') })
    expect(passed).toMatchObject({ result: 'pass', policy: 'reject', disposition: 'none' })
  })

  test('counts only passing SPF results and DKIM signatures', async () => {
    for (const result of ['fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror']) {
      expect(
        await check(reject, {
          from: 'example.com',
          spf: { result: result as 'fail', domain: 'example.com' },
          dkim: [{ result, domain: 'example.com' }],
        }),
      ).toMatchObject({ result: 'fail', disposition: 'reject' })
    }
  })

  test('reports why the result is none, temperror or permerror', async () => {
    expect(await check({}, { from: 'example.com' })).toMatchObject({
      result: 'none',
      disposition: 'none',
      reason: expect.any(String),
    })
    expect(
      await check({ '_dmarc.example.com': { TXT: 'ETIMEOUT' } }, { from: 'example.com' }),
    ).toMatchObject({
      result: 'temperror',
      reason: expect.stringContaining('ETIMEOUT'),
      cause: expect.objectContaining({ code: 'ETIMEOUT' }),
    })
    expect(await check({}, { from: 'bad domain.test' })).toMatchObject({
      result: 'permerror',
      reason: expect.any(String),
    })
  })

  test('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop')
    for (const from of ['example.com', 'not a domain']) {
      await expect(check(reject, { from }, { signal: AbortSignal.abort(reason) })).rejects.toBe(
        reason,
      )
    }
  })

  test('rejects with the reason when the signal aborts during a lookup', async () => {
    const controller = new AbortController()
    const reason = new Error('timeout')
    const timer = setTimeout(() => controller.abort(reason), 20)
    const never = () => new Promise<never>(() => {})
    const checked = Dmarc.check(
      { from: 'sub.example.com', dkim: [pass('example.com')] },
      {
        resolver: { resolveTxt: never, resolve4: never, resolveCname: never },
        signal: controller.signal,
      },
    )
    await expect(checked).rejects.toBe(reason)
    clearTimeout(timer)
  })

  test('rejects when the signal aborts during the tree walk of an identifier', async () => {
    const controller = new AbortController()
    const reason = new Error('timeout')
    const resolver = zoneResolver(reject)
    const checked = Dmarc.check(
      { from: 'example.com', dkim: [pass('mail.example.com')] },
      {
        resolver: {
          ...resolver,
          resolveTxt: (name) => {
            if (name === '_dmarc.mail.example.com') {
              controller.abort(reason)
              return new Promise<never>(() => {})
            }
            return resolver.resolveTxt(name)
          },
        },
        signal: controller.signal,
      },
    )
    await expect(checked).rejects.toBe(reason)
  })
})

describe('dmarc-verify-test.js', () => {
  describe('Basic DMARC lookup', () => {
    test('pass when DKIM aligns', async () => {
      expect(
        await check(reject, { from: 'example.com', dkim: [pass('example.com')] }),
      ).toMatchObject({ result: 'pass', policy: 'reject' })
    })

    test('pass when SPF aligns', async () => {
      const zone = withRecord('v=DMARC1; p=quarantine')
      expect(await check(zone, { from: 'example.com', spf: pass('example.com') })).toMatchObject({
        result: 'pass',
        policy: 'quarantine',
      })
    })

    test('fail when neither aligns', async () => {
      const result = await check(reject, {
        from: 'example.com',
        spf: pass('anotherdomain.com'),
        dkim: [pass('otherdomain.com')],
      })
      expect(result.result).toBe('fail')
    })

    test('none without a record', async () => {
      expect((await check({}, { from: 'example.com' })).result).toBe('none')
    })

    test('temperror on a DNS failure', async () => {
      const zone = { '_dmarc.example.com': { TXT: 'ETIMEOUT' } } satisfies Zone
      const result = await check(zone, { from: 'example.com' })
      expect(result.result).toBe('temperror')
      expect(result.reason).toContain('ETIMEOUT')
    })
  })

  describe('DMARC record parsing', () => {
    test('parses the common tags and leaves out pct', async () => {
      const zone = withRecord('v=DMARC1; p=quarantine; sp=reject; pct=50; adkim=s; aspf=r')
      const { record } = await check(zone, { from: 'example.com' })
      expect(record).toMatchObject({ p: 'quarantine', sp: 'reject', adkim: 's', aspf: 'r' })
      expect(record).not.toHaveProperty('pct')
    })

    test('a minimal record fails a message with no identifiers', async () => {
      const result = await check(withRecord('v=DMARC1; p=none'), { from: 'example.com' })
      expect(result).toMatchObject({ result: 'fail', policy: 'none', disposition: 'none' })
    })

    test('joins the strings of a split TXT record', async () => {
      const zone = {
        '_dmarc.example.com': { TXT: [['v=DMARC1; p=rej', 'ect; pct=100']] },
      } satisfies Zone
      const result = await check(zone, { from: 'example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', policy: 'reject' })
      expect(result.record?.text).toBe('v=DMARC1; p=reject; pct=100')
    })
  })

  describe('Policy evaluation', () => {
    test('p applies to the domain itself', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=quarantine')
      expect((await check(zone, { from: 'example.com' })).policy).toBe('reject')
    })

    test('sp applies to a subdomain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=quarantine')
      expect(await check(zone, { from: 'sub.example.com' })).toMatchObject({
        policy: 'quarantine',
        policyDomain: 'example.com',
      })
    })

    test('p applies to a subdomain without sp', async () => {
      expect((await check(reject, { from: 'sub.example.com' })).policy).toBe('reject')
    })
  })

  describe('Alignment modes', () => {
    test('DKIM alignment is relaxed by default', async () => {
      const result = await check(reject, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', record: { adkim: 'r' } })
    })

    test('adkim=s fails a signature of the organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s')
      const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'fail', record: { adkim: 's' } })
    })

    test('adkim=s passes an identical signing domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s')
      expect((await check(zone, { from: 'example.com', dkim: [pass('example.com')] })).result).toBe(
        'pass',
      )
    })

    test('adkim=s passes an identical subdomain with its own record', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s', 'mail.example.com')
      const result = await check(zone, {
        from: 'mail.example.com',
        dkim: [pass('mail.example.com')],
      })
      expect(result.result).toBe('pass')
    })

    test('adkim=s fails another organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s')
      expect(
        (await check(zone, { from: 'example.com', dkim: [pass('otherdomain.net')] })).result,
      ).toBe('fail')
    })

    test('SPF alignment is relaxed by default', async () => {
      const result = await check(reject, { from: 'mail.example.com', spf: pass('example.com') })
      expect(result).toMatchObject({ result: 'pass', record: { aspf: 'r' } })
    })

    test('aspf=s fails the organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; aspf=s')
      const result = await check(zone, { from: 'mail.example.com', spf: pass('example.com') })
      expect(result).toMatchObject({ result: 'fail', record: { aspf: 's' } })
    })

    test('aspf=s passes an identical domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; aspf=s')
      expect((await check(zone, { from: 'example.com', spf: pass('example.com') })).result).toBe(
        'pass',
      )
    })

    test('relaxed SPF passes while strict DKIM fails', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s; aspf=r')
      const result = await check(zone, {
        from: 'mail.example.com',
        spf: pass('example.com'),
        dkim: [pass('example.com')],
      })
      expect(result).toMatchObject({
        result: 'pass',
        spf: { domain: 'example.com', aligned: true },
        dkim: [{ domain: 'example.com', aligned: false }],
      })
    })
  })

  describe('Organizational domain fallback', () => {
    test('a subdomain without a record uses the organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=quarantine')
      const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', policyDomain: 'example.com' })
    })

    test('a subdomain with its own record uses it', async () => {
      const zone = {
        ...withRecord('v=DMARC1; p=reject', 'mail.example.com'),
        ...withRecord('v=DMARC1; p=none'),
      }
      expect(await check(zone, { from: 'mail.example.com' })).toMatchObject({
        policy: 'reject',
        policyDomain: 'mail.example.com',
      })
    })
  })

  describe('Edge cases', () => {
    test('several From addresses in one domain: the caller passes the domain once', async () => {
      const result = await check(reject, { from: 'EXAMPLE.com.' })
      expect(result).toMatchObject({ result: 'fail', policy: 'reject', domain: 'example.com' })
    })

    test('IDN domains in A-label form', async () => {
      const zone = withRecord('v=DMARC1; p=reject', 'xn--e1afmkfd.xn--p1ai')
      const result = await check(zone, {
        from: 'xn--e1afmkfd.xn--p1ai',
        dkim: [pass('xn--e1afmkfd.xn--p1ai')],
      })
      expect(result.result).toBe('pass')
    })

    test('the raw record is in record.text', async () => {
      const zone = withRecord('v=DMARC1; p=reject; pct=100')
      expect((await check(zone, { from: 'example.com' })).record?.text).toBe(
        'v=DMARC1; p=reject; pct=100',
      )
    })

    test('record.text drops trailing whitespace', async () => {
      const zone = withRecord('v=DMARC1; p=none; ')
      expect((await check(zone, { from: 'example.com' })).record?.text).toBe('v=DMARC1; p=none;')
    })
  })

  describe('Reported identifiers', () => {
    test('the From domain is reported, and the policy domain separately', async () => {
      const result = await check(reject, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ domain: 'mail.example.com', policyDomain: 'example.com' })
    })

    test('the policy domain is the From domain when it has its own record', async () => {
      const zone = withRecord('v=DMARC1; p=reject', 'mail.example.com')
      const result = await check(zone, {
        from: 'mail.example.com',
        dkim: [pass('mail.example.com')],
      })
      expect(result).toMatchObject({ domain: 'mail.example.com', policyDomain: 'mail.example.com' })
    })

    test('each signature is reported, so a caller can tell an l= signature apart', async () => {
      const zone = withRecord('v=DMARC1; p=reject; adkim=s')
      const result = await check(zone, {
        from: 'mail.example.com',
        spf: pass('example.com'),
        dkim: [pass('example.com'), pass('mail.example.com')],
      })
      expect(result.result).toBe('pass')
      expect(result.dkim).toEqual([
        { domain: 'example.com', aligned: false },
        { domain: 'mail.example.com', aligned: true },
      ])
    })
  })
})

describe('dmarc-fixes-test.js', () => {
  test('F4: an identifier with no common parent fails when the author walk fails', async () => {
    const zone = { ...reject, '_dmarc.com': { TXT: 'ESERVFAIL' } } satisfies Zone
    const result = await check(zone, { from: 'example.com', spf: pass('other.net') })
    expect(result.result).toBe('fail')
    expect(result.reason).toBeUndefined()
  })

  test('F4: an identifier that could align gives temperror when the author walk fails', async () => {
    const zone = { ...reject, '_dmarc.com': { TXT: 'ESERVFAIL' } } satisfies Zone
    for (const domain of ['sub.example.com', 'other.com']) {
      const result = await check(zone, { from: 'example.com', spf: pass(domain) })
      expect(result).toMatchObject({ result: 'temperror', disposition: 'none' })
      expect(result.reason).toContain('_dmarc.com')
    }
  })

  test('keeps every failed lookup behind a temperror in an AggregateError', async () => {
    const zone = {
      ...reject,
      '_dmarc.sub.example.com': { TXT: 'ESERVFAIL' },
      '_dmarc.other.example.com': { TXT: 'ETIMEOUT' },
    } satisfies Zone
    const result = await check(zone, {
      from: 'example.com',
      dkim: [pass('sub.example.com'), pass('other.example.com')],
    })
    expect(result.result).toBe('temperror')
    expect(result.cause).toBeInstanceOf(AggregateError)
    expect((result.cause as AggregateError).errors).toMatchObject([
      { code: 'ESERVFAIL' },
      { code: 'ETIMEOUT' },
    ])
    expect(result.reason).toContain('ESERVFAIL')
    expect(result.reason).toContain('ETIMEOUT')
  })

  test('F5: an identifier past the limit of 10 tree walks gives temperror, not fail', async () => {
    const zone: Zone = { ...reject }
    const dkim = []
    for (let i = 0; i < 10; i++) {
      zone[`_dmarc.s${i}.example.com`] = { TXT: ['v=DMARC1; p=none; psd=n'] }
      dkim.push(pass(`s${i}.example.com`))
    }
    dkim.push(pass('good.example.com'))
    const result = await check(zone, { from: 'example.com', dkim })
    expect(result).toMatchObject({ result: 'temperror', disposition: 'none' })
    expect(result.reason).toContain('tree walks')
  })

  test('F5: an identifier within the limit still passes', async () => {
    const zone: Zone = { ...reject }
    const dkim = [pass('good.example.com')]
    for (let i = 0; i < 12; i++) {
      zone[`_dmarc.s${i}.example.com`] = { TXT: ['v=DMARC1; p=none; psd=n'] }
      dkim.push(pass(`s${i}.example.com`))
    }
    expect((await check(zone, { from: 'example.com', dkim })).result).toBe('pass')
  })

  test('F6: t=y lowers the policy, and the policy domain is reported', async () => {
    const zone = withRecord('v=DMARC1; p=reject; sp=quarantine; t=y')
    expect(await check(zone, { from: 'sub.example.com' })).toMatchObject({
      result: 'fail',
      policy: 'none',
      disposition: 'none',
      policyDomain: 'example.com',
    })
  })

  test('F6: no policy and no policy domain without a record', async () => {
    const result = await check(reject, { from: 'example.net' })
    expect(result.policy).toBeUndefined()
    expect(result.policyDomain).toBeUndefined()
  })

  test('F7: a record with a duplicate tag is invalid', async () => {
    expect(
      (await check(withRecord('v=DMARC1; p=none; p=reject'), { from: 'example.com' })).result,
    ).toBe('none')
  })

  test('F7: the tree walk continues past a record with a duplicate tag', async () => {
    const zone = {
      ...withRecord('v=DMARC1; p=none; p=none', 'sub.example.com'),
      ...reject,
    }
    expect(await check(zone, { from: 'sub.example.com' })).toMatchObject({
      result: 'fail',
      policy: 'reject',
      policyDomain: 'example.com',
    })
  })

  test('F7: an upper case tag name is an unknown tag', async () => {
    const upper = withRecord('V=DMARC1; P=reject; rua=mailto:dmarc@example.com')
    expect(await check(upper, { from: 'example.com' })).toMatchObject({
      result: 'fail',
      policy: 'none',
    })
    const mixed = withRecord('v=DMARC1; p=none; P=reject')
    expect((await check(mixed, { from: 'example.com' })).policy).toBe('none')
  })

  test('F7: unknown tags and fragments are ignored', async () => {
    const zone = withRecord('V=DMARC1; p=reject; Foo=bar; x')
    expect((await check(zone, { from: 'example.com' })).policy).toBe('reject')
  })

  test('I3: no query for an empty domain', async () => {
    for (const from of ['', '.', ' ']) {
      const log: Query[] = []
      expect((await check({}, { from }, { log })).result).toBe('permerror')
      expect(log).toEqual([])
    }
  })
})

describe('get-dmarc-record-test.js', () => {
  describe('DNS resolution', () => {
    test('reads the record at _dmarc.<domain>', async () => {
      const log: Query[] = []
      const result = await check(reject, { from: 'example.com' }, { log })
      expect(result.record?.p).toBe('reject')
      expect(log[0]).toBe('TXT _dmarc.example.com')
    })

    test('no record for ENOTFOUND, ENODATA, EBADNAME or an empty answer', async () => {
      for (const TXT of ['ENOTFOUND', 'ENODATA', 'EBADNAME', []]) {
        const zone = { '_dmarc.example.com': { TXT }, '_dmarc.com': { TXT } } satisfies Zone
        expect((await check(zone, { from: 'example.com' })).result).toBe('none')
      }
    })

    test('temperror for a DNS server error', async () => {
      const zone = { '_dmarc.example.com': { TXT: 'ETIMEOUT' } } satisfies Zone
      expect((await check(zone, { from: 'example.com' })).result).toBe('temperror')
    })
  })

  describe('Record parsing', () => {
    test('parses every tag', async () => {
      const zone = withRecord(
        'v=DMARC1; p=quarantine; sp=reject; np=none; pct=50; adkim=s; aspf=r; fo=1; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; ri=3600; t=y; psd=n',
      )
      expect((await check(zone, { from: 'example.com' })).record).toMatchObject({
        p: 'quarantine',
        sp: 'reject',
        np: 'none',
        adkim: 's',
        aspf: 'r',
        fo: '1',
        rua: ['mailto:dmarc@example.com'],
        ruf: ['mailto:forensic@example.com'],
        t: 'y',
        psd: 'n',
      })
    })

    test('allows whitespace around "=" and ";"', async () => {
      const zone = withRecord('v=DMARC1 ;  p = reject  ; pct = 100 ')
      const { record } = await check(zone, { from: 'example.com' })
      expect(record?.p).toBe('reject')
      expect(record?.text).toBe('v=DMARC1 ;  p = reject  ; pct = 100')
    })

    test('ignores a fragment without "=" or without a name', async () => {
      for (const text of [
        'v=DMARC1; p=reject; tagonly',
        'v=DMARC1; p=reject; =none',
        'v=DMARC1; p=reject; p',
      ]) {
        expect((await check(withRecord(text), { from: 'example.com' })).policy).toBe('reject')
      }
      const zone = withRecord('v=DMARC1; p=reject; adkim=s; adkim')
      const result = await check(zone, { from: 'example.com', dkim: [pass('mail.example.com')] })
      expect(result).toMatchObject({ result: 'fail', record: { adkim: 's' } })
    })

    test('accepts an upper case version tag name, but not lower case DMARC1', async () => {
      expect((await check(withRecord('V=DMARC1; p=reject'), { from: 'example.com' })).policy).toBe(
        'reject',
      )
      expect((await check(withRecord('v=dmarc1; p=reject'), { from: 'example.com' })).result).toBe(
        'none',
      )
    })

    test('ignores a record with whitespace before v=DMARC1', async () => {
      for (const text of [' v=DMARC1; p=reject', '\tv=DMARC1; p=reject']) {
        expect((await check(withRecord(text), { from: 'example.com' })).result).toBe('none')
      }
    })

    test('trims trailing whitespace from the record', async () => {
      const result = await check(withRecord('v=DMARC1; p=reject '), { from: 'example.com' })
      expect(result).toMatchObject({ policy: 'reject', record: { text: 'v=DMARC1; p=reject' } })
    })
  })

  describe('Org domain fallback', () => {
    test('a subdomain falls back to its organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=quarantine')
      expect(await check(zone, { from: 'mail.example.com' })).toMatchObject({
        policy: 'quarantine',
        policyDomain: 'example.com',
      })
    })

    test('a single label is queried once, and an address literal not at all', async () => {
      const log: Query[] = []
      for (const from of ['localhost', '192.0.2.1', '[192.0.2.1]', '[IPv6:2001:db8::1]']) {
        expect((await check({}, { from }, { log })).result).toBe('none')
      }
      expect(log).toEqual(['TXT _dmarc.localhost'])
    })
  })

  describe('Record validation', () => {
    test('ignores records that are not DMARC records', async () => {
      const zone = withRecord('v=spf1 include:example.com -all')
      expect((await check(zone, { from: 'example.com' })).result).toBe('none')
    })

    test('discards several DMARC records', async () => {
      const zone = {
        '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject', 'v=DMARC1; p=none'] },
      } satisfies Zone
      expect((await check(zone, { from: 'example.com' })).result).toBe('none')
    })

    test('picks the DMARC record among other TXT records', async () => {
      const zone = {
        '_dmarc.example.com': { TXT: ['some-other-txt-record', 'v=DMARC1; p=reject', 'another'] },
      } satisfies Zone
      expect((await check(zone, { from: 'example.com' })).policy).toBe('reject')
    })
  })

  describe('Domain existence test', () => {
    const np = withRecord('v=DMARC1; p=reject; sp=none; np=quarantine')

    test('a dangling CNAME exists', async () => {
      const log: Query[] = []
      const zone = { ...np, 'shop.example.com': { CNAME: 'gone.example.net' } }
      expect((await check(zone, { from: 'shop.example.com' }, { log })).policy).toBe('none')
      expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([
        'A shop.example.com',
        'CNAME shop.example.com',
      ])
    })

    test('a name without an A record or a CNAME does not exist', async () => {
      const log: Query[] = []
      expect((await check(np, { from: 'missing.example.com' }, { log })).policy).toBe('quarantine')
      expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([
        'A missing.example.com',
        'CNAME missing.example.com',
      ])
    })

    test('a failed CNAME query gives temperror for a failing message', async () => {
      const resolver = {
        ...zoneResolver(np),
        resolveCname: () => Promise.reject(dnsError('ESERVFAIL', 'sub.example.com')),
      }
      const result = await Dmarc.check(
        { from: 'sub.example.com', dkim: [pass('other.example')] },
        { resolver },
      )
      expect(result).toMatchObject({ result: 'temperror', disposition: 'none' })
    })
  })
})

describe('rfc9989-compliance-test.js', () => {
  describe('Currently compliant', () => {
    test('discards a set of several records at the From domain and keeps walking', async () => {
      const zone = {
        '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=reject', 'v=DMARC1; p=quarantine'] },
        ...withRecord('v=DMARC1; p=none; sp=quarantine'),
      } satisfies Zone
      expect(await check(zone, { from: 'mail.example.com' })).toMatchObject({
        result: 'fail',
        policyDomain: 'example.com',
        policy: 'quarantine',
      })
    })

    test('continues past TXT records that are not DMARC records', async () => {
      const zone = {
        '_dmarc.mail.example.com': { TXT: ['some other txt record', 'and another one'] },
        ...withRecord('v=DMARC1; p=quarantine'),
      } satisfies Zone
      const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', policy: 'quarantine' })
    })

    test('pct does not change the result', async () => {
      const zone = withRecord('v=DMARC1; p=reject; pct=0')
      expect((await check(zone, { from: 'example.com', dkim: [pass('example.com')] })).result).toBe(
        'pass',
      )
      const failed = await check(zone, {
        from: 'example.com',
        spf: pass('other.example'),
        dkim: [pass('other.example')],
      })
      expect(failed).toMatchObject({ result: 'fail', disposition: 'reject' })
    })

    test('B.4.1 and B.4.2: alignment in a simple and in a deep hierarchy', async () => {
      const zone = { ...reject, ...withRecord('v=DMARC1; p=reject', 'signing.example.com') }
      for (const from of ['example.com', 'a.b.c.d.e.f.g.h.i.j.k.example.com']) {
        const result = await check(zone, {
          from,
          spf: pass('example.com'),
          dkim: [pass('signing.example.com')],
        })
        expect(result).toMatchObject({
          result: 'pass',
          policyDomain: 'example.com',
          spf: { aligned: true },
          dkim: [{ domain: 'signing.example.com', aligned: true }],
        })
      }
    })
  })

  describe('#1 DNS tree walk', () => {
    test('a record with psd=n is the organizational domain', async () => {
      const zone = {
        ...withRecord('v=DMARC1; p=reject; psd=n', 'b.example.com'),
        ...withRecord('v=DMARC1; p=none'),
      }
      expect(await check(zone, { from: 'a.b.example.com' })).toMatchObject({
        policyDomain: 'b.example.com',
        policy: 'reject',
      })
    })

    test('a long name is shortened to seven labels after the first query', async () => {
      const log: Query[] = []
      await check(
        withRecord('v=DMARC1; p=none'),
        { from: 'a.b.c.d.e.f.g.h.i.j.k.example.com' },
        {
          log,
        },
      )
      expect(dmarcQueries(log)).toEqual([
        '_dmarc.a.b.c.d.e.f.g.h.i.j.k.example.com',
        '_dmarc.g.h.i.j.k.example.com',
        '_dmarc.h.i.j.k.example.com',
        '_dmarc.i.j.k.example.com',
        '_dmarc.j.k.example.com',
        '_dmarc.k.example.com',
        '_dmarc.example.com',
        '_dmarc.com',
      ])
    })

    test('B.4.1: walks for the author and for each differing identifier once', async () => {
      const log: Query[] = []
      const zone = { ...reject, ...withRecord('v=DMARC1; p=reject', 'signing.example.com') }
      await check(
        zone,
        { from: 'example.com', spf: pass('example.com'), dkim: [pass('signing.example.com')] },
        { log },
      )
      expect(dmarcQueries(log)).toEqual([
        '_dmarc.example.com',
        '_dmarc.com',
        '_dmarc.signing.example.com',
      ])
    })

    test('B.4.2: an identifier walk reuses the names the author walk queried', async () => {
      const log: Query[] = []
      const zone = { ...reject, ...withRecord('v=DMARC1; p=reject', 'signing.example.com') }
      await check(
        zone,
        {
          from: 'a.b.c.d.e.f.g.h.i.j.k.example.com',
          spf: pass('example.com'),
          dkim: [pass('signing.example.com')],
        },
        { log },
      )
      expect(dmarcQueries(log)).toHaveLength(9)
      expect(dmarcQueries(log).at(-1)).toBe('_dmarc.signing.example.com')
    })

    test('eight labels lose one label and nine lose two', async () => {
      for (const [from, second] of [
        ['a.b.c.d.e.f.example.com', '_dmarc.b.c.d.e.f.example.com'],
        ['x.a.b.c.d.e.f.example.com', '_dmarc.b.c.d.e.f.example.com'],
      ] as const) {
        const log: Query[] = []
        await check({}, { from }, { log })
        expect(dmarcQueries(log)[1]).toBe(second)
        expect(dmarcQueries(log)).toHaveLength(8)
      }
    })

    test('the From domain is its own organizational domain with no record above it', async () => {
      const zone = withRecord('v=DMARC1; p=reject', 'mail.example.com')
      const result = await check(zone, {
        from: 'mail.example.com',
        spf: pass('bounce.example.com'),
        dkim: [pass('example.com')],
      })
      expect(result).toMatchObject({ result: 'fail', policy: 'reject' })
    })

    test('the record with the fewest labels applies, not an intermediate one', async () => {
      const zone = { ...withRecord('v=DMARC1; p=none', 'b.example.com'), ...reject }
      expect(await check(zone, { from: 'a.b.example.com' })).toMatchObject({
        policyDomain: 'example.com',
        policy: 'reject',
      })
    })

    test('a public suffix that publishes a record is an organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject', 'blogspot.com')
      const result = await check(zone, {
        from: 'alice.blogspot.com',
        dkim: [pass('bob.blogspot.com')],
      })
      expect(result).toMatchObject({
        result: 'pass',
        policy: 'reject',
        policyDomain: 'blogspot.com',
      })
    })

    test('psd=n on the From domain stops the walk', async () => {
      const log: Query[] = []
      const zone = { ...withRecord('v=DMARC1; p=reject; psd=n', 'mail.example.com'), ...reject }
      const result = await check(
        zone,
        { from: 'mail.example.com', dkim: [pass('example.com')] },
        { log },
      )
      expect(result.result).toBe('fail')
      expect(dmarcQueries(log)).toEqual(['_dmarc.mail.example.com'])
    })

    test('a set of several records above the From domain is discarded', async () => {
      const zone = {
        '_dmarc.b.example.com': { TXT: ['v=DMARC1; p=reject; psd=n', 'v=DMARC1; p=none'] },
        ...withRecord('v=DMARC1; p=quarantine'),
      } satisfies Zone
      expect(await check(zone, { from: 'a.b.example.com' })).toMatchObject({
        policyDomain: 'example.com',
        policy: 'quarantine',
      })
    })

    test('identifiers outside the organizational domain are not walked', async () => {
      const log: Query[] = []
      const result = await check(
        reject,
        {
          from: 'example.com',
          spf: pass('bounces.esp.example.net'),
          dkim: [pass('esp.example.net'), pass('example.org')],
        },
        { log },
      )
      expect(result.result).toBe('fail')
      expect(dmarcQueries(log)).toEqual(['_dmarc.example.com', '_dmarc.com'])
    })

    test('SPF is walked before DKIM, within the limit of 10 walks', async () => {
      const log: Query[] = []
      const dkim = Array.from({ length: 20 }, (_, i) => pass(`s${i}.example.com`))
      const result = await check(
        reject,
        { from: 'example.com', spf: pass('bounces.example.com'), dkim },
        { log },
      )
      expect(result).toMatchObject({ result: 'pass', spf: { aligned: true } })
      expect(dmarcQueries(log)).toHaveLength(12)
      expect(dmarcQueries(log)).toContain('_dmarc.bounces.example.com')
      expect(dmarcQueries(log)).not.toContain('_dmarc.s9.example.com')
    })

    test('names that cannot exist are not queried', async () => {
      const log: Query[] = []
      const result = await check(reject, { from: `${'a'.repeat(64)}.example.com` }, { log })
      expect(result.policy).toBe('reject')
      expect(dmarcQueries(log)).toEqual(['_dmarc.example.com', '_dmarc.com'])
    })

    test('EBADNAME is no record', async () => {
      const zone = {
        '_dmarc.mail.example.com': { TXT: 'EBADNAME' },
        ...withRecord('v=DMARC1; p=quarantine'),
      } satisfies Zone
      expect(await check(zone, { from: 'mail.example.com' })).toMatchObject({
        result: 'fail',
        policy: 'quarantine',
      })
    })

    test('a trailing root dot is ignored on the From domain and identifiers', async () => {
      const result = await check(reject, {
        from: 'mail.example.com.',
        dkim: [pass('example.com.')],
      })
      expect(result).toMatchObject({
        result: 'pass',
        domain: 'mail.example.com',
        dkim: [{ domain: 'example.com', aligned: true }],
      })
    })

    describe('DNS failures', () => {
      test('temperror when the policy cannot be discovered', async () => {
        const zone = { '_dmarc.example.com': { TXT: 'ESERVFAIL' } } satisfies Zone
        const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
        expect(result).toMatchObject({ result: 'temperror', domain: 'mail.example.com' })
        expect(result.policy).toBeUndefined()
      })

      test('the From domain record applies when the walk above it fails', async () => {
        const zone = { ...reject, '_dmarc.com': { TXT: 'ESERVFAIL' } } satisfies Zone
        const passed = await check(zone, { from: 'example.com', dkim: [pass('example.com')] })
        expect(passed).toMatchObject({ result: 'pass', policy: 'reject' })
        const unknown = await check(zone, { from: 'example.com', dkim: [pass('mail.example.com')] })
        expect(unknown).toMatchObject({
          result: 'temperror',
          policy: 'reject',
          disposition: 'none',
          record: { text: 'v=DMARC1; p=reject' },
          reason: expect.stringContaining('_dmarc.com'),
        })
      })

      test('temperror when an identifier walk fails and nothing else aligns', async () => {
        const zone = { ...reject, '_dmarc.mail.example.com': { TXT: 'ESERVFAIL' } } satisfies Zone
        const result = await check(zone, { from: 'example.com', dkim: [pass('mail.example.com')] })
        expect(result).toMatchObject({ result: 'temperror', policy: 'reject' })
      })

      test('pass when an identifier walk fails but another identifier aligns', async () => {
        const zone = { ...reject, '_dmarc.mail.example.com': { TXT: 'ESERVFAIL' } } satisfies Zone
        const result = await check(zone, {
          from: 'example.com',
          spf: pass('bounces.example.com'),
          dkim: [pass('mail.example.com')],
        })
        expect(result).toMatchObject({ result: 'pass', spf: { aligned: true } })
      })

      test('strict alignment does not walk, so it fails instead of temperror', async () => {
        const zone = {
          ...withRecord('v=DMARC1; p=reject; adkim=s'),
          '_dmarc.mail.example.com': { TXT: 'ESERVFAIL' },
        } satisfies Zone
        const result = await check(zone, { from: 'example.com', dkim: [pass('mail.example.com')] })
        expect(result.result).toBe('fail')
      })
    })
  })

  describe('#3 np and the domain existence test', () => {
    const np = withRecord('v=DMARC1; p=reject; sp=none; np=quarantine')

    test('np applies to a subdomain that does not exist', async () => {
      expect((await check(np, { from: 'sub.example.com' })).policy).toBe('quarantine')
    })

    test('sp applies to a subdomain with an A record', async () => {
      const zone = { ...np, 'sub.example.com': { A: ['192.0.2.10'] } }
      expect((await check(zone, { from: 'sub.example.com' })).policy).toBe('none')
    })

    test('a name with other records exists', async () => {
      const zone = { ...np, 'mail.example.com': {} }
      expect((await check(zone, { from: 'mail.example.com' })).policy).toBe('none')
    })

    test('np does not apply to the organizational domain, which is not queried', async () => {
      const log: Query[] = []
      const result = await check(np, { from: 'example.com' }, { log })
      expect(result).toMatchObject({ policy: 'reject', record: { np: 'quarantine' } })
      expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([])
    })

    test('no existence query without np', async () => {
      const log: Query[] = []
      const zone = withRecord('v=DMARC1; p=reject; sp=none')
      expect((await check(zone, { from: 'sub.example.com' }, { log })).policy).toBe('none')
      expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([])
    })

    test('p applies to an existing subdomain without sp', async () => {
      const zone = {
        ...withRecord('v=DMARC1; p=quarantine; np=reject'),
        'sub.example.com': { A: ['192.0.2.1'] },
      }
      expect((await check(zone, { from: 'sub.example.com' })).policy).toBe('quarantine')
    })

    test('a public suffix np applies to a name registered below it', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=none; np=reject; psd=y', 'gov.example')
      expect(await check(zone, { from: 'fake-agency.gov.example' })).toMatchObject({
        policyDomain: 'gov.example',
        policy: 'reject',
      })
    })

    test('a name that cannot exist does not exist, without a query', async () => {
      const log: Query[] = []
      const result = await check(np, { from: `${'a'.repeat(64)}.example.com` }, { log })
      expect(result.policy).toBe('quarantine')
      expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([])
    })

    test('an aligned message passes when the existence query fails', async () => {
      const zone = { ...np, 'sub.example.com': { A: 'ESERVFAIL' } }
      const result = await check(zone, { from: 'sub.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', policy: 'none' })
      expect(result.reason).toBeUndefined()
    })

    test('a failing message gives temperror when the existence query fails', async () => {
      const zone = { ...np, 'sub.example.com': { A: 'ESERVFAIL' } }
      const result = await check(zone, { from: 'sub.example.com', dkim: [pass('other.example')] })
      expect(result).toMatchObject({
        result: 'temperror',
        disposition: 'none',
        reason: expect.stringContaining('ESERVFAIL'),
      })
    })

    test('a failed existence query does not matter when np and sp agree', async () => {
      const zone = {
        ...withRecord('v=DMARC1; p=none; sp=reject; np=reject'),
        'sub.example.com': { A: 'ESERVFAIL' },
      }
      const result = await check(zone, { from: 'sub.example.com', dkim: [pass('other.example')] })
      expect(result).toMatchObject({ result: 'fail', policy: 'reject', disposition: 'reject' })
    })
  })

  describe('#4 psd and public suffix domains', () => {
    test('B.4.3: psd=y stops the walk, and the organizational domain is one label below', async () => {
      const log: Query[] = []
      const zone = {
        ...withRecord('v=DMARC1; p=reject; psd=y; rua=mailto:psd@bank.example', 'bank.example'),
        ...withRecord('v=DMARC1; p=quarantine', 'giant.bank.example'),
      }
      const result = await check(
        zone,
        {
          from: 'giant.bank.example',
          spf: pass('mail.giant.bank.example'),
          dkim: [pass('mail.mega.bank.example')],
        },
        { log },
      )
      expect(result).toMatchObject({
        result: 'pass',
        policyDomain: 'giant.bank.example',
        spf: { domain: 'mail.giant.bank.example', aligned: true },
        dkim: [{ aligned: false }],
      })
      expect(dmarcQueries(log)).toEqual([
        '_dmarc.giant.bank.example',
        '_dmarc.bank.example',
        '_dmarc.mail.giant.bank.example',
      ])
    })

    test('a public suffix policy is not used when the organizational domain has a record', async () => {
      const zone = {
        ...withRecord('v=DMARC1; p=reject; psd=y', 'example'),
        ...withRecord('v=DMARC1; p=none', 'foo.example'),
      }
      expect(await check(zone, { from: 'foo.example' })).toMatchObject({
        policyDomain: 'foo.example',
        policy: 'none',
      })
    })

    test('the public suffix policy applies, with sp, when the organizational domain has none', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=quarantine; psd=y', 'bank.example')
      const result = await check(zone, {
        from: 'mail.giant.bank.example',
        dkim: [pass('giant.bank.example')],
      })
      expect(result).toMatchObject({
        result: 'pass',
        policyDomain: 'bank.example',
        policy: 'quarantine',
      })
    })

    test('two registrants below one public suffix do not align', async () => {
      const zone = withRecord('v=DMARC1; p=reject; psd=y', 'bank.example')
      const result = await check(zone, {
        from: 'giant.bank.example',
        spf: pass('bank.example'),
        dkim: [pass('mega.bank.example')],
      })
      expect(result).toMatchObject({ result: 'fail', policy: 'reject' })
    })

    test('a public suffix sending as itself is its own organizational domain', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=none; psd=y', 'bank.example')
      const result = await check(zone, { from: 'bank.example', spf: pass('mail.bank.example') })
      expect(result).toMatchObject({
        result: 'fail',
        policy: 'reject',
        policyDomain: 'bank.example',
      })
    })
  })

  describe('#5 t: test mode', () => {
    test('t=y lowers reject to quarantine and quarantine to none', async () => {
      for (const [p, policy] of [
        ['reject', 'quarantine'],
        ['quarantine', 'none'],
        ['none', 'none'],
      ]) {
        const result = await check(withRecord(`v=DMARC1; p=${p}; t=y`), { from: 'example.com' })
        expect(result).toMatchObject({ result: 'fail', policy, disposition: policy })
      }
    })

    test('t=y keeps the published tags', async () => {
      const zone = withRecord('v=DMARC1; p=reject; sp=quarantine; t=Y')
      expect(await check(zone, { from: 'sub.example.com' })).toMatchObject({
        policy: 'none',
        record: { p: 'reject', sp: 'quarantine', t: 'y' },
      })
    })

    test('t=n and an invalid t apply the policy as published', async () => {
      for (const t of ['n', 'yes']) {
        const result = await check(withRecord(`v=DMARC1; p=reject; t=${t}`), {
          from: 'example.com',
        })
        expect(result).toMatchObject({ policy: 'reject', record: { t: 'n' } })
      }
    })
  })

  describe('#7 records without a valid policy', () => {
    test('no p and a valid rua act as p=none', async () => {
      const zone = withRecord('v=DMARC1; rua=mailto:dmarc@example.com')
      const result = await check(zone, { from: 'example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'pass', policy: 'none' })
    })

    test('no p and no rua mean no DMARC processing', async () => {
      const result = await check(withRecord('v=DMARC1; adkim=s'), { from: 'example.com' })
      expect(result).toMatchObject({ result: 'none', reason: expect.any(String) })
      expect(result.policy).toBeUndefined()
    })

    test('an invalid p with a valid rua acts as p=none and keeps the other tags', async () => {
      const zone = withRecord('v=DMARC1; p=block; adkim=s; rua=mailto:dmarc@example.com!10m')
      const result = await check(zone, { from: 'example.com', dkim: [pass('mail.example.com')] })
      expect(result).toMatchObject({
        result: 'fail',
        policy: 'none',
        record: { p: 'none', adkim: 's', rua: ['mailto:dmarc@example.com'] },
      })
    })

    test('an invalid sp or np with a valid rua acts as p=none', async () => {
      for (const tag of ['sp=bounce', 'np=']) {
        const zone = withRecord(`v=DMARC1; p=reject; ${tag}; rua=mailto:dmarc@example.com`)
        const result = await check(zone, { from: 'sub.example.com' })
        expect(result.policy).toBe('none')
        expect(result.record?.sp).toBeUndefined()
      }
    })

    test('any syntactically valid URI in rua counts', async () => {
      for (const rua of [
        'rua=mailto:',
        'rua=mailto:dmarc@example.com!10m',
        'rua=bogus, https://report.example/dmarc',
        'rua=mailto:d%2Cmarc@example.com',
      ]) {
        const result = await check(withRecord(`v=DMARC1; p=reject; sp=nope; ${rua}`), {
          from: 'example.com',
        })
        expect(result).toMatchObject({ result: 'fail', policy: 'none' })
      }
    })

    test('a rua without a valid URI means no DMARC processing', async () => {
      for (const rua of [
        'rua=dmarc@example.com',
        'rua=',
        'rua=nothing',
        'rua=<mailto:dmarc@example.com>',
        'rua=mailto:a b@example.com',
      ]) {
        const result = await check(withRecord(`v=DMARC1; p=reject; sp=nope; ${rua}`), {
          from: 'example.com',
        })
        expect(result.result).toBe('none')
        expect(result.policy).toBeUndefined()
      }
    })

    test('the walk stops at a From domain record without a valid policy', async () => {
      const zone = { ...withRecord('v=DMARC1; adkim=s', 'mail.example.com'), ...reject }
      expect((await check(zone, { from: 'mail.example.com' })).result).toBe('none')
    })
  })

  describe('#8 the version tag', () => {
    test('the version must be exactly DMARC1', async () => {
      for (const text of ['v=dmarc1; p=reject', 'v=DMARC1x; p=reject']) {
        expect((await check(withRecord(text), { from: 'example.com' })).result).toBe('none')
      }
    })

    test('whitespace around "=" in the version tag is allowed', async () => {
      const result = await check(withRecord('v = DMARC1; p=reject'), {
        from: 'example.com',
        dkim: [pass('example.com')],
      })
      expect(result).toMatchObject({ result: 'pass', policy: 'reject' })
    })
  })

  describe('#10 tag values', () => {
    test('policy and alignment values are case-insensitive', async () => {
      expect((await check(withRecord('v=DMARC1; p=Reject'), { from: 'example.com' })).policy).toBe(
        'reject',
      )
      const zone = withRecord('v=DMARC1; p=reject; adkim=S')
      const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'fail', record: { adkim: 's' } })
    })

    test('whitespace around "=" in a tag is allowed', async () => {
      const zone = withRecord('v=DMARC1; p = reject; adkim = s')
      const result = await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })
      expect(result).toMatchObject({ result: 'fail', policy: 'reject', record: { adkim: 's' } })
    })

    test('report URIs keep their case', async () => {
      const zone = withRecord('v=DMARC1; p=none; rua=mailto:DMARC-Reports@Example.COM')
      expect((await check(zone, { from: 'example.com' })).record?.rua).toEqual([
        'mailto:DMARC-Reports@Example.COM',
      ])
    })
  })
})

describe('author-domain-test.js and from-header-test.js', () => {
  test('converts U-labels to A-labels, in lower case and NFC', async () => {
    const cases = [
      ['bücher.example', 'xn--bcher-kva.example'],
      ['BÜCHER.Example', 'xn--bcher-kva.example'],
      ['пример.рф', 'xn--e1afmkfd.xn--p1ai'],
      ['bänk.example', 'xn--bnk-qla.example'],
      [`cafe${String.fromCharCode(0x301)}.example`, 'xn--caf-dma.example'],
      ['café.example', 'xn--caf-dma.example'],
    ]
    for (const [from, domain] of cases) {
      const log: Query[] = []
      expect((await check({}, { from: from! }, { log })).domain).toBe(domain)
      expect(log[0]).toBe(`TXT _dmarc.${domain}`)
    }
  })

  test('maps fullwidth letters and the ideographic full stop as SPF and URL do', async () => {
    for (const from of ['ＥＸＡＭＰＬＥ.com', 'example。com']) {
      const result = await check(reject, { from })
      expect(result).toMatchObject({ domain: 'example.com', policy: 'reject' })
    }
  })

  test('aligns a U-label identifier with an A-label From domain', async () => {
    const zone = withRecord('v=DMARC1; p=reject', 'xn--bcher-kva.example')
    const result = await check(zone, {
      from: 'mail.bücher.example',
      dkim: [pass('Bücher.example')],
    })
    expect(result).toMatchObject({
      result: 'pass',
      domain: 'mail.xn--bcher-kva.example',
      dkim: [{ domain: 'xn--bcher-kva.example', aligned: true }],
    })
  })

  test('rejects a domain with a control, format or space character, without a query', async () => {
    const chars = [0x200b, 0xad, 0x2060, 0x200e, 0x202e, 0, 0x1b, 0x7f, 0x85, 0x20, 0x3000]
    for (const char of chars.map((code) => String.fromCharCode(code))) {
      const log: Query[] = []
      expect((await check(reject, { from: `bank${char}.example` }, { log })).result).toBe(
        'permerror',
      )
      expect(log).toEqual([])
    }
  })

  test('accepts the CONTEXTJ joiners U+200C and U+200D', async () => {
    expect((await check({}, { from: `ن${String.fromCharCode(0x200c)}ا.example` })).result).toBe(
      'none',
    )
  })

  test('rejects an address, a URL or an empty label instead of a domain', async () => {
    for (const from of [
      'user@example.com',
      'example.com/x',
      'http://example.com',
      'example..com',
      'exa"mple.com',
    ]) {
      expect((await check(reject, { from })).result).toBe('permerror')
    }
  })
})

describe('tools-test.js getAlignment', () => {
  const relaxed = withRecord('v=DMARC1; p=reject')
  const strict = withRecord('v=DMARC1; p=reject; adkim=s')
  const aligned = async (zone: Zone, from: string, domain: string) =>
    (await check(zone, { from, dkim: [pass(domain)] })).dkim[0]!.aligned

  test('relaxed: same organizational domain aligns', async () => {
    expect(await aligned(relaxed, 'example.com', 'example.com')).toBe(true)
    expect(await aligned(relaxed, 'mail.example.com', 'example.com')).toBe(true)
    expect(await aligned(relaxed, 'example.com', 'mail.example.com')).toBe(true)
    expect(await aligned(relaxed, 'news.example.com', 'foo.example.com')).toBe(true)
    expect(await aligned(relaxed, 'news.example.com', 'foo.example.net')).toBe(false)
    expect(await aligned(relaxed, 'example.com', 'other.com')).toBe(false)
  })

  test('strict: only the identical domain aligns, ignoring case and a trailing dot', async () => {
    const zone = { ...strict, ...withRecord('v=DMARC1; p=reject; adkim=s', 'news.example.com') }
    expect(await aligned(zone, 'news.example.com', 'news.example.com')).toBe(true)
    expect(await aligned(zone, 'News.Example.COM', 'news.example.com.')).toBe(true)
    expect(await aligned(zone, 'mail.example.com', 'example.com')).toBe(false)
    expect(await aligned(zone, 'news.example.com', 'foo.example.com')).toBe(false)
  })

  test('a domain with URL characters never aligns', async () => {
    for (const separator of ['/', '?', '#', '\\', '@', ':', ' ']) {
      for (const zone of [relaxed, strict]) {
        expect(await aligned(zone, 'example.com', `example.com${separator}x.attacker.test`)).toBe(
          false,
        )
      }
    }
    expect(await aligned(relaxed, 'example.com', 'http://example.com')).toBe(false)
    expect(await aligned(relaxed, 'example.com', 'example..com')).toBe(false)
    expect(await aligned(relaxed, 'example.com', '.')).toBe(false)
    expect(await aligned(relaxed, 'example.com', '')).toBe(false)
  })

  test('underscore labels align', async () => {
    expect(await aligned(relaxed, 'example.com', '_sub.Example.COM.')).toBe(true)
  })
})

describe('mailauth-test.js', () => {
  test('a signature of the organizational domain aligns in relaxed mode only', async () => {
    const zone = {
      ...withRecord('v=DMARC1; p=none'),
      ...withRecord('v=DMARC1; p=reject', 'mail.example.com'),
    }
    expect(
      (await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] })).result,
    ).toBe('pass')
  })

  test('without a record above it the From domain is its own organizational domain', async () => {
    const zone = withRecord('v=DMARC1; p=reject', 'mail.example.com')
    expect(
      await check(zone, { from: 'mail.example.com', dkim: [pass('example.com')] }),
    ).toMatchObject({ result: 'fail', dkim: [{ aligned: false }] })
  })
})

describe('organizationalDomain option', () => {
  const list = (domain: string) => domain.split('.').slice(-2).join('.')

  test('uses the function instead of the tree walk', async () => {
    const log: Query[] = []
    const zone = withRecord('v=DMARC1; p=reject', 'mail.example.com')
    const result = await check(
      zone,
      { from: 'mail.example.com', dkim: [pass('example.com'), pass('other.example.com')] },
      { log, organizationalDomain: list },
    )
    expect(result).toMatchObject({
      result: 'pass',
      dkim: [{ aligned: true }, { aligned: true }],
    })
    expect(dmarcQueries(log)).toEqual(['_dmarc.mail.example.com'])
  })

  test('falls back to the record of the organizational domain only', async () => {
    const log: Query[] = []
    const zone = withRecord('v=DMARC1; p=reject; sp=quarantine')
    const result = await check(
      zone,
      { from: 'a.b.example.com' },
      { log, organizationalDomain: list },
    )
    expect(result).toMatchObject({ policy: 'quarantine', policyDomain: 'example.com' })
    expect(dmarcQueries(log)).toEqual(['_dmarc.a.b.example.com', '_dmarc.example.com'])
  })

  test('a missing result makes the domain its own organizational domain', async () => {
    const log: Query[] = []
    const result = await check({}, { from: 'com' }, { log, organizationalDomain: () => null })
    expect(result.result).toBe('none')
    expect(dmarcQueries(log)).toEqual(['_dmarc.com'])
  })
})

describe('known upstream issues', () => {
  test('no tree walk above the From domain when every identifier is identical to it', async () => {
    const log: Query[] = []
    const result = await check(
      reject,
      { from: 'example.com', spf: pass('example.com'), dkim: [pass('example.com')] },
      { log },
    )
    expect(result.result).toBe('pass')
    expect(log).toEqual(['TXT _dmarc.example.com'])
  })

  test('no existence query when np is the policy that applies anyway', async () => {
    const log: Query[] = []
    const zone = withRecord('v=DMARC1; p=none; sp=reject; np=reject')
    expect((await check(zone, { from: 'sub.example.com' }, { log })).policy).toBe('reject')
    expect(log.filter((query) => !query.startsWith('TXT'))).toEqual([])
  })
})
