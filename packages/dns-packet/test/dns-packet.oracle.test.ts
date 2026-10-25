import * as upstream from 'dns-packet';
import { describe, expect, test } from 'vite-plus/test';
import { decode, encode, type Packet } from '@portable/dns-packet';
import responses from './fixtures/responses.json' with { type: 'json' };
import { canonical, fromUpstream } from './upstream.js';
import { hex, random } from './utils.js';

const corpus = [
  { id: 1, flags: { rd: true }, questions: [{ type: 'A', name: 'example.com' }] },
  {
    id: 0xbeef,
    flags: { rd: true, cd: true },
    questions: [
      { type: 'AAAA', name: 'Example.COM.' },
      { type: 'ANY', class: 'CH', name: 'version.bind' },
    ],
    additionals: [
      {
        type: 'OPT',
        udpPayloadSize: 1232,
        dnssecOk: true,
        options: [
          { code: 'CLIENT_SUBNET', ip: '198.51.100.0', sourcePrefixLength: 24 },
          { code: 'CLIENT_SUBNET', ip: '2001:db8::', sourcePrefixLength: 56, scopePrefixLength: 0 },
          { code: 'PADDING', length: 17 },
          { code: 'TCP_KEEPALIVE', timeout: 300 },
          { code: 'TCP_KEEPALIVE' },
          { code: 'KEY_TAG', tags: [20326, 19036] },
          { code: 'COOKIE', data: hex('0102030405060708') },
          { code: 'OPTION65001', data: new Uint8Array(0) },
        ],
      },
    ],
  },
  {
    id: 7,
    type: 'response',
    opcode: 'QUERY',
    rcode: 'NXDOMAIN',
    flags: { aa: true, rd: true, ra: true, ad: true },
    questions: [{ type: 'ANY', name: 'example.org' }],
    answers: [
      { type: 'A', name: 'example.org', ttl: 300, data: '93.184.216.34' },
      { type: 'AAAA', name: 'example.org', ttl: 300, data: '2606:2800:220:1:248:1893:25c8:1946' },
      { type: 'CNAME', name: 'www.example.org', data: 'example.org' },
      { type: 'DNAME', name: 'old.example.org', data: 'new.example.org' },
      { type: 'MX', name: 'example.org', data: { preference: 10, exchange: 'mx1.example.org' } },
      { type: 'NS', name: 'example.org', data: 'a.iana-servers.net' },
      { type: 'PTR', name: '34.216.184.93.in-addr.arpa', data: 'example.org' },
      {
        type: 'SOA',
        name: 'example.org',
        data: {
          mname: 'ns.icann.org',
          rname: 'noc\\.dns.icann.org',
          serial: 2024010101,
          refresh: 7200,
          retry: 3600,
          expire: 1209600,
          minimum: 3600,
        },
      },
      {
        type: 'SRV',
        name: '_sip._udp.example.org',
        data: { priority: 10, weight: 60, port: 5060, target: 'sip.example.org' },
      },
      { type: 'TXT', name: 'example.org', data: ['v=spf1 -all', hex('00ff10'), '', 'ünïcödé'] },
      { type: 'NULL', name: 'null.example.org', data: hex('deadbeef') },
      { type: 'HINFO', name: 'example.org', data: { cpu: 'RFC8482', os: '' } },
      {
        type: 'CAA',
        name: 'example.org',
        data: { flags: 0, tag: 'issuewild', value: 'letsencrypt.org; validationmethods=dns-01' },
      },
      {
        type: 'CAA',
        name: 'example.org',
        data: { flags: 128, tag: 'iodef', value: 'mailto:a@b.c' },
      },
      {
        type: 'NAPTR',
        name: 'example.org',
        data: {
          order: 100,
          preference: 10,
          flags: 'u',
          services: 'E2U+sip',
          regexp: '!^.*$!sip:info@example.org!',
          replacement: '.',
        },
      },
      {
        type: 'TLSA',
        name: '_443._tcp.example.org',
        data: { usage: 3, selector: 1, matchingType: 1, certificate: hex('aa'.repeat(32)) },
      },
      {
        type: 'SSHFP',
        name: 'example.org',
        data: { algorithm: 4, fingerprintType: 2, fingerprint: hex('ab'.repeat(32)) },
      },
      {
        type: 'DS',
        name: 'example.org',
        data: { keyTag: 370, algorithm: 13, digestType: 2, digest: hex('11'.repeat(32)) },
      },
      {
        type: 'DNSKEY',
        name: 'example.org',
        data: { flags: 257, algorithm: 13, key: hex('22'.repeat(64)) },
      },
      {
        type: 'RRSIG',
        name: 'example.org',
        data: {
          typeCovered: 'DNSKEY',
          algorithm: 13,
          labels: 2,
          originalTTL: 3600,
          expiration: 1700000000,
          inception: 1690000000,
          keyTag: 370,
          signersName: 'example.org',
          signature: hex('33'.repeat(64)),
        },
      },
      {
        type: 'RP',
        name: 'example.org',
        data: { mbox: 'admin.example.org', txt: 'info.example.org' },
      },
      {
        type: 'NSEC',
        name: 'example.org',
        data: {
          nextDomain: 'a.example.org',
          types: ['A', 'NS', 'SOA', 'RRSIG', 'NSEC', 'CAA', 'TA'],
        },
      },
      {
        type: 'NSEC3',
        name: 'abc.example.org',
        data: {
          algorithm: 1,
          flags: 1,
          iterations: 0,
          salt: new Uint8Array(0),
          nextHashedOwner: hex('44'.repeat(20)),
          types: ['A', 'RRSIG'],
        },
      },
      { type: 'TYPE65280', name: 'example.org', data: hex('0001000001000302683200') },
      { type: 'A', name: 'printer.local', flush: true, ttl: 120, data: '192.168.1.20' },
      { type: 'TXT', name: 'chaos.example', class: 'CH', data: ['chaos'] },
    ],
  },
] satisfies Packet[];

