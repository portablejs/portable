import type * as DnsPacket from '@portable/dns-packet';
import { describe, expect, test } from 'vite-plus/test';
import { QueryError, create, isNotFound, type Resolver } from '@portable/dns';
import { decodeQuery, doh, record, replay, respond, utf8, type Server } from './utils.js';

const N = 'example.org';

function resolverFor(server: Server, options: create.Options = {}) {
  const { fetch, requests } = doh(server);
  return { resolver: create({ fetch, ...options }), requests };
}

const answering =
  (...answers: DnsPacket.ResourceRecord[]): Server =>
  () => ({ answers });

async function failure(promise: Promise<unknown>): Promise<QueryError> {
  const error = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(QueryError);
  return error as QueryError;
}

describe('record types', () => {
  test('resolve4 and resolve6 return addresses, IPv6 formatted as RFC 5952 recommends', async () => {
    const { resolver } = resolverFor(({ type }) => ({
      answers:
        type === 'A'
          ? [record(N, 'A', '192.0.2.1'), record(N, 'A', '192.0.2.2')]
          : [record(N, 'AAAA', '2001:0DB8:0:0:0:0:0:1'), record(N, 'AAAA', '::ffff:c000:201')],
    }));
    expect(await resolver.resolve4(N)).toEqual(['192.0.2.1', '192.0.2.2']);
    expect(await resolver.resolve6(N)).toEqual(['2001:db8::1', '::ffff:192.0.2.1']);
  });

  test('resolveTxt returns each record as its list of strings', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'TXT', ['v=spf1 include:_spf.example.org', ' ~all']),
        record(N, 'TXT', ['google-site-verification=abc']),
        record(N, 'TXT', ['']),
      ),
    );
    expect(await resolver.resolveTxt(N)).toEqual([
      ['v=spf1 include:_spf.example.org', ' ~all'],
      ['google-site-verification=abc'],
      [''],
    ]);
  });

  test('resolveTxt keeps a string split at 255 bytes as two strings', async () => {
    const key = 'p=' + 'A'.repeat(400);
    const { resolver } = resolverFor(
      answering(record(N, 'TXT', [key.slice(0, 255), key.slice(255)])),
    );
    const [chunks] = await resolver.resolveTxt(N);
    expect(chunks).toHaveLength(2);
    expect(chunks!.join('')).toBe(key);
  });

  test('resolveTxt decodes UTF-8, keeps a leading BOM and replaces invalid bytes', async () => {
    const bom = Uint8Array.of(0xef, 0xbb, 0xbf, 0x61);
    const { resolver } = resolverFor(
      answering(record(N, 'TXT', [utf8('héllo ✓'), bom, Uint8Array.of(0xff, 0x41), utf8('a\0b')])),
    );
    expect(await resolver.resolveTxt(N)).toEqual([
      ['héllo ✓', `${String.fromCharCode(0xfeff)}a`, `${String.fromCharCode(0xfffd)}A`, 'a\0b'],
    ]);
  });

  test('resolveMx renames preference to priority, and returns the root of a null MX as an empty string', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'MX', { preference: 10, exchange: 'Mx1.Example.org' }),
        record(N, 'MX', { preference: 0, exchange: '.' }),
      ),
    );
    expect(await resolver.resolveMx(N)).toEqual([
      { exchange: 'Mx1.Example.org', priority: 10 },
      { exchange: '', priority: 0 },
    ]);
  });

  test('resolveNs, resolveCname and resolvePtr return names', async () => {
    const { resolver } = resolverFor(({ name, type }) => ({
      answers: [record(name, type, `${type.toLowerCase()}.example.net`)],
    }));
    expect(await resolver.resolveNs(N)).toEqual(['ns.example.net']);
    expect(await resolver.resolveCname(N)).toEqual(['cname.example.net']);
    expect(await resolver.resolvePtr('4.3.2.1.in-addr.arpa')).toEqual(['ptr.example.net']);
  });

  test('resolveSrv returns the target as name', async () => {
    const answers = [0, 1, 2].map((i) =>
      record('_mongodb._tcp.cluster0.example.org', 'SRV', {
        priority: i === 2 ? 1 : 0,
        weight: i === 2 ? 10 : 5,
        port: 27017,
        target: `server${i + 1}.example.org`,
      }),
    );
    const { resolver } = resolverFor(answering(...answers));
    expect(await resolver.resolveSrv('_mongodb._tcp.cluster0.example.org')).toEqual([
      { name: 'server1.example.org', port: 27017, priority: 0, weight: 5 },
      { name: 'server2.example.org', port: 27017, priority: 0, weight: 5 },
      { name: 'server3.example.org', port: 27017, priority: 1, weight: 10 },
    ]);
  });

  test('resolveSoa returns one object and keeps 32-bit values above 2^31', async () => {
    const soa = {
      mname: 'ns1.example.com',
      rname: 'admin.example.com',
      serial: 3210987654,
      refresh: 900,
      retry: 900,
      expire: 1800,
      minimum: 3333333333,
    };
    const { resolver } = resolverFor(answering(record(N, 'SOA', soa)));
    expect(await resolver.resolveSoa(N)).toEqual({
      nsname: 'ns1.example.com',
      hostmaster: 'admin.example.com',
      serial: 3210987654,
      refresh: 900,
      retry: 900,
      expire: 1800,
      minttl: 3333333333,
    });
  });

  test('resolveCaa keys each value by its tag', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'CAA', { flags: 128, tag: 'issue', value: 'platynum.ch' }),
        record(N, 'CAA', { flags: 0, tag: 'iodef', value: 'mailto:security@example.org' }),
        record(N, 'CAA', { flags: 0, tag: '__proto__', value: 'x' }),
      ),
    );
    const records = await resolver.resolveCaa(N);
    expect(records.slice(0, 2)).toEqual([
      { critical: 128, issue: 'platynum.ch' },
      { critical: 0, iodef: 'mailto:security@example.org' },
    ]);
    expect(Object.getPrototypeOf(records[2])).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(records[2], '__proto__')?.value).toBe('x');
  });

  test('resolveNaptr renames services to service', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'NAPTR', {
          order: 30,
          preference: 50,
          flags: 'S',
          services: 'SIP+D2U',
          regexp: '',
          replacement: '_sip._udp.example.org',
        }),
      ),
    );
    expect(await resolver.resolveNaptr(N)).toEqual([
      {
        flags: 'S',
        service: 'SIP+D2U',
        regexp: '',
        replacement: '_sip._udp.example.org',
        order: 30,
        preference: 50,
      },
    ]);
  });

  test('257 records are all returned', async () => {
    const answers = Array.from({ length: 257 }, (_, i) =>
      record(N, 'A', `10.0.${i >> 8}.${i & 0xff}`, 60 + i),
    );
    const { resolver } = resolverFor(answering(...answers));
    const addresses = await resolver.resolve4(N);
    expect(addresses).toHaveLength(257);
    expect(addresses[256]).toBe('10.0.1.0');
    const packet = await resolver.query(N, 'A');
    expect(packet.answers.map((answer) => 'ttl' in answer && answer.ttl).slice(254)).toEqual([
      314, 315, 316,
    ]);
  });
});

