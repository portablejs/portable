import { describe, expect, test } from 'vite-plus/test';
import { big5 } from '@portable/charset/big5';
import { eucJp } from '@portable/charset/euc-jp';
import { eucKr } from '@portable/charset/euc-kr';
import { gb18030, gbk } from '@portable/charset/gbk';
import * as Charset from '@portable/charset';
import { iso2022Jp } from '@portable/charset/iso-2022-jp';
import { shiftJis } from '@portable/charset/shift_jis';
import * as singleByte from '@portable/charset/single-byte';
import { binary, hex } from './utils.js';

const ascii = Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)).join('');

type Case = {
  name: string;
  labels: readonly string[];
  strings: Record<string, [text: string, bytes: string]>;
  unmappable: string;
};

// From iconv-lite's cyrillic, greek and turkish tests. The bytes are written as Latin-1 text.
const singleByteCases = [
  {
    name: 'windows-1251',
    labels: ['win1251', 'Windows-1251', 'windows1251', 'CP1251', '1251'],
    strings: {
      empty: ['', ''],
      hi: ['Привет!', '\xcf\xf0\xe8\xe2\xe5\xf2!'],
      ascii: [ascii, ascii],
      rus: [
        'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя',
        Array.from({ length: 64 }, (_, i) => String.fromCharCode(0xc0 + i)).join(''),
      ],
      additional: [
        'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ\xa0ЎўЈ¤Ґ¦§Ё©Є«¬\xAD®Ї°±Ііґµ¶·ё№є»јЅѕї',
        Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x80 + i))
          .filter((char) => char !== '\x98')
          .join(''),
      ],
    },
    unmappable: '£Åçþÿ¿',
  },
  {
    name: 'KOI8-R',
    labels: ['koi8r', 'KOI8-R', 'cp20866', '20866'],
    strings: {
      hi: ['Привет!', '\xf0\xd2\xc9\xd7\xc5\xd4!'],
      ascii: [ascii, ascii],
      rus: [
        'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя',
        '\xe1\xe2\xf7\xe7\xe4\xe5\xf6\xfa\xe9\xea\xeb\xec\xed\xee\xef\xf0\xf2\xf3\xf4\xf5\xe6\xe8\xe3\xfe\xfb\xfd\xff\xf9\xf8\xfc\xe0\xf1\xc1\xc2\xd7\xc7\xc4\xc5\xd6\xda\xc9\xca\xcb\xcc\xcd\xce\xcf\xd0\xd2\xd3\xd4\xd5\xc6\xc8\xc3\xde\xdb\xdd\xdf\xd9\xd8\xdc\xc0\xd1',
      ],
      additional: [
        '─│┌┐└┘├┤┬┴┼▀▄█▌▐░▒▓⌠■∙√≈≤≥\xa0⌡°²·÷═║╒ё╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡Ё╢╣╤╥╦╧╨╩╪╫╬©',
        Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x80 + i)).join(''),
      ],
    },
    unmappable: '£Åçþÿ¿',
  },
  {
    name: 'ISO-8859-5',
    labels: ['iso88595', 'ISO-8859-5', 'ISO 8859-5', 'cp28595', '28595'],
    strings: {
      hi: ['Привет!', '\xbf\xe0\xd8\xd2\xd5\xe2!'],
      ascii: [ascii, ascii],
      rus: [
        'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя',
        Array.from({ length: 64 }, (_, i) => String.fromCharCode(0xb0 + i)).join(''),
      ],
      additional: [
        '\xa0ЁЂЃЄЅІЇЈЉЊЋЌ\xadЎЏ№ёђѓєѕіїјљњћќ§ўџ',
        '\xa0\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xad\xae\xaf\xf0\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff',
      ],
    },
    unmappable: '£Åçþÿ¿',
  },
  {
    name: 'windows-1253',
    labels: ['windows-1253', 'win-1253', 'win1253', 'cp1253', 'cp-1253', '1253'],
    strings: {
      hi: ['Γειά!', '\xc3\xe5\xe9\xdc!'],
      ascii: [ascii, ascii],
      greek: [
        'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩάέήίόύώΆΈΉΊΌΎΏϊϋΪΫ',
        '\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef\xf0\xf1\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf\xd0\xd1\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xdc\xdd\xde\xdf\xfc\xfd\xfe\xa2\xb8\xb9\xba\xbc\xbe\xbf\xfa\xfb\xda\xdb',
      ],
    },
    unmappable: 'Åçþÿ¿',
  },
  {
    name: 'ISO-8859-7',
    labels: ['iso-8859-7', 'greek', 'greek8', 'cp28597', 'cp-28597', '28597'],
    strings: {
      hi: ['Γειά!', '\xc3\xe5\xe9\xdc!'],
      ascii: [ascii, ascii],
      greek: [
        'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩάέήίόύώΆΈΉΊΌΎΏϊϋΪΫ',
        '\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef\xf0\xf1\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf\xd0\xd1\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xdc\xdd\xde\xdf\xfc\xfd\xfe\xb6\xb8\xb9\xba\xbc\xbe\xbf\xfa\xfb\xda\xdb',
      ],
    },
    unmappable: 'Åçþÿ¿',
  },
  {
    name: 'windows-1254',
    labels: ['windows-1254', 'win-1254', 'win1254', 'cp1254', 'cp-1254', '1254'],
    strings: {
      ascii: [ascii, ascii],
      turkish: [
        '€‚ƒ„…†‡ˆ‰Š‹Œ‘’“”•–—˜™š›œŸ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ',
        '\x80\x82\x83\x84\x85\x86\x87\x88\x89\x8a\x8b\x8c\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9a\x9b\x9c\x9f' +
          '\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xae\xaf' +
          Array.from({ length: 80 }, (_, i) => String.fromCharCode(0xb0 + i)).join(''),
      ],
    },
    unmappable: 'Ωب',
  },
  {
    name: 'windows-1254',
    labels: ['iso-8859-9', 'turkish', 'turkish8', 'cp28599', 'cp-28599', '28599'],
    strings: {
      ascii: [ascii, ascii],
      turkish: [
        '\xa0¡¢£¤¥¦§¨©ª«¬\xad®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĞÑÒÓÔÕÖ×ØÙÚÛÜİŞßàáâãäåæçèéêëìíîïğñòóôõö÷øùúûüışÿ',
        Array.from({ length: 96 }, (_, i) => String.fromCharCode(0xa0 + i)).join(''),
      ],
    },
    unmappable: '',
  },
] satisfies Case[];

