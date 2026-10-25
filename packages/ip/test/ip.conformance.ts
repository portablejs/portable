import { describe, expect, test } from 'vite-plus/test';
import * as Ip from '@portable/ip';
import { bytes, formatWords, network, normalize, words } from './utils.js';

describe('ipaddr.js', () => {
  test('builds an IPv4 address from bytes', () => {
    expect(Ip.fromBytes(new Uint8Array([192, 168, 1, 2]))).toEqual(Ip.parse('192.168.1.2'));
  });

  test('rejects bytes that are not 4 or 16 long', () => {
    for (const length of [0, 1, 3, 5, 15, 17]) {
      expect(() => Ip.fromBytes(new Uint8Array(length))).toThrow(Ip.InvalidInputError);
    }
  });

  test('formats IPv4', () => {
    expect(Ip.format(Ip.fromBytes(new Uint8Array([192, 168, 1, 1])))).toBe('192.168.1.1');
  });

  test('formats an IPv4 CIDR block', () => {
    expect(network('192.168.1.0/24')).toBe('192.168.1.0/24');
  });

  test('reports the version', () => {
    expect(Ip.parse('1.2.3.4').version).toBe(4);
    expect(Ip.parse('2001:db8:f53a::1').version).toBe(6);
    expect(Ip.parse('2001:db8:3312::1%z').version).toBe(6);
  });

  test('exposes IPv4 bytes', () => {
    expect(Ip.parse('42.0.0.0').bytes[0]).toBe(42);
  });

  test('accepts only four-part decimal IPv4', () => {
    expect(Ip.canParse('0.0.0.0')).toBe(true);
    expect(Ip.canParse('127.0.0.1')).toBe(true);
    expect(Ip.canParse('192.168.1.1')).toBe(true);
    for (const text of [
      '192.168.007.0xa',
      '1024.0.0.1',
      '8.0xa.wtf.6',
      '0xc0.168.1.1',
      '000000192.168.100.2',
      '192.0000168.100.2',
      '192.168.100.00000002',
      '192.168.100.20000000',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
  });

  test('rejects the octal, hex, integer, and short IPv4 forms', () => {
    for (const text of [
      '0xc0.168.1.1',
      '192.0250.1.1',
      '0xc0a80101',
      '030052000401',
      '3232235777',
      '127.42.258',
      '127.66051',
      '10.1.1.0xff',
      '1',
    ]) {
      expect(() => Ip.parse(text)).toThrow(Ip.InvalidInputError);
    }
  });

  test('rejects malformed IPv4', () => {
    for (const text of [
      '10.0.0.wtf',
      '8.0x1ffffff',
      '8.8.0x1ffff',
      '10.048.1.1',
      '4999999999',
      '-1',
    ]) {
      expect(() => Ip.parse(text)).toThrow(Ip.InvalidInputError);
    }
  });

  test('matches IPv4 CIDR blocks given as objects', () => {
    const address = '10.5.0.1';
    const at = (text: string, prefix: number) =>
      Ip.contains({ address: Ip.parse(text), prefix }, address);
    expect(at('0.0.0.0', 0)).toBe(true);
    expect(at('11.0.0.0', 8)).toBe(false);
    expect(at('10.0.0.0', 8)).toBe(true);
    expect(at('10.0.0.1', 8)).toBe(true);
    expect(at('10.0.0.10', 8)).toBe(true);
    expect(at('10.5.5.0', 16)).toBe(true);
    expect(at('10.4.5.0', 16)).toBe(false);
    expect(at('10.4.5.0', 15)).toBe(true);
    expect(at('10.5.0.2', 32)).toBe(false);
    expect(at('10.5.0.1', 32)).toBe(true);
  });

  test('rejects an invalid prefix length in a CIDR object', () => {
    for (const [text, prefix] of [
      ['192.168.1.0', -1],
      ['192.168.1.0', -0.5],
      ['192.168.1.0', NaN],
      ['192.168.1.0', Infinity],
      ['192.168.1.0', -Infinity],
      ['192.168.1.0', 24.9],
      ['192.168.1.0', 33],
      ['2001:db8::', 64.9],
      ['2001:db8::', 129],
      ['2001:db8::', -1],
    ] as const) {
      expect(() => Ip.contains({ address: Ip.parse(text), prefix }, text)).toThrow(RangeError);
    }
  });

  test('formats a parsed CIDR block with host bits cleared', () => {
    expect(network('1.2.3.4/24')).toBe('1.2.3.0/24');
    expect(network('::1/24')).toBe('::/24');
  });

  test('matches IPv4 CIDR blocks given as text', () => {
    const address = '10.5.0.1';
    expect(Ip.contains('0.0.0.0/0', address)).toBe(true);
    expect(Ip.contains('11.0.0.0/8', address)).toBe(false);
    expect(Ip.contains('10.0.0.0/8', address)).toBe(true);
    expect(Ip.contains('10.0.0.1/8', address)).toBe(true);
    expect(Ip.contains('10.0.0.10/8', address)).toBe(true);
    expect(Ip.contains('10.5.5.0/16', address)).toBe(true);
    expect(Ip.contains('10.4.5.0/16', address)).toBe(false);
    expect(Ip.contains('10.4.5.0/15', address)).toBe(true);
    expect(Ip.contains('10.5.0.2/32', address)).toBe(false);
    expect(Ip.contains('10.5.0.1/32', address)).toBe(true);
  });

  test('rejects malformed CIDR text', () => {
    for (const text of [
      '10.5.0.1',
      '0.0.0.0/-1',
      '0.0.0.0/33',
      '192.168.1.1/999',
      '0xc0.168.1.1/24',
      '192.168.1/24',
      '2001:db8:f53a::1',
      '2001:db8:f53a::1/-1',
      '2001:db8:f53a::1/129',
      '2001:db8:F53A::1%z/129',
      '2001:db8:F53A::1/64%z',
      '2001:db8:F53A::1/64%',
      '2001:db8:F53A::1/64%z/64',
      '2001:db8:F53A::1%z/64',
    ]) {
      expect(() => Ip.parseCidr(text)).toThrow(Ip.InvalidInputError);
    }
    expect(network('192.168.1.1/24')).toBe('192.168.1.0/24');
    expect(network('0.0.0.0/0')).toBe('0.0.0.0/0');
    expect(network('::/0')).toBe('::/0');
  });

  test('names the special-purpose IPv4 blocks', () => {
    const cases = {
      '0.0.0.0': 'thisNetwork',
      '0.1.0.0': 'thisNetwork',
      '10.1.0.1': 'private',
      '100.64.0.0': 'sharedAddressSpace',
      '100.127.255.255': 'sharedAddressSpace',
      '192.52.193.1': 'amt',
      '192.168.2.1': 'private',
      '192.175.48.0': 'as112',
      '224.100.0.1': 'multicast',
      '169.254.15.0': 'linkLocal',
      '127.1.1.1': 'loopback',
      '255.255.255.255': 'broadcast',
      '240.1.2.3': 'reserved',
      '8.8.8.8': 'unicast',
    };
    for (const [address, range] of Object.entries(cases)) {
      expect([address, Ip.range(address)]).toEqual([address, range]);
    }
  });

  test('builds an IPv6 address from bytes', () => {
    const bytes = new Uint8Array([0x20, 0x01, 0xd, 0xb8, 0xf5, 0x3a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(Ip.fromBytes(bytes)).toEqual(Ip.parse('2001:db8:f53a::1'));
    expect(Ip.fromBytes(words(0x2001, 0xdb8, 0xf53a, 0, 0, 0, 0, 1))).toEqual(Ip.fromBytes(bytes));
  });

  test('formats IPv6 as RFC 5952 says', () => {
    expect(formatWords(0x2001, 0xdb8, 0xf53a, 0, 0, 0, 0, 1)).toBe('2001:db8:f53a::1');
    expect(formatWords(0, 0, 0, 0, 0, 0, 0, 0)).toBe('::');
    expect(formatWords(0, 0, 0, 0, 0, 0, 0, 1)).toBe('::1');
    expect(formatWords(0x2001, 0xdb8, 0, 0, 0, 0, 0, 0)).toBe('2001:db8::');
    expect(formatWords(0, 0xff, 0, 0, 0, 0, 0, 0)).toBe('0:ff::');
    expect(formatWords(0, 0, 0, 0, 0, 0, 0xff, 0)).toBe('::ff:0');
    expect(formatWords(0, 0, 0xff, 0, 0, 0, 0, 0)).toBe('0:0:ff::');
    expect(formatWords(0, 0, 0, 0, 0, 0xff, 0, 0)).toBe('::ff:0:0');
    expect(formatWords(0, 0, 0, 0xff, 0xff, 0, 0, 0)).toBe('::ff:ff:0:0:0');
    expect(formatWords(0, 0, 0xff, 0xff, 0, 0, 0xff, 0xff)).toBe('::ff:ff:0:0:ff:ff');
    expect(formatWords(0, 0, 1, 0, 0, 1, 0, 0)).toBe('::1:0:0:1:0:0');
    expect(formatWords(0x2001, 0xdb8, 0, 0, 1, 0, 0, 1)).toBe('2001:db8::1:0:0:1');
    expect(formatWords(0x2001, 0, 0, 0, 0xff, 0, 0, 0)).toBe('2001::ff:0:0:0');
    expect(formatWords(0x2001, 0xdb8, 0xff, 0xabc, 0xdef, 0x123b, 0x456c, 0x78d)).toBe(
      '2001:db8:ff:abc:def:123b:456c:78d',
    );
    expect(formatWords(0x2001, 0xdb8, 0xff, 0xabc, 0, 0x123b, 0x456c, 0x78d)).toBe(
      '2001:db8:ff:abc:0:123b:456c:78d',
    );
    expect(formatWords(0x2001, 0xdb8, 0xff, 0xabc, 0x78d, 0x123b, 0x456c, 0)).toBe(
      '2001:db8:ff:abc:78d:123b:456c:0',
    );
    expect(formatWords(0, 0xdb8, 0xff, 0xabc, 0x78d, 0x123b, 0x456c, 0x2001)).toBe(
      '0:db8:ff:abc:78d:123b:456c:2001',
    );
    expect(formatWords(0x2001, 0xdb8, 0xff, 0xabc, 0, 0, 0x456c, 0x78d)).toBe(
      '2001:db8:ff:abc::456c:78d',
    );
  });

  test('formats IPv6 CIDR blocks', () => {
    expect(network('0:0:0:0:0:0:0:0/64')).toBe('::/64');
    expect(network('0:0:0:ff:ff:0:0:0/64')).toBe('0:0:0:ff::/64');
    expect(network('2001:db8:ff:abc:def:123b:456c:78d/128')).toBe(
      '2001:db8:ff:abc:def:123b:456c:78d/128',
    );
  });

  test('keeps the zone index', () => {
    expect(normalize('2001:db8:f53a:0:0:0:0:1%utun0')).toBe('2001:db8:f53a::1%utun0');
    expect(normalize('2001:db8:f53a::1%2')).toBe('2001:db8:f53a::1%2');
    expect(normalize('2001:db8:f53a::1%WAT')).toBe('2001:db8:f53a::1%WAT');
    expect(normalize('2001:db8:f53a::1%sUp')).toBe('2001:db8:f53a::1%sUp');
    expect(Ip.parse('::%z')).toEqual({ version: 6, bytes: new Uint8Array(16), zone: 'z' });
  });

  test('compresses a trailing zero run before a zone index', () => {
    expect(normalize('fe80:0:0:0:0:0:0:0%eth0')).toBe('fe80::%eth0');
    expect(normalize('2001:db8::%eth0')).toBe('2001:db8::%eth0');
    expect(normalize('fe80::%eth0')).toBe('fe80::%eth0');
    expect(normalize('::%eth0')).toBe('::%eth0');
  });

  test('keeps the zone index of an IPv4-mapped address', () => {
    expect(normalize('::ffff:192.168.1.1%eth0')).toBe('::ffff:192.168.1.1%eth0');
    expect(normalize('::ffff:192.168.1.1%2')).toBe('::ffff:192.168.1.1%2');
  });

  test('exposes IPv6 bytes', () => {
    expect(bytes('2001:db8:f53a::2a:0:1').slice(10, 12)).toEqual([0, 42]);
  });

  test('validates IPv6', () => {
    for (const text of [
      '2001:db8:F53A::1',
      '::ffff:192.168.1.1',
      '::ffff:192.168.1.1%z',
      '::10.2.3.4',
      '::12.34.56.78%z',
      '::1.1.1.1',
      '::1.2.3.4%z',
      '::%z',
      '1:2:3:4:5:6:7::',
      '::1:2:3:4:5:6:7',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, true]);
    }
    for (const text of [
      '200001::1',
      '::ffff:300.168.1.1',
      '::ffff:300.168.1.1:0',
      '::ffff:222.1.41.9000',
      '2001:db8::F53A::1',
      'fe80::wtf',
      'fe80::%',
      '2002::2:',
      '00000::1',
      '00000:0:0:0:0:0:1.2.3.4',
      '1:2:3:4:5:6:7:8::',
      '::1:2:3:4:5:6:7:8',
      '::8:8:8:8:8:8:8:8:8',
      '::8:8:8:8:8:8:8:8:8%z',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
    expect(Ip.canParse(undefined)).toBe(false);
  });

  test('parses IPv6 in different notations', () => {
    expect(Ip.parse('2001:db8:F53A:0:0:0:0:1').bytes).toEqual(
      words(0x2001, 0xdb8, 0xf53a, 0, 0, 0, 0, 1),
    );
    expect(Ip.parse('fe80::10').bytes).toEqual(words(0xfe80, 0, 0, 0, 0, 0, 0, 0x10));
    expect(Ip.parse('2001:db8:F53A::').bytes).toEqual(words(0x2001, 0xdb8, 0xf53a));
    expect(Ip.parse('::1').bytes).toEqual(words(0, 0, 0, 0, 0, 0, 0, 1));
    expect(Ip.parse('::8.8.8.8').bytes).toEqual(words(0, 0, 0, 0, 0, 0, 0x808, 0x808));
    expect(Ip.parse('FFFF::255.255.255.255').bytes).toEqual(
      words(0xffff, 0, 0, 0, 0, 0, 0xffff, 0xffff),
    );
    expect(Ip.parse('64:ff9a::0.0.0.0').bytes).toEqual(words(0x64, 0xff9a));
    expect(Ip.parse('::').bytes).toEqual(words());
  });

  test('rejects malformed IPv6 with InvalidInputError', () => {
    for (const text of [
      'fe80::0::1',
      'foobar',
      '::ffff:999.1.1.1',
      '1::2::3:1.2.3.4',
      '::some.nonsense',
    ]) {
      expect(() => Ip.parse(text)).toThrow(Ip.InvalidInputError);
    }
  });

  test('matches IPv6 CIDR blocks', () => {
    const address = Ip.parse('2001:db8:f53a::1');
    expect(Ip.contains('::/0', address)).toBe(true);
    expect(Ip.contains('2001:db8:f53a::1:1/64', address)).toBe(true);
    expect(Ip.contains('2001:db8:f53b::1:1/48', address)).toBe(false);
    expect(Ip.contains('2001:db8:f531::1:1/44', address)).toBe(true);
    expect(Ip.contains('2001:db8:f500::1/40', address)).toBe(true);
    expect(Ip.contains('2001:db9:f500::1/40', address)).toBe(false);
    expect(Ip.contains('2001:db8:f53a::1/128', address)).toBe(true);
    expect(Ip.contains({ address: Ip.parse('2001:db8:f500::1%z'), prefix: 40 }, address)).toBe(
      true,
    );
    expect(Ip.contains({ address: Ip.parse('2001:db9:f500::1%z'), prefix: 40 }, address)).toBe(
      false,
    );
  });

  test('converts between IPv4 and IPv4-mapped IPv6', () => {
    const mapped = Ip.toIpv6('77.88.21.11');
    expect(mapped.bytes).toEqual(words(0, 0, 0, 0, 0, 0xffff, 0x4d58, 0x150b));
    expect(Ip.unmap(mapped)).toEqual(Ip.parse('77.88.21.11'));
  });

  test('leaves an address that is not IPv4-mapped unchanged', () => {
    expect(Ip.unmap('2001:db8::1')).toEqual(Ip.parse('2001:db8::1'));
    expect(Ip.unmap('8.8.8.8')).toEqual(Ip.parse('8.8.8.8'));
    expect(Ip.unmap('::8.8.8.8').version).toBe(6);
  });

  test('names the special-purpose IPv6 blocks', () => {
    const cases = {
      '::': 'unspecified',
      'fe80::1234:5678:abcd:0123': 'linkLocal',
      'ff00::1234': 'multicast',
      '::1': 'loopback',
      '100::42': 'discard',
      'fc00::': 'uniqueLocal',
      '::ffff:192.168.1.10': 'ipv4Mapped',
      'fec0::1234': 'deprecatedSiteLocal',
      '::ffff:0:192.168.1.10': 'ipv4Translated',
      '64:ff9b::1234': 'ipv4Ipv6Translation',
      '64:ff9b:1::1234': 'ipv4Ipv6Translation',
      '2002:1f63:45e8::1': '6to4',
      '2001::4242': 'teredo',
      '2001:2::': 'benchmarking',
      '2001:3::': 'amt',
      '2001:4:112::': 'as112',
      '2620:4f:8000::': 'as112',
      '2001:10::': 'deprecatedOrchid',
      '2001:20::': 'orchidV2',
      '2001:30::': 'droneRemoteIdProtocolEntityTags',
      '2001:db8::3210': 'documentation',
      '2001:470:8:66::1': 'unicast',
      '2001:470:8:66::1%z': 'unicast',
      '5f00::1': 'segmentRouting',
      '3fff::1': 'documentation',
    };
    for (const [address, range] of Object.entries(cases)) {
      expect([address, Ip.range(address)]).toEqual([address, range]);
    }
  });

  test('unmaps IPv4-mapped addresses', () => {
    expect(Ip.unmap('8.8.8.8').version).toBe(4);
    expect(Ip.unmap('2001:db8:3312::1').version).toBe(6);
    expect(Ip.unmap('::ffff:192.168.1.1').version).toBe(4);
    expect(Ip.unmap('::ffff:192.168.1.1%z').version).toBe(4);
  });

  test('returns bytes in network order', () => {
    expect(bytes('1.2.3.4')).toEqual([1, 2, 3, 4]);
    const google = [42, 0x00, 0x14, 0x50, 0x80, 0x07, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x68];
    expect(bytes('2a00:1450:8007::68')).toEqual(google);
    expect(bytes('2a00:1450:8007::68%z')).toEqual(google);
  });

  test('parses the version from CIDR text', () => {
    expect(Ip.parseCidr('fc00::/64')).toEqual({ address: Ip.parse('fc00::'), prefix: 64 });
    expect(Ip.parseCidr('1.2.3.4/5')).toEqual({ address: Ip.parse('0.0.0.0'), prefix: 5 });
  });

  test('matches an address only against blocks of its own version', () => {
    expect(Ip.contains('fe80::/64', '1.2.3.4')).toBe(false);
    expect(Ip.contains('1.2.3.0/24', 'fe80::1')).toBe(false);
    const dual = ['1.2.4.0/24', '2001:1:2:3::/64'].map(Ip.parseCidr);
    expect(dual.some((cidr) => Ip.contains(cidr, '1.2.4.1'))).toBe(true);
    expect(dual.some((cidr) => Ip.contains(cidr, '2001:1:2:3::1'))).toBe(true);
  });

  test('builds either version from bytes', () => {
    expect(Ip.fromBytes(new Uint8Array([0x7f, 0, 0, 1])).version).toBe(4);
    expect(Ip.fromBytes(words(0x2001, 0xdb8, 0xf53a, 0, 0, 0, 0, 1)).version).toBe(6);
    expect(() => Ip.fromBytes(new Uint8Array([1]))).toThrow(Ip.InvalidInputError);
  });

  test('gives the network address of a CIDR block', () => {
    expect(Ip.format(Ip.parseCidr('172.0.0.1/24').address)).toBe('172.0.0.0');
    expect(Ip.format(Ip.parseCidr('172.0.0.1/5').address)).toBe('168.0.0.0');
    const cases = {
      '::/0': '::',
      '2001:db8:f53a::1:1/64': '2001:db8:f53a::',
      '2001:db8:f53b::1:1/48': '2001:db8:f53b::',
      '2001:db8:f531::1:1/44': '2001:db8:f530::',
      '2001:db8:f500::1/40': '2001:db8:f500::',
      '2001:db9:f500::1/40': '2001:db9:f500::',
      '2001:db8:f53a::1/128': '2001:db8:f53a::1',
    };
    for (const [cidr, address] of Object.entries(cases)) {
      expect([cidr, Ip.format(Ip.parseCidr(cidr).address)]).toEqual([cidr, address]);
    }
  });
});

describe('ip', () => {
  test('converts IPv4 to bytes and back', () => {
    const address = Ip.parse('127.0.0.1');
    expect(address.bytes).toEqual(new Uint8Array([0x7f, 0, 0, 1]));
    expect(Ip.format(Ip.fromBytes(address.bytes))).toBe('127.0.0.1');
  });

  test('reads an address out of a larger buffer', () => {
    const buffer = new Uint8Array(128);
    buffer.set(Ip.parse('127.0.0.1').bytes, 64);
    expect(Ip.format(Ip.fromBytes(buffer.subarray(64, 68)))).toBe('127.0.0.1');
    buffer.set(Ip.parse('abcd::dcba').bytes, 64);
    expect(Ip.format(Ip.fromBytes(buffer.subarray(64, 80)))).toBe('abcd::dcba');
  });

  test('converts IPv6 to bytes and back', () => {
    expect(bytes('::1')).toEqual([...Array(15).fill(0), 1]);
    for (const text of ['::1', '1::', 'abcd::dcba']) {
      expect(Ip.format(Ip.fromBytes(Ip.parse(text).bytes))).toBe(text);
    }
  });

  test('converts IPv6 with an embedded IPv4 address', () => {
    const hex = (text: string) =>
      Array.from(Ip.parse(text).bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex('::ffff:127.0.0.1')).toBe('00000000000000000000ffff7f000001');
    expect(normalize('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
    expect(hex('ffff::127.0.0.1')).toBe('ffff000000000000000000007f000001');
    expect(normalize('ffff::127.0.0.1')).toBe('ffff::7f00:1');
    expect(hex('0:0:0:0:0:ffff:127.0.0.1')).toBe('00000000000000000000ffff7f000001');
    expect(normalize('0:0:0:0:0:ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
  });

  test('masks an address with a CIDR prefix', () => {
    expect(Ip.format(Ip.parseCidr('192.168.1.134/24').address)).toBe('192.168.1.0');
    expect(Ip.format(Ip.parseCidr('::1/0').address)).toBe('::');
  });

  test('computes the network of a subnet and what it contains', () => {
    expect(network('192.168.1.134/26')).toBe('192.168.1.128/26');
    for (const cidr of ['192.168.1.134/26', Ip.parseCidr('192.168.1.134/26')]) {
      expect(Ip.contains(cidr, '192.168.1.180')).toBe(true);
      expect(Ip.contains(cidr, '192.168.1.195')).toBe(false);
    }
    expect(Ip.contains('192.168.1.134/32', '192.168.1.134')).toBe(true);
    expect(Ip.contains('192.168.1.134/32', '192.168.1.135')).toBe(false);
    expect(Ip.contains('192.168.1.134/31', '192.168.1.135')).toBe(true);
    expect(Ip.contains('192.168.1.134/31', '192.168.1.133')).toBe(false);
  });

  test('masks CIDR text to its network', () => {
    expect(network('192.168.1.134/26')).toBe('192.168.1.128/26');
    expect(network('2607:f0d0:1002:51::4/56')).toBe('2607:f0d0:1002::/56');
  });

  test('compares addresses, treating IPv4-mapped IPv6 as IPv4 after unmap', () => {
    const same = (a: string, b: string) => Ip.compare(Ip.unmap(a), Ip.unmap(b)) === 0;
    expect(same('127.0.0.1', '::7f00:2')).toBe(false);
    expect(same('127.0.0.1', '::ffff:7f00:1')).toBe(true);
    expect(same('127.0.0.1', '::ffaf:7f00:1')).toBe(false);
    expect(same('::ffff:127.0.0.1', '::ffff:127.0.0.1')).toBe(true);
    expect(same('::ffff:127.0.0.1', '127.0.0.1')).toBe(true);
  });

  test('accepts only the dotted-decimal IPv4 form', () => {
    expect(bytes('127.0.0.1')).toEqual([127, 0, 0, 1]);
    for (const text of [
      '127.1',
      '127.0.1',
      '0x7f.0x0.0x0.0x1',
      '0x7f000001',
      '010.0.0.01',
      '256.100.50.25',
      '019.0.0.1',
      '0xGG.0.0.1',
      '',
      '192.168.0.1.100',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
  });

  test('classifies private and internal addresses', () => {
    const cases = {
      '127.0.0.1': 'loopback',
      '192.168.0.123': 'private',
      '192.168.122.123': 'private',
      '192.162.1.2': 'unicast',
      '172.16.0.5': 'private',
      '172.16.123.254': 'private',
      '171.16.0.5': 'unicast',
      '172.25.232.15': 'private',
      '172.15.0.5': 'unicast',
      '172.32.0.5': 'unicast',
      '169.254.2.3': 'linkLocal',
      '169.254.221.9': 'linkLocal',
      '168.254.2.3': 'unicast',
      '10.0.2.3': 'private',
      '10.1.23.45': 'private',
      '12.1.2.3': 'unicast',
      'fd12:3456:789a:1::1': 'uniqueLocal',
      'fe80::f2de:f1ff:fe3f:307e': 'linkLocal',
      '165.225.132.33': 'unicast',
      '::': 'unspecified',
      '::1': 'loopback',
      'fe80::1': 'linkLocal',
    };
    for (const [address, range] of Object.entries(cases)) {
      expect([address, Ip.range(address)]).toEqual([address, range]);
    }
    const mapped = {
      '::ffff:10.100.1.42': 'private',
      '::FFFF:172.16.200.1': 'private',
      '::ffff:192.168.0.1': 'private',
    };
    for (const [address, range] of Object.entries(mapped)) {
      expect([address, Ip.range(address)]).toEqual([address, 'ipv4Mapped']);
      expect([address, Ip.range(Ip.unmap(address))]).toEqual([address, range]);
    }
  });

  test('detects loopback addresses', () => {
    expect(Ip.range('127.0.0.1')).toBe('loopback');
    expect(Ip.range('127.8.8.8')).toBe('loopback');
    expect(Ip.range('::1')).toBe('loopback');
    expect(Ip.range('8.8.8.8')).toBe('unicast');
    expect(Ip.range('192.168.1.1')).toBe('private');
    expect(Ip.range('fe80::1')).toBe('linkLocal');
    expect(Ip.range('::')).toBe('unspecified');
  });

  test('rejects octal, hex, and integer loopback forms instead of guessing', () => {
    for (const text of [
      '0177.0.0.1',
      '0177.0.1',
      '0177.1',
      '0x7f.0.0.1',
      '0x7f.0.1',
      '0x7f.1',
      '2130706433',
    ]) {
      expect(() => Ip.range(text)).toThrow(Ip.InvalidInputError);
    }
  });
});

describe('is-ip', () => {
  test('accepts IPv4 and IPv6', () => {
    for (const text of [
      '192.168.0.1',
      '1:2:3:4:5:6:7:8',
      '::1',
      '2001:0dc5:72a3:0000:0000:802e:3370:73E4',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, true]);
    }
  });

  test('accepts only IPv6 with version 6', () => {
    for (const text of [
      '1:2:3:4:5:6:7:8',
      '::1',
      '0000:0000:0000:0000:0000:0000:0000:0000',
      '0000:0000:0000:0000:0000:ffff:192.168.100.228',
      '2001:0dc5:72a3:0000:0000:802e:3370:73E4',
    ]) {
      expect([text, Ip.canParse(text, { version: 6 })]).toEqual([text, true]);
    }
    expect(Ip.canParse('2001:0dc5:72a3:0000:0000:802e:3370:73E4XXXXXXXX', { version: 6 })).toBe(
      false,
    );
    expect(Ip.canParse('192.168.0.1', { version: 6 })).toBe(false);
  });

  test('accepts only IPv4 with version 4', () => {
    expect(Ip.canParse('192.168.0.1', { version: 4 })).toBe(true);
    expect(Ip.canParse('123.123.123.1234', { version: 4 })).toBe(false);
    expect(Ip.canParse('123.123.123.12345', { version: 4 })).toBe(false);
    expect(Ip.canParse('::1', { version: 4 })).toBe(false);
  });

  test('reports the version', () => {
    expect(Ip.parse('192.168.0.1').version).toBe(4);
    expect(Ip.parse('1:2:3:4:5:6:7:8').version).toBe(6);
    expect(() => Ip.parse('abc')).toThrow(Ip.InvalidInputError);
    expect(() => Ip.parse('123.123.123.12345')).toThrow(Ip.InvalidInputError);
  });
});

describe('known upstream issues', () => {
  test('CVE-2023-42282: a hex or short loopback address is not accepted as public', () => {
    for (const text of ['0x7f.1', '0x7f.0.0.1', '127.1', '0']) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
  });

  test('CVE-2024-29415: octal, integer, and odd IPv6 spellings of internal addresses', () => {
    for (const text of ['127.1', '01200034567', '012.1.2.3', '017700000001', '0177.0.0.1']) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
    expect(Ip.range('000:0:0000::01')).toBe('loopback');
    expect(Ip.range('::fFFf:127.0.0.1')).toBe('ipv4Mapped');
    expect(Ip.range(Ip.unmap('::fFFf:127.0.0.1'))).toBe('loopback');
    expect(Ip.range(Ip.unmap('::ffff:7f00:1'))).toBe('loopback');
    expect(Ip.range(Ip.unmap('::ffff:a9fe:a9fe'))).toBe('linkLocal');
  });

  test('an IPv4-mapped address matches an IPv4 block in any notation', () => {
    expect(Ip.contains('127.0.0.0/8', '::ffff:7f00:1')).toBe(true);
    expect(Ip.contains('127.0.0.0/8', '::ffff:127.0.0.1')).toBe(true);
    expect(Ip.contains('10.0.0.0/8', '0:0:0:0:0:FFFF:10.1.2.3')).toBe(true);
    expect(Ip.contains('::ffff:0:0/96', '127.0.0.1')).toBe(true);
  });

  test('the IPv4 part of an IPv6 address may not have leading zeros', () => {
    expect(Ip.canParse('::ffff:0177.0.0.1')).toBe(false);
    expect(Ip.canParse('::ffff:010.0.0.1')).toBe(false);
  });

  test('999.999.999.999 is not an address, and IPv4 is not IPv6', () => {
    expect(Ip.canParse('999.999.999.999')).toBe(false);
    expect(Ip.canParse('127.0.0.1', { version: 6 })).toBe(false);
  });

  test('198.18.0.0/15 is benchmarking, not public', () => {
    expect(Ip.range('198.18.0.1')).toBe('benchmarking');
    expect(Ip.range('198.19.255.255')).toBe('benchmarking');
    expect(Ip.range('198.20.0.0')).toBe('unicast');
  });

  test('::a.b.c.d is IPv4-compatible, not IPv4-mapped', () => {
    expect(normalize('::8.8.8.8')).toBe('::808:808');
    expect(Ip.range('::8.8.8.8')).toBe('reserved');
    expect(Ip.range('::7f00:1')).toBe('reserved');
  });

  test('matching across versions returns false instead of throwing', () => {
    expect(Ip.contains('2001:db8::/32', '192.0.2.1')).toBe(false);
    expect(Ip.contains('192.0.2.0/24', '2001:db8::1')).toBe(false);
  });
});

describe('parse', () => {
  test('accepts every edge of the IPv4 grammar', () => {
    expect(bytes('0.0.0.0')).toEqual([0, 0, 0, 0]);
    expect(bytes('255.255.255.255')).toEqual([255, 255, 255, 255]);
    expect(bytes('10.0.100.199')).toEqual([10, 0, 100, 199]);
    for (const text of [
      '1.2.3.4.',
      '.1.2.3.4',
      '1..2.3',
      '1.2.3.4 ',
      ' 1.2.3.4',
      '1.2.3.256',
      '00.0.0.0',
      '1.2.3.4%z',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
  });

  test('accepts every edge of the IPv6 grammar', () => {
    for (const text of [
      '::',
      '::1',
      '1::',
      '1:2:3:4:5:6:7:8',
      '1:2:3:4:5:6:1.2.3.4',
      '1::1.2.3.4',
      'fe80::1%eth0',
      'fe80::1%en0.1_a~b-c',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, true]);
    }
    for (const text of [
      ':',
      ':::',
      ':1::',
      '1::2:',
      '1:2:3:4:5:6:7:1.2.3.4',
      '::1.2.3',
      '::1.2.3.4:1',
      '1:2:3:4:5:6:7',
      '1:2:3:4:5:6:7:8:9',
      'fe80::1%a b',
      'fe80::1%a%b',
      'fe80::1%a:b',
      '[::1]',
      'g::',
    ]) {
      expect([text, Ip.canParse(text)]).toEqual([text, false]);
    }
  });

  test('copies the bytes passed to fromBytes', () => {
    const source = new Uint8Array([1, 2, 3, 4]);
    const address = Ip.fromBytes(source);
    source[0] = 9;
    expect(Ip.format(address)).toBe('1.2.3.4');
  });
});

describe('compare', () => {
  test('sorts IPv4 before IPv6, then by bytes, then by zone', () => {
    const sorted = [
      '::1',
      '10.0.0.2',
      'fe80::1%b',
      '2001:db8::',
      'fe80::1',
      '10.0.0.10',
      '9.255.255.255',
      'fe80::1%a',
    ].sort(Ip.compare);
    expect(sorted).toEqual([
      '9.255.255.255',
      '10.0.0.2',
      '10.0.0.10',
      '::1',
      '2001:db8::',
      'fe80::1',
      'fe80::1%a',
      'fe80::1%b',
    ]);
  });

  test('treats different spellings of one address as equal', () => {
    expect(Ip.compare('2001:DB8:0:0::1', '2001:db8::1')).toBe(0);
    expect(Ip.compare('127.0.0.1', '::ffff:127.0.0.1')).not.toBe(0);
  });
});

describe('format', () => {
  test('writes IPv4-mapped addresses in mixed notation and nothing else', () => {
    expect(normalize('::ffff:c000:201')).toBe('::ffff:192.0.2.1');
    expect(normalize('::ffff:0:0')).toBe('::ffff:0.0.0.0');
    expect(normalize('::fffe:c000:201')).toBe('::fffe:c000:201');
    expect(normalize('64:ff9b::192.0.2.1')).toBe('64:ff9b::c000:201');
  });

  test('does not compress a single zero group', () => {
    expect(normalize('1:0:1:1:1:1:1:1')).toBe('1:0:1:1:1:1:1:1');
    expect(normalize('1:0:0:1:0:0:0:1')).toBe('1:0:0:1::1');
  });
});

describe('reverseName', () => {
  test('names IPv4 under in-addr.arpa', () => {
    expect(Ip.reverseName('192.0.2.1')).toBe('1.2.0.192.in-addr.arpa');
    expect(Ip.reverseName(Ip.parse('127.0.0.1'))).toBe('1.0.0.127.in-addr.arpa');
  });

  test('names IPv6 under ip6.arpa, one hex digit per label', () => {
    expect(Ip.reverseName('2001:db8::567:89ab')).toBe(
      'b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
    );
    expect(Ip.reverseName('::ffff:1.2.3.4')).toBe(
      '4.0.3.0.2.0.1.0.f.f.f.f.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa',
    );
    expect(Ip.reverseName(Ip.unmap('::ffff:1.2.3.4'))).toBe('4.3.2.1.in-addr.arpa');
  });
});

describe('range', () => {
  test('names every IANA special-purpose IPv4 block', () => {
    const cases = {
      '192.0.0.8': 'ietfProtocolAssignments',
      '192.0.2.255': 'documentation',
      '198.51.100.7': 'documentation',
      '203.0.113.200': 'documentation',
      '192.31.196.1': 'as112',
      '192.88.99.1': '6to4RelayAnycast',
      '172.31.255.255': 'private',
      '100.63.255.255': 'unicast',
      '100.128.0.0': 'unicast',
      '223.255.255.255': 'unicast',
      '239.255.255.255': 'multicast',
      '255.255.255.254': 'reserved',
    };
    for (const [address, range] of Object.entries(cases)) {
      expect([address, Ip.range(address)]).toEqual([address, range]);
    }
  });

  test('names every IANA special-purpose IPv6 block', () => {
    const cases = {
      '100:0:0:1::1': 'dummy',
      '2001:1::1': 'ietfProtocolAssignments',
      '2001:1ff::': 'ietfProtocolAssignments',
      '2001:200::1': 'unicast',
      '2001:db8:ffff::': 'documentation',
      '3fff:fff::': 'documentation',
      '3fff:1000::': 'unicast',
      '4000::1': 'reserved',
      '1fff:ffff::': 'reserved',
      'fdff::1': 'uniqueLocal',
      'febf::1': 'linkLocal',
      'feff::1': 'deprecatedSiteLocal',
    };
    for (const [address, range] of Object.entries(cases)) {
      expect([address, Ip.range(address)]).toEqual([address, range]);
    }
  });
});
