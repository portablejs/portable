import * as MimeHeaders from '@portable/mime-headers';
import { fc, fuzz, mutated, outcome } from '@portable/fuzz';
import { describe, expect, test } from 'vite-plus/test';
import { utf8, wellFormed } from './utils.js';

const headerLike = fc.string({
  unit: fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom('a', 'Z', '0', '.', '-', ' ', '\t', '\r\n', '\n') },
    {
      weight: 4,
      arbitrary: fc.constantFrom(...'"<>@,;:()[]\\=?*\'%'.split('')),
    },
    {
      weight: 2,
      arbitrary: fc.constantFrom(
        '=?UTF-8?B?',
        '=?iso-8859-1?Q?',
        '=?utf-8*en?q?',
        '?=',
        '=C3=B5',
        'w7U=',
        '*0*=',
        "utf-8''",
        '%C3%B5',
        '__proto__',
      ),
    },
    { weight: 1, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 80,
});

const input = fc.oneof(
  headerLike,
  headerLike.map(utf8),
  mutated(
    utf8(
      'To: "Reinman, Andris" <andris@example.com>, team: a@example.com, =?UTF-8?Q?J=C3=B5geva?= <j@example.org>;\r\n' +
        "Content-Disposition: attachment; filename*0*=utf-8''J%C3%B5; filename*1=geva.txt\r\n" +
        'Subject: =?UTF-8?B?SsO1Z2V2YQ==?=\r\n folded\r\n\r\nbody',
    ),
  ),
);

describe('parsers', () => {
  test('parseAddresses, parseValue, parseHeaders, unfold and decodeWords never throw', () => {
    fuzz(
      fc.property(input, (input) => {
        MimeHeaders.parseAddresses(input);
        MimeHeaders.parseMailboxes(input);
        MimeHeaders.parseValue(input);
        MimeHeaders.parseHeaders(input);
        MimeHeaders.unfold(input);
        MimeHeaders.decodeWords(input);
      }),
    );
  });

  test('strict parseAddresses throws only InvalidInputError, and agrees with the lenient parse', () => {
    fuzz(
      fc.property(input, (input) => {
        const strict = outcome([MimeHeaders.InvalidInputError], () =>
          MimeHeaders.parseAddresses(input, { strict: true }),
        );
        const lenient = MimeHeaders.parseAddresses(input);
        expect(strict).toEqual('value' in strict ? { value: lenient } : strict);
      }),
    );
  });
});

const text = fc.string({ unit: 'grapheme', maxLength: 40 });
const atom = fc.stringMatching(/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]{1,10}$/);
const address = fc
  .tuple(
    fc.oneof(
      atom,
      fc.tuple(atom, atom).map(([a, b]) => `${a}.${b}`),
    ),
    fc.constantFrom('example.com', 'mail.example.org', '[192.0.2.1]', 'bücher.example'),
  )
  .map(([local, domain]) => `${local}@${domain}`);
const mailbox = fc.record({ name: text, address });

/** A name as it reads back: lone surrogates replaced, whitespace runs collapsed and trimmed. */
const normal = (name: string) => wellFormed(name).replace(/\s+/g, ' ').trim();
const normalEntry = (entry: MimeHeaders.Address): MimeHeaders.Address =>
  'group' in entry
    ? {
        name: normal(entry.name),
        group: entry.group.map((member) => normalEntry(member) as MimeHeaders.Mailbox),
      }
    : { name: normal(entry.name), address: entry.address };

describe('round trips', () => {
  test('parseAddresses reads back what formatAddresses wrote', () => {
    fuzz(
      fc.property(
        fc.array(fc.oneof(mailbox, fc.record({ name: text, group: fc.array(mailbox) })), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.constantFrom<MimeHeaders.WordEncoding | undefined>(undefined, 'Q', 'B'),
        (list, encoding) => {
          const formatted = MimeHeaders.formatAddresses(
            list,
            encoding ? { wordEncoding: encoding } : {},
          );
          const parsed = MimeHeaders.parseAddresses(formatted, { strict: true });
          expect(parsed.map(normalEntry)).toEqual(list.map(normalEntry));
        },
      ),
    );
  });

  test('parseValue reads back what formatValue wrote', () => {
    fuzz(
      fc.property(
        fc.constantFrom('attachment', 'text/plain', 'multipart/mixed'),
        fc.dictionary(
          fc.stringMatching(/^[a-z0-9!#$&+.^_`|~-]{1,12}$/),
          fc.string({ unit: 'grapheme' }),
        ),
        (value, params) => {
          const formatted = MimeHeaders.formatValue({ value, params });
          expect(formatted).toMatch(/^[ -~]*$/);
          expect(MimeHeaders.parseValue(formatted)).toEqual({ value, params });
        },
      ),
    );
  });

  test('decodeWords reads back what encodeWords and encodeWord wrote', () => {
    fuzz(
      fc.property(
        text,
        fc.constantFrom<MimeHeaders.WordEncoding | undefined>(undefined, 'Q', 'B'),
        (text, encoding) => {
          const options = encoding ? { wordEncoding: encoding } : {};
          expect(MimeHeaders.decodeWords(MimeHeaders.encodeWords(text, options))).toBe(
            wellFormed(text),
          );
          expect(MimeHeaders.decodeWords(MimeHeaders.encodeWord(text, options))).toBe(
            wellFormed(text),
          );
        },
      ),
    );
  });

  test('unfold removes exactly the line breaks fold inserts', () => {
    fuzz(
      fc.property(
        fc.string({ unit: fc.constantFrom('a', 'õ', ' ', '\t', '日'), maxLength: 200 }),
        fc.integer({ min: 5, max: 100 }),
        (text, lineLength) => {
          const folded = MimeHeaders.fold(text, { lineLength });
          expect(folded.replaceAll('\r\n', '')).toBe(text);
          expect(MimeHeaders.unfold(folded)).toBe(text);
        },
      ),
    );
  });
});
