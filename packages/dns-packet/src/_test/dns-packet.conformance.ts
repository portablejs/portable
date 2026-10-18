import { describe, expect, test } from 'vite-plus/test'
import {
  AUTHORITATIVE_ANSWER,
  DNSSEC_OK,
  InvalidNameError,
  InvalidPointerError,
  InvalidRecordError,
  RECURSION_AVAILABLE,
  TRUNCATED_RESPONSE,
  TruncatedError,
  decode,
  encode,
  encodingLength,
  opcodes,
  optioncodes,
  rcodes,
  streamDecode,
  streamEncode,
  type DecodedOptAnswer,
  type Packet,
} from '../index.js'
import {
  PREFIX_OFFSET,
  decodeNameAfter,
  decodeQuestionName,
  hex,
  nameBytes,
  roundTrip,
  roundTripAnswer,
  roundTripData,
  utf8,
} from './utils.js'

describe('dns-packet', () => {
  test('unknown', () => {
    expect(roundTripData('UNKNOWN_4242', utf8('hello world'))).toEqual(utf8('hello world'))
  })

  test('txt', () => {
    expect(roundTripData('TXT', [])).toEqual([])
    expect(roundTripData('TXT', ['hello world'])).toEqual([utf8('hello world')])
    expect(roundTripData('TXT', ['hello', 'world'])).toEqual([utf8('hello'), utf8('world')])
    expect(roundTripData('TXT', [Uint8Array.of(0, 1, 2, 3, 4, 5)])).toEqual([
      Uint8Array.of(0, 1, 2, 3, 4, 5),
    ])
    expect(roundTripData('TXT', ['a', 'b', Uint8Array.of(0, 1, 2, 3, 4, 5)])).toEqual([
      utf8('a'),
      utf8('b'),
      Uint8Array.of(0, 1, 2, 3, 4, 5),
    ])
    expect(roundTripData('TXT', ['', new Uint8Array(0)])).toEqual([
      new Uint8Array(0),
      new Uint8Array(0),
    ])
  })

  test('txt-scalar-string', () => {
    expect(roundTripData('TXT', 'hi')).toEqual([utf8('hi')])
  })

  test('txt-scalar-buffer', () => {
    const data = Uint8Array.of(0, 1, 2, 3, 4, 5)
    expect(roundTripData('TXT', data)).toEqual([data])
  })

  test('txt-invalid-data', () => {
    for (const data of [null, undefined, 10]) {
      const packet = { answers: [{ type: 'TXT', name: 'a.com', data }] } as unknown as Packet
      expect(() => encode(packet)).toThrow(InvalidRecordError)
    }
  })

  test('null', () => {
    expect(roundTripData('NULL', Uint8Array.of(0, 1, 2, 3, 4, 5))).toEqual(
      Uint8Array.of(0, 1, 2, 3, 4, 5),
    )
  })

  test('hinfo', () => {
    expect(roundTripData('HINFO', { cpu: 'intel', os: 'best one' })).toEqual({
      cpu: 'intel',
      os: 'best one',
    })
  })

  test('ptr', () => {
    expect(roundTripData('PTR', 'hello.world.com')).toBe('hello.world.com')
  })

  test('cname', () => {
    expect(roundTripData('CNAME', 'hello.cname.world.com')).toBe('hello.cname.world.com')
  })

  test('dname', () => {
    expect(roundTripData('DNAME', 'hello.dname.world.com')).toBe('hello.dname.world.com')
  })

  test('srv', () => {
    expect(roundTripData('SRV', { port: 9999, target: 'hello.world.com' })).toEqual({
      priority: 0,
      weight: 0,
      port: 9999,
      target: 'hello.world.com',
    })
    expect(
      roundTripData('SRV', { port: 9999, target: 'hello.world.com', priority: 42, weight: 10 }),
    ).toEqual({ priority: 42, weight: 10, port: 9999, target: 'hello.world.com' })
  })

  test('caa', () => {
    const expected = { flags: 128, tag: 'issue', value: 'letsencrypt.org', issuerCritical: true }
    expect(roundTripData('CAA', expected)).toEqual(expected)
    expect(
      roundTripData('CAA', { tag: 'issue', value: 'letsencrypt.org', issuerCritical: true }),
    ).toEqual(expected)
    expect(roundTripData('CAA', { tag: 'issue', value: 'letsencrypt.org' })).toEqual({
      flags: 0,
      tag: 'issue',
      value: 'letsencrypt.org',
      issuerCritical: false,
    })
  })

  test('mx', () => {
    expect(roundTripData('MX', { preference: 10, exchange: 'mx.hello.world.com' })).toEqual({
      preference: 10,
      exchange: 'mx.hello.world.com',
    })
    expect(roundTripData('MX', { exchange: 'mx.hello.world.com' })).toEqual({
      preference: 0,
      exchange: 'mx.hello.world.com',
    })
  })

  test('ns', () => {
    expect(roundTripData('NS', 'ns.world.com')).toBe('ns.world.com')
  })

  test('soa', () => {
    const soa = {
      mname: 'hello.world.com',
      rname: 'root.hello.world.com',
      serial: 2018010400,
      refresh: 14400,
      retry: 3600,
      expire: 604800,
      minimum: 3600,
    }
    expect(roundTripData('SOA', soa)).toEqual(soa)
  })

  test('sshfp', () => {
    const sshfp = { algorithm: 1, hash: 1, fingerprint: 'A108C9F834354D5B37AF988141C9294822F5BC00' }
    expect(roundTripData('SSHFP', sshfp)).toEqual(sshfp)
  })

  test('a', () => {
    expect(roundTripData('A', '127.0.0.1')).toBe('127.0.0.1')
  })

  test('aaaa', () => {
    expect(roundTripData('AAAA', 'fe80::1')).toBe('fe80::1')
  })

  test('query', () => {
    const questions = (klass?: 'IN' | 'CH') => [
      { type: 'A' as const, name: 'hello.a.com', ...(klass && { class: klass }) },
      { type: 'SRV' as const, name: 'hello.srv.com' },
    ]
    expect(roundTrip({ type: 'query', questions: questions() })).toMatchObject({
      type: 'query',
      id: 0,
      questions: [
        { type: 'A', class: 'IN', name: 'hello.a.com' },
        { type: 'SRV', class: 'IN', name: 'hello.srv.com' },
      ],
    })
    expect(roundTrip({ type: 'query', id: 42, questions: questions('IN') })).toMatchObject({
      id: 42,
      questions: [{ class: 'IN' }, { class: 'IN' }],
    })
    expect(roundTrip({ type: 'query', id: 42, questions: questions('CH') })).toMatchObject({
      id: 42,
      questions: [{ class: 'CH', name: 'hello.a.com' }, { class: 'IN' }],
    })
  })

  test('response', () => {
    expect(
      roundTrip({
        type: 'response',
        answers: [{ type: 'A', class: 'IN', flush: true, name: 'hello.a.com', data: '127.0.0.1' }],
      }).answers,
    ).toEqual([
      { type: 'A', class: 'IN', flush: true, ttl: 0, name: 'hello.a.com', data: '127.0.0.1' },
    ])

    const truncated = roundTrip({
      type: 'response',
      flags: TRUNCATED_RESPONSE,
      answers: [
        { type: 'A', class: 'IN', name: 'hello.a.com', data: '127.0.0.1' },
        {
          type: 'SRV',
          class: 'IN',
          name: 'hello.srv.com',
          data: { port: 9090, target: 'hello.target.com' },
        },
        { type: 'CNAME', class: 'IN', name: 'hello.cname.com', data: 'hello.other.domain.com' },
      ],
    })
    expect(truncated.flags).toBe(TRUNCATED_RESPONSE)
    expect(truncated.flag_tc).toBe(true)
    expect(truncated.answers.map((answer) => 'data' in answer && answer.data)).toEqual([
      '127.0.0.1',
      { priority: 0, weight: 0, port: 9090, target: 'hello.target.com' },
      'hello.other.domain.com',
    ])

    const mixed = roundTrip({
      type: 'response',
      id: 100,
      flags: 0,
      additionals: [
        { type: 'AAAA', name: 'hello.a.com', data: 'fe80::1' },
        { type: 'PTR', name: 'hello.ptr.com', data: 'hello.other.ptr.com' },
        {
          type: 'SRV',
          name: 'hello.srv.com',
          ttl: 42,
          data: { port: 9090, target: 'hello.target.com' },
        },
      ],
      answers: [{ type: 'NULL', name: 'hello.null.com', data: Uint8Array.of(1, 2, 3, 4, 5) }],
    })
    expect(mixed.id).toBe(100)
    expect(mixed.answers[0]).toMatchObject({ type: 'NULL', data: Uint8Array.of(1, 2, 3, 4, 5) })
    expect(mixed.additionals).toMatchObject([
      { type: 'AAAA', data: 'fe80::1' },
      { type: 'PTR', data: 'hello.other.ptr.com' },
      { type: 'SRV', ttl: 42, data: { port: 9090, target: 'hello.target.com' } },
    ])

    expect(
      roundTrip({ type: 'response', answers: [{ type: 'TXT', name: 'emptytxt.com', data: '' }] })
        .answers[0],
    ).toMatchObject({ data: [new Uint8Array(0)] })
  })

  test('rcode', () => {
    const errors = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED']
    errors.push('YXDOMAIN', 'YXRRSET', 'NXRRSET', 'NOTAUTH', 'NOTZONE')
    errors.push('RCODE_11', 'RCODE_12', 'RCODE_13', 'RCODE_14', 'RCODE_15')
    errors.forEach((name, code) => {
      expect(rcodes.toRcode(name)).toBe(code)
      expect(rcodes.toString(code)).toBe(name)
    })

    const ops = ['QUERY', 'IQUERY', 'STATUS', 'OPCODE_3', 'NOTIFY', 'UPDATE']
    for (let code = 6; code < 16; code++) ops.push(`OPCODE_${code}`)
    ops.forEach((name, code) => {
      expect(opcodes.toOpcode(name)).toBe(code)
      expect(opcodes.toString(code)).toBe(name)
    })

    const packet = decode(
      encode({
        type: 'response',
        id: 45632,
        flags: 0x8480,
        answers: [{ type: 'A', name: 'hello.example.net', data: '127.0.0.1' }],
      }),
    )
    expect(packet).toMatchObject({
      type: 'response',
      opcode: 'QUERY',
      flag_qr: true,
      flag_aa: true,
      flag_tc: false,
      flag_rd: false,
      flag_ra: true,
      flag_z: false,
      flag_ad: false,
      flag_cd: false,
      rcode: 'NOERROR',
    })
  })

  test('name_encoding', () => {
    expect(nameBytes('foo.example.com')).toEqual(utf8('\x03foo\x07example\x03com\x00'))
    expect(decodeQuestionName([...nameBytes('foo.example.com')])).toBe('foo.example.com')
    expect(nameBytes('com')).toHaveLength(5)
    expect(decodeQuestionName([...nameBytes('com')])).toBe('com')
    expect(nameBytes('example.com.')).toHaveLength(13)
    expect(decodeQuestionName([...nameBytes('example.com.')])).toBe('example.com')
    expect(nameBytes('.')).toEqual(Uint8Array.of(0))
    expect(decodeQuestionName([0])).toBe('.')
    expect(nameBytes('a.b.c.d.example.com')).toHaveLength(21)

    const rname = (name: string) => {
      const soa = { mname: '.', rname: name }
      const packet: Packet = { answers: [{ type: 'SOA', name: '.', data: soa }] }
      const answer = roundTrip(packet).answers[0]!
      return {
        length: encodingLength(packet) - 12 - 11 - 1 - 20,
        decoded: answer.type === 'SOA' ? answer.data.rname : undefined,
      }
    }
    expect(rname('a.b.c.d.example.com')).toEqual({ length: 21, decoded: 'a.b.c.d.example.com' })
    expect(rname('a\\.b.c.d.example.com')).toEqual({ length: 21, decoded: 'a\\.b.c.d.example.com' })
    expect(rname('a\\.b\\.c.d.example.com')).toEqual({
      length: 21,
      decoded: 'a\\.b\\.c.d.example.com',
    })
    expect(rname('root\\.mail')).toEqual({ length: 11, decoded: 'root\\.mail' })
  })

  test('name_decoding', () => {
    expect(() => decodeQuestionName([0x80])).toThrow(InvalidNameError)
    expect(() => decodeQuestionName([0xb0])).toThrow(InvalidNameError)

    const truncated = (name: number[]) => {
      const bytes = Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...name])
      expect(() => decode(bytes)).toThrow(TruncatedError)
    }
    truncated([])
    truncated([0x01, 0x00])
    truncated([0x01])
    truncated([0xc0])

    expect(() => decodeQuestionName([0xc0, 12])).toThrow(InvalidPointerError)
    expect(() => decodeQuestionName([0xc0, 13])).toThrow(InvalidPointerError)

    const labels = (count: number) => Array.from({ length: count }, () => [0x01, 0x61]).flat()
    expect(decodeQuestionName([...labels(127), 0])).toBe(Array(127).fill('a').join('.'))
    expect(() => decodeQuestionName([...labels(128), 0])).toThrow(InvalidNameError)

    expect(() =>
      decodeNameAfter([...labels(100), 0], [...labels(100), 0xc0, PREFIX_OFFSET]),
    ).toThrow(InvalidNameError)

    expect(decodeNameAfter([0], [0x01, 0x61, 0xc0, PREFIX_OFFSET])).toBe('a')

    const chain = [0, 0]
    for (let at = PREFIX_OFFSET + 2; at + 2 < 0x4000; at += 2) {
      const target = at - 2
      chain.push(0xc0 | (target >> 8), target & 0xff)
    }
    const last = PREFIX_OFFSET + chain.length - 2
    expect(decodeNameAfter(chain, [0xc0 | (last >> 8), last & 0xff])).toBe('.')
  })

  test('stream', () => {
    const packet: Packet = {
      type: 'query',
      id: 45632,
      flags: 0x8480,
      answers: [{ type: 'A', name: 'test2.example.net', data: '198.51.100.1' }],
    }
    const frame = streamEncode(packet)
    expect(frame.length).toBe(encodingLength(packet) + 2)
    expect(streamDecode(frame)).toMatchObject({
      type: 'query',
      id: 45632,
      flags: 0x8480 & 0x7fff,
      answers: [{ type: 'A', name: 'test2.example.net', data: '198.51.100.1' }],
    })
  })

  test('opt', () => {
    const question = { type: 'A', name: 'hello.a.com' } as const
    const plain = roundTrip({
      type: 'query',
      questions: [question],
      additionals: [{ type: 'OPT', name: '.', udpPayloadSize: 1024 }],
    }).additionals[0]
    expect(plain).toMatchObject({ name: '.', udpPayloadSize: 1024, flags: 0 })

    const opt = roundTrip({
      type: 'query',
      questions: [question],
      additionals: [
        {
          type: 'OPT',
          name: '.',
          udpPayloadSize: 1024,
          flags: DNSSEC_OK,
          extendedRcode: 0x80,
          options: [
            { code: 'CLIENT_SUBNET', ip: 'fe80::', sourcePrefixLength: 64 },
            { code: 8, ip: '5.6.0.0', sourcePrefixLength: 16, scopePrefixLength: 16 },
            { code: 'padding', length: 31 },
            { code: 'TCP_KEEPALIVE' },
            { code: 'tcp_keepalive', timeout: 150 },
            { code: 'KEY_TAG', tags: [1, 82, 987] },
          ],
        },
      ],
    }).additionals[0] as DecodedOptAnswer
    expect(opt.flags).toBe(1 << 15)
    expect(opt.flag_do).toBe(true)
    expect(opt.extendedRcode).toBe(0x80)
    expect(opt.options[0]).toMatchObject({ code: 8, ip: 'fe80::', sourcePrefixLength: 64 })
    expect(opt.options[1]).toMatchObject({
      ip: '5.6.0.0',
      sourcePrefixLength: 16,
      scopePrefixLength: 16,
    })
    expect(opt.options[2]!.data).toHaveLength(31)
    expect(opt.options[3]!.timeout).toBeUndefined()
    expect(opt.options[4]!.timeout).toBe(150)
    expect(opt.options[5]!.tags).toEqual([1, 82, 987])
  })

  test('dnskey', () => {
    const dnskey = { flags: 0x8000 | 0x80, algorithm: 1, key: Uint8Array.of(0, 1, 2, 3, 4, 5) }
    expect(roundTripData('DNSKEY', dnskey)).toEqual(dnskey)
  })

  test('rrsig', () => {
    const rrsig = {
      typeCovered: 'A' as const,
      algorithm: 1,
      labels: 2,
      originalTTL: 3600,
      expiration: 1234,
      inception: 1233,
      keyTag: 2345,
      signersName: 'foo.com',
      signature: Uint8Array.of(0, 1, 2, 3, 4, 5),
    }
    expect(roundTripData('RRSIG', rrsig)).toEqual(rrsig)

    const bytes = encode({ answers: [{ type: 'RRSIG', name: '.', data: rrsig }] })
    const padded = Uint8Array.from([...bytes, 1, 2, 3, 4])
    expect(decode(padded).answers[0]).toMatchObject({ data: rrsig })
  })

  test('rrp', () => {
    expect(roundTripData('RP', { mbox: 'foo.bar.com', txt: 'baz.bar.com' })).toEqual({
      mbox: 'foo.bar.com',
      txt: 'baz.bar.com',
    })
    expect(roundTripData('RP', { mbox: 'foo.bar.com' })).toEqual({ mbox: 'foo.bar.com', txt: '.' })
    expect(roundTripData('RP', { txt: 'baz.bar.com' })).toEqual({ mbox: '.', txt: 'baz.bar.com' })
    expect(roundTripData('RP', {})).toEqual({ mbox: '.', txt: '.' })
  })

  test('nsec', () => {
    for (const rrtypes of [
      ['A', 'DNSKEY', 'CAA', 'DLV'],
      ['TXT'],
      ['TKEY'],
      ['RRSIG', 'NSEC'],
      ['TXT', 'RRSIG'],
      ['TXT', 'NSEC'],
    ]) {
      expect(roundTripData('NSEC', { nextDomain: 'foo.com', rrtypes })).toEqual({
        nextDomain: 'foo.com',
        rrtypes,
      })
    }

    // The sample NSEC record from RFC 4034 section 4.3, with its RDLENGTH.
    const rdata = hex(
      '003704686f7374076578616d706c6503636f6d00' +
        '0006400100000003041b000000000000000000000000000000000000000000000' +
        '000000020',
    )
    const header = hex('000084000000000100000000')
    const record = hex('00002f00010000000a')
    const message = Uint8Array.from([...header, ...record, ...rdata])
    const decoded = decode(message)
    expect(decoded.answers[0]).toMatchObject({
      data: {
        nextDomain: 'host.example.com',
        rrtypes: ['A', 'MX', 'RRSIG', 'NSEC', 'UNKNOWN_1234'],
      },
    })
    expect(encode(decoded)).toEqual(message)
  })

  test('nsec3', () => {
    const nsec3 = {
      algorithm: 1,
      flags: 0,
      iterations: 257,
      salt: Uint8Array.of(42, 42, 42),
      nextDomain: Uint8Array.from({ length: 20 }, (_, i) => i),
      rrtypes: ['A', 'DNSKEY', 'CAA', 'DLV'],
    }
    expect(roundTripData('NSEC3', nsec3)).toEqual(nsec3)
  })

  test('ds', () => {
    const ds = {
      keyTag: 1234,
      algorithm: 1,
      digestType: 1,
      digest: Uint8Array.of(0, 1, 2, 3, 4, 5),
    }
    expect(roundTripData('DS', ds)).toEqual(ds)
  })

  test('naptr', () => {
    const naptr = {
      order: 1,
      preference: 1,
      flags: 'S',
      services: 'SIP+D2T',
      regexp: '!^.*$!sip:customer-service@xuexample.com!',
      replacement: '_sip._udp.xuexample.com',
    }
    expect(roundTripData('NAPTR', naptr)).toEqual(naptr)
  })

  test('tlsa', () => {
    const tlsa = {
      usage: 3,
      selector: 1,
      matchingType: 1,
      certificate: Uint8Array.of(0, 1, 2, 3, 4, 5),
    }
    expect(roundTripData('TLSA', tlsa)).toEqual(tlsa)
  })

  test('unpack', () => {
    const frame = hex(
      '0079dead85000001000100020002026f6a0562616e676a03636f6d0000010001c00c' +
        '0001000100000e10000481fa0baac00f0002000100000e10000502636ac00fc00f' +
        '0002000100000e100002c00cc03a0001000100000e100004454d9b9cc00c001c00' +
        '0100000e10001020010418000050000000000000000001f9',
    )
    const packet = streamDecode(frame)!
    expect(packet.rcode).toBe('NOERROR')
    expect(packet.answers[0]).toMatchObject({
      type: 'A',
      name: 'oj.bangj.com',
      data: '129.250.11.170',
    })
    expect(packet.authorities[1]).toMatchObject({
      type: 'NS',
      name: 'bangj.com',
      data: 'oj.bangj.com',
    })
  })

  test('optioncodes', () => {
    const codes: [number, string | null][] = [
      [0, 'OPTION_0'],
      [1, 'LLQ'],
      [2, 'UL'],
      [3, 'NSID'],
      [4, 'OPTION_4'],
      [5, 'DAU'],
      [6, 'DHU'],
      [7, 'N3U'],
      [8, 'CLIENT_SUBNET'],
      [9, 'EXPIRE'],
      [10, 'COOKIE'],
      [11, 'TCP_KEEPALIVE'],
      [12, 'PADDING'],
      [13, 'CHAIN'],
      [14, 'KEY_TAG'],
      [26946, 'DEVICEID'],
      [65535, 'OPTION_65535'],
      [64000, 'OPTION_64000'],
      [65002, 'OPTION_65002'],
      [-1, null],
    ]
    for (const [code, name] of codes) {
      expect(optioncodes.toString(code)).toBe(name)
      expect(optioncodes.toCode(name)).toBe(code)
    }
    expect(optioncodes.toCode('INVALIDINVALID')).toBe(-1)
  })
})

