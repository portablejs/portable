import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import * as Rdap from '@portable/rdap'
import { recorded, rejection, server, services } from './utils.js'

const iana = 'https://data.iana.org/rdap/dns.json'

describe('recorded responses', () => {
  test('Verisign: follows the referral to MarkMonitor and takes the contacts from it', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('google.com', { fetch })
    expect(urls).toEqual([
      iana,
      'https://rdap.verisign.com/com/v1/domain/google.com',
      'https://rdap.markmonitor.com/rdap/domain/GOOGLE.COM',
    ])
    expect(result.name).toBe('google.com')
    expect(result.handle).toBe('2138514_DOMAIN_COM-VRSN')
    expect(result.status).toEqual([
      'client delete prohibited',
      'client transfer prohibited',
      'client update prohibited',
      'server delete prohibited',
      'server transfer prohibited',
      'server update prohibited',
    ])
    expect(result.events).toEqual({
      registration: new Date('1997-09-15T04:00:00Z'),
      expiration: new Date('2028-09-14T04:00:00Z'),
      lastChanged: new Date('2019-09-09T15:39:04Z'),
    })
    expect(result.nameservers).toEqual([
      'ns1.google.com',
      'ns2.google.com',
      'ns3.google.com',
      'ns4.google.com',
    ])
    expect(result.entities.map((entity) => entity.roles)).toEqual([
      ['registrant'],
      ['technical'],
      ['registrar'],
      ['abuse'],
    ])
    expect(result.entities[0]).toEqual({
      handle: undefined,
      roles: ['registrant'],
      name: 'REDACTED REGISTRANT',
      org: 'REDACTED FOR PRIVACY',
      email: 'REDACTED FOR PRIVACY',
      phone: 'REDACTED FOR PRIVACY',
      address: 'REDACTED FOR PRIVACY\nREDACTED FOR PRIVACY\nCA\nREDACTED FOR PRIVACY',
    })
    expect(result.entities[2]).toMatchObject({
      handle: '292',
      name: 'Markmonitor Inc.',
      org: 'Markmonitor Inc.',
      address: '3540 E Longwing Ln\nMeridian\nID\n83646',
    })
    expect(result.raw.ldhName).toBe('GOOGLE.COM')
    expect(result.referral?.url).toBe('https://rdap.markmonitor.com/rdap/domain/GOOGLE.COM')
    expect(result.referral?.raw?.ldhName).toBe('google.com')
  })

  test('Verisign without follow: one request, and the registry entities', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('google.com', { fetch, follow: false })
    expect(urls).toHaveLength(2)
    expect(result.referral).toBeUndefined()
    expect(result.entities).toEqual([
      {
        handle: '292',
        roles: ['registrar'],
        name: 'MarkMonitor Inc.',
        org: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
      },
      {
        handle: undefined,
        roles: ['abuse'],
        name: undefined,
        org: undefined,
        email: 'abusecomplaints@markmonitor.com',
        phone: '+1.2086851750',
        address: undefined,
      },
    ])
  })

  test('PIR: .org follows the referral to MarkMonitor', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('wikipedia.org', { fetch })
    expect(urls.slice(1)).toEqual([
      'https://rdap.publicinterestregistry.org/rdap/domain/wikipedia.org',
      'https://rdap.markmonitor.com/rdap/domain/wikipedia.org',
    ])
    expect(result.events.expiration).toEqual(new Date('2027-01-13T00:12:14Z'))
    expect(result.events.registration).toEqual(new Date('2001-01-13T00:12:14.754Z'))
    expect(result.nameservers).toEqual([
      'ns0.wikimedia.org',
      'ns1.wikimedia.org',
      'ns2.wikimedia.org',
    ])
    expect(result.entities.map((entity) => entity.roles[0])).toEqual([
      'registrant',
      'technical',
      'registrar',
      'abuse',
    ])
    expect(result.entities[2]?.name).toBe('Markmonitor Inc.')
  })

  test('SIDN: a ccTLD with no expiration event and no referral', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('sidn.nl', { fetch })
    expect(urls.slice(1)).toEqual(['https://rdap.sidn.nl/domain/sidn.nl'])
    expect(result.status).toEqual(['locked'])
    expect(result.events).toEqual({
      registration: new Date('1999-11-18T12:47:20Z'),
      expiration: undefined,
      lastChanged: new Date('2026-05-12T07:16:39Z'),
    })
    expect(result.nameservers).toEqual(['ns2.sidn.nl', 'ns1.sidn.nl', 'ns3.sidn.nl'])
    expect(result.entities.find((entity) => entity.roles.includes('abuse'))?.email).toBe(
      'abuse@sidn.nl',
    )
  })

  test('Nominet: a second-level name under .uk, and nameservers with trailing dots', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('bbc.co.uk', { fetch })
    expect(urls.slice(1)).toEqual(['https://rdap.nominet.uk/uk/domain/bbc.co.uk'])
    expect(result.nameservers).toContain('ddns0.bbc.co.uk')
    expect(result.nameservers.every((host) => !host.endsWith('.'))).toBe(true)
    expect(result.events.expiration).toEqual(new Date('2034-12-13T03:49:48Z'))
  })

  test('AFNIC: a failed referral keeps the registry result and reports the error', async () => {
    const { fetch, urls } = server()
    const result = await Rdap.domain('google.fr', { fetch })
    expect(urls.at(-1)).toBe('https://rdap.markmonitor.com/rdap/domain/google.fr')
    expect(result.referral?.url).toBe('https://rdap.markmonitor.com/rdap/domain/google.fr')
    expect(result.referral?.error).toBeInstanceOf(Rdap.NotFoundError)
    expect(result.entities.find((entity) => entity.roles.includes('registrant'))).toMatchObject({
      handle: 'GIHU100-FRNIC',
      name: 'Google Ireland Holdings Unlimited Company',
      email: 'dns-admin@google.com',
    })
    expect(result.status).toContain('server recover prohibited')
  })
})

