import { describe, expect, test } from 'vite-plus/test';
import * as Charset from '@portable/charset';
import { windows1251 } from '@portable/charset/single-byte';

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
  'ISO-8859-8-I',
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
  'UTF-16BE',
  'UTF-16LE',
  'x-user-defined',
] satisfies readonly Charset.Name[];

describe('normalizeLabel', () => {
  test('maps WHATWG labels to their encoding name', () => {
    expect(Charset.normalizeLabel('unicode-1-1-utf-8')).toBe('UTF-8');
    expect(Charset.normalizeLabel('csshiftjis')).toBe('Shift_JIS');
    expect(Charset.normalizeLabel('ks_c_5601-1987')).toBe('EUC-KR');
    expect(Charset.normalizeLabel('x-gbk')).toBe('GBK');
    expect(Charset.normalizeLabel('cn-big5')).toBe('Big5');
    expect(Charset.normalizeLabel('dos-874')).toBe('windows-874');
    expect(Charset.normalizeLabel('unicodefffe')).toBe('UTF-16BE');
  });

  test('maps every encoding name to itself', () => {
    for (const name of names) {
      expect(Charset.normalizeLabel(name)).toBe(name);
    }
  });

  test('follows WHATWG where a label means something else in iconv-lite', () => {
    expect(Charset.normalizeLabel('latin1')).toBe('windows-1252');
    expect(Charset.normalizeLabel('iso-8859-1')).toBe('windows-1252');
    expect(Charset.normalizeLabel('ascii')).toBe('windows-1252');
    expect(Charset.normalizeLabel('iso-8859-9')).toBe('windows-1254');
    expect(Charset.normalizeLabel('gb2312')).toBe('GBK');
    expect(Charset.normalizeLabel('utf-16')).toBe('UTF-16LE');
  });

  test('accepts iconv-lite names', () => {
    expect(Charset.normalizeLabel('win1251')).toBe('windows-1251');
    expect(Charset.normalizeLabel('cp1251')).toBe('windows-1251');
    expect(Charset.normalizeLabel('1251')).toBe('windows-1251');
    expect(Charset.normalizeLabel('cp20866')).toBe('KOI8-R');
    expect(Charset.normalizeLabel('cp932')).toBe('Shift_JIS');
    expect(Charset.normalizeLabel('ms932')).toBe('Shift_JIS');
    expect(Charset.normalizeLabel('cp936')).toBe('GBK');
    expect(Charset.normalizeLabel('cp949')).toBe('EUC-KR');
    expect(Charset.normalizeLabel('cp950')).toBe('Big5');
    expect(Charset.normalizeLabel('big5hkscs')).toBe('Big5');
    expect(Charset.normalizeLabel('ucs2')).toBe('UTF-16LE');
    expect(Charset.normalizeLabel('maccyrillic')).toBe('x-mac-cyrillic');
  });

  test('ignores case, punctuation and a trailing year', () => {
    expect(Charset.normalizeLabel('ISO_8859-5:1988')).toBe('ISO-8859-5');
    expect(Charset.normalizeLabel('ISO 8859-5')).toBe('ISO-8859-5');
    expect(Charset.normalizeLabel('UTF16-BE')).toBe('UTF-16BE');
    expect(Charset.normalizeLabel('Windows_1251')).toBe('windows-1251');
  });

  test('trims ASCII whitespace only', () => {
    expect(Charset.normalizeLabel(' \t\n\f\rutf-8\r\n')).toBe('UTF-8');
    expect(Charset.normalizeLabel('\0utf-8')).toBeUndefined();
    expect(Charset.normalizeLabel('utf-8\v')).toBeUndefined();
    expect(Charset.normalizeLabel('\u00a0utf-8')).toBeUndefined();
    expect(Charset.normalizeLabel('utf-8\u2028')).toBeUndefined();
  });

  test('returns undefined for unknown labels and object prototype keys', () => {
    expect(Charset.normalizeLabel('xxx')).toBeUndefined();
    expect(Charset.normalizeLabel('')).toBeUndefined();
    expect(Charset.normalizeLabel('cp437')).toBeUndefined();
    expect(Charset.normalizeLabel('__proto__')).toBeUndefined();
    expect(Charset.normalizeLabel('constructor')).toBeUndefined();
    expect(Charset.normalizeLabel('hasOwnProperty')).toBeUndefined();
  });

  test('returns undefined for the labels WHATWG reserves for the replacement encoding', () => {
    expect(Charset.normalizeLabel('iso-2022-kr')).toBeUndefined();
    expect(Charset.normalizeLabel('hz-gb-2312')).toBeUndefined();
    expect(Charset.normalizeLabel('replacement')).toBeUndefined();
  });
});

describe('load', () => {
  test('loads every supported encoding by name', async () => {
    for (const name of names) {
      expect((await Charset.load(name)).name).toBe(name);
    }
  });

  test('returns the same charset object as the subpath export', async () => {
    expect(await Charset.load('cp1251')).toBe(windows1251);
    expect(await Charset.load('utf8')).toBe(Charset.utf8);
  });

  test('rejects unknown labels and the replacement encoding with UnsupportedError', async () => {
    await expect(Charset.load('xxx')).rejects.toThrow(Charset.UnsupportedError);
    await expect(Charset.load('constructor')).rejects.toThrow(Charset.UnsupportedError);
    await expect(Charset.load('iso-2022-kr')).rejects.toThrow(Charset.UnsupportedError);
  });

  test('loads encodings after Object and Array prototypes are extended', async () => {
    const objectPrototype = Object.prototype as Record<string, unknown>;
    const arrayPrototype = Array.prototype as unknown as Record<string, unknown>;
    objectPrototype.permits = () => {};
    arrayPrototype.sample2 = () => {};
    try {
      for (const label of ['gbk', 'win1251', 'utf8', 'shift_jis']) {
        expect(Charset.encode('abc', await Charset.load(label))).toEqual(
          new Uint8Array([0x61, 0x62, 0x63]),
        );
      }
    } finally {
      delete objectPrototype.permits;
      delete arrayPrototype.sample2;
    }
  });
});
