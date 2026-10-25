import { describe, expect, test } from 'vite-plus/test';
import * as Idna from '@portable/idna';
import { decode, encode } from '../src/internal/punycode.js';

// Cases from punycode.js 2.3.1 tests/tests.js (MIT, Mathias Bynens), most of them from RFC 3492
// section 7.1.
const strings = [
  { description: 'a single basic code point', decoded: 'Bach', encoded: 'Bach-' },
  { description: 'a single non-ASCII character', decoded: '\xFC', encoded: 'tda' },
  {
    description: 'multiple non-ASCII characters',
    decoded: '\xFC\xEB\xE4\xF6♥',
    encoded: '4can8av2009b',
  },
  {
    description: 'mix of ASCII and non-ASCII characters',
    decoded: 'b\xFCcher',
    encoded: 'bcher-kva',
  },
  {
    description: 'long string with both ASCII and non-ASCII characters',
    decoded: 'Willst du die Bl\xFCthe des fr\xFChen, die Fr\xFCchte des sp\xE4teren Jahres',
    encoded: 'Willst du die Blthe des frhen, die Frchte des spteren Jahres-x9e96lkal',
  },
  {
    description: 'Arabic (Egyptian)',
    decoded: 'ليهمابتكلموشعربي؟',
    encoded: 'egbpdaj6bu4bxfgehfvwxn',
  },
  {
    description: 'Chinese (simplified)',
    decoded: '他们为什么不说中文',
    encoded: 'ihqwcrb4cv8a8dqg056pqjye',
  },
  {
    description: 'Chinese (traditional)',
    decoded: '他們爲什麽不說中文',
    encoded: 'ihqwctvzc91f659drss3x8bo0yb',
  },
  {
    description: 'Czech',
    decoded: 'Pročprostěnemluv\xEDčesky',
    encoded: 'Proprostnemluvesky-uyb24dma41a',
  },
  {
    description: 'Hebrew',
    decoded: 'למההםפשוטלאמדבריםעברית',
    encoded: '4dbcagdahymbxekheh6e0a7fei0b',
  },
  {
    description: 'Hindi (Devanagari)',
    decoded: 'यहलोगहिन्दीक्योंनहींबोलसकतेहैं',
    encoded: 'i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd',
  },
  {
    description: 'Japanese (kanji and hiragana)',
    decoded: 'なぜみんな日本語を話してくれないのか',
    encoded: 'n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa',
  },
  {
    description: 'Korean (Hangul syllables)',
    decoded: '세계의모든사람들이한국어를이해한다면얼마나좋을까',
    encoded: '989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c',
  },
  {
    description: 'Russian (Cyrillic), without mixed-case annotation',
    decoded: 'почемужеонинеговорятпорусски',
    encoded: 'b1abfaaepdrnnbgefbadotcwatmq2g4l',
  },
  {
    description: 'Spanish',
    decoded: 'Porqu\xE9nopuedensimplementehablarenEspa\xF1ol',
    encoded: 'PorqunopuedensimplementehablarenEspaol-fmd56a',
  },
  {
    description: 'Vietnamese',
    decoded: 'Tạisaohọkh\xF4ngthểchỉn\xF3itiếngViệt',
    encoded: 'TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g',
  },
  {
    description: '3B-ww4c5e180e575a65lsy2b',
    decoded: '3年B組金八先生',
    encoded: '3B-ww4c5e180e575a65lsy2b',
  },
  {
    description: '-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n',
    decoded: '安室奈美恵-with-SUPER-MONKEYS',
    encoded: '-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n',
  },
  {
    description: 'Hello-Another-Way--fc4qua05auwb3674vfr0b',
    decoded: 'Hello-Another-Way-それぞれの場所',
    encoded: 'Hello-Another-Way--fc4qua05auwb3674vfr0b',
  },
  {
    description: '2-u9tlzr9756bt3uc0v',
    decoded: 'ひとつ屋根の下2',
    encoded: '2-u9tlzr9756bt3uc0v',
  },
  {
    description: 'MajiKoi5-783gue6qz075azm5e',
    decoded: 'MajiでKoiする5秒前',
    encoded: 'MajiKoi5-783gue6qz075azm5e',
  },
  { description: 'de-jg4avhby1noc0d', decoded: 'パフィーdeルンバ', encoded: 'de-jg4avhby1noc0d' },
  { description: 'd9juau41awczczp', decoded: 'そのスピードで', encoded: 'd9juau41awczczp' },
  {
    description: 'ASCII string that breaks the existing rules for host-name labels',
    decoded: '-> $1.00 <-',
    encoded: '-> $1.00 <--',
  },
];