describe('compression', () => {
  const response: Packet = {
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
        data: { mname: 'ns.example.com', rname: 'host\\.master.example.com' },
      },
    ],
    additionals: [
      { type: 'A', name: 'mail.example.com', data: '192.0.2.1' },
      {
        type: 'SRV',
        name: '_sip._tcp.example.com',
        data: { port: 5060, target: 'mail.example.com' },
      },
    ],
  }

  test('replaces repeated names with pointers and decodes to the same packet', () => {
    const plain = encode(response)
    const compressed = encode(response, { compress: true })
    expect(compressed.length).toBeLessThan(plain.length)
    expect(decode(compressed)).toEqual(decode(plain))
  })

  test('writes a pointer to the earlier name', () => {
    const bytes = encode(
      {
        questions: [
          { type: 'A', name: 'example.com' },
          { type: 'AAAA', name: 'www.example.com' },
        ],
      },
      { compress: true },
    )
    expect(bytes.subarray(29)).toEqual(hex('03777777c00c001c0001'))
  })

  test('leaves names inside SRV records uncompressed', () => {
    const srv = encode(
      {
        answers: [
          { type: 'A', name: 'host.example.com', data: '192.0.2.1' },
          { type: 'SRV', name: 'example.com', data: { port: 1, target: 'host.example.com' } },
        ],
      },
      { compress: true },
    )
    expect(srv.subarray(srv.length - 18)).toEqual(nameBytes('host.example.com'))
  })

  test('is off by default', () => {
    const bytes = encode({
      questions: [
        { type: 'A', name: 'a.com' },
        { type: 'A', name: 'a.com' },
      ],
    })
    expect(bytes).toHaveLength(12 + 2 * (7 + 4))
  })

  test('streamEncode accepts the same option', () => {
    const frame = streamEncode(response, { compress: true })
    expect(frame.length - 2).toBe(encode(response, { compress: true }).length)
    expect(streamDecode(frame)).toEqual(decode(encode(response)))
  })
})

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
          name: '.',
          options: [{ code: 'CLIENT_SUBNET', ip: '192.0.2.0', sourcePrefixLength: 24 }],
        },
      ],
    },
    { compress: true },
  )

  test('every truncation throws TruncatedError', () => {
    for (let length = 0; length < valid.length; length++)
      expect(() => decode(valid.subarray(0, length))).toThrow(TruncatedError)
    expect(decode(valid).answers).toHaveLength(3)
  })

  test('an RDLENGTH past the end throws TruncatedError', () => {
    const bytes = encode({ answers: [{ type: 'A', name: '.', data: '192.0.2.1' }] })
    bytes[bytes.length - 5] = 5
    expect(() => decode(bytes)).toThrow(TruncatedError)
  })

  test('record data that overruns its RDLENGTH throws TruncatedError', () => {
    const bytes = encode({ answers: [{ type: 'A', name: '.', data: '192.0.2.1' }] })
    bytes[bytes.length - 5] = 3
    expect(() => decode(bytes.subarray(0, bytes.length - 1))).toThrow(TruncatedError)
  })

  test('a TXT string longer than its record throws TruncatedError', () => {
    const bytes = encode({ answers: [{ type: 'TXT', name: '.', data: 'abc' }] })
    bytes[bytes.length - 4] = 9
    expect(() => decode(bytes)).toThrow(TruncatedError)
  })

  test('pointers that form a loop throw InvalidPointerError', () => {
    expect(() => decodeNameAfter([0xc0, PREFIX_OFFSET + 2], [0xc0, PREFIX_OFFSET])).toThrow(
      InvalidPointerError,
    )
  })

  test('a DNSKEY with a protocol other than 3 throws InvalidRecordError', () => {
    const bytes = encode({
      answers: [
        { type: 'DNSKEY', name: '.', data: { flags: 0, algorithm: 8, key: Uint8Array.of(1) } },
      ],
    })
    bytes[bytes.length - 3] = 2
    expect(() => decode(bytes)).toThrow(InvalidRecordError)
  })

  test('the QU bit of an mDNS question is kept in the class, as dns-packet does', () => {
    const bytes = encode({ questions: [{ type: 'PTR', name: '_http._tcp.local' }] })
    bytes[bytes.length - 2]! |= 0x80
    expect(decode(bytes).questions[0]!.class).toBe('UNKNOWN_32769')
  })

  test('the flush bit is read from the class', () => {
    expect(
      roundTripAnswer({ type: 'A', name: 'a.local', flush: true, data: '192.0.2.1' }),
    ).toMatchObject({
      class: 'IN',
      flush: true,
    })
  })
})