describe('dns-packet decodes our output to the same packet', () => {
  corpus.forEach((packet, i) => {
    test(`synthetic packet ${i}`, () => {
      const bytes = encode(packet);
      const theirs = upstream.decode(Buffer.from(bytes));
      expect(fromUpstream(theirs)).toEqual(canonical(decode(bytes)));
      expect(new Uint8Array(upstream.encode(theirs))).toEqual(bytes);
    });

    test(`synthetic packet ${i}, compressed`, () => {
      const bytes = encode(packet, { compress: true });
      expect(fromUpstream(upstream.decode(Buffer.from(bytes)))).toEqual(canonical(decode(bytes)));
    });
  });
});

describe('decodes real responses like dns-packet', () => {
  for (const { query, server, hex: text } of responses) {
    test(`${query} from ${server}`, () => {
      const theirs = upstream.decode(Buffer.from(text, 'hex'));
      const ours = decode(hex(text));
      expect(canonical(ours)).toEqual(fromUpstream(theirs));
      expect(encode(ours)).toEqual(new Uint8Array(upstream.encode(theirs)));
    });
  }
});

describe('TCP framing matches dns-packet', () => {
  test('the length-prefixed packet from the dns-packet suite', () => {
    const framed = hex(
      '0079dead85000001000100020002026f6a0562616e676a03636f6d0000010001c00c' +
        '0001000100000e10000481fa0baac00f0002000100000e10000502636ac00fc00f' +
        '0002000100000e100002c00cc03a0001000100000e100004454d9b9cc00c001c00' +
        '0100000e10001020010418000050000000000000000001f9',
    );
    const theirs = upstream.streamDecode(Buffer.from(framed));
    expect(canonical(decode(framed, { framing: 'tcp' }))).toEqual(fromUpstream(theirs));
  });

  test('encoding', () => {
    for (const packet of corpus) {
      const theirs = upstream.decode(Buffer.from(encode(packet)));
      expect(encode(packet, { framing: 'tcp' })).toEqual(
        new Uint8Array(upstream.streamEncode(theirs)),
      );
    }
  });

  for (const seed of [1, 2, 3]) {
    test(`frames read in random chunks, seed ${seed}`, () => {
      const next = random(seed);
      const frames = responses
        .map(({ hex: text }) => hex(text))
        .map((message) =>
          Uint8Array.from([message.length >> 8, message.length & 0xff, ...message]),
        );
      const stream = Uint8Array.from(frames.flatMap((frame) => [...frame]));
      const ours: unknown[] = [];
      let buffered = new Uint8Array(0);
      for (let i = 0; i < stream.length;) {
        const size = 1 + Math.floor(next() * 200);
        buffered = Uint8Array.from([...buffered, ...stream.subarray(i, i + size)]);
        i += size;
        while (
          buffered.length >= 2 &&
          buffered.length >= 2 + ((buffered[0]! << 8) | buffered[1]!)
        ) {
          ours.push(canonical(decode(buffered, { framing: 'tcp' })));
          buffered = buffered.subarray(2 + ((buffered[0]! << 8) | buffered[1]!));
        }
      }
      const theirs = frames.map((frame) => fromUpstream(upstream.streamDecode(Buffer.from(frame))));
      expect(ours).toEqual(theirs);
    });
  }
});