describe('names', () => {
  test('sends Unicode names in A-labels, and keeps the unicodeName from the server', async () => {
    for (const name of [
      'münchen.com',
      'MÜNCHEN.COM',
      'xn--mnchen-3ya.com',
      'XN--MNCHEN-3YA.COM.',
    ]) {
      const { fetch, urls } = server()
      const result = await Rdap.domain(name, { fetch, follow: false })
      expect(urls[1]).toBe('https://rdap.verisign.com/com/v1/domain/xn--mnchen-3ya.com')
      expect(result.name).toBe('xn--mnchen-3ya.com')
    }
  })

  test('picks the registry by the longest matching label suffix', async () => {
    const { fetch, urls } = server({
      [iana]: services([['uk'], ['https://uk.example/']], [['co.uk'], ['https://co-uk.example/']]),
      'https://co-uk.example/domain/bbc.co.uk': { objectClassName: 'domain', ldhName: 'bbc.co.uk' },
      'https://uk.example/domain/bbc.uk': { objectClassName: 'domain', ldhName: 'bbc.uk' },
    })
    await Rdap.domain('bbc.co.uk', { fetch })
    await Rdap.domain('bbc.uk', { fetch })
    expect(urls.slice(1)).toEqual([
      'https://co-uk.example/domain/bbc.co.uk',
      'https://uk.example/domain/bbc.uk',
    ])
  })

  test('rejects malformed names with InvalidInputError, without a request', async () => {
    const { fetch, urls } = server()
    const names = [
      '',
      ' ',
      '\t',
      'example',
      'com',
      '12345',
      '1.2.3.4',
      'example..com',
      '.example.com',
      '-example.com',
      'example-.com',
      'sub.-example.com',
      'my_domain.com',
      'mydomain！.co.uk',
      'exa mple.com',
      'https://www.example.com',
      'www.example.com/news',
      'user@example.com',
      'example.com:443',
      `${'a'.repeat(64)}.com`,
      `${'abcdefghi.'.repeat(26)}com`,
    ]
    for (const name of names)
      expect({ input: name, error: await rejection(Rdap.domain(name, { fetch })) }).toEqual({
        input: name,
        error: expect.any(Rdap.InvalidInputError),
      })
    expect(urls).toEqual([])
  })

  test('accepts labels of 63 characters and names up to 253', async () => {
    const { fetch, urls } = server()
    const long = `${'a'.repeat(63)}.${'abcdefghi.'.repeat(18)}com`
    for (const name of [`${'a'.repeat(63)}.domain.co.uk`, long, 'my-hyphenated-domain.com'])
      expect(await rejection(Rdap.domain(name, { fetch }))).toBeInstanceOf(Rdap.NotFoundError)
    expect(urls.filter((url) => url !== iana)).toHaveLength(3)
  })

  test('rejects a TLD with no RDAP server with UnsupportedError, after only the bootstrap file', async () => {
    const { fetch, urls } = server()
    for (const name of ['example.de', 'example.badger', 'example.invalid'])
      expect(await rejection(Rdap.domain(name, { fetch }))).toBeInstanceOf(Rdap.UnsupportedError)
    expect(urls).toEqual([iana])
  })

  test('rejects an unregistered name with NotFoundError', async () => {
    const { fetch } = server()
    const error = await rejection(Rdap.domain('nonexistent-domain.com', { fetch }))
    expect(error).toBeInstanceOf(Rdap.NotFoundError)
    expect((error as Rdap.NotFoundError).url).toBe(
      'https://rdap.verisign.com/com/v1/domain/nonexistent-domain.com',
    )
    expect((error as Rdap.NotFoundError).status).toBe(404)
  })

  test('throws a TypeError for a name that is not a string', async () => {
    const { fetch } = server()
    expect(await rejection(Rdap.domain(42 as never, { fetch }))).toBeInstanceOf(TypeError)
  })
})