describe('single-byte charsets', () => {
  for (const { name, labels, strings, unmappable } of singleByteCases) {
    describe(`${name} (${labels[0]})`, () => {
      test('encodes text', async () => {
        const charset = await Charset.load(labels[0]!);
        expect(charset.name).toBe(name);
        for (const [text, bytes] of Object.values(strings)) {
          expect(Charset.encode(text, charset)).toEqual(binary(bytes));
        }
      });

      test('encodes the same with every label', async () => {
        for (const label of labels) {
          const [text, bytes] = Object.values(strings).at(-1)!;
          expect(Charset.encode(text, await Charset.load(label))).toEqual(binary(bytes));
        }
      });

      test("writes '?' for each unmappable character", async () => {
        const charset = await Charset.load(labels[0]!);
        expect(Charset.encode(unmappable, charset)).toEqual(binary('?'.repeat(unmappable.length)));
      });
    });
  }

  test('ISO-8859-8-I and ISO-8859-8-E encode like ISO-8859-8', async () => {
    for (const label of ['iso-8859-8', 'iso-8859-8-i', 'ISO-8859-8-I', 'iso-8859-8-e']) {
      expect(hex(Charset.encode('אבג', await Charset.load(label)))).toBe('e0e1e2');
    }
  });

  test('windows-125x and windows-874 encode the C1 controls their index maps', () => {
    expect(hex(Charset.encode('\x81\x8d\x8e\x8f\x90\x9d\x9e', singleByte.windows1254))).toBe(
      '818d8e8f909d9e',
    );
    expect(hex(Charset.encode('\x81\x8d\x8f\x90\x9d', singleByte.windows1252))).toBe('818d8f909d');
    expect(hex(Charset.encode('\x80', singleByte.windows1252))).toBe('3f');
  });

  test("encode U+FFFD as '?', not as a byte the charset leaves undefined", () => {
    for (const charset of Object.values(singleByte)) {
      expect(hex(Charset.encode('�', charset))).toBe('3f');
    }
  });

  test('KOI8-U is KOI8-RU, with Ў and ў', () => {
    expect(hex(Charset.encode('Ўў', singleByte.koi8U))).toBe('beae');
  });

  test('macintosh maps € and U+F8FF, and Ω only from U+03A9', () => {
    expect(hex(Charset.encode('€\uf8ffΩ', singleByte.macintosh))).toBe('dbf0bd');
    expect(hex(Charset.encode('Ω¤', singleByte.macintosh))).toBe('3f3f');
  });

  test('x-mac-cyrillic is the Mac OS Ukrainian variant, with Ґ, ґ and €', () => {
    expect(hex(Charset.encode('Ґґ€', singleByte.xMacCyrillic))).toBe('a2b6ff');
  });

  test('x-user-defined encodes ASCII and U+F780 to U+F7FF', () => {
    expect(hex(Charset.encode('a\uf780\uf7ff', singleByte.xUserDefined))).toBe('6180ff');
    expect(hex(Charset.encode('\x80\uf800é', singleByte.xUserDefined))).toBe('3f3f3f');
  });
});

