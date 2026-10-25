import { describe, expect, test } from 'vite-plus/test';
import { InvalidInputError, parseAddresses, parseMailboxes } from '@portable/mime-headers';
import isEmail from './fixtures/is_email.json' with { type: 'json' };

// Ported from email-addresses 5.0.1 test/email-addresses.js and test/is_email.js. Its
// parseOneAddress and parseAddressList are parseAddresses(input, { strict: true }) here, and
// a null result is a thrown InvalidInputError. PARITY.md maps each upstream assertion.

const strict = (input: string) => parseMailboxes(input, { strict: true });
const one = (input: string) => {
  const list = strict(input);
  expect(list).toHaveLength(1);
  return list[0]!;
};

describe('one address', () => {
  test('a name and an angle address', () => {
    expect(strict('ABC < a@b.c>')).toEqual([{ name: 'ABC', address: 'a@b.c' }]);
  });

  test('a bare word is not an address', () => {
    expect(() => strict('bogus')).toThrow(InvalidInputError);
  });

  test('two addresses are a list of two', () => {
    expect(strict('a@b.c, d@e.f')).toHaveLength(2);
  });

  test('a quoted UTF-8 local part (RFC 6532)', () => {
    expect(one('"Françoise Lefèvre"@example.com').address).toBe('"Françoise Lefèvre"@example.com');
  });

  test('whitespace in an unquoted name is collapsed', () => {
    expect(one('First Last <first@last.com>').name).toBe('First Last');
    expect(one('  First   Last   <first@last.com>').name).toBe('First Last');
  });

  test('an "@" in the display name is read in the default mode', () => {
    expect(() => strict('ABC@abc (comment) < a@b.c>')).toThrow(InvalidInputError);
    expect(parseAddresses('ABC@abc (comment) < a@b.c>')).toEqual([
      { name: 'ABC@abc', address: 'a@b.c' },
    ]);
  });

  test('a comma in the display name is read in the default mode', () => {
    expect(parseAddresses('ABC, abc (comment) <a@b.c>')).toEqual([
      { name: 'ABC, abc', address: 'a@b.c' },
    ]);
    expect(() => strict('ABC, abc (comment) <a@b.c>')).toThrow(InvalidInputError);
  });

  test('a comment after the name is not part of it', () => {
    expect(one('ABC (comment) < a@b.c>').name).toBe('ABC');
  });
});

describe('address lists', () => {
  test('a quoted name and a bare address', () => {
    expect(strict('"A B C" < a@b.c>, d@e')).toEqual([
      { name: 'A B C', address: 'a@b.c' },
      { name: '', address: 'd@e' },
    ]);
    expect(() => strict('bogus')).toThrow(InvalidInputError);
    expect(strict('a@b.c')).toHaveLength(1);
    expect(strict('"Françoise Lefèvre"@example.com')).toHaveLength(1);
  });

  test('";" as the separator is read in the default mode', () => {
    expect(parseAddresses('"A B C" < a@b.c>; d@e')).toEqual([
      { name: 'A B C', address: 'a@b.c' },
      { name: '', address: 'd@e' },
    ]);
    expect(() => strict('"A B C" < a@b.c>; d@e')).toThrow(InvalidInputError);
  });

  test('trailing text is an error in strict mode', () => {
    expect(() => strict('a@b bogus')).toThrow(InvalidInputError);
    expect(parseAddresses('a@b bogus')).toEqual([{ name: 'bogus', address: 'a@b' }]);
  });
});

describe('display names', () => {
  test.for([
    ['First<foo@bar.com>', 'First'],
    ['First Last<foo@bar.com>', 'First Last'],
    [' First Last <foo@bar.com>', 'First Last'],
    ['First   Last<foo@bar.com>', 'First Last'],
    ['   First    Last     <foo@bar.com>', 'First Last'],
    ['   First  Middle   Last     <foo@bar.com>', 'First Middle Last'],
    ['\tFirst \t  Last\t<foo@bar.com>', 'First Last'],
    ['"First Last"<foo@bar.com>', 'First Last'],
    [' \t "First   Last" <foo@bar.com>', 'First   Last'],
    [' \t "First \\"The\t\tNickname\\"  Last" <foo@bar.com>', 'First "The\t\tNickname"  Last'],
  ] as const)('%j', ([input, name]) => {
    expect(one(input).name).toBe(name);
  });

  test('dots in an unquoted name (obs-phrase)', () => {
    expect(one('H.P. Lovecraft <foo@bar.net>').name).toBe('H.P. Lovecraft');
    expect(one('Hmm Yes Info. <foo@bar.net>').name).toBe('Hmm Yes Info.');
    expect(one('bar.net <foo@bar.net>').name).toBe('bar.net');
  });

  test('a quoted name that starts with a dot, as formatAddresses writes it', () => {
    expect(one('"." <foo@bar.net>').name).toBe('.');
    expect(one('".x" <foo@bar.net>').name).toBe('.x');
    expect(() => strict('.x <foo@bar.net>')).toThrow(InvalidInputError);
  });

  test('UTF-8 names', () => {
    expect(one('杨孝宇 <xiaoyu@example.com>').name).toBe('杨孝宇');
    expect(one('"杨孝宇" <xiaoyu@example.com>').name).toBe('杨孝宇');
  });
});