describe('reverse', () => {
  test('queries in-addr.arpa for IPv4 and ip6.arpa for IPv6', async () => {
    const { resolver, requests } = resolverFor(({ name }) => ({
      answers: [record(name, 'PTR', 'reverse-dns-only.example')],
    }));
    expect(await resolver.reverse('127.0.0.1')).toEqual(['reverse-dns-only.example']);
    expect(await resolver.reverse('2001:db8::1')).toEqual(['reverse-dns-only.example']);
    expect(await resolver.reverse('::ffff:1.2.3.4')).toEqual(['reverse-dns-only.example']);
    expect(requests.map((request) => decodeQuery(request).questions[0])).toEqual([
      { name: '1.0.0.127.in-addr.arpa', type: 'PTR', class: 'IN', qu: false },
      {
        name: '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
        type: 'PTR',
        class: 'IN',
        qu: false,
      },
      {
        name: '4.0.3.0.2.0.1.0.f.f.f.f.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa',
        type: 'PTR',
        class: 'IN',
        qu: false,
      },
    ]);
  });

  test('follows the CNAME of a classless delegation (RFC 2317)', async () => {
    const { resolver } = resolverFor(
      answering(
        record('5.2.0.192.in-addr.arpa', 'CNAME', '5.0-63.2.0.192.in-addr.arpa'),
        record('5.0-63.2.0.192.in-addr.arpa', 'PTR', 'mail.example.org'),
      ),
    );
    expect(await resolver.reverse('192.0.2.5')).toEqual(['mail.example.org']);
  });

  test('rejects anything that is not an IP address with EINVAL, without a request', async () => {
    const { resolver, requests } = resolverFor(answering());
    for (const ip of ['bogus ip', '1.2.3', '1.2.3.256', '1.2.3.4.5', '::1::2', '', '01.2.3.4']) {
      const error = await failure(resolver.reverse(ip));
      expect(error).toMatchObject({ code: 'EINVAL', syscall: 'getHostByAddr', hostname: ip });
      expect(error.message).toBe(`getHostByAddr EINVAL ${ip}`);
    }
    expect(requests).toHaveLength(0);
  });

  test('reports NXDOMAIN as ENOTFOUND with the address as hostname', async () => {
    const { resolver } = resolverFor(() => ({ rcode: 'NXDOMAIN' }));
    expect(await failure(resolver.reverse('1.2.3.4'))).toMatchObject({
      code: 'ENOTFOUND',
      syscall: 'getHostByAddr',
      hostname: '1.2.3.4',
    });
  });
});