describe('encoding invalid input', () => {
  const answer = (data: unknown, type = 'A'): Packet =>
    ({ answers: [{ type, name: 'example.com', data }] }) as unknown as Packet

  test('rejects invalid IP addresses', () => {
    for (const ip of ['1.2.3', '1.2.3.256', 'a.b.c.d', ''])
      expect(() => encode(answer(ip))).toThrow(InvalidRecordError)
    for (const ip of ['1::2::3', '1:2:3:4:5:6:7:8:9', 'g::1', '::1.2.3'])
      expect(() => encode(answer(ip, 'AAAA'))).toThrow(InvalidRecordError)
  })

  test('rejects empty labels, labels over 63 bytes and names over 255 bytes', () => {
    for (const name of ['a..b', `${'a'.repeat(64)}.com`, Array(128).fill('a').join('.')])
      expect(() => encode({ questions: [{ type: 'A', name }] })).toThrow(InvalidNameError)
    expect(nameBytes(`${'a'.repeat(63)}.com`)).toHaveLength(69)
  })

  test('rejects TXT strings over 255 bytes', () => {
    expect(() => encode(answer('x'.repeat(256), 'TXT'))).toThrow(InvalidRecordError)
    expect(roundTripData('TXT', 'x'.repeat(255))).toEqual([utf8('x'.repeat(255))])
  })

  test('rejects an OPT record whose name is not the root', () => {
    expect(() => encode({ additionals: [{ type: 'OPT', name: 'example.com' }] })).toThrow(
      InvalidRecordError,
    )
  })

  test('rejects an EDNS option without data that has no encoder', () => {
    expect(() =>
      encode({ additionals: [{ type: 'OPT', name: '.', options: [{ code: 'NSID' }] }] }),
    ).toThrow(InvalidRecordError)
  })

  test('rejects an SSHFP fingerprint of the wrong length', () => {
    expect(() => encode(answer({ algorithm: 1, hash: 2, fingerprint: 'AB' }, 'SSHFP'))).toThrow(
      InvalidRecordError,
    )
  })

  test('rejects binary fields that are not Uint8Array', () => {
    expect(() => encode(answer({ flags: 0, algorithm: 8, key: [1, 2] }, 'DNSKEY'))).toThrow(
      InvalidRecordError,
    )
  })
})