describe('referrals', () => {
  const self = 'https://registry.example/domain/example.com'
  const registry = (links: unknown[]) => ({
    [iana]: services([['com'], ['https://registry.example/']]),
    [self]: {
      objectClassName: 'domain',
      ldhName: 'EXAMPLE.COM',
      links,
      entities: [
        { roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Registry view']]] },
        { roles: ['sponsor'], vcardArray: ['vcard', [['fn', {}, 'text', 'Sponsor']]] },
      ],
    },
    'https://registrar.example/domain/example.com': {
      objectClassName: 'domain',
      entities: [
        { roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Registrar view']]] },
        { roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Owner']]] },
      ],
    },
  })

  test('keeps registry entities whose roles the registrar has none of', async () => {
    const { fetch } = server(
      registry([{ rel: 'related', href: 'https://registrar.example/domain/example.com' }]),
    )
    const result = await Rdap.domain('example.com', { fetch })
    expect(result.entities.map((entity) => entity.name)).toEqual([
      'Registrar view',
      'Owner',
      'Sponsor',
    ])
  })

  test('ignores related links to HTML pages, other schemes, other objects and the same URL', async () => {
    const { fetch, urls } = server(
      registry([
        { rel: 'related', type: 'text/html', href: 'https://registrar.example/domain/example.com' },
        { rel: 'related', href: 'ftp://registrar.example/domain/example.com' },
        { rel: 'related', href: 'https://registrar.example/entity/292' },
        { rel: 'related', href: self },
        { rel: 'alternate', href: 'https://registrar.example/domain/example.com' },
        { rel: 'related', href: 'not a url' },
      ]),
    )
    const result = await Rdap.domain('example.com', { fetch })
    expect(urls).toEqual([iana, self])
    expect(result.referral).toBeUndefined()
  })

  test('reports a referral that is not JSON in referral.error', async () => {
    const { fetch } = server({
      ...registry([{ rel: 'related', href: 'https://registrar.example/domain/example.com' }]),
      'https://registrar.example/domain/example.com': new Response('<html>'),
    })
    const result = await Rdap.domain('example.com', { fetch })
    expect(result.referral?.error).toBeInstanceOf(Rdap.ResponseError)
    expect(result.entities.map((entity) => entity.name)).toEqual(['Registry view', 'Sponsor'])
  })

  test('aborting during the referral rejects instead of reporting it', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    const { fetch, requests } = server({
      ...registry([{ rel: 'related', href: 'https://registrar.example/domain/example.com' }]),
      'https://registrar.example/domain/example.com': 'hang',
    })
    const promise = Rdap.domain('example.com', { fetch, signal: controller.signal })
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    controller.abort(reason)
    expect(await rejection(promise)).toBe(reason)
  })
})

describe('normalization', () => {
  const lookup = async (json: Record<string, unknown>) => {
    const { fetch } = server({
      [iana]: services([['test'], ['https://rdap.example/']]),
      'https://rdap.example/domain/example.test': { objectClassName: 'domain', ...json },
    })
    return Rdap.domain('example.test', { fetch })
  }

  test('reads dates without a time zone as UTC, and skips unreadable dates', async () => {
    const result = await lookup({
      events: [
        { eventAction: 'Registration', eventDate: '2020-01-02T03:04:05' },
        { eventAction: 'registration', eventDate: '1999-01-01T00:00:00Z' },
        { eventAction: 'expiration', eventDate: 'next year' },
        { eventAction: 'last changed', eventDate: '2024-06-01T12:00:00+02:00' },
      ],
    })
    expect(result.events).toEqual({
      registration: new Date('2020-01-02T03:04:05Z'),
      expiration: undefined,
      lastChanged: new Date('2024-06-01T10:00:00Z'),
    })
  })

  test('flattens jCard properties into the first value of each', async () => {
    const result = await lookup({
      entities: [
        {
          handle: 'H1',
          roles: ['Registrant', 'Administrative'],
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['fn', {}, 'text', '  '],
              ['fn', {}, 'text', 'Jane Doe'],
              ['org', {}, 'text', ['Example Inc.', 'Legal']],
              ['tel', { type: 'fax' }, 'uri', 'tel:+1-555-0100'],
              ['tel', { type: ['work', 'voice'] }, 'uri', 'tel:+1-555-0199;ext=2'],
              ['email', {}, 'text', 'jane@example.test'],
              ['email', {}, 'text', 'other@example.test'],
              [
                'adr',
                {},
                'text',
                ['', 'Suite 5', ['1 Main St', 'Floor 2'], 'Springfield', '', '12345', 'US'],
              ],
            ],
          ],
        },
        {
          roles: ['technical'],
          vcardArray: [
            'vcard',
            [['adr', { label: '1 Main St\nSpringfield' }, 'text', ['', '', 'x', '', '', '', '']]],
          ],
          entities: [{ roles: ['abuse'], vcardArray: 'not a jcard' }],
        },
        'not an entity',
      ],
    })
    expect(result.entities).toEqual([
      {
        handle: 'H1',
        roles: ['registrant', 'administrative'],
        name: 'Jane Doe',
        org: 'Example Inc.',
        email: 'jane@example.test',
        phone: '+1-555-0199;ext=2',
        address: 'Suite 5\n1 Main St\nFloor 2\nSpringfield\n12345\nUS',
      },
      {
        handle: undefined,
        roles: ['technical'],
        name: undefined,
        org: undefined,
        email: undefined,
        phone: undefined,
        address: '1 Main St\nSpringfield',
      },
      {
        handle: undefined,
        roles: ['abuse'],
        name: undefined,
        org: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
      },
    ])
  })

  test('falls back to the queried name and tolerates missing arrays', async () => {
    const result = await lookup({ status: 'active', nameservers: [{}, { ldhName: 'NS.EXAMPLE.' }] })
    expect(result).toMatchObject({
      name: 'example.test',
      unicodeName: undefined,
      handle: undefined,
      status: [],
      nameservers: ['ns.example'],
      entities: [],
    })
  })
})