describe('NXDOMAIN and NODATA', () => {
  const methods = [
    ['resolve4', 'queryA'],
    ['resolve6', 'queryAaaa'],
    ['resolveCname', 'queryCname'],
    ['resolveMx', 'queryMx'],
    ['resolveNs', 'queryNs'],
    ['resolvePtr', 'queryPtr'],
    ['resolveTxt', 'queryTxt'],
    ['resolveSrv', 'querySrv'],
    ['resolveSoa', 'querySoa'],
    ['resolveCaa', 'queryCaa'],
    ['resolveNaptr', 'queryNaptr'],
  ] as const;

  test.each(methods)('%s rejects NXDOMAIN with ENOTFOUND', async (method, syscall) => {
    const { resolver } = resolverFor(() => ({ rcode: 'NXDOMAIN' }));
    const error = await failure(resolver[method]('foo.example.org'));
    expect(error).toMatchObject({ code: 'ENOTFOUND', syscall, hostname: 'foo.example.org' });
    expect(error.message).toBe(`${syscall} ENOTFOUND foo.example.org`);
    expect(error.name).toBe('Dns.QueryError');
  });

  test.each(methods)('%s rejects an empty answer with ENODATA', async (method, syscall) => {
    const { resolver } = resolverFor(() => ({
      authorities: [
        record(N, 'SOA', {
          mname: 'a',
          rname: 'b',
          serial: 1,
          refresh: 1,
          retry: 1,
          expire: 1,
          minimum: 1,
        }),
      ],
    }));
    expect(await failure(resolver[method](N))).toMatchObject({ code: 'ENODATA', syscall });
  });

  test('a CNAME to a name without TXT records is ENODATA', async () => {
    const { resolver } = resolverFor(answering(record(N, 'CNAME', 'no-txt.example.net')));
    expect(await failure(resolver.resolveTxt(N))).toMatchObject({ code: 'ENODATA' });
  });

  test('NXDOMAIN at the end of a CNAME chain is ENOTFOUND', async () => {
    const { resolver } = resolverFor(() => ({
      rcode: 'NXDOMAIN',
      answers: [record(N, 'CNAME', 'gone.example.net')],
    }));
    expect(await failure(resolver.resolveTxt(N))).toMatchObject({ code: 'ENOTFOUND' });
  });

  test('query resolves for NXDOMAIN and NODATA so the caller sees the SOA', async () => {
    const soa = record('org', 'SOA', {
      mname: 'a0.org.afilias-nst.info',
      rname: 'hostmaster.donuts.email',
      serial: 1,
      refresh: 7200,
      retry: 900,
      expire: 1209600,
      minimum: 3600,
    });
    const { resolver } = resolverFor(({ name }) => ({
      rcode: name === N ? 'NOERROR' : 'NXDOMAIN',
      authorities: [soa],
    }));
    const nodata = await resolver.query(N, 'TXT');
    expect(nodata.rcode).toBe('NOERROR');
    expect(nodata.answers).toEqual([]);
    const nxdomain = await resolver.query('missing.example.org', 'TXT');
    expect(nxdomain.rcode).toBe('NXDOMAIN');
    expect(nxdomain.authorities[0]).toMatchObject({ type: 'SOA', name: 'org', ttl: 300 });
  });

  test('query returns TTLs and the AD flag', async () => {
    const { resolver } = resolverFor(() => ({
      flags: { rd: true, ra: true, ad: true },
      answers: [record(N, 'A', '192.0.2.1', 123)],
    }));
    const packet = await resolver.query(N, 'A');
    expect(packet.flags.ad).toBe(true);
    expect(packet.answers).toEqual([
      { name: N, type: 'A', class: 'IN', ttl: 123, flush: false, data: '192.0.2.1' },
    ]);
  });
});

