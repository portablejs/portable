import { describe, expect, test } from 'vite-plus/test';
import {
  InvalidInputError,
  TruncatedError,
  UnsupportedError,
  decode,
  encode,
  type DecodedOptRecord,
  type EdnsOption,
  type Packet,
  type ResourceRecord,
} from '@portable/dns-packet';
import responses from './fixtures/responses.json' with { type: 'json' };
import {
  PREFIX_OFFSET,
  decodeNameAfter,
  decodeQuestionName,
  hex,
  nameBytes,
  roundTrip,
  roundTripData,
  roundTripRecord,
  utf8,
} from './utils.js';

const invalid = (value: unknown): Packet => value as Packet;

describe('dns-packet cases', () => {
  test('unknown', () => {
    expect(roundTripData('TYPE4242', utf8('hello world'))).toEqual(utf8('hello world'));
  });

  test('txt', () => {
    expect(roundTripData('TXT', [])).toEqual([]);
    expect(roundTripData('TXT', ['hello world'])).toEqual([utf8('hello world')]);
    expect(roundTripData('TXT', ['hello', 'world'])).toEqual([utf8('hello'), utf8('world')]);
    const binary = Uint8Array.of(0, 1, 2, 3, 4, 5);
    expect(roundTripData('TXT', [binary])).toEqual([binary]);
    expect(roundTripData('TXT', ['a', 'b', binary])).toEqual([utf8('a'), utf8('b'), binary]);
    expect(roundTripData('TXT', ['', new Uint8Array(0)])).toEqual([
      new Uint8Array(0),
      new Uint8Array(0),
    ]);
  });

  test('txt with one string', () => {
    expect(roundTripData('TXT', ['hi'])).toEqual([utf8('hi')]);
    const data = Uint8Array.of(0, 1, 2, 3, 4, 5);
    expect(roundTripData('TXT', [data])).toEqual([data]);
  });

  test('txt with invalid data', () => {
    for (const data of [null, undefined, 10, 'not an array', [10]]) {
      const packet = invalid({ answers: [{ type: 'TXT', name: 'a.com', data }] });
      expect(() => encode(packet)).toThrow(InvalidInputError);
    }
  });

  test('null', () => {
    const data = Uint8Array.of(0, 1, 2, 3, 4, 5);
    expect(roundTripData('NULL', data)).toEqual(data);
  });

  test('hinfo', () => {
    const data = { cpu: 'intel', os: 'best one' };
    expect(roundTripData('HINFO', data)).toEqual(data);
  });

  test('ptr, cname, dname and ns', () => {
    expect(roundTripData('PTR', 'hello.world.com')).toBe('hello.world.com');
    expect(roundTripData('CNAME', 'hello.cname.world.com')).toBe('hello.cname.world.com');
    expect(roundTripData('DNAME', 'hello.dname.world.com')).toBe('hello.dname.world.com');
    expect(roundTripData('NS', 'ns.world.com')).toBe('ns.world.com');
  });

  test('srv', () => {
    const data = { priority: 42, weight: 10, port: 9999, target: 'hello.world.com' };
    expect(roundTripData('SRV', data)).toEqual(data);
  });

  test('caa', () => {
    const critical = { flags: 128, tag: 'issue', value: 'letsencrypt.org' };
    expect(roundTripData('CAA', critical)).toEqual(critical);
    const plain = { flags: 0, tag: 'issue', value: 'letsencrypt.org' };
    expect(roundTripData('CAA', plain)).toEqual(plain);
  });

  test('mx', () => {
    const data = { preference: 10, exchange: 'mx.hello.world.com' };
    expect(roundTripData('MX', data)).toEqual(data);
  });

  test('soa', () => {
    const data = {
      mname: 'hello.world.com',
      rname: 'root.hello.world.com',
      serial: 2018010400,
      refresh: 14400,
      retry: 3600,
      expire: 604800,
      minimum: 3600,
    };
    expect(roundTripData('SOA', data)).toEqual(data);
  });

  test('sshfp', () => {
    const data = {
      algorithm: 1,
      fingerprintType: 1,
      fingerprint: hex('a108c9f834354d5b37af988141c9294822f5bc00'),
    };
    expect(roundTripData('SSHFP', data)).toEqual(data);
  });

  test('a and aaaa', () => {
    expect(roundTripData('A', '127.0.0.1')).toBe('127.0.0.1');
    expect(roundTripData('AAAA', 'fe80::1')).toBe('fe80::1');
  });

  test('query', () => {
    const decoded = roundTrip({
      type: 'query',
      id: 42,
      questions: [
        { type: 'A', class: 'CH', name: 'hello.a.com' },
        { type: 'SRV', name: 'hello.srv.com' },
      ],
    });
    expect(decoded).toMatchObject({
      type: 'query',
      id: 42,
      questions: [
        { type: 'A', class: 'CH', name: 'hello.a.com', qu: false },
        { type: 'SRV', class: 'IN', name: 'hello.srv.com', qu: false },
      ],
    });
    expect(roundTrip({ questions: [{ type: 'A', name: 'a.com' }] }).id).toBe(0);
  });

  test('response', () => {
    const decoded = roundTrip({
      type: 'response',
      id: 100,
      flags: { tc: true },
      answers: [
        { type: 'A', class: 'IN', flush: true, name: 'hello.a.com', data: '127.0.0.1' },
        {
          type: 'SRV',
          name: 'hello.srv.com',
          data: { priority: 0, weight: 0, port: 9090, target: 'hello.target.com' },
        },
        { type: 'CNAME', name: 'hello.cname.com', data: 'hello.other.domain.com' },
        { type: 'NULL', name: 'hello.null.com', data: Uint8Array.of(1, 2, 3, 4, 5) },
        { type: 'TXT', name: 'emptytxt.com', data: [''] },
      ],
      additionals: [
        { type: 'AAAA', name: 'hello.a.com', data: 'fe80::1' },
        { type: 'PTR', name: 'hello.ptr.com', data: 'hello.other.ptr.com' },
      ],
    });
    expect(decoded.flags.tc).toBe(true);
    expect(decoded.answers[0]).toEqual({
      type: 'A',
      class: 'IN',
      flush: true,
      ttl: 0,
      name: 'hello.a.com',
      data: '127.0.0.1',
    });
    expect(decoded.answers[4]).toMatchObject({ data: [new Uint8Array(0)] });
    expect(decoded.additionals.map((record) => record.type)).toEqual(['AAAA', 'PTR']);
  });

  test('rcode and opcode', () => {
    const rcodes = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'];
    rcodes.push('YXDOMAIN', 'YXRRSET', 'NXRRSET', 'NOTAUTH', 'NOTZONE', 'DSOTYPENI');
    rcodes.push('RCODE12', 'RCODE13', 'RCODE14', 'RCODE15');
    const bytes = rcodes.map((rcode) => encode(invalid({ rcode })));
    rcodes.forEach((rcode, code) => {
      expect(bytes[code]![3]! & 0xf).toBe(code);
      expect(decode(bytes[code]!).rcode).toBe(rcode);
    });

    const opcodes = ['QUERY', 'IQUERY', 'STATUS', 'OPCODE3', 'NOTIFY', 'UPDATE', 'DSO'];
    for (let code = 7; code < 16; code++) {
      opcodes.push(`OPCODE${code}`);
    }
    opcodes.forEach((opcode, code) => {
      const encoded = encode(invalid({ opcode }));
      expect((encoded[2]! >> 3) & 0xf).toBe(code);
      expect(decode(encoded).opcode).toBe(opcode);
    });

    const header = decode(hex('b24084800000000000000000'));
    expect(header).toMatchObject({
      id: 45632,
      type: 'response',
      opcode: 'QUERY',
      rcode: 'NOERROR',
      flags: { aa: true, tc: false, rd: false, ra: true, ad: false, cd: false },
    });
    expect(encode({ id: 45632, type: 'response', flags: { aa: true, ra: true } })).toEqual(
      hex('b24084800000000000000000'),
    );
  });

  test('name encoding', () => {
    expect(nameBytes('foo.example.com')).toEqual(utf8('\x03foo\x07example\x03com\x00'));
    expect(decodeQuestionName([...nameBytes('foo.example.com')])).toBe('foo.example.com');
    expect(nameBytes('com')).toHaveLength(5);
    expect(nameBytes('example.com.')).toEqual(nameBytes('example.com'));
    expect(decodeQuestionName([...nameBytes('example.com.')])).toBe('example.com');
    expect(nameBytes('.')).toEqual(Uint8Array.of(0));
    expect(decodeQuestionName([0])).toBe('.');
    expect(nameBytes('a.b.c.d.example.com')).toHaveLength(21);
    expect(nameBytes('a\\.b.c.d.example.com')).toEqual(
      utf8('\x03a.b\x01c\x01d\x07example\x03com\x00'),
    );
    expect(nameBytes('a\\.b\\.c.d.example.com')).toHaveLength(21);
    expect(nameBytes('root\\.mail')).toEqual(utf8('\x09root.mail\x00'));

    for (const rname of [
      'a.b.c.d.example.com',
      'a\\.b.c.d.example.com',
      'a\\.b\\.c.d.example.com',
      'root\\.mail',
    ]) {
      const soa = { mname: '.', rname, serial: 0, refresh: 0, retry: 0, expire: 0, minimum: 0 };
      expect(roundTripData('SOA', soa)).toEqual(soa);
    }
  });

  test('an RDATA field that is too short throws InvalidInputError with the TruncatedError as cause', () => {
    const bytes = hex('00008180000000010000000000000f000100000000000101');
    const error = (() => {
      try {
        decode(bytes);
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as Error).cause).toBeInstanceOf(TruncatedError);
  });

  test('name decoding', () => {
    expect(() => decodeQuestionName([0x80])).toThrow(InvalidInputError);
    expect(() => decodeQuestionName([0xb0])).toThrow(InvalidInputError);

    for (const name of [[], [0x01, 0x00], [0x01], [0xc0]]) {
      const bytes = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...name]);
      expect(() => decode(bytes)).toThrow(TruncatedError);
    }

    expect(() => decodeQuestionName([0xc0, 12])).toThrow(InvalidInputError);
    expect(() => decodeQuestionName([0xc0, 13])).toThrow(InvalidInputError);

    const labels = (count: number) => Array.from({ length: count }, () => [0x01, 0x61]).flat();
    expect(decodeQuestionName([...labels(127), 0])).toBe(Array(127).fill('a').join('.'));
    expect(() => decodeQuestionName([...labels(128), 0])).toThrow(InvalidInputError);

    const jumpBack = [...labels(100), 0xc0, PREFIX_OFFSET];
    expect(() => decodeNameAfter([...labels(100), 0], jumpBack)).toThrow(InvalidInputError);

    expect(decodeNameAfter([0], [0x01, 0x61, 0xc0, PREFIX_OFFSET])).toBe('a');

    const chain = [0, 0];
    for (let at = PREFIX_OFFSET + 2; at + 2 < 0x4000; at += 2) {
      const target = at - 2;
      chain.push(0xc0 | (target >> 8), target & 0xff);
    }
    const last = PREFIX_OFFSET + chain.length - 2;
    expect(decodeNameAfter(chain, [0xc0 | (last >> 8), last & 0xff])).toBe('.');
  });

  test('stream', () => {
    const packet = {
      id: 45632,
      flags: { aa: true, ra: true },
      answers: [{ type: 'A', name: 'test2.example.net', data: '198.51.100.1' }],
    } satisfies Packet;
    const framed = encode(packet, { framing: 'tcp' });
    expect(framed.subarray(2)).toEqual(encode(packet));
    expect((framed[0]! << 8) | framed[1]!).toBe(framed.length - 2);
    expect(decode(framed, { framing: 'tcp' })).toMatchObject({
      id: 45632,
      flags: { aa: true, ra: true },
      answers: [{ type: 'A', name: 'test2.example.net', data: '198.51.100.1' }],
    });
  });

  test('opt', () => {
    const question = { type: 'A', name: 'hello.a.com' } as const;
    expect(
      roundTrip({ questions: [question], additionals: [{ type: 'OPT', udpPayloadSize: 1024 }] })
        .additionals[0],
    ).toEqual({
      type: 'OPT',
      name: '.',
      udpPayloadSize: 1024,
      extendedRcode: 0,
      version: 0,
      dnssecOk: false,
      options: [],
    });

    const options = [
      { code: 'CLIENT_SUBNET', ip: 'fe80::', sourcePrefixLength: 64, scopePrefixLength: 0 },
      { code: 'CLIENT_SUBNET', ip: '5.6.0.0', sourcePrefixLength: 16, scopePrefixLength: 16 },
      { code: 'PADDING', length: 31 },
      { code: 'TCP_KEEPALIVE' },
      { code: 'TCP_KEEPALIVE', timeout: 150 },
      { code: 'KEY_TAG', tags: [1, 82, 987] },
    ] satisfies EdnsOption[];
    const opt = roundTrip({
      questions: [question],
      additionals: [
        {
          type: 'OPT',
          name: '.',
          udpPayloadSize: 1024,
          dnssecOk: true,
          extendedRcode: 0x80,
          options,
        },
      ],
    }).additionals[0] as DecodedOptRecord;
    expect(opt).toMatchObject({ dnssecOk: true, extendedRcode: 0x80 });
    expect(opt.options).toEqual(options);
  });

  test('dnskey', () => {
    const data = { flags: 0x8000 | 0x80, algorithm: 1, key: Uint8Array.of(0, 1, 2, 3, 4, 5) };
    expect(roundTripData('DNSKEY', data)).toEqual(data);
  });

  test('rrsig', () => {
    const data = {
      typeCovered: 'A',
      algorithm: 1,
      labels: 2,
      originalTTL: 3600,
      expiration: 1234,
      inception: 1233,
      keyTag: 2345,
      signersName: 'foo.com',
      signature: Uint8Array.of(0, 1, 2, 3, 4, 5),
    };
    expect(roundTripData('RRSIG', data)).toEqual(data);

    const bytes = encode(invalid({ answers: [{ type: 'RRSIG', name: '.', data }] }));
    expect(decode(Uint8Array.from([...bytes, 1, 2, 3, 4])).answers[0]).toMatchObject({ data });
  });

  test('rp', () => {
    for (const data of [
      { mbox: 'foo.bar.com', txt: 'baz.bar.com' },
      { mbox: 'foo.bar.com', txt: '.' },
      { mbox: '.', txt: 'baz.bar.com' },
      { mbox: '.', txt: '.' },
    ]) {
      expect(roundTripData('RP', data)).toEqual(data);
    }
  });

  test('nsec', () => {
    for (const types of [
      ['A', 'DNSKEY', 'CAA', 'DLV'],
      ['TXT'],
      ['TKEY'],
      ['RRSIG', 'NSEC'],
      ['TXT', 'RRSIG'],
      ['TXT', 'NSEC'],
    ]) {
      const data = { nextDomain: 'foo.com', types };
      expect(roundTripData('NSEC', data)).toEqual(data);
    }

    // The sample NSEC record from RFC 4034 section 4.3.
    const message = hex(
      '000084000000000100000000' +
        '00002f00010000000a' +
        '003704686f7374076578616d706c6503636f6d00' +
        '0006400100000003041b000000000000000000000000000000000000000000000000000020',
    );
    expect(decode(message).answers[0]).toMatchObject({
      data: { nextDomain: 'host.example.com', types: ['A', 'MX', 'RRSIG', 'NSEC', 'TYPE1234'] },
    });
    expect(encode(decode(message))).toEqual(message);
  });

  test('nsec3', () => {
    const data = {
      algorithm: 1,
      flags: 0,
      iterations: 257,
      salt: Uint8Array.of(42, 42, 42),
      nextHashedOwner: Uint8Array.from({ length: 20 }, (_, i) => i),
      types: ['A', 'DNSKEY', 'CAA', 'DLV'],
    };
    expect(roundTripData('NSEC3', data)).toEqual(data);
  });

  test('ds', () => {
    const data = { keyTag: 1234, algorithm: 1, digestType: 1, digest: Uint8Array.of(0, 1, 2, 3) };
    expect(roundTripData('DS', data)).toEqual(data);
    expect(roundTripData('CDS', data)).toEqual(data);
  });

  test('naptr', () => {
    const data = {
      order: 1,
      preference: 1,
      flags: 'S',
      services: 'SIP+D2T',
      regexp: '!^.*$!sip:customer-service@xuexample.com!',
      replacement: '_sip._udp.xuexample.com',
    };
    expect(roundTripData('NAPTR', data)).toEqual(data);
  });

  test('tlsa', () => {
    const data = { usage: 3, selector: 1, matchingType: 1, certificate: Uint8Array.of(0, 1, 2, 3) };
    expect(roundTripData('TLSA', data)).toEqual(data);
  });

  test('unpack', () => {
    const framed = hex(
      '0079dead85000001000100020002026f6a0562616e676a03636f6d0000010001c00c' +
        '0001000100000e10000481fa0baac00f0002000100000e10000502636ac00fc00f' +
        '0002000100000e100002c00cc03a0001000100000e100004454d9b9cc00c001c00' +
        '0100000e10001020010418000050000000000000000001f9',
    );
    const packet = decode(framed, { framing: 'tcp' });
    expect(packet.rcode).toBe('NOERROR');
    expect(packet.answers[0]).toMatchObject({
      type: 'A',
      name: 'oj.bangj.com',
      data: '129.250.11.170',
    });
    expect(packet.authorities[1]).toMatchObject({
      type: 'NS',
      name: 'bangj.com',
      data: 'oj.bangj.com',
    });
  });

  test('option codes', () => {
    const codes = [
      [0, 'OPTION0'],
      [1, 'LLQ'],
      [2, 'UL'],
      [3, 'NSID'],
      [4, 'OPTION4'],
      [5, 'DAU'],
      [6, 'DHU'],
      [7, 'N3U'],
      [9, 'EXPIRE'],
      [10, 'COOKIE'],
      [13, 'CHAIN'],
      [15, 'EDE'],
      [26946, 'DEVICEID'],
      [65535, 'OPTION65535'],
      [64000, 'OPTION64000'],
      [65002, 'OPTION65002'],
    ] satisfies [number, string][];
    for (const [number, code] of codes) {
      const options = [{ code, data: Uint8Array.of(1) }] as EdnsOption[];
      const bytes = encode({ additionals: [{ type: 'OPT', options }] });
      expect((bytes[23]! << 8) | bytes[24]!).toBe(number);
      expect((decode(bytes).additionals[0] as DecodedOptRecord).options).toEqual(options);
    }
    const unknownCode = invalid({
      additionals: [
        { type: 'OPT', options: [{ code: 'INVALIDINVALID', data: new Uint8Array(0) }] },
      ],
    });
    expect(() => encode(unknownCode)).toThrow(InvalidInputError);
  });
});