describe('responses', () => {
  const url = 'https://rdap.verisign.com/com/v1/domain/example.com'

  test('sends Accept: application/rdap+json', async () => {
    const { fetch, requests } = server()
    await rejection(Rdap.domain('example.com', { fetch }))
    expect(requests[1]!.headers.get('accept')).toMatch(/^application\/rdap\+json\b/)
  })

  test('rejects an HTTP error with ResponseError, holding the status and the RDAP error body', async () => {
    const body = { errorCode: 429, title: 'Too Many Requests' }
    const { fetch } = server({ [url]: Response.json(body, { status: 429 }) })
    const error = await rejection(Rdap.domain('example.com', { fetch }))
    expect(error).toBeInstanceOf(Rdap.ResponseError)
    expect(error).toMatchObject({ status: 429, url, body })
  })

  test('rejects an HTTP error with no body with ResponseError', async () => {
    const { fetch } = server({ [url]: new Response(null, { status: 503 }) })
    expect(await rejection(Rdap.domain('example.com', { fetch }))).toMatchObject({
      status: 503,
      body: undefined,
    })
  })

  test('rejects a body that is not a JSON object with ResponseError', async () => {
    for (const body of [
      new Response('<html></html>'),
      Response.json([1, 2]),
      Response.json(null),
    ]) {
      const { fetch } = server({ [url]: body })
      expect(await rejection(Rdap.domain('example.com', { fetch }))).toBeInstanceOf(
        Rdap.ResponseError,
      )
    }
  })

  test('passes a rejected fetch through unchanged', async () => {
    const failure = new TypeError('fetch failed')
    const { fetch } = server({ [url]: failure })
    expect(await rejection(Rdap.domain('example.com', { fetch }))).toBe(failure)
  })
})