describe('isNotFound', () => {
  test('is true for the codes that mean there are no records', () => {
    for (const code of ['ENOTFOUND', 'ENODATA', 'EBADNAME'] as const) {
      expect(
        isNotFound(new QueryError({ code, syscall: 'queryTxt', hostname: 'example.com' })),
      ).toBe(true);
    }
  });

  test('is false for temporary failures and errors without a code', () => {
    for (const code of ['ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED'] as const) {
      expect(
        isNotFound(new QueryError({ code, syscall: 'queryTxt', hostname: 'example.com' })),
      ).toBe(false);
    }
    expect(isNotFound(new Error('ENOTFOUND'))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });

  test('reads the code of an error from node:dns or another copy of the package', () => {
    expect(isNotFound(Object.assign(new Error('queryTxt ENODATA x'), { code: 'ENODATA' }))).toBe(
      true,
    );
  });
});

describe('CNAME chains', () => {
  test('follows a chain to the records of the requested type', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'CNAME', 'b.example.net'),
        record('b.example.net', 'CNAME', 'c.example.com'),
        record('c.example.com', 'A', '192.0.2.7'),
      ),
    );
    expect(await resolver.resolve4(N)).toEqual(['192.0.2.7']);
  });

  test('ignores records owned by names outside the chain', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'CNAME', 'b.example.net'),
        record('b.example.net', 'TXT', ['wanted']),
        record('unrelated.example.com', 'TXT', ['injected']),
      ),
    );
    expect(await resolver.resolveTxt(N)).toEqual([['wanted']]);
  });

  test('ignores answers for another name when there is no chain', async () => {
    const { resolver } = resolverFor(answering(record('other.example.org', 'TXT', ['x'])));
    expect(await failure(resolver.resolveTxt(N))).toMatchObject({ code: 'ENODATA' });
  });

  test('stops at a CNAME loop', async () => {
    const { resolver } = resolverFor(
      answering(record(N, 'CNAME', 'b.example.net'), record('b.example.net', 'CNAME', N)),
    );
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'ENODATA' });
  });

  test('resolveCname returns only the first hop', async () => {
    const { resolver } = resolverFor(
      answering(
        record(N, 'CNAME', 'b.example.net'),
        record('b.example.net', 'CNAME', 'c.example.com'),
      ),
    );
    expect(await resolver.resolveCname(N)).toEqual(['b.example.net']);
  });

  test('compares names without regard to ASCII case', async () => {
    const { resolver } = resolverFor(
      answering(
        record('EXAMPLE.org', 'CNAME', 'B.Example.NET'),
        record('b.example.net', 'A', '192.0.2.9'),
      ),
    );
    expect(await resolver.resolve4('Example.ORG')).toEqual(['192.0.2.9']);
  });

  test('follows the recorded www.github.com chain to TXT records', async () => {
    const resolver = create({ fetch: doh(replay('dns.google')).fetch });
    const records = await resolver.resolveTxt('www.github.com');
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((strings) => strings.join('').startsWith('v=spf1'))).toBe(true);
  });
});

