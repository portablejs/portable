# @portable/mime-headers

Email header values: encoded-words (RFC 2047), folding (RFC 5322), parameters with RFC 2231 encoding, and address lists. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the header functions of [libmime](https://www.npmjs.com/package/libmime), [addressparser](https://www.npmjs.com/package/addressparser) (now `nodemailer/lib/addressparser`) and [email-addresses](https://www.npmjs.com/package/email-addresses).

```sh
npm install @portable/mime-headers
```

```ts
import * as MimeHeaders from '@portable/mime-headers';

MimeHeaders.fold('Subject: ' + MimeHeaders.encodeWords('Tere õhtust, Mari'));
// 'Subject: Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari'
MimeHeaders.decodeWords('Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari'); // 'Tere õhtust, Mari'

MimeHeaders.parseValue('attachment; filename*=UTF-8\'\'%C3%B5.pdf');
// { value: 'attachment', params: { filename: 'õ.pdf' } }
MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'õ.pdf' } });
// "attachment; filename*0*=utf-8''%C3%B5.pdf"

MimeHeaders.parseAddresses('Mari Maasikas <mari@example.com>, Team: a@example.com;');
// [{ name: 'Mari Maasikas', address: 'mari@example.com' },
//  { name: 'Team', group: [{ name: '', address: 'a@example.com' }] }]
MimeHeaders.formatAddresses([{ name: 'Maasikas, Mari', address: 'mari@example.com' }]);
// '"Maasikas, Mari" <mari@example.com>'

MimeHeaders.parseHeaders('Subject: Tere\r\n õhtust\r\nTo: mari@example.com\r\n\r\nbody');
// [{ name: 'Subject', value: 'Tere õhtust' }, { name: 'To', value: 'mari@example.com' }]
```

## API

Functions come in pairs. `encode*` and `decode*` convert text to encoded-words and back, and `parse*` and `format*` read structured values from header text and write them back. Every function that takes text also takes a `Uint8Array`, which it reads as UTF-8.

| Export | Takes | Returns |
| --- | --- | --- |
| `encodeWord(text, options?)` | text | all of it as encoded words |
| `encodeWords(text, options?)` | text | the text, with the part that needs it as encoded words |
| `decodeWords(text)` | a header value | the value with its encoded words decoded |
| `fold(line, options?)` | a header line | the line with a CRLF inserted before whitespace where it is too long |
| `unfold(text)` | folded text | the text with every CRLF before whitespace removed |
| `parseHeaders(text, options?)` | a header block | `Header[]`, `{ name, value }` in order, unfolded |
| `parseValue(text)` | a value such as `text/plain; charset=utf-8` | `Value`, `{ value, params }` |
| `formatValue(value)` | `Value` | the header value |
| `parseAddresses(text, options?)` | an address list | `Address[]`, each a `Mailbox` `{ name, address }` or a `Group` `{ name, group }` |
| `parseMailboxes(text, options?)` | an address list | `Mailbox[]`, with the members of each group in place of the group |
| `formatAddresses(addresses, options?)` | `Address[]` | the address list |
| `InvalidInputError` | | thrown by `parseAddresses` and `parseMailboxes` in strict mode and by `formatValue` and `formatAddresses` |
| `MaxLengthError` | | thrown by `parseHeaders` when the header block is longer than `maxLength`. The error stores the limit in `maxLength`. |

`decodeWords` joins encoded words that only whitespace separates, and decodes adjacent words in the same charset together, so a character split across two words still decodes. It decodes the charset with `TextDecoder`, and reads the text as UTF-8 if `TextDecoder` doesn't know the label, such as `utf-7`. It never throws.

`parseValue` lowercases parameter names, joins RFC 2231 sections (`name*0*`, `name*1*`), decodes their charset, and decodes encoded words in plain values. When a parameter has both forms, `parseValue` uses the RFC 2231 one (RFC 6266 section 4.3). `formatValue` quotes values that need it and writes values outside printable ASCII, or ones that look like encoded words, as UTF-8 RFC 2231 sections.

`parseAddresses` reads RFC 5322 address lists with the obsolete syntax, RFC 6532 UTF-8, comments, groups and encoded-word names. In the default mode it never throws and reads malformed input the way mail clients do: an unquoted name split by a comma is joined back, anything before a stray `<` is dropped, and text around the address becomes the name. A quoted string is never searched for an address. With `strict: true` it throws `InvalidInputError` for anything RFC 5322 doesn't allow.

## Options

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `wordEncoding` | `encodeWord`, `encodeWords`, `formatAddresses` | `'Q'` | `'Q'` keeps ASCII readable, `'B'` is base64. |
| `wordLength` | `encodeWord`, `encodeWords` | `75` | Longest encoded word, `=?` and `?=` included, as RFC 2047 requires. Longer text becomes several words, each holding whole characters. With `false`, the text is written as one encoded word whatever its length. |
| `charset` | `encodeWord`, `encodeWords`, `formatAddresses` | UTF-8 | A `CharsetEncoder`, `{ name, encode(text) }`, for mail that has to use another charset. Every charset from `@portable/charset` is one. |
| `lineLength` | `fold` | `76` | Longest line, not counting the line break. A word longer than a line is not broken. |
| `strict` | `parseAddresses`, `parseMailboxes` | `false` | Throw `InvalidInputError` on input RFC 5322 doesn't allow. |
| `maxLength` | `parseHeaders` | `Infinity` | Longest header block in UTF-16 code units. `parseHeaders` throws `MaxLengthError` for a longer block. The body doesn't count toward the limit. |

## Types

| Type | Description |
| --- | --- |
| `MimeHeaders.Address` | One entry of an address list: a `Mailbox` or a `Group`. |
| `MimeHeaders.Mailbox` | `{ name, address }`. `address` is `''` when the entry has no address. |
| `MimeHeaders.Group` | `{ name, group }`, a named group of mailboxes. |
| `MimeHeaders.Header` | `{ name, value }`, one header field from `parseHeaders`. |
| `MimeHeaders.Value` | `{ value, params }`, a header value with parameters. |
| `MimeHeaders.CharsetEncoder` | `{ name, encode(text) }`, the charset that encoded words are written in. `encode` is called once per word, so the bytes from each call must decode on their own. |
| `MimeHeaders.WordEncoding` | `'Q' \| 'B'`, the encodings of an encoded-word. |

## Why use this over libmime, addressparser and email-addresses

It has no dependencies, takes and returns plain strings and `Uint8Array`s, and decodes charsets with `TextDecoder` instead of bundling iconv-lite. One address parser covers what addressparser and email-addresses each do: a lenient mode for mail as it arrives and a strict mode that validates RFC 5322.

- In the benchmarks on Node 24, `parseAddresses` was 2× faster than addressparser and about 50× faster than email-addresses (25× in strict mode). `fold` was 7× faster than libmime's `foldLines`, `parseHeaders` 3.5× faster than `decodeHeaders`, `encodeWords` 3× faster and `formatValue` 2× faster. `decodeWords`, `parseValue` and `encodeWord` were 1.1 to 1.3× faster. `Buffer` and `TextDecoder` decode a single B word 3.7× faster than `decodeWords`, which also finds the words in the text and joins characters split across them.
- `parseAddresses` reads an address hidden in a quoted local part, such as `"evil@evil.com x"@good.com`, as the quoted local part at good.com. addressparser before nodemailer 7.0.7 sent it to evil.com (GHSA-mm7p-fcc7-pg87), and 10.2.1 still moves a quoted display name that contains "@" into the address.
- `parseAddresses` never takes the address from a comment: `(evil@evil.com) Name <good@good.com>` parses to `good@good.com`. nodemailer fixed this in 10.1.4.
- `encodeWords` encodes text that looks like an encoded word, so a reader can't decode a subject the sender didn't encode. libmime 5.5.1 leaves it as is.
- `encodeWord` keeps every astral character whole when it splits B words. libmime 5.4.9 turns a character outside the emoji block into two U+FFFD.
- `formatAddresses` encodes a CRLF in a name and refuses an address that would read back as something else, so a header can't be split into two.
- Every function runs in linear time on hostile input. The tests check 45 adversarial inputs.
- libmime's `encodeWord` writes one word unless given a length, and `encodeWord` limits words to 75 characters by default. Pass `wordLength: false` where you passed libmime a length of 0.
- In a Q word, `encodeWord` writes a trailing space as `_`, where libmime writes `=20`.
- `encodeWords` encodes words that contain control characters. libmime leaves them as they are.
- libmime's `encodeWords` takes bytes in another charset, and `encodeWords` reads a `Uint8Array` as UTF-8, so decode such bytes with `TextDecoder` first.
- `fold` allows a line of exactly `lineLength`, where libmime's `foldLines` keeps its lines one character shorter. `fold` never breaks in front of trailing whitespace, which would leave a line of only whitespace.
- libmime's `decodeHeaders` lowercases names, collapses the whitespace a fold leaves to one space and groups values by name. `parseHeaders` keeps the case of names and the whitespace, and returns a list in order, so lowercase the names yourself to group them.
- libmime's `parseHeaderValue` returns the decoded parameters in `decodedParams`. `parseValue` has no `decodedParams`, because it decodes every parameter in `params`.
- Unlike libmime's `parseHeaderValue`, `parseValue` reads a backslash as an escape only inside quotes.
- `formatValue` throws `InvalidInputError` for a control character in the value or a parameter name, where libmime 5.5's `buildHeaderValue` drops it. It marks every section of an encoded value with `*`.
- libmime's `encodeFlowed`, `decodeFlowed`, `detectMimeType` and `charset` functions are not in this package.
- `parseAddresses` decodes the encoded words in names. addressparser and email-addresses return them encoded.
- `parseAddresses` drops quotes a local part doesn't need, inside angle brackets as well, so `<"user"@example.com>` gives `user@example.com`. It keeps whitespace inside a quoted name, where email-addresses collapses it.
- When malformed input can be read two ways, `parseAddresses` takes the first complete address and makes the rest the name: `<x@evil.com @good.com>` gives `x@evil.com` named `@good.com`, where addressparser returns the whole value. `PARITY.md` lists each case.
- email-addresses' `parseAddressList` and `parseOneAddress` return `null` for invalid input, and `parseAddresses` with `strict: true` throws `InvalidInputError`. There is no single-address function, so check that the result has one entry.
- Strict mode accepts the obsolete syntax RFC 5322 says to read, such as `H.P. Lovecraft <a@b.c>`, and UTF-8 (RFC 6532). email-addresses' `strict` refuses the first and needs `rfc6532: true` for the second. `parseAddresses` has no equivalent of email-addresses' `rejectTLD`, `atInDisplayName`, `commaInDisplayName` or `addressListSeparator` options.
- email-addresses returns `local` and `domain` fields, and `parseAddresses` returns only `address`, so split it at its last `@`. There is no IDN conversion: `user@münchen.de` stays as written.

<!-- bench:start -->
| | @portable/mime-headers | libmime | addressparser | email-addresses | Node `Buffer` and `TextDecoder` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Decode 200 Q-encoded subjects | 1,130 | 602 | – | – | – |
| Decode 200 B-encoded words | 2,470 | 1,810 | – | – | 7,530 |
| Encode 200 subjects | 1,720 | 631 | – | – | – |
| Encode 200 subjects as B words | 7,320 | 7,600 | – | – | 3,450 |
| Fold a 2,000-word header | 79,200 | 10,300 | – | – | – |
| Parse 200 folded headers | 18,100 | 4,930 | – | – | – |
| Parse 200 header values with parameters | 1,330 | 864 | – | – | – |
| Format 200 header values with parameters | 1,880 | 837 | – | – | – |
| Parse 500 addresses | 2,070 | – | 861 | 36.8 | – |
| Parse 500 addresses in strict mode | 969 | – | – | 41.0 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/mime-headers | libmime | addressparser | email-addresses | Node `Buffer` and `TextDecoder` |
| --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 7.9 kB | 258 kB | 2.6 kB | 3.1 kB | built in |
| Runtime dependencies | 2 | 5 | 0 | 0 | – |
| Node built-ins used | none | `buffer`, `stream`, `string_decoder` | none | none | Node only |
| TypeScript types | included | none | none | included | – |
| Version compared | – | 5.4.9 | 10.1.2 | 5.0.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