describe('bootstrap cache', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches the bootstrap file once for every TLD in it', async () => {
    const { fetch, urls } = server()
    await Rdap.domain('google.com', { fetch, follow: false })
    await Rdap.domain('sidn.nl', { fetch })
    await Rdap.domain('bbc.co.uk', { fetch })
    expect(urls.filter((url) => url === iana)).toHaveLength(1)
  })

  test('concurrent lookups share one bootstrap request', async () => {
    const { fetch, urls } = server()
    await Promise.all([
      Rdap.domain('google.com', { fetch, follow: false }),
      Rdap.domain('sidn.nl', { fetch }),
      Rdap.ip('8.8.8.8', { fetch }),
      Rdap.ip('193.0.6.139', { fetch }),
    ])
    expect(urls.filter((url) => url.startsWith('https://data.iana.org/'))).toEqual([
      iana,
      'https://data.iana.org/rdap/ipv4.json',
    ])
  })

  test('fetches the bootstrap file again after 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { fetch, urls } = server()
    await Rdap.domain('sidn.nl', { fetch })
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 - 1000)
    await Rdap.domain('sidn.nl', { fetch })
    expect(urls.filter((url) => url === iana)).toHaveLength(1)
    vi.setSystemTime(Date.now() + 2000)
    await Rdap.domain('sidn.nl', { fetch })
    expect(urls.filter((url) => url === iana)).toHaveLength(2)
  })

  test('checks the cache age against the now option', async () => {
    const { fetch, urls } = server()
    const start = new Date('2030-01-01T00:00:00Z')
    await Rdap.domain('sidn.nl', { fetch, now: start })
    await Rdap.domain('sidn.nl', { fetch, now: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) })
    expect(urls.filter((url) => url === iana)).toHaveLength(1)
    await Rdap.domain('sidn.nl', { fetch, now: new Date(start.getTime() + 24 * 60 * 60 * 1000) })
    expect(urls.filter((url) => url === iana)).toHaveLength(2)
  })

  test('keeps a separate cache for each fetch function', async () => {
    const one = server()
    const two = server()
    await Rdap.domain('sidn.nl', { fetch: one.fetch })
    await Rdap.domain('sidn.nl', { fetch: two.fetch })
    expect(two.urls[0]).toBe(iana)
  })

  test('does not cache a failed bootstrap request', async () => {
    let fail = true
    const { fetch: inner, urls } = server()
    const fetch = (request: Request) =>
      fail && request.url === iana
        ? Promise.resolve(new Response(null, { status: 500 }))
        : inner(request)
    const error = await rejection(Rdap.domain('sidn.nl', { fetch }))
    expect(error).toBeInstanceOf(Rdap.ResponseError)
    expect(error).toMatchObject({ status: 500, url: iana })
    fail = false
    expect((await Rdap.domain('sidn.nl', { fetch })).name).toBe('sidn.nl')
    expect(urls.filter((url) => url === iana)).toHaveLength(1)
  })

  test('rejects a bootstrap file without services with ResponseError', async () => {
    const { fetch } = server({ [iana]: { version: '1.0' } })
    expect(await rejection(Rdap.domain('sidn.nl', { fetch }))).toBeInstanceOf(Rdap.ResponseError)
  })

  test('prefers an https URL, uses an http-only one, and skips services without a URL', async () => {
    const { fetch, urls } = server({
      [iana]: services(
        [['a'], ['http://a.example/rdap', 'https://a.example/rdap']],
        [['b'], ['http://b.example/']],
        [['c'], ['ftp://c.example/']],
      ),
      'https://a.example/rdap/domain/x.a': { objectClassName: 'domain' },
      'http://b.example/domain/x.b': { objectClassName: 'domain' },
    })
    await Rdap.domain('x.a', { fetch })
    await Rdap.domain('x.b', { fetch })
    expect(await rejection(Rdap.domain('x.c', { fetch }))).toBeInstanceOf(Rdap.UnsupportedError)
    expect(urls.slice(1)).toEqual([
      'https://a.example/rdap/domain/x.a',
      'http://b.example/domain/x.b',
    ])
  })
})

