import { describe, expect, test } from 'vite-plus/test';
import * as Idna from '@portable/idna';
import idnaTestV2 from './fixtures/IdnaTestV2.json' with { type: 'json' };
import toascii from './fixtures/toascii.json' with { type: 'json' };
import { attempt } from './utils.js';

type WptCase = { input: string; output: string | null; comment?: string | undefined };
const cases = (fixture: readonly unknown[]) =>
  fixture.filter((entry): entry is WptCase => typeof entry === 'object');

describe('tr46: ToASCII with useSTD3ASCIIRules', () => {
  test('keeps a-z and 0-9', () => {
    for (const char of 'abcdefghijklmnopqrstuvwxyz0123456789') {
      expect(Idna.toAscii(char, { strict: true })).toBe(char);
    }
  });

  test('rejects "-" alone, because strict also checks hyphens', () => {
    expect(() => Idna.toAscii('-', { strict: true })).toThrow(Idna.InvalidInputError);
  });

  test('rejects every other ASCII character except A-Z', () => {
    for (let code = 0; code < 128; code++) {
      const char = String.fromCharCode(code);
      if (/[a-zA-Z0-9-]/.test(char)) {
        continue;
      }
      expect(() => Idna.toAscii(char, { strict: true }), `U+${code}`).toThrow(
        Idna.InvalidInputError,
      );
    }
  });

  test('maps A-Z to lowercase', () => {
    expect(Idna.toAscii('ABCXYZ', { strict: true })).toBe('abcxyz');
  });

  test('encodes a Unicode label', () => {
    expect(Idna.toAscii('é', { strict: true })).toBe('xn--9ca');
    expect(Idna.toAscii('unicodé', { strict: true })).toBe('xn--unicod-gva');
    expect(Idna.toAscii('valid', { strict: true })).toBe('valid');
  });

  test('rejects labels with a disallowed character', () => {
    expect(() => Idna.toAscii('inv@alid', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(() => Idna.toAscii('uni!codé', { strict: true })).toThrow(Idna.InvalidInputError);
  });

  test('applies the rule to ASCII that a mapping produces', () => {
    expect(() => Idna.toAscii('a＿b', { strict: true })).toThrow(Idna.InvalidInputError);
    expect(Idna.toAscii('a＿b')).toBe('a_b');
  });
});

describe('tr46: WPT host parsing of ASCII characters', () => {
  test('toAscii lowercases each character URL allows and rejects the others', () => {
    for (let code = 0; code < 0x7f; code++) {
      const char = String.fromCharCode(code);
      const forbidden = /[\0-\x20#%/:<>?@[\\\]^|]/.test(char);
      expect(
        attempt(() => Idna.toAscii(char)),
        `U+${code}`,
      ).toBe(forbidden ? null : char.toLowerCase());
    }
  });

  test('toUnicode lowercases each character', () => {
    for (let code = 0; code < 0x7f; code++) {
      const char = String.fromCharCode(code);
      expect(Idna.toUnicode(char), `U+${code}`).toBe(char.toLowerCase());
    }
  });
});

function mismatches(fixture: readonly unknown[]) {
  return cases(fixture).flatMap(({ input, output, comment }) => {
    const actual = attempt(() => Idna.toAscii(input));
    return actual === output ? [] : [{ input, comment, expected: output, actual }];
  });
}

describe('tr46: WPT URL tests', () => {
  test('toascii.json', () => {
    expect(cases(toascii).length).toBe(87);
    expect(mismatches(toascii)).toEqual([]);
  });

  test('IdnaTestV2.json', () => {
    expect(cases(idnaTestV2).length).toBe(2676);
    expect(mismatches(idnaTestV2)).toEqual([
      { input: '', comment: 'A4_1 (ignored); A4_2 (ignored)', expected: '', actual: null },
    ]);
  });
});