describe('server failures', () => {
  test.each([
    ['SERVFAIL', 'ESERVFAIL'],
    ['REFUSED', 'EREFUSED'],
    ['NOTIMP', 'ENOTIMP'],
    ['FORMERR', 'EFORMERR'],
    ['YXDOMAIN', 'EBADRESP'],
  ] as const)('%s is %s once every endpoint has answered it', async (rcode, code) => {
    const { resolver, requests } = resolverFor(() => ({ rcode }), {
      endpoints: ['https://a.example/dns-query', 'https://b.example/dns-query'],
    });
    expect(await failure(resolver.resolve4(N))).toMatchObject({
      code,
      syscall: 'queryA',
      hostname: N,
    });
    expect(requests).toHaveLength(2);
  });

  test('a malformed response is EBADRESP', async () => {
    const { resolver } = resolverFor(() => Uint8Array.of(1, 2, 3));
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'EBADRESP' });
  });

  test('an answer count larger than the answers is EBADRESP', async () => {
    const { resolver } = resolverFor((_, request) => {
      const bytes = respond(decodeQuery(request), { answers: [record(N, 'A', '1.2.3.4')] });
      bytes[7] = 2;
      return bytes;
    });
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'EBADRESP' });
  });

  test('a response to another question is EBADRESP', async () => {
    const { resolver } = resolverFor(() =>
      respond(
        { id: 0, questions: [{ name: 'evil.example', type: 'A' }] },
        { answers: [record('evil.example', 'A', '6.6.6.6')] },
      ),
    );
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'EBADRESP' });
    const wrongType = resolverFor((_, request) =>
      respond(decodeQuery(request), {
        questions: [{ name: N, type: 'AAAA' }],
        answers: [record(N, 'A', '1.2.3.4')],
      }),
    );
    expect(await failure(wrongType.resolver.resolve4(N))).toMatchObject({ code: 'EBADRESP' });
  });

  test('a query echoed back instead of a response is EBADRESP', async () => {
    const { resolver } = resolverFor((_, request) => {
      const value = new URL(request.url).searchParams.get('dns')!;
      const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    });
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'EBADRESP' });
  });

  test('a truncated response is EBADRESP, and the data in it is not used', async () => {
    const { resolver, requests } = resolverFor(
      () => ({
        flags: { tc: true, rd: true, ra: true },
        answers: [record(N, 'TXT', ['v=spf1 include:a'])],
      }),
      { endpoints: ['https://a.example/', 'https://b.example/'] },
    );
    const error = await failure(resolver.resolveTxt(N));
    expect(error.code).toBe('EBADRESP');
    expect(requests).toHaveLength(2);
  });

  test('an HTTP error status is EBADRESP, with the status in the cause', async () => {
    const { resolver } = resolverFor(() => new Response('Bad Request', { status: 400 }));
    const error = await failure(resolver.resolve4(N));
    expect(error.code).toBe('EBADRESP');
    expect(String(error.cause)).toContain('400');
  });

  test('a fetch that rejects is ECONNREFUSED, with the fetch error as cause', async () => {
    const cause = new TypeError('fetch failed');
    const { resolver } = resolverFor(() => cause);
    const error = await failure(resolver.resolveMx(N));
    expect(error).toMatchObject({ code: 'ECONNREFUSED', syscall: 'queryMx', hostname: N });
    expect(error.cause).toBe(cause);
  });
});

