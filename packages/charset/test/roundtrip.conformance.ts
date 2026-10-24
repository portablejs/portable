import { describe, expect, test } from 'vite-plus/test';
import * as Charset from '@portable/charset';

const astral = new Set(['Big5', 'gb18030', 'UTF-8', 'UTF-16LE', 'UTF-16BE']);

const jisSubstitutes: Record<number, string> = { 0xa5: '\\', 0x203e: '~', 0x2212: '－' };
const fullwidthKatakana =
  '。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜';

// The gb18030 encoder writes these Private Use code points with the two-byte codes that
// GB18030-2022 assigned to the characters they used to stand in for.
const gb18030Substitutes: Record<number, number> = {
  0xe78d: 0xfe10,
  0xe78e: 0xfe12,
  0xe78f: 0xfe11,
  0xe790: 0xfe13,
  0xe791: 0xfe14,
  0xe792: 0xfe15,
  0xe793: 0xfe16,
  0xe794: 0xfe17,
  0xe795: 0xfe18,
  0xe796: 0xfe19,
  0xe81e: 0x9fb4,
  0xe826: 0x9fb5,
  0xe82b: 0x9fb6,
  0xe82c: 0x9fb7,
  0xe832: 0x9fb8,
  0xe843: 0x9fb9,
  0xe854: 0x9fba,
  0xe864: 0x9fbb,
};

/** The text a WHATWG decoder returns for a code point the encoder wrote, where it differs. */
function decodesAs(name: string, codePoint: number): string {
  if (name === 'Shift_JIS' || name === 'EUC-JP') {
    const substitute = jisSubstitutes[codePoint];
    if (substitute) {
      return substitute;
    }
  }
  if (name === 'ISO-2022-JP') {
    if (codePoint === 0x2212) {
      return '\uff0d';
    }
    if (codePoint >= 0xff61 && codePoint <= 0xff9f) {
      return fullwidthKatakana[codePoint - 0xff61]!;
    }
  }
  if (name === 'GBK' || name === 'gb18030') {
    return String.fromCodePoint(gb18030Substitutes[codePoint] ?? codePoint);
  }
  return String.fromCodePoint(codePoint);
}

const escape = (text: string) =>
  Array.from(text, (char) => `U+${char.codePointAt(0)!.toString(16)}`).join(' ');

function allCodePoints(name: string): string {
  const units: number[] = [];
  const end = astral.has(name) ? 0x10ffff : 0xffff;
  for (let codePoint = 0; codePoint <= end; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      continue;
    }
    if (codePoint < 0x10000) {
      units.push(codePoint);
    } else {
      units.push(0xd800 + ((codePoint - 0x10000) >> 10), 0xdc00 + ((codePoint - 0x10000) & 0x3ff));
    }
  }
  let text = '';
  for (let i = 0; i < units.length; i += 0x8000) {
    text += String.fromCharCode(...units.slice(i, i + 0x8000));
  }
  return text;
}

const names = [
  'UTF-8',
  'IBM866',
  'ISO-8859-2',
  'ISO-8859-3',
  'ISO-8859-4',
  'ISO-8859-5',
  'ISO-8859-6',
  'ISO-8859-7',
  'ISO-8859-8',
  'ISO-8859-10',
  'ISO-8859-13',
  'ISO-8859-14',
  'ISO-8859-15',
  'ISO-8859-16',
  'KOI8-R',
  'KOI8-U',
  'macintosh',
  'windows-874',
  'windows-1250',
  'windows-1251',
  'windows-1252',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-1257',
  'windows-1258',
  'x-mac-cyrillic',
  'GBK',
  'gb18030',
  'Big5',
  'EUC-JP',
  'ISO-2022-JP',
  'Shift_JIS',
  'EUC-KR',
  'UTF-16LE',
  'UTF-16BE',
];

// Node's TextDecoder uses ICU's converters for these charsets, which differ from the WHATWG
// decoders, and WebKit's TextDecoder decodes ISO-8859-16 to an empty string. Each probe is a byte
// sequence that the WHATWG decoder and the runtime's decoder decode differently.
const probes: Record<string, [bytes: number[], text: string]> = {
  Big5: [[0xc6, 0xd8], '\u00a8'],
  'EUC-KR': [[0xa2, 0xe7], '\u00ae'],
  'ISO-2022-JP': [[0x1a], '\x1a'],
  'ISO-8859-16': [[0x41], 'A'],
  Shift_JIS: [[0x1a], '\x1a'],
};

function hasWhatwgDecoder(name: string): boolean {
  const probe = probes[name];
  return !probe || new TextDecoder(name).decode(new Uint8Array(probe[0])) === probe[1];
}

describe('every encoded code point decodes back with TextDecoder', () => {
  test.for(names)('%s', { timeout: 60_000 }, async (name, { skip }) => {
    skip(!hasWhatwgDecoder(name), "this runtime's TextDecoder is not the WHATWG decoder");
    const charset = await Charset.load(name);
    const unmapped = new Set<number>();
    const text = allCodePoints(name);
    const bytes = Charset.encode(text, charset, {
      unmappable: (codePoint) => {
        unmapped.add(codePoint);
        return '';
      },
    });
    let expected = '';
    for (const char of text) {
      const codePoint = char.codePointAt(0)!;
      if (unmapped.has(codePoint)) {
        continue;
      }
      if (name === 'ISO-2022-JP' && [0x0e, 0x0f, 0x1b].includes(codePoint)) {
        continue;
      }
      expected += decodesAs(name, codePoint);
    }
    const decoded = new TextDecoder(name).decode(bytes);
    let i = 0;
    while (i < expected.length && decoded[i] === expected[i]) {
      i++;
    }
    expect(escape(decoded.slice(i, i + 4))).toBe(escape(expected.slice(i, i + 4)));
  });
});