describe('Big5', () => {
  test('encodes Chinese and ASCII text', async () => {
    expect(hex(Charset.encode('中文abc', big5))).toBe('a4a4a4e5616263');
    expect(hex(Charset.encode('測試', big5))).toBe('b4fab8d5');
    expect(hex(Charset.encode('中文abc', await Charset.load('cp950')))).toBe('a4a4a4e5616263');
  });

  test('encodes · and ×', () => {
    expect(hex(Charset.encode('·×', big5))).toBe('a150a1d1');
  });

  test('encodes 十, 卅 and the box drawings that appear twice in the index with their last pointer', () => {
    expect(hex(Charset.encode('十', big5))).toBe('a451');
    expect(hex(Charset.encode('卅', big5))).toBe('a4ca');
    expect(hex(Charset.encode('═╞╡╪', big5))).toBe('f9f9f9e9f9ebf9ea');
  });

  test('encodes 起 with its Big5 code, not its HKSCS code', () => {
    expect(hex(Charset.encode('起', big5))).toBe('b05f');
  });

  test('does not encode HKSCS characters below lead byte 0xA1', () => {
    expect(hex(Charset.encode('Ê\u0304', big5))).toBe('3f3f');
    expect(hex(Charset.encode('Ê', big5))).toBe('3f');
    expect(hex(Charset.encode('Ê𠕇', big5))).toBe('3ffa40');
  });
});

describe('GBK and gb18030', () => {
  test('encode Chinese and ASCII text', async () => {
    expect(hex(Charset.encode('中国abc', gbk))).toBe('d6d0b9fa616263');
    expect(hex(Charset.encode('中国abc', await Charset.load('GB2312')))).toBe('d6d0b9fa616263');
    expect(hex(Charset.encode('中国abc', gb18030))).toBe('d6d0b9fa616263');
  });

  test('encode · and ×', () => {
    expect(hex(Charset.encode('·×', gbk))).toBe('a1a4a1c1');
  });

  test('GBK writes € as 0x80 and gb18030 as A2 E3', () => {
    expect(hex(Charset.encode('€', gbk))).toBe('80');
    expect(hex(Charset.encode('€', gb18030))).toBe('a2e3');
  });

  test('gb18030 writes four-byte sequences', () => {
    const cases: Record<string, string> = {
      '\u0080': '81308130',
      '\u0081': '81308131',
      '\u008b': '81308231',
      '\u0615': '81318231',
      㦟: '82318231',
      '\u{106677}': 'e0318231',
      '\u{10000}': '90308130',
      '\u{10ffff}': 'e3329a35',
      '�': '8431a437',
    };
    for (const [text, bytes] of Object.entries(cases)) {
      expect(hex(Charset.encode(text, gb18030))).toBe(bytes);
    }
  });

  test('GBK has no four-byte sequences', () => {
    expect(hex(Charset.encode('\u0080㦟😀\ue7c7', gbk))).toBe('3f3f3f3f');
  });

  test('gb18030 applies the GB18030-2005 changes', () => {
    expect(hex(Charset.encode('ḿ\u0000\ue7c7', gb18030))).toBe('a8bc008135f437');
  });

  test('gb18030 writes the GB18030-2022 characters with their two-byte codes', () => {
    expect(hex(Charset.encode('龴︐', gb18030))).toBe('fe59a6d9');
    expect(hex(Charset.encode('\ue81e\ue78d', gb18030))).toBe('fe59a6d9');
  });

  test('U+E5E5 is unmappable, because A3 A0 decodes to U+3000', () => {
    expect(hex(Charset.encode('\ue5e5', gb18030))).toBe('3f');
    expect(hex(Charset.encode('\u3000', gb18030))).toBe('a1a1');
  });
});