describe('endpoints', () => {
  test('uses Cloudflare, then Google, by default', async () => {
    const { resolver, requests } = resolverFor(() => new TypeError('offline'));
    await failure(resolver.resolve4(N));
    expect(requests.map((request) => new URL(request.url).host)).toEqual([
      'cloudflare-dns.com',
      'dns.google',
    ]);
  });

  test('tries the next endpoint after a failure and stops at the first answer', async () => {
    const endpoints = ['https://a.example/q', 'https://b.example/q', 'https://c.example/q'];
    const { resolver, requests } = resolverFor(
      (_, request) =>
        request.url.startsWith('https://a.example')
          ? { rcode: 'SERVFAIL' }
          : { answers: [record(N, 'A', '192.0.2.1')] },
      { endpoints },
    );
    expect(await resolver.resolve4(N)).toEqual(['192.0.2.1']);
    expect(requests.map((request) => new URL(request.url).host)).toEqual([
      'a.example',
      'b.example',
    ]);
  });

  test('tries the next endpoint after a network error', async () => {
    const { resolver } = resolverFor(
      (_, request) =>
        request.url.startsWith('https://a.example')
          ? new TypeError('fetch failed')
          : { answers: [record(N, 'A', '192.0.2.1')] },
      { endpoints: ['https://a.example/', 'https://b.example/'] },
    );
    expect(await resolver.resolve4(N)).toEqual(['192.0.2.1']);
  });

  test('does not try the next endpoint after NXDOMAIN or NODATA', async () => {
    const { resolver, requests } = resolverFor(
      ({ type }) => ({ rcode: type === 'A' ? 'NXDOMAIN' : 'NOERROR' }),
      {
        endpoints: ['https://a.example/', 'https://b.example/'],
      },
    );
    await failure(resolver.resolve4(N));
    await failure(resolver.resolve6(N));
    expect(requests).toHaveLength(2);
  });

  test('the last failure decides the code', async () => {
    const { resolver } = resolverFor(
      (_, request) =>
        request.url.startsWith('https://a.example') ? { rcode: 'SERVFAIL' } : { rcode: 'REFUSED' },
      { endpoints: ['https://a.example/', 'https://b.example/'] },
    );
    expect(await failure(resolver.resolve4(N))).toMatchObject({ code: 'EREFUSED' });
  });

  test('two resolvers keep their own endpoints and fetch', async () => {
    const one = resolverFor(answering(record(N, 'A', '192.0.2.1')), {
      endpoints: ['https://one.example/'],
    });
    const two = resolverFor(answering(record(N, 'A', '192.0.2.2')), {
      endpoints: ['https://two.example/'],
    });
    expect(await Promise.all([one.resolver.resolve4(N), two.resolver.resolve4(N)])).toEqual([
      ['192.0.2.1'],
      ['192.0.2.2'],
    ]);
    expect(new URL(one.requests[0]!.url).host).toBe('one.example');
    expect(new URL(two.requests[0]!.url).host).toBe('two.example');
  });

  test('rejects an empty endpoint list, a bad URL and a bad timeout', () => {
    expect(() => create({ endpoints: [] })).toThrow(RangeError);
    expect(() => create({ endpoints: ['not a url'] })).toThrow(TypeError);
    for (const timeout of [0, -1, Number.NaN, 2 ** 31, Infinity]) {
      expect(() => create({ timeout })).toThrow(RangeError);
    }
    for (const timeout of [1, 2 ** 31 - 1]) {
      expect(() => create({ timeout })).not.toThrow();
    }
  });
});