describe('encoding', () => {
  test('encodes UTF-8 names and TXT strings', () => {
    expect(roundTripData('TXT', 'héllo ☃')).toEqual([utf8('héllo ☃')])
    expect(roundTripData('CNAME', 'bücher.example')).toBe('bücher.example')
  })

  test('formats IPv6 addresses per RFC 5952', () => {
    expect(roundTripData('AAAA', '2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1')
    expect(roundTripData('AAAA', '2001:db8:0:1:0:0:0:1')).toBe('2001:db8:0:1::1')
    expect(roundTripData('AAAA', '2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1')
    expect(roundTripData('AAAA', '::')).toBe('::')
    expect(roundTripData('AAAA', '::ffff:192.0.2.1')).toBe('::ffff:c000:201')
    expect(roundTripData('AAAA', 'FE80::ABCD')).toBe('fe80::abcd')
  })

  test('uses the header flags constants', () => {
    const packet = decode(
      encode({ type: 'response', flags: AUTHORITATIVE_ANSWER | RECURSION_AVAILABLE }),
    )
    expect(packet).toMatchObject({ flag_aa: true, flag_ra: true, flag_rd: false })
  })

  test('does not modify the packet', () => {
    const packet: Packet = {
      answers: [
        { type: 'CAA', name: 'a.com', data: { tag: 'issue', value: 'ca', issuerCritical: true } },
      ],
    }
    const copy = structuredClone(packet)
    encode(packet)
    expect(packet).toEqual(copy)
  })

  test('streamDecode returns null until the whole message has arrived', () => {
    const frame = streamEncode({ questions: [{ type: 'A', name: 'example.com' }] })
    for (let length = 0; length < frame.length; length++)
      expect(streamDecode(frame.subarray(0, length))).toBeNull()
    expect(streamDecode(Uint8Array.from([...frame, 0, 5]))?.questions).toHaveLength(1)
  })

  test('encodes classes and types by number', () => {
    const packet = roundTrip({
      questions: [{ type: 'UNKNOWN_65280', class: 'UNKNOWN_254', name: 'a.com' }],
    })
    expect(packet.questions[0]).toEqual({
      type: 'UNKNOWN_65280',
      class: 'UNKNOWN_254',
      name: 'a.com',
    })
  })
})