describe('known upstream issues', () => {
  test('a label over 63 bytes is rejected instead of corrupting the length byte', () => {
    expect(() => nameBytes(`${'a'.repeat(64)}.com`)).toThrow(InvalidInputError);
    expect(nameBytes(`${'a'.repeat(63)}.com`)).toHaveLength(69);
  });

  test('a TXT string over 255 bytes is rejected instead of truncating its length byte', () => {
    expect(() => roundTripData('TXT', ['x'.repeat(256)])).toThrow(InvalidInputError);
    expect(roundTripData('TXT', ['x'.repeat(255)])).toEqual([utf8('x'.repeat(255))]);
  });

  test('an empty label is rejected instead of ending the name early', () => {
    expect(() => nameBytes('a..b')).toThrow(InvalidInputError);
  });

  test('a name over 255 bytes is rejected', () => {
    expect(() => nameBytes(Array(128).fill('a').join('.'))).toThrow(InvalidInputError);
  });

  test('an invalid name throws before any bytes are produced (CVE-2021-23386)', () => {
    expect(() => encode({ questions: [{ type: 'A', name: `ü${'a'.repeat(62)}.com` }] })).toThrow(
      InvalidInputError,
    );
    expect(nameBytes('bücher.example')).toEqual(utf8('\x07bücher\x07example\x00'));
  });

  test('the mDNS QU bit is decoded as qu instead of an unknown class', () => {
    const bytes = encode({ questions: [{ type: 'PTR', name: '_http._tcp.local', qu: true }] });
    expect(bytes.at(-2)).toBe(0x80);
    expect(decode(bytes).questions[0]).toEqual({
      type: 'PTR',
      name: '_http._tcp.local',
      class: 'IN',
      qu: true,
    });
  });

  test('RDLENGTH is checked against the record data', () => {
    const a = encode({ answers: [{ type: 'A', name: '.', data: '192.0.2.1' }] });
    const longer = Uint8Array.from([...a, 0]);
    longer[longer.length - 6] = 5;
    expect(() => decode(longer)).toThrow(InvalidInputError);
    const shorter = a.slice(0, -1);
    shorter[shorter.length - 4] = 3;
    expect(() => decode(shorter)).toThrow(InvalidInputError);

    const mx = encode({
      answers: [{ type: 'MX', name: '.', data: { preference: 1, exchange: 'mx.example' } }],
    });
    const padded = Uint8Array.from([...mx, 0]);
    padded[padded.length - 16] = 15;
    expect(() => decode(padded)).toThrow(InvalidInputError);
  });

  test('IPv6 addresses are formatted as RFC 5952 recommends', () => {
    expect(roundTripData('AAAA', '2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(roundTripData('AAAA', '2001:db8:0:1:0:0:0:1')).toBe('2001:db8:0:1::1');
    expect(roundTripData('AAAA', '2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
    expect(roundTripData('AAAA', '::')).toBe('::');
    expect(roundTripData('AAAA', '::ffff:192.0.2.1')).toBe('::ffff:192.0.2.1');
    expect(roundTripData('AAAA', '::ffff:c000:201')).toBe('::ffff:192.0.2.1');
    expect(roundTripData('AAAA', '::c000:201')).toBe('::c000:201');
    expect(roundTripData('AAAA', '::fffe:c000:201')).toBe('::fffe:c000:201');
    expect(roundTripData('AAAA', 'FE80::ABCD')).toBe('fe80::abcd');
  });

  test('invalid IP addresses are rejected instead of encoded as garbage', () => {
    for (const ip of ['1.2.3', '1.2.3.256', 'a.b.c.d', '', '300.1.1.1', '010.0.0.1', '1.2.3.00']) {
      expect(() => roundTripData('A', ip)).toThrow(InvalidInputError);
    }
    for (const ip of [
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      'g::1',
      '::1.2.3',
      '1:2:3:4:5:6:7',
      '::ffff:010.0.0.1',
    ]) {
      expect(() => roundTripData('AAAA', ip)).toThrow(InvalidInputError);
    }
  });

  test('unknown type and class names are rejected instead of encoded as 0', () => {
    expect(() => encode(invalid({ questions: [{ type: 'AAA', name: 'a.com' }] }))).toThrow(
      InvalidInputError,
    );
    expect(() =>
      encode(invalid({ questions: [{ type: 'A', class: 'INTERNET', name: 'a.com' }] })),
    ).toThrow(InvalidInputError);
  });

  test('encode does not modify its input', () => {
    const packet = {
      answers: [{ type: 'CAA', name: 'a.com', data: { flags: 128, tag: 'issue', value: 'ca' } }],
    } satisfies Packet;
    const copy = structuredClone(packet);
    encode(packet);
    expect(packet).toEqual(copy);
  });

  test('TCP framing with fewer than 2 bytes throws TruncatedError', () => {
    expect(() => decode(new Uint8Array(0), { framing: 'tcp' })).toThrow(TruncatedError);
    expect(() => decode(Uint8Array.of(0), { framing: 'tcp' })).toThrow(TruncatedError);
  });

  test('SSHFP records with any fingerprint type round-trip', () => {
    const data = { algorithm: 4, fingerprintType: 9, fingerprint: Uint8Array.of(1, 2, 3) };
    expect(roundTripData('SSHFP', data)).toEqual(data);
  });

  test('escaped dots work in any label, not only the first', () => {
    const rp = { mbox: 'first\\.last.team\\.a.example.com', txt: 'info.example.com' };
    expect(roundTripData('RP', rp)).toEqual(rp);
  });

  test('a label containing a dot or backslash decodes with escapes', () => {
    expect(decodeQuestionName([3, 0x61, 0x2e, 0x62, 0])).toBe('a\\.b');
    expect(decodeQuestionName([3, 0x61, 0x5c, 0x62, 0])).toBe('a\\\\b');
    expect(nameBytes('a\\\\b')).toEqual(Uint8Array.of(3, 0x61, 0x5c, 0x62, 0));
    expect(nameBytes('\\065\\.b')).toEqual(Uint8Array.of(3, 0x41, 0x2e, 0x62, 0));
  });

  test('a label that is not UTF-8 decodes with \\DDD escapes and encodes to the same bytes', () => {
    // Found by the fuzzer: decoding replaced each invalid byte with U+FFFD, so the label grew past
    // 63 bytes when it was encoded again.
    const label = [0x68, 0x10, 0x84, 0xe5, 0x00, 0x20, 0x2e];
    const name = decodeQuestionName([label.length, ...label, 0]);
    expect(name).toBe('h\\016\\132\\229\\000\\032\\.');
    expect(nameBytes(name)).toEqual(Uint8Array.of(label.length, ...label, 0));
    expect(decodeQuestionName([2, 0xc3, 0xb5, 0])).toBe('õ');
  });

  test('CLIENT_SUBNET clears address bits past the source prefix (RFC 7871)', () => {
    const option = { code: 'CLIENT_SUBNET', ip: '192.0.2.77', sourcePrefixLength: 20 } as const;
    const bytes = encode({ additionals: [{ type: 'OPT', options: [option] }] });
    expect(bytes.subarray(-3)).toEqual(Uint8Array.of(192, 0, 0));
  });

  test('EDNS options with a bad length are rejected instead of read past', () => {
    const keepalive = encode({
      additionals: [{ type: 'OPT', options: [{ code: 'TCP_KEEPALIVE' }] }],
    });
    const malformed = Uint8Array.from([...keepalive, 0]);
    malformed[malformed.length - 6] = 5;
    malformed[malformed.length - 2] = 1;
    expect(() => decode(malformed)).toThrow(InvalidInputError);

    const subnet = encode({
      additionals: [
        {
          type: 'OPT',
          options: [{ code: 'CLIENT_SUBNET', ip: '1.2.3.4', sourcePrefixLength: 32 }],
        },
      ],
    });
    const tooLong = Uint8Array.from([...subnet, 9]);
    tooLong[tooLong.length - 14] = 13;
    tooLong[tooLong.length - 10] = 9;
    expect(() => decode(tooLong)).toThrow(InvalidInputError);
  });

  test('an OPT record must have the root as its name', () => {
    expect(() => encode(invalid({ additionals: [{ type: 'OPT', name: 'a.com' }] }))).toThrow(
      InvalidInputError,
    );
    const bytes = Uint8Array.from([
      ...hex('000000000000000000000001'),
      1,
      0x61,
      0,
      ...hex('0029100000000000000000'),
    ]);
    expect(() => decode(bytes)).toThrow(InvalidInputError);
  });
});

describe('compression', () => {
  const response = {
    type: 'response',
    questions: [{ type: 'MX', name: 'example.com' }],
    answers: [
      { type: 'MX', name: 'example.com', data: { preference: 10, exchange: 'mail.example.com' } },
      { type: 'MX', name: 'example.com', data: { preference: 20, exchange: 'mail2.example.com' } },
    ],
    authorities: [
      {
        type: 'SOA',
        name: 'example.com',
        data: {
          mname: 'ns.example.com',
          rname: 'host\\.master.example.com',
          serial: 1,
          refresh: 2,
          retry: 3,
          expire: 4,
          minimum: 5,
        },
      },
    ],
    additionals: [
      { type: 'A', name: 'mail.example.com', data: '192.0.2.1' },
      {
        type: 'SRV',
        name: '_sip._tcp.example.com',
        data: { priority: 0, weight: 0, port: 5060, target: 'mail.example.com' },
      },
    ],
  } satisfies Packet;

  test('replaces repeated names with pointers and decodes to the same packet', () => {
    const plain = encode(response);
    const compressed = encode(response, { compress: true });
    expect(compressed.length).toBeLessThan(plain.length);
    expect(decode(compressed)).toEqual(decode(plain));
  });

  test('points at the earlier copy of a suffix', () => {
    const bytes = encode(
      {
        questions: [
          { type: 'A', name: 'example.com' },
          { type: 'AAAA', name: 'www.example.com' },
        ],
      },
      { compress: true },
    );
    expect(bytes.subarray(29)).toEqual(hex('03777777c00c001c0001'));
  });

  test('leaves names inside SRV records uncompressed (RFC 3597)', () => {
    const srv = encode(
      {
        answers: [
          { type: 'A', name: 'host.example.com', data: '192.0.2.1' },
          {
            type: 'SRV',
            name: 'example.com',
            data: { priority: 0, weight: 0, port: 1, target: 'host.example.com' },
          },
        ],
      },
      { compress: true },
    );
    expect(srv.subarray(-18)).toEqual(nameBytes('host.example.com'));
  });

  test('is off by default', () => {
    const bytes = encode({
      questions: [
        { type: 'A', name: 'a.com' },
        { type: 'A', name: 'a.com' },
      ],
    });
    expect(bytes).toHaveLength(12 + 2 * (7 + 4));
  });

  test('works with TCP framing', () => {
    const framed = encode(response, { compress: true, framing: 'tcp' });
    expect(framed.subarray(2)).toEqual(encode(response, { compress: true }));
    expect(decode(framed, { framing: 'tcp' })).toEqual(decode(encode(response)));
  });
});

describe('decoding malformed input', () => {
  const valid = encode(
    {
      type: 'response',
      questions: [{ type: 'A', name: 'example.com' }],
      answers: [
        { type: 'A', name: 'example.com', data: '192.0.2.1' },
        { type: 'TXT', name: 'example.com', data: ['v=spf1 -all'] },
        { type: 'MX', name: 'example.com', data: { preference: 1, exchange: 'mx.example.com' } },
      ],
      additionals: [
        {
          type: 'OPT',
          options: [{ code: 'CLIENT_SUBNET', ip: '192.0.2.0', sourcePrefixLength: 24 }],
        },
      ],
    },
    { compress: true },
  );

  test('every truncation throws TruncatedError', () => {
    for (let length = 0; length < valid.length; length++) {
      expect(() => decode(valid.subarray(0, length))).toThrow(TruncatedError);
    }
    expect(decode(valid).answers).toHaveLength(3);
  });

  test('an RDLENGTH past the end throws TruncatedError', () => {
    const bytes = encode({ answers: [{ type: 'A', name: '.', data: '192.0.2.1' }] });
    bytes[bytes.length - 5] = 5;
    expect(() => decode(bytes)).toThrow(TruncatedError);
  });

  test('a TXT string longer than its record throws InvalidInputError', () => {
    const bytes = encode({ answers: [{ type: 'TXT', name: '.', data: ['abc'] }] });
    bytes[bytes.length - 4] = 9;
    expect(() => decode(bytes)).toThrow(InvalidInputError);
  });

  test('pointers that form a loop throw InvalidInputError', () => {
    expect(() => decodeNameAfter([0xc0, PREFIX_OFFSET + 2], [0xc0, PREFIX_OFFSET])).toThrow(
      InvalidInputError,
    );
  });

  test('a DNSKEY with a protocol other than 3 throws InvalidInputError', () => {
    const bytes = encode({
      answers: [
        { type: 'DNSKEY', name: '.', data: { flags: 0, algorithm: 8, key: Uint8Array.of(1) } },
      ],
    });
    bytes[bytes.length - 3] = 2;
    expect(() => decode(bytes)).toThrow(InvalidInputError);
  });

  test('TCP framing throws TruncatedError until the whole message has arrived', () => {
    const framed = encode({ questions: [{ type: 'A', name: 'example.com' }] }, { framing: 'tcp' });
    for (let length = 0; length < framed.length; length++) {
      expect(() => decode(framed.subarray(0, length), { framing: 'tcp' })).toThrow(TruncatedError);
    }
    const next = Uint8Array.from([...framed, 0, 5]);
    expect(decode(next, { framing: 'tcp' }).questions).toHaveLength(1);
  });
});

describe('decoding corrupted real responses', () => {
  test('decodes every captured response', () => {
    for (const { hex: text } of responses) {
      expect(decode(hex(text)).questions).toHaveLength(1);
    }
  });
});

describe('encoding', () => {
  test('rejects an EDNS option without data that has no encoder', () => {
    const options = [{ code: 'NSID' }] as unknown as EdnsOption[];
    expect(() => encode({ additionals: [{ type: 'OPT', options }] })).toThrow(UnsupportedError);
  });

  test('rejects binary fields that are not Uint8Array', () => {
    const record = { type: 'DNSKEY', name: 'a.com', data: { flags: 0, algorithm: 8, key: [1, 2] } };
    expect(() => encode(invalid({ answers: [record] }))).toThrow(InvalidInputError);
  });

  test('encodes UTF-8 names and TXT strings', () => {
    expect(roundTripData('TXT', ['héllo ☃'])).toEqual([utf8('héllo ☃')]);
    expect(roundTripData('CNAME', 'bücher.example')).toBe('bücher.example');
  });

  test('accepts lowercase type and class names', () => {
    const packet = invalid({ questions: [{ type: 'aaaa', class: 'in', name: 'a.com' }] });
    expect(decode(encode(packet)).questions[0]).toMatchObject({ type: 'AAAA', class: 'IN' });
  });

  test('encodes types and classes by number', () => {
    const decoded = roundTrip({
      questions: [{ type: 'TYPE65280', class: 'CLASS254', name: 'a.com' }],
    });
    expect(decoded.questions[0]).toEqual({
      type: 'TYPE65280',
      class: 'NONE',
      name: 'a.com',
      qu: false,
    });
  });

  test('decodes HTTPS records as raw bytes', () => {
    const record = { type: 'HTTPS', name: 'a.com', data: hex('00010000') } satisfies ResourceRecord;
    expect(roundTripRecord(record)).toMatchObject({ type: 'HTTPS', data: hex('00010000') });
  });

  test('keeps the mDNS cache-flush bit apart from the class', () => {
    const record = roundTripRecord({ type: 'A', name: 'a.local', flush: true, data: '192.0.2.1' });
    expect(record).toMatchObject({ class: 'IN', flush: true });
  });
});