describe('Shift_JIS', () => {
  test('encodes Japanese and ASCII text', () => {
    expect(hex(Charset.encode('中文abc', shiftJis))).toBe('928695b6616263');
    expect(hex(Charset.encode('測試', shiftJis))).toBe('91aa8e8e');
  });

  test('encodes characters duplicated in the NEC rows with their IBM extension codes', () => {
    expect(hex(Charset.encode('纊＂ⅰ', shiftJis))).toBe('fa5cfa57fa40');
  });

  test('does not encode the user-defined area that F0 40 to F9 FC decode to', () => {
    expect(hex(Charset.encode('\ue000\ue233\ue757', shiftJis))).toBe('3f3f3f');
  });

  test('includes the NEC extensions', () => {
    expect(hex(Charset.encode('①', shiftJis))).toBe('8740');
  });

  test('encodes ¥, ‾, U+0080, halfwidth katakana and the minus sign', () => {
    expect(hex(Charset.encode('¥‾\x80ｱﾟ−', shiftJis))).toBe('5c7e80b1df817c');
  });
});

describe('EUC-JP', () => {
  test('encodes Japanese, halfwidth katakana, ¥ and ‾', () => {
    expect(hex(Charset.encode('日本ｱ¥‾−', eucJp))).toBe('c6fccbdc8eb15c7ea1dd');
  });

  test('does not encode JIS X 0212 characters', () => {
    const text = new TextDecoder('euc-jp').decode(new Uint8Array([0x8f, 0xa2, 0xc2]));
    expect(text).toBe('¡');
    expect(hex(Charset.encode(text, eucJp))).toBe('3f');
  });
});

describe('ISO-2022-JP', () => {
  test('stays in ASCII for ASCII text', () => {
    expect(hex(Charset.encode('abc', iso2022Jp))).toBe('616263');
  });

  test('switches to JIS X 0208 and back to ASCII at the end', () => {
    expect(hex(Charset.encode('日本', iso2022Jp))).toBe('1b2442467c4b5c1b2842');
  });

  test('switches to JIS X 0201 Roman for ¥ and ‾', () => {
    expect(hex(Charset.encode('¥a‾\\', iso2022Jp))).toBe('1b284a5c617e1b28425c');
  });

  test('encodes halfwidth katakana as fullwidth', () => {
    expect(hex(Charset.encode('ｱﾞ', iso2022Jp))).toBe('1b24422522212b1b2842');
  });

  test('does not write SO, SI or ESC, which would change the decoder state', () => {
    expect(hex(Charset.encode('\x0e\x0f\x1b', iso2022Jp))).toBe('3f3f3f');
    const html = Charset.encode('\x1b', iso2022Jp, { unmappable: 'html' });
    expect(new TextDecoder().decode(html)).toBe('&#65533;');
  });

  test('decodes back to the input with TextDecoder', () => {
    const text = 'メール本文 ¥100 and ASCII ‾ 漢字';
    expect(new TextDecoder('iso-2022-jp').decode(Charset.encode(text, iso2022Jp))).toBe(text);
  });
});

describe('EUC-KR', () => {
  test('encodes Hangul, including syllables outside KS X 1001', () => {
    expect(hex(Charset.encode('한국어', eucKr))).toBe('c7d1b1b9beee');
    expect(hex(Charset.encode('똠', eucKr))).toBe('8c63');
  });
});