const domains = [
  { description: 'ma\xF1ana.com', decoded: 'ma\xF1ana.com', encoded: 'xn--maana-pta.com' },
  { description: 'a trailing dot', decoded: 'example.com.', encoded: 'example.com.' },
  { description: 'b\xFCcher.com', decoded: 'b\xFCcher.com', encoded: 'xn--bcher-kva.com' },
  { description: 'caf\xE9.com', decoded: 'caf\xE9.com', encoded: 'xn--caf-dma.com' },
  { description: '☃-⌘.com', decoded: '☃-⌘.com', encoded: 'xn----dqo34k.com' },
  {
    description: '퐀☃-⌘.com',
    decoded: '퐀☃-⌘.com',
    encoded: 'xn----dqo34kn65z.com',
  },
  { description: 'Emoji', decoded: '💩.la', encoded: 'xn--ls8h.la' },
];

describe('punycode.js: decode', () => {
  test.each(strings)('$description', ({ decoded, encoded }) => {
    expect(decode(encoded)).toBe(decoded);
  });

  test('handles uppercase Z', () => {
    expect(decode('ZZZ')).toBe('箥');
  });

  test('rejects a non-basic code point before the delimiter', () => {
    expect(decode('\x81-')).toBeUndefined();
  });

  test('rejects a non-basic code point after the delimiter', () => {
    expect(decode('\x81')).toBeUndefined();
  });

  test('rejects a character that is not a base-36 digit', () => {
    expect(decode('ls8h=')).toBeUndefined();
  });

  test('rejects input that ends in the middle of a number', () => {
    expect(decode('b')).toBeUndefined();
  });

  test('rejects a delta that overflows', () => {
    expect(decode('99999999999')).toBeUndefined();
  });
});

describe('punycode.js: encode', () => {
  test.each(strings)('$description', ({ decoded, encoded }) => {
    expect(encode(decoded)).toBe(encoded);
  });

  test('encodes astral code points as one code point', () => {
    expect(encode('💩')).toBe('ls8h');
  });
});

describe('punycode.js: toUnicode', () => {
  test.each(domains)('$description', ({ decoded, encoded }) => {
    expect(Idna.toUnicode(encoded)).toBe(decoded);
  });

  test('decodes only the domain of an email address', () => {
    expect(Idna.toUnicode('xn--p-8sbkgc5ag7bhce.xn--ba-lmcq')).toBe('джpумлатест.bрфa');
  });

  test('leaves non-printable ASCII alone', () => {
    expect(Idna.toUnicode('\0\x01\x02foo.bar')).toBe('\0\x01\x02foo.bar');
    expect(Idna.toUnicode('foo\x7F.example')).toBe('foo\x7F.example');
  });

  test('does not decode names that do not start with xn--, but lowercases them', () => {
    for (const { encoded } of strings) {
      expect(Idna.toUnicode(encoded)).toBe(encoded.toLowerCase());
    }
  });
});

describe('punycode.js: toASCII', () => {
  test.each(domains)('$description', ({ decoded, encoded }) => {
    expect(Idna.toAscii(decoded)).toBe(encoded);
  });

  test('encodes only the domain of an email address', () => {
    expect(Idna.toAscii('джpумлатест.bрфa')).toBe('xn--p-8sbkgc5ag7bhce.xn--ba-lmcq');
  });

  test('rejects characters that URL forbids in a host', () => {
    expect(() => Idna.toAscii('\0\x01\x02foo.bar')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('foo\x7F.example')).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('джумла@example.com')).toThrow(Idna.InvalidInputError);
  });

  const forbidden = strings.filter(({ encoded }) => /[ $<>]/.test(encoded));
  const allowed = strings.filter((entry) => !forbidden.includes(entry));

  test('does not convert names that are already ASCII, but lowercases them', () => {
    for (const { encoded } of allowed) {
      expect(Idna.toAscii(encoded)).toBe(encoded.toLowerCase());
    }
  });

  test('rejects ASCII names with characters that URL forbids in a host', () => {
    expect(forbidden.length).toBe(2);
    for (const { encoded } of forbidden) {
      expect(() => Idna.toAscii(encoded)).toThrow(Idna.InvalidInputError);
    }
  });

  test.each(['\x2E', '。', '．', '｡'])('supports %s as a separator', (separator) => {
    expect(Idna.toAscii(`ma\xF1ana${separator}com`)).toBe('xn--maana-pta.com');
  });
});