describe('addresses', () => {
  test.for([
    ['foo@bar.com', 'foo@bar.com'],
    ['  foo@bar.com  ', 'foo@bar.com'],
    ['foo  @bar.com', 'foo@bar.com'],
    ['foo@  bar.com', 'foo@bar.com'],
    ['\t  foo\t\t@ \t  bar.com \t ', 'foo@bar.com'],
    ['Bob <\t  foo\t\t@ \t  bar.com \t >', 'foo@bar.com'],
    ['"foo"@bar.com', 'foo@bar.com'],
    ['"foo   baz"@bar.com', '"foo   baz"@bar.com'],
    ['":sysmail"@ Some-Group. Some-Org', '":sysmail"@Some-Group.Some-Org'],
  ] as const)('%j', ([input, address]) => {
    expect(one(input).address).toBe(address);
  });

  test('a single-label domain is allowed', () => {
    expect(one('foo@bar').address).toBe('foo@bar');
    expect(one('"Foo Bar" <foo@bar>').address).toBe('foo@bar');
    expect(() => strict('jack@')).toThrow(InvalidInputError);
  });
});

describe('groups (RFC 6854)', () => {
  test('a group', () => {
    expect(
      parseAddresses('Managing Partners:ben@example.com,carol@example.com;', { strict: true }),
    ).toEqual([
      {
        name: 'Managing Partners',
        group: [
          { name: '', address: 'ben@example.com' },
          { name: '', address: 'carol@example.com' },
        ],
      },
    ]);
  });

  test('a group, a mailbox, and a group', () => {
    const list = parseAddresses(
      'Managing Partners:ben@example.com,carol@example.com;, "Foo" <foo@example.com>, Group2:alice@example.com;',
      { strict: true },
    );
    expect(list.map((entry) => entry.name)).toEqual(['Managing Partners', 'Foo', 'Group2']);
    expect(list[1]).toEqual({ name: 'Foo', address: 'foo@example.com' });
  });

  test('a group named by an empty quoted string, as formatAddresses writes an unnamed group', () => {
    expect(parseAddresses('"":;', { strict: true })).toEqual([{ name: '', group: [] }]);
    expect(() => parseAddresses(':a@example.com;', { strict: true })).toThrow(InvalidInputError);
  });
});

describe('is_email', () => {
  // The fixture writes control characters as their U+2400 symbols. As in email-addresses, a
  // domain that starts or ends with "-" is valid: RFC 5322 allows it, and only DNS doesn't.
  const control = (text: string) =>
    text.replace(/[\u2400-\u241f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x2400));
  // RFC 6532 adds UTF-8 to VCHAR, so "\©" is a valid quoted-pair. email-addresses runs these
  // tests without its rfc6532 option.
  const utf8 = new Set(['160']);
  const valid = (id: string, diagnosis: string) =>
    utf8.has(id) ||
    !diagnosis.startsWith('ISEMAIL_ERR') ||
    diagnosis === 'ISEMAIL_ERR_DOMAINHYPHENSTART' ||
    diagnosis === 'ISEMAIL_ERR_DOMAINHYPHENEND';

  test.for(
    isEmail.map(
      (entry) => [entry.id, control(entry.address), valid(entry.id, entry.diagnosis)] as const,
    ),
  )('#%s %j', ([, address, expected]) => {
    let parsed = true;
    try {
      parsed = strict(address).length === 1;
    } catch (error) {
      if (!(error instanceof InvalidInputError)) {
        throw error;
      }
      parsed = false;
    }
    expect(parsed).toBe(expected);
  });
});