describe('requests', () => {
  test('sends a GET with the query as unpadded base64url, an ID of 0, and RD and AD set', async () => {
    const { resolver, requests } = resolverFor(answering(record(N, 'TXT', ['x'])), {
      endpoints: ['https://doh.example/dns-query?ct=1'],
    });
    await resolver.resolveTxt(N);
    const [request] = requests;
    expect(request!.method).toBe('GET');
    expect(request!.headers.get('accept')).toBe('application/dns-message');
    const url = new URL(request!.url);
    expect(url.origin + url.pathname).toBe('https://doh.example/dns-query');
    expect(url.searchParams.get('ct')).toBe('1');
    expect(url.searchParams.get('dns')).toMatch(/^[\w-]+$/);
    const query = decodeQuery(request!);
    expect(query).toMatchObject({ id: 0, type: 'query', flags: { rd: true, ad: true, cd: false } });
    expect(query.questions).toEqual([{ name: N, type: 'TXT', class: 'IN', qu: false }]);
  });

  test('encodes the query as base64url, never with +, / or =', async () => {
    const { resolver, requests } = resolverFor(({ name }) => ({
      answers: [record(name, 'A', '1.1.1.1')],
    }));
    const names = [1, 2, 3].flatMap((prefix) =>
      [62, 63].map((length) => `${'a'.repeat(prefix)}.${'b'.repeat(length)}.example`),
    );
    for (const name of names) {
      await resolver.resolve4(name);
    }
    const standard = requests.map((request) => {
      const value = new URL(request.url).searchParams.get('dns')!;
      expect(value).toMatch(/^[\w-]+$/);
      return value.replaceAll('-', '+').replaceAll('_', '/');
    });
    expect(standard.some((value) => /[+/]/.test(value))).toBe(true);
    expect(requests.map((request) => decodeQuery(request).questions[0]!.name)).toEqual(names);
  });

  test('converts internationalized names to punycode with IDNA 2008 rules', async () => {
    const { resolver, requests } = resolverFor(({ name }) => ({
      answers: [record(name, 'A', '1.1.1.1')],
    }));
    expect(await resolver.resolve4('münchen.de')).toEqual(['1.1.1.1']);
    await resolver.resolve4('straße.de');
    expect(requests.map((request) => decodeQuery(request).questions[0]!.name)).toEqual([
      'xn--mnchen-3ya.de',
      'xn--strae-oqa.de',
    ]);
  });

  test('accepts a trailing dot, the root, and names with _, *, / and -', async () => {
    const { resolver, requests } = resolverFor(({ name }) => ({
      answers: [record(name, 'TXT', ['ok'])],
    }));
    await resolver.resolveTxt('example.org.');
    await resolver.resolveTxt('');
    await resolver.resolveTxt('_dmarc.Example.ORG');
    await resolver.resolveTxt('*.example.org');
    await resolver.resolveTxt('0/26.2.0.192.in-addr.arpa');
    await resolver.resolveTxt('-x.example.org');
    expect(requests.map((request) => decodeQuery(request).questions[0]!.name)).toEqual([
      N,
      '.',
      '_dmarc.Example.ORG',
      '*.example.org',
      '0/26.2.0.192.in-addr.arpa',
      '-x.example.org',
    ]);
  });

  test('rejects names with empty labels, long labels, or characters other than A-Z, a-z, 0-9, -, _, *, /, . and backslash escapes with EBADNAME', async () => {
    const { resolver, requests } = resolverFor(answering());
    const names = [
      'foo..com',
      `${'a'.repeat(64)}.com`,
      `${'a.'.repeat(128)}com`,
      'é/x.com',
      'ex ämple.com',
      '.example.org',
      '..',
      ',.,.',
      '::1',
      'with space.org',
      'evil.example?x',
    ];
    for (const name of names) {
      expect(await failure(resolver.resolve4(name))).toMatchObject({
        code: 'EBADNAME',
        syscall: 'queryA',
        hostname: name,
      });
    }
    expect(requests).toHaveLength(0);
  });

  test('answers ENOTFOUND for .onion names without a request (RFC 7686)', async () => {
    const { resolver, requests } = resolverFor(answering());
    for (const name of ['foo.onion', 'a.b.ONION', 'foo.onion.']) {
      expect(await failure(resolver.resolveMx(name))).toMatchObject({
        code: 'ENOTFOUND',
        syscall: 'queryMx',
        hostname: name,
        message: `queryMx ENOTFOUND ${name}`,
      });
    }
    expect(await resolver.resolveMx('onion.example').catch(() => 'sent')).toBe('sent');
    expect(requests).toHaveLength(1);
  });

  test('rejects a name that is not a string with a TypeError', async () => {
    const { resolver } = resolverFor(answering());
    for (const name of [[], undefined, 1]) {
      await expect(resolver.resolveNs(name as unknown as string)).rejects.toBeInstanceOf(TypeError);
    }
  });
});

