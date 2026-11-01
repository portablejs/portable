import { describe, expect, test } from 'vite-plus/test';
import * as Idna from '@portable/idna/url';

describe('toUnicode', () => {
  test('decodes the hostname that URL returns', () => {
    const { hostname } = new URL('https://Bücher.example/');
    expect(Idna.toUnicode(hostname)).toBe('bücher.example');
    expect(Idna.toUnicode('XN--BCHER-KVA.COM')).toBe('bücher.com');
  });

  test('maps and normalizes Unicode input', () => {
    expect(Idna.toUnicode('BÜCHER.example')).toBe('bücher.example');
    expect(Idna.toUnicode('Bücher。example')).toBe('bücher.example');
  });

  test('keeps deviation characters', () => {
    expect(Idna.toUnicode('xn--fu-hia.de')).toBe('fuß.de');
    expect(Idna.toUnicode('Fuß.de')).toBe('fuß.de');
  });

  test('returns the empty string and empty labels as they are', () => {
    expect(Idna.toUnicode('')).toBe('');
    expect(Idna.toUnicode('a..b.')).toBe('a..b.');
  });

  test('rejects invalid Punycode', () => {
    expect(() => Idna.toUnicode('xn--ls8h=')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('www.xn--b.com')).toThrow(Idna.InvalidInputError);
  });

  test('rejects a Punycode label that decodes to ASCII, so xn--google- never displays as google', () => {
    expect(() => Idna.toUnicode('xn--google-')).toThrow(Idna.InvalidInputError);
  });

  test('rejects a Punycode label that encodes an uppercase letter', () => {
    expect(() => Idna.toUnicode('xn--BER-ska.COM')).toThrow(Idna.InvalidInputError);
  });

  test('rejects a Punycode label that decodes to a character IDNA maps', () => {
    expect(() => Idna.toUnicode('xn--v86cr064b')).toThrow(Idna.InvalidInputError);
  });

  test('rejects a zero width joiner outside a virama context', () => {
    expect(() => Idna.toUnicode('xn--1ugz855p6kd.com')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('a\u200Db')).toThrow(Idna.InvalidInputError);
    expect(Idna.toUnicode('\u0915\u094D\u200D')).toBe('\u0915\u094D\u200D');
  });

  test('rejects a zero width non-joiner outside a joining context', () => {
    expect(() => Idna.toUnicode('a\u200Cb')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('xn--ab-j1t')).toThrow(Idna.InvalidInputError);
  });

  test('allows a zero width non-joiner between joining letters', () => {
    expect(Idna.toUnicode('xn--mgba3gch31f060k')).toBe('نامه‌ای');
  });

  test('applies the bidi rule, which Node and workerd skip', () => {
    expect(Idna.toUnicode('a.א')).toBe('a.א');
    expect(() => Idna.toUnicode('0a.א')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('0à.א')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('xn--0-sfa.xn--4db')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('אa')).toThrow(Idna.InvalidInputError);
    expect(Idna.toUnicode('مثال.إختبار')).toBe('مثال.إختبار');
  });

  test('rejects Unicode input that URL reads as an IPv4 address', () => {
    expect(() => Idna.toUnicode('１２７.０.０.１')).toThrow(Idna.InvalidInputError);
  });

  test('rejects characters that URL treats as delimiters or forbids in a host', () => {
    for (const domain of ['a/b', 'a?b', 'a#b', 'a@b', 'a:80', 'a b', 'a%41', 'ü<b']) {
      expect(() => Idna.toUnicode(domain)).toThrow(Idna.InvalidInputError);
    }
  });

  test('strict also applies the hyphen and STD 3 rules', () => {
    expect(Idna.toUnicode('-a.b_c')).toBe('-a.b_c');
    expect(() => Idna.toUnicode('-a', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('ab--c', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('b_c', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toUnicode('xn--b_c-hoa', { strict: true })).toThrow(Idna.InvalidInputError);
  });

  test('reverses toAscii', () => {
    for (const domain of ['bücher.example', '☕.example', 'example.com', 'نامه‌ای.ir']) {
      expect(Idna.toUnicode(Idna.toAscii(domain))).toBe(domain);
    }
  });
});

describe('toAscii', () => {
  test('matches the hostname that URL returns', () => {
    for (const domain of [
      'Bücher.example',
      'faß.de',
      'EXAMPLE.com',
      '☕.example',
      'ＡＢＣ。example',
    ]) {
      expect(Idna.toAscii(domain)).toBe(new URL(`http://${domain}/`).hostname);
    }
  });

  test('lowercases ASCII input without validating it, as URL does', () => {
    expect(Idna.toAscii('WWW.XN--B.COM')).toBe('www.xn--b.com');
    expect(Idna.toAscii('-a_b-.example')).toBe('-a_b-.example');
  });

  test('checks the xn-- labels in Unicode input', () => {
    expect(() => Idna.toAscii('xn--b.bücher.example')).toThrow(Idna.InvalidInputError);
  });

  test('applies the bidi rule', () => {
    expect(() => Idna.toAscii('0à.א')).toThrow(Idna.InvalidInputError);
  });

  test('rejects an empty result', () => {
    expect(() => Idna.toAscii('')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('­')).toThrow(Idna.InvalidInputError);
  });

  test('rejects characters that URL forbids in a host', () => {
    expect(() => Idna.toAscii('a b.example')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('a%41.example')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('a<b.example')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('www.example.net⩴80')).toThrow(Idna.InvalidInputError);
  });

  test('rejects a whole URL instead of encoding it as one label', () => {
    expect(() => Idna.toAscii('https://ğğl.com')).toThrow(Idna.InvalidInputError);
  });

  test('strict rejects empty labels and labels over 63 characters', () => {
    expect(() => Idna.toAscii('example.com.', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('a..b', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(Idna.toAscii('a'.repeat(63), { strict: true })).toBe('a'.repeat(63));
    expect(() => Idna.toAscii('a'.repeat(64), { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('é'.repeat(60), { strict: true })).toThrow(Idna.InvalidInputError);
  });

  test('strict rejects names over 253 characters', () => {
    const label = 'a'.repeat(63);
    const name = [label, label, label, 'a'.repeat(61)].join('.');
    expect(Idna.toAscii(name, { strict: true })).toBe(name);
    expect(() => Idna.toAscii(`${name}a`, { strict: true })).toThrow(Idna.InvalidInputError);
  });
});

describe('InvalidInputError', () => {
  test('is the class that the main entry point throws', async () => {
    const Full = await import('@portable/idna');
    expect(Idna.InvalidInputError).toBe(Full.InvalidInputError);
    expect(() => Idna.toUnicode('xn--ls8h=')).toThrow(Full.InvalidInputError);
  });
});