describe('cancellation', () => {
  test('an aborted signal rejects with its reason before any request', async () => {
    const { fetch, urls } = server()
    const reason = new Error('stop')
    expect(
      await rejection(Rdap.domain('google.com', { fetch, signal: AbortSignal.abort(reason) })),
    ).toBe(reason)
    expect(urls).toEqual([])
  })

  test('aborting during the lookup rejects with the reason and aborts the request', async () => {
    const { fetch, requests } = server({ 'https://rdap.sidn.nl/domain/sidn.nl': 'hang' })
    await Rdap.domain('google.com', { fetch, follow: false })
    const controller = new AbortController()
    const promise = Rdap.domain('sidn.nl', { fetch, signal: controller.signal })
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    controller.abort('stop')
    expect(await rejection(promise)).toBe('stop')
    expect(requests[2]!.signal.aborted).toBe(true)
  })

  test('aborting the only lookup waiting for a bootstrap file aborts its request', async () => {
    const { fetch, requests } = server({ [iana]: 'hang' })
    const controller = new AbortController()
    const promise = Rdap.domain('sidn.nl', { fetch, signal: controller.signal })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    controller.abort('stop')
    expect(await rejection(promise)).toBe('stop')
    expect(requests[0]!.signal.aborted).toBe(true)
  })

  test('aborting one of two lookups waiting for a bootstrap file leaves the other running', async () => {
    let release = () => {}
    const { fetch: inner, requests } = server()
    const fetch = async (request: Request) => {
      if (request.url === iana) await new Promise<void>((resolve) => (release = resolve))
      return inner(request)
    }
    const controller = new AbortController()
    const first = Rdap.domain('sidn.nl', { fetch, signal: controller.signal })
    const second = Rdap.domain('bbc.co.uk', { fetch, signal: new AbortController().signal })
    controller.abort('stop')
    expect(await rejection(first)).toBe('stop')
    release()
    expect((await second).name).toBe('bbc.co.uk')
    expect(requests[0]!.signal.aborted).toBe(false)
  })
})

test('error names are namespaced by the package', () => {
  expect(new Rdap.InvalidInputError('x').name).toBe('Rdap.InvalidInputError')
  expect(new Rdap.UnsupportedError('x').name).toBe('Rdap.UnsupportedError')
  expect(new Rdap.NotFoundError({ response: new Response(null, { status: 404 }), url: 'https://x/' }).name).toBe('Rdap.NotFoundError')
  expect(
    new Rdap.ResponseError({ response: new Response(null, { status: 500 }), url: 'https://x/' })
      .name,
  ).toBe('Rdap.ResponseError')
})

test('an empty ldhName gives the name that was looked up', async () => {
  const registry = 'https://rdap.verisign.com/com/v1/domain/google.com'
  const { fetch } = server({ [registry]: { ...recorded[registry], ldhName: '' } })
  expect((await Rdap.domain('google.com', { fetch, follow: false })).name).toBe('google.com')
})
