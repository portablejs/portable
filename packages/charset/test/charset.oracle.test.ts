import { Readable } from 'node:stream';
import iconv from 'iconv-lite';
import { describe, expect, test } from 'vite-plus/test';
import * as Charset from '@portable/charset';
import { encodeStream, hex, random, randomChunks } from './utils.js';

const iconvNames: Record<string, string> = {
  'UTF-8': 'utf8',
  IBM866: 'cp866',
  'ISO-8859-2': 'iso88592',
  'ISO-8859-3': 'iso88593',
  'ISO-8859-4': 'iso88594',
  'ISO-8859-5': 'iso88595',
  'ISO-8859-6': 'iso88596',
  'ISO-8859-7': 'iso88597',
  'ISO-8859-8': 'iso88598',
  'ISO-8859-10': 'iso885910',
  'ISO-8859-13': 'iso885913',
  'ISO-8859-14': 'iso885914',
  'ISO-8859-15': 'iso885915',
  'ISO-8859-16': 'iso885916',
  'KOI8-R': 'koi8r',
  'KOI8-U': 'koi8u',
  macintosh: 'macintosh',
  'windows-874': 'windows874',
  'windows-1250': 'windows1250',
  'windows-1251': 'windows1251',
  'windows-1252': 'windows1252',
  'windows-1253': 'windows1253',
  'windows-1254': 'windows1254',
  'windows-1255': 'windows1255',
  'windows-1256': 'windows1256',
  'windows-1257': 'windows1257',
  'windows-1258': 'windows1258',
  'x-mac-cyrillic': 'maccyrillic',
  GBK: 'gbk',
  gb18030: 'gb18030',
  Big5: 'big5',
  'EUC-JP': 'eucjp',
  Shift_JIS: 'shiftjis',
  'EUC-KR': 'euckr',
  'UTF-16LE': 'utf16le',
  'UTF-16BE': 'utf16be',
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Code points whose WHATWG index entry differs from iconv-lite's table. See PARITY.md.
const indexDifferences: Record<string, readonly number[]> = {
  'KOI8-U': [0x40e, 0x45e, 0x255d, 0x256c],
  macintosh: [0xa4, 0x3a9, 0x20ac, 0x2126, 0xf8ff],
  'x-mac-cyrillic': [0xa2, 0xa4, 0x490, 0x491, 0x20ac, 0x2202],
  Shift_JIS: [0x2212],
  'EUC-JP': [0x2212],
  GBK: [...range(0x9fb4, 0x9fbb), ...range(0xfe10, 0xfe19), 0xe7c7],
  gb18030: [...range(0x9fb4, 0x9fbb), ...range(0xfe10, 0xfe19), 0xe5e5],
};

/** Says why our bytes for one code point differ from iconv-lite's, or returns undefined. */
function explain(
  name: string,
  codePoint: number,
  ours: string,
  theirs: string,
): string | undefined {
  if (codePoint === 0xfffd && ours === '3f') {
    return 'iconv-lite encodes U+FFFD';
  }
  if (
    name.startsWith('windows-') &&
    codePoint >= 0x80 &&
    codePoint <= 0x9f &&
    ours === hex(new Uint8Array([codePoint]))
  ) {
    return 'WHATWG maps the C1 control';
  }
  if (indexDifferences[name]?.includes(codePoint)) {
    return 'index differs';
  }
  if (name === 'Big5' && ours === '3f' && parseInt(theirs.slice(0, 2), 16) < 0xa1) {
    return 'HKSCS is decode-only';
  }
  if (name === 'EUC-JP' && theirs.startsWith('8f')) {
    return ours === '3f' ? 'JIS X 0212 is decode-only' : 'JIS X 0208 is preferred over JIS X 0212';
  }
  return undefined;
}

const lastCodePoint = (name: string) =>
  ['Big5', 'gb18030', 'UTF-8', 'UTF-16LE', 'UTF-16BE'].includes(name) ? 0x10ffff : 0xffff;

async function viaIconvStream(chunks: readonly string[], name: string): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  for await (const part of Readable.from(chunks, { objectMode: true }).pipe(
    iconv.encodeStream(name),
  )) {
    parts.push(part as Buffer);
  }
  return new Uint8Array(Buffer.concat(parts));
}

describe.each(Object.entries(iconvNames))('%s matches iconv-lite %s', (name, iconvName) => {
  const agreed: number[] = [];
  const unmappable: number[] = [];

  test('on every code point, apart from the documented differences', async () => {
    const charset = await Charset.load(name);
    const unexplained: string[] = [];
    const reasons = new Map<string, number>();
    for (let codePoint = 0; codePoint <= lastCodePoint(name); codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }
      const text = String.fromCodePoint(codePoint);
      const ours = hex(Charset.encode(text, charset));
      const theirs = hex(iconv.encode(text, iconvName));
      if (ours === theirs) {
        if (ours !== '3f' || codePoint === 0x3f) {
          agreed.push(codePoint);
        } else {
          unmappable.push(codePoint);
        }
        continue;
      }
      const reason = explain(name, codePoint, ours, theirs);
      if (reason) {
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      } else {
        unexplained.push(`U+${codePoint.toString(16)}: ${ours} vs ${theirs}`);
      }
    }
    expect(unexplained).toEqual([]);
    expect(agreed.length).toBeGreaterThan(127);
  }, 120_000);

  test('on random text with unmappable characters, in one piece and in random chunks', async () => {
    const charset = await Charset.load(name);
    for (let seed = 1; seed <= 20; seed++) {
      const next = random(seed);
      const pick = (list: readonly number[]) => list[Math.floor(next() * list.length)]!;
      let text = '';
      for (let i = 0; i < 200; i++) {
        const kind = next();
        const codePoint =
          kind < 0.2
            ? Math.floor(next() * 0x80)
            : kind < 0.85 || unmappable.length === 0
              ? pick(agreed)
              : pick(unmappable);
        text += String.fromCodePoint(codePoint);
      }
      const expected = new Uint8Array(iconv.encode(text, iconvName));
      expect(Charset.encode(text, charset)).toEqual(expected);
      const chunks = randomChunks(text, seed);
      expect(await encodeStream(chunks, charset)).toEqual(expected);
      expect(await viaIconvStream(chunks, iconvName)).toEqual(expected);
    }
  });
});