describe('timeouts and cancellation', () => {
  test('an endpoint that does not answer within timeout is ETIMEOUT', async () => {
    const { resolver } = resolverFor(() => 'hang', { timeout: 20 });
    const error = await failure(resolver.resolve4('nodejs.org'));
    expect(error).toMatchObject({ code: 'ETIMEOUT', syscall: 'queryA', hostname: 'nodejs.org' });
  });

  test('a timed-out endpoint is followed by the next one', async () => {
    const { resolver } = resolverFor(
      (_, request) =>
        request.url.startsWith('https://slow.example')
          ? 'hang'
          : { answers: [record(N, 'A', '192.0.2.1')] },
      { endpoints: ['https://slow.example/', 'https://fast.example/'], timeout: 20 },
    );
    expect(await resolver.resolve4(N)).toEqual(['192.0.2.1']);
  });

  test('aborting the signal rejects with its reason and skips the remaining endpoints', async () => {
    const controller = new AbortController();
    const { resolver, requests } = resolverFor(
      () => {
        queueMicrotask(() => controller.abort(new Error('stop')));
        return 'hang';
      },
      { endpoints: ['https://a.example/', 'https://b.example/'] },
    );
    const results = await Promise.allSettled(
      ['example1.org', 'example2.org'].map((name) =>
        resolver.resolve4(name, { signal: controller.signal }),
      ),
    );
    for (const result of results) {
      expect(result).toMatchObject({ status: 'rejected', reason: new Error('stop') });
    }
    expect(requests.every((request) => request.url.startsWith('https://a.example/'))).toBe(true);
  });

  test('an already aborted signal rejects without a request', async () => {
    const { resolver, requests } = resolverFor(answering());
    const signal = AbortSignal.abort();
    await expect(resolver.resolveTxt(N, { signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(resolver.reverse('1.2.3.4', { signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(resolver.query(N, 'A', { signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toHaveLength(0);
  });
});

describe('recorded responses', () => {
  const servers = ['cloudflare-dns.com', 'dns.google'] as const;

  test.each(servers)('%s answers decode into node:dns shapes', async (server) => {
    const resolver = create({ fetch: doh(replay(server)).fetch });
    const gmailMx = await resolver.resolveMx('gmail.com');
    expect(gmailMx.map((mx) => mx.exchange).sort()[0]).toBe('alt1.gmail-smtp-in.l.google.com');
    const dmarc = await resolver.resolveTxt('_dmarc.gmail.com');
    expect(dmarc[0]!.join('')).toMatch(/^v=DMARC1;/);
    const [dkim] = await resolver.resolveTxt('google._domainkey.github.com');
    expect(dkim).toHaveLength(2);
    expect(dkim!.join('')).toMatch(/^v=DKIM1;.*p=[\w+/]+={0,2}$/);
    expect(await resolver.reverse('1.1.1.1')).toEqual(['one.one.one.one']);
    expect(await resolver.reverse('8.8.8.8')).toEqual(['dns.google']);
    expect((await resolver.resolveSoa('cloudflare.com')).nsname).toMatch(/cloudflare\.com$/);
    expect((await resolver.resolveCaa('google.com'))[0]).toEqual({
      critical: 0,
      issue: 'pki.goog',
    });
    expect((await resolver.resolveSrv('_imaps._tcp.gmail.com'))[0]).toEqual({
      name: 'imap.gmail.com',
      port: 993,
      priority: 5,
      weight: 0,
    });
    expect(await failure(resolver.resolveTxt('does-not-exist.example.com'))).toMatchObject({
      code: 'ENODATA',
    });
    expect(await failure(resolver.resolve4('nxdomain.portable-test.invalid'))).toMatchObject({
      code: 'ENOTFOUND',
    });
    expect(await failure(resolver.resolve6('github.com'))).toMatchObject({ code: 'ENODATA' });
  });
});

test('a plain object of functions fits the Resolver type, as create does', () => {
  const fake = {
    resolve4: async () => ['192.0.2.1'],
    resolve6: async () => [],
    resolveCname: async () => [],
    resolveMx: async () => [{ exchange: 'mx.example.org', priority: 10 }],
    resolveNs: async () => [],
    resolvePtr: async () => [],
    resolveTxt: async () => [['v=spf1 -all']],
    resolveSrv: async () => [],
    resolveSoa: async () => ({
      nsname: '',
      hostmaster: '',
      serial: 0,
      refresh: 0,
      retry: 0,
      expire: 0,
      minttl: 0,
    }),
    resolveCaa: async () => [],
    resolveNaptr: async () => [],
    reverse: async () => [],
  } satisfies Resolver;
  const ours = create() satisfies Resolver;
  expect(Object.keys(fake).every((key) => typeof ours[key as keyof Resolver] === 'function')).toBe(
    true,
  );
});
