# @portable/mime-headers

Reads and writes email header values: encoded-words (RFC 2047), folding (RFC 5322), parameters with RFC 2231 encoding, and address lists. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the header functions of [libmime](https://www.npmjs.com/package/libmime), [addressparser](https://www.npmjs.com/package/addressparser) (now `nodemailer/lib/addressparser`), and [email-addresses](https://www.npmjs.com/package/email-addresses).

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

`encode*` and `decode*` convert text to encoded-words and back. `parse*` and `format*` read and write structured values. Every function that takes text also takes a `Uint8Array`, read as UTF-8.

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
| `formatAddresses(addresses, options?)` | `Address[]` | the address list, each address in its shortest form. Throws `InvalidInputError` for an empty `address`, so filter those out of a `parseAddresses` result first. |
| `InvalidInputError` | | thrown by `parseAddresses` and `parseMailboxes` in strict mode and by `formatValue` and `formatAddresses` |
| `MaxLengthError` | | thrown by `parseHeaders` when the header block is longer than `maxLength` |

`parseHeaders` stops at the first empty line, skips a line without a colon, and unfolds and trims each value. It doesn't decode encoded words, so pass the value to `decodeWords` or `parseAddresses`.

`decodeWords` decodes a character split across two encoded words. A charset `TextDecoder` doesn't know, such as `utf-7`, is read as UTF-8. It never throws.

`parseValue` lowercases parameter names and decodes RFC 2231 sections and encoded words. It keeps the case of parameter values, so compare them case-insensitively.

`formatValue` quotes values that need it and writes non-ASCII values as UTF-8 RFC 2231 sections. It throws `InvalidInputError` if `value` has a character outside printable ASCII or a parameter name isn't a token.

`parseAddresses` reads RFC 5322 address lists, including the obsolete syntax, UTF-8 (RFC 6532), comments, groups, and encoded-word names. By default it never throws and reads malformed input the way mail clients do. With `strict: true` it throws `InvalidInputError` for anything RFC 5322 doesn't allow.

## Options

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `wordEncoding` | `encodeWord`, `encodeWords`, `formatAddresses` | `'Q'` | In `'Q'` words, ASCII letters and digits stay readable. `'B'` is base64 and shorter for non-Latin text. |
| `wordLength` | `encodeWord`, `encodeWords` | `75` | Longest encoded word, including `=?` and `?=` (RFC 2047). Longer text is split into several words without splitting a character. `Infinity` writes one word. |
| `charset` | `encodeWord`, `encodeWords`, `formatAddresses` | UTF-8 | A `CharsetEncoder` for another charset. Every charset from [@portable/charset](https://portablejs.com/packages/charset) is one. |
| `lineLength` | `fold` | `76` | Longest line, not counting the line break. A word longer than a line is not broken. |
| `strict` | `parseAddresses`, `parseMailboxes` | `false` | Throw `InvalidInputError` on input RFC 5322 doesn't allow. |
| `maxLength` | `parseHeaders` | `Infinity` | Longest header block in UTF-16 code units, not counting the body. A longer block throws `MaxLengthError`. |

Each function throws `RangeError` for an option outside its range, such as a `lineLength` of 0 or an unknown `wordEncoding`.

## Types

| Type | Description |
| --- | --- |
| `MimeHeaders.Address` | One entry of an address list: a `Mailbox` or a `Group`. |
| `MimeHeaders.Mailbox` | `{ name, address }`. `address` is `''` when the entry has no address. |
| `MimeHeaders.Group` | `{ name, group }`, a named group of mailboxes. |
| `MimeHeaders.Header` | `{ name, value }`, one header field from `parseHeaders`. |
| `MimeHeaders.Value` | `{ value, params }`, a header value with parameters. |
| `MimeHeaders.CharsetEncoder` | `{ name, encode(text) }`, the charset for encoded words. `encode` is called once per word, so each call's bytes must decode on their own. |
| `MimeHeaders.WordEncoding` | `'Q' \| 'B'`, the encodings of an encoded-word. |

## Why use this over libmime, addressparser, and email-addresses

It uses plain strings and `Uint8Array`s, and decodes charsets with `TextDecoder` instead of bundling iconv-lite. `parseAddresses` replaces both addressparser and email-addresses.

Speed, on Node 24:

- `parseAddresses` is 2.4× faster than addressparser and 56× faster than email-addresses (24× in strict mode).
- Compared with libmime, `fold` is 7.7× faster, `parseHeaders` 3.7×, `encodeWords` 2.7×, `formatValue` 2.2×, `decodeWords` 1.4× to 1.9×, and `parseValue` 1.5×. `encodeWord` is as fast for B words.

Security:

- `parseAddresses` reads `"evil@evil.com x"@good.com` as an address at good.com. addressparser before nodemailer 7.0.7 sent it to evil.com (GHSA-mm7p-fcc7-pg87), and 10.2.1 still moves a quoted display name with "@" into the address.
- `parseAddresses` never takes the address from a comment: `(evil@evil.com) Name <good@good.com>` parses to `good@good.com`. nodemailer fixed this in 10.1.4.
- `encodeWords` encodes text that looks like an encoded word, so a reader can't decode a subject the sender didn't encode. libmime 5.5.1 leaves it as is.
- `formatAddresses` encodes a CRLF in a name, and throws `InvalidInputError` for an address that would parse back differently, so a header can't be split into two.
- Every function runs in linear time on hostile input (45 adversarial inputs are tested).

Differences from libmime:

- `encodeWord` keeps astral characters whole when it splits B words. libmime 5.4.9 turns some into two U+FFFD.
- `encodeWord` limits words to 75 characters by default. libmime writes one word unless you give a length. For libmime's length 0, pass `wordLength: Infinity`.
- In a Q word, a trailing space is written as `_`, not `=20`.
- `encodeWords` encodes words with control characters. libmime leaves them.
- `encodeWords` reads a `Uint8Array` as UTF-8. Decode bytes in another charset with `TextDecoder` first.
- `fold` allows a line of exactly `lineLength`. libmime's lines are one character shorter. `fold` never breaks before trailing whitespace.
- `parseHeaders` returns a list in order and keeps the case of names and the whitespace from folding. libmime's `decodeHeaders` lowercases names, collapses whitespace, and groups values by name.
- `parseValue` decodes every parameter in `params`, so there is no `decodedParams`. It reads a backslash as an escape only inside quotes.
- `formatValue` throws `InvalidInputError` for a control character where libmime 5.5's `buildHeaderValue` drops it. It marks every section of an encoded value with `*`.
- libmime's `encodeFlowed`, `decodeFlowed`, `detectMimeType`, and `charset` functions are not included.

Differences from addressparser and email-addresses:

- `parseAddresses` decodes encoded words in names. Both libraries return them encoded.
- `parseAddresses` drops quotes a local part doesn't need, so `<"user"@example.com>` gives `user@example.com`. It keeps whitespace inside a quoted name, which email-addresses collapses.
- On ambiguous malformed input, `parseAddresses` takes the first complete address and makes the rest the name: `<x@evil.com @good.com>` gives `x@evil.com` named `@good.com`. addressparser returns the whole value.
- Strict mode throws `InvalidInputError` where email-addresses returns `null`. There is no single-address function, so check that the result has one entry.
- Strict mode accepts the obsolete syntax, such as `H.P. Lovecraft <a@b.c>`, and UTF-8. email-addresses' `strict` refuses the first and needs `rfc6532: true` for the second. Its `rejectTLD`, `atInDisplayName`, `commaInDisplayName`, and `addressListSeparator` options have no equivalent.
- `parseAddresses` returns only `address`, not `local` and `domain`, so split at the last `@`. Domains aren't converted to or from IDN: `user@münchen.de` stays as written.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Decode 200 Q-encoded subjects</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">1,130</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">602</td><td>1.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="85" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 200 B-encoded words</th></tr>
<tr><td>Node <code>Buffer</code> and <code>TextDecoder</code></td><td align="right">7,530</td><td>3.0× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/mime-headers</td><td align="right">2,470</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="52" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">1,810</td><td>1.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="38" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 200 subjects</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">1,720</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">631</td><td>2.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="59" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 200 subjects as B words</th></tr>
<tr><td>libmime</td><td align="right">7,600</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/mime-headers</td><td align="right">7,320</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="154" height="12" alt="" /></td></tr>
<tr><td>Node <code>Buffer</code> and <code>TextDecoder</code></td><td align="right">3,450</td><td>2.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="73" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Fold a 2,000-word header</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">79,200</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">10,300</td><td>7.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="21" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Parse 200 folded headers</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">18,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">4,930</td><td>3.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="44" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Parse 200 header values with parameters</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">1,330</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">864</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="104" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Format 200 header values with parameters</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">1,880</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>libmime</td><td align="right">837</td><td>2.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="71" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Parse 500 addresses</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">2,070</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>addressparser</td><td align="right">861</td><td>2.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="67" height="12" alt="" /></td></tr>
<tr><td>email-addresses</td><td align="right">36.8</td><td>56× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="3" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Parse 500 addresses in strict mode</th></tr>
<tr><td>@portable/mime-headers</td><td align="right">969</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>email-addresses</td><td align="right">41.0</td><td>24× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="7" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/mime-headers, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/mime-headers | – | 8.1 kB | 4 | none | included |
| libmime | 5.4.9 | 258 kB | 5 | `buffer`, `stream`, `string_decoder` | none |
| addressparser | 10.2.1 | 3.6 kB | 0 | none | none |
| email-addresses | 5.0.0 | 3.1 kB | 0 | none | included |
| Node `Buffer` and `TextDecoder` | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
