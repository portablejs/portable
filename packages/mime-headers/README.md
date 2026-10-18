# @portable/mime-headers

Email header values: encoded-words (RFC 2047), folding (RFC 5322), parameters with RFC 2231 encoding, and address lists. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the header functions of [libmime](https://www.npmjs.com/package/libmime), [addressparser](https://www.npmjs.com/package/addressparser) (now `nodemailer/lib/addressparser`) and [email-addresses](https://www.npmjs.com/package/email-addresses).

## Why use this over libmime, addressparser and email-addresses

It has no dependencies, takes and returns plain strings and `Uint8Array`s, and decodes charsets with `TextDecoder` instead of bundling iconv-lite. One address parser covers what addressparser and email-addresses each do: a lenient mode for mail as it arrives and a strict mode that validates RFC 5322.

- In the benchmarks on Node 24, `parseAddresses` was 2× faster than addressparser and about 50× faster than email-addresses (25× in strict mode). `fold` was 7× faster than libmime's `foldLines`, `parseHeaders` 3.5× faster than `decodeHeaders`, `encodeWords` 3× faster and `formatValue` 2× faster. `decodeWords`, `parseValue` and `encodeWord` were 1.1 to 1.3× faster. `Buffer` and `TextDecoder` decode a single B word 3.7× faster than `decodeWords`, which also finds the words in the text and joins characters split across them.
- An address hidden in a quoted local part, such as `"evil@evil.com x"@good.com`, stays the quoted local part at good.com. addressparser before nodemailer 7.0.7 sent it to evil.com (GHSA-mm7p-fcc7-pg87), and 10.1.2 still moves a quoted display name holding "@" into the address.
- A comment never holds the address: `(evil@evil.com) Name <good@good.com>` is good.com. nodemailer fixed this in 10.1.4.
- `encodeWords` encodes text that looks like an encoded word, so a reader can't decode a subject the sender didn't encode. libmime 5.5.1 leaves it as is.
- `encodeWord` keeps every astral character whole when it splits B words. libmime 5.4.9 turns a character outside the emoji block into two U+FFFD.
- `formatAddresses` encodes a CRLF in a name and refuses an address that would read back as something else, so a header can't be split into two.
- Every function runs in linear time on hostile input. The tests check 43 adversarial inputs.

```sh
npm install @portable/mime-headers
```

```ts
import * as MimeHeaders from '@portable/mime-headers'

MimeHeaders.fold('Subject: ' + MimeHeaders.encodeWords('Tere õhtust, Mari'))
// 'Subject: Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari'
MimeHeaders.decodeWords('Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari') // 'Tere õhtust, Mari'

MimeHeaders.parseValue('attachment; filename*=UTF-8\'\'%C3%B5.pdf')
// { value: 'attachment', params: { filename: 'õ.pdf' } }
MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'õ.pdf' } })
// "attachment; filename*0*=utf-8''%C3%B5.pdf"

MimeHeaders.parseAddresses('Mari Maasikas <mari@example.com>, Team: a@example.com;')
// [{ name: 'Mari Maasikas', address: 'mari@example.com' },
//  { name: 'Team', group: [{ name: '', address: 'a@example.com' }] }]
MimeHeaders.formatAddresses([{ name: 'Maasikas, Mari', address: 'mari@example.com' }])
// '"Maasikas, Mari" <mari@example.com>'

MimeHeaders.parseHeaders('Subject: Tere\r\n õhtust\r\nTo: mari@example.com\r\n\r\nbody')
// [{ name: 'Subject', value: 'Tere õhtust' }, { name: 'To', value: 'mari@example.com' }]
```

## API

Functions come in pairs. `encode*`/`decode*` convert encoded-words and back; `parse*`/`format*` read structured values from header text and write them back. Every function that takes text also takes a `Uint8Array`, which it reads as UTF-8.

| Export | Takes | Returns |
| --- | --- | --- |
| `encodeWord(text, options?)` | text | all of it as encoded words |
| `encodeWords(text, options?)` | text | the text, with the part that needs it as encoded words |
| `decodeWords(text)` | a header value | the value with its encoded words decoded |
| `fold(line, options?)` | a header line | the line with CRLF and whitespace where it is too long |
| `unfold(text)` | folded text | the text with every CRLF before whitespace removed |
| `parseHeaders(text)` | a header block | `Header[]`, `{ name, value }` in order, unfolded |
| `parseValue(text)` | a value such as `text/plain; charset=utf-8` | `Value`, `{ value, params }` |
| `formatValue(value)` | `Value` | the header value |
| `parseAddresses(text, options?)` | an address list | `Address[]`, each a `Mailbox` `{ name, address }` or a `Group` `{ name, group }` |
| `formatAddresses(addresses, options?)` | `Address[]` | the address list |
| `InvalidInputError` | | thrown by `parseAddresses` in strict mode and by `formatValue` and `formatAddresses` |

`decodeWords` joins encoded words that only whitespace separates, and decodes adjacent words in the same charset together, so a character split across two words still decodes. It decodes the charset with `TextDecoder`; a label `TextDecoder` doesn't know, such as `utf-7`, is read as UTF-8. It never throws.

`parseValue` lowercases parameter names, joins RFC 2231 sections (`name*0*`, `name*1*`), decodes their charset, and decodes encoded words in plain values. When a parameter has both forms, the RFC 2231 one wins (RFC 6266 section 4.3). `formatValue` quotes values that need it and writes values outside printable ASCII, or ones that look like encoded words, as UTF-8 RFC 2231 sections.

`parseAddresses` reads RFC 5322 address lists with the obsolete syntax, RFC 6532 UTF-8, comments, groups and encoded-word names. In the default mode it never throws and reads malformed input the way mail clients do: an unquoted name split by a comma is joined back, a stray `<` drops what came before it, and text around the address becomes the name. A quoted string is never searched for an address. With `strict: true` it throws `InvalidInputError` for anything RFC 5322 doesn't allow.

## Options

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `encoding` | `encodeWord`, `encodeWords`, `formatAddresses` | `'Q'` | `'Q'` keeps ASCII readable, `'B'` is base64. |
| `maxLength` | `encodeWord`, `encodeWords` | `75` | Longest encoded word, `=?` and `?=` included, as RFC 2047 requires. Longer text becomes several words, each holding whole characters. `false` writes one word. |
| `charset` | `encodeWord`, `encodeWords`, `formatAddresses` | UTF-8 | A `CharsetEncoder`, `{ name, encode(text) }`, for mail that has to use another charset. `@portable/charset` provides the encoders. |
| `lineLength` | `fold` | `76` | Longest line, not counting the line break. A word longer than a line is not broken. |
| `strict` | `parseAddresses` | `false` | Throw `InvalidInputError` on input RFC 5322 doesn't allow. |
| `flatten` | `parseAddresses` | `false` | Return the members of groups in place of the groups. |

## Migrating

| libmime / addressparser / email-addresses | @portable/mime-headers |
| --- | --- |
| `libmime.encodeWord(text, 'Q', n)` | `encodeWord(text, { maxLength: n })` (`maxLength: false` for libmime's 0) |
| `libmime.encodeWords(text, 'B', n)` | `encodeWords(text, { encoding: 'B', maxLength: n })` |
| `libmime.encodeWords(buffer, 'Q', 0, 'iso-8859-1')` | `encodeWords(new TextDecoder('iso-8859-1').decode(bytes))` |
| `libmime.decodeWords(text)` | `decodeWords(text)` |
| `libmime.foldLines(text, n)` | `fold(text, { lineLength: n })` |
| `libmime.decodeHeaders(text)` | `parseHeaders(text)`, a list in order; lowercase the names to group them |
| `libmime.decodeHeader(line)` | `parseHeaders(line)[0]` |
| `libmime.parseHeaderValue(text)` | `parseValue(text)` (there is no `decodedParams`: every parameter is decoded) |
| `libmime.buildHeaderValue({ value, params })` | `formatValue({ value, params })` |
| `libmime.encodeFlowed`, `decodeFlowed`, `detectMimeType`, `charset.*` | Not in this package. |
| `addressparser(text)` | `parseAddresses(text)` |
| `addressparser(text, { flatten: true })` | `parseAddresses(text, { flatten: true })` |
| `emailAddresses.parseOneAddress(text)` | `parseAddresses(text, { strict: true })`, then check for one entry |
| `emailAddresses.parseAddressList(text)` | `parseAddresses(text, { strict: true })`; it throws where email-addresses returns `null` |
| `result.local`, `result.domain` | Split `address` at its last `@`. |
| nodemailer's address formatting | `formatAddresses(addresses)` |

The oracle tests compare this package with libmime 5.4.9, nodemailer 10.1.2's addressparser and email-addresses 5.0.0 on generated input. Differences:

- `encodeWord` limits words to 75 characters by default; libmime's `encodeWord` writes one word unless given a length. A trailing space in a Q word is `_` here and `=20` in libmime.
- `encodeWords` encodes words with control characters, and words that read as encoded words. libmime leaves both as they are.
- `fold` allows a line of exactly `lineLength`; libmime's lines stay one shorter. `fold` never breaks in front of trailing whitespace, which would leave a line of only whitespace.
- `parseHeaders` keeps the case of names and the whitespace a fold leaves, and returns a list. libmime lowercases names, collapses the whitespace to one space and groups values by name.
- `parseValue` also decodes encoded words in plain parameter values. A backslash escapes only inside quotes.
- `formatValue` throws `InvalidInputError` for a control character in the value or a parameter name; libmime 5.5 drops it. It marks every section of an encoded value with `*`.
- Names from `parseAddresses` have their encoded words decoded; addressparser and email-addresses return them encoded.
- Quotes a local part doesn't need are dropped, inside angle brackets as well (`<"user"@example.com>` gives `user@example.com`). Whitespace inside a quoted name is kept; email-addresses collapses it.
- Where malformed input could be read two ways, `parseAddresses` takes the first complete address and makes the rest the name: `<x@evil.com @good.com>` gives `x@evil.com` named `@good.com`, where addressparser returns the whole value. `PARITY.md` lists each case.
- Strict mode accepts the obsolete syntax RFC 5322 says to read, such as `H.P. Lovecraft <a@b.c>`, and UTF-8 (RFC 6532). email-addresses' `strict` refuses the first and needs `rfc6532: true` for the second. There are no `rejectTLD`, `atInDisplayName`, `commaInDisplayName` or `addressListSeparator` options.
- There are no `local` or `domain` fields and no IDN conversion: `user@münchen.de` stays as written.
