# Test parity

Upstream suites:

- [libmime 5.5.1](https://github.com/nodemailer/libmime/tree/v5.5.1/test) (`libmime-test.ts`, `property-test.ts`, `fuzz-test.ts`), MIT, Andris Reinman.
- [nodemailer 10.1.7](https://github.com/nodemailer/nodemailer/tree/v10.1.7/test/addressparser) (`addressparser-test.ts`, `addressparser-heap-test.ts`), MIT, Andris Reinman. The [addressparser](https://github.com/nodemailer/addressparser) repository is archived and has no tests; its code and tests live on in nodemailer.
- [email-addresses 5.0.1](https://github.com/jackbearheart/email-addresses/tree/v5.0.1/test) (`email-addresses.js`, `is_email.js`, `tests.json`), MIT, Fog Creek Software. `fixtures/is_email.json` is its `tests.json`, which holds Dominic Sayers' is_email test data under a BSD license; `fixtures/is_email.LICENSE` carries it.

Name mapping: libmime's `encodeWord(text, 'Q', n)` is `encodeWord(text, { maxLength: n })`, with its `n = 0` (no limit) as `maxLength: false`. `foldLines(text, n)` is `fold(text, { lineLength: n })`, `parseHeaderValue` is `parseValue`, `buildHeaderValue` is `formatValue`, `decodeHeaders` and `decodeHeader` are `parseHeaders`. addressparser's `addressparser(input, options)` is `parseAddresses(input, options)`. email-addresses' `parseOneAddress`, `parseAddressList`, `parseFrom`, `parseReplyTo` and `parseSender` are `parseAddresses(input, { strict: true })`, and its `null` result is a thrown `InvalidInputError`.

"same name" means a test of the same name, in the file named in the section heading.

## libmime `libmime-test.ts`

`libmime.conformance.ts` unless the row names another file.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| #isPlainText > should detect plain text | skipped | Not exported. `encodeWords` decides per word what needs encoding. |
| #isPlainText > should return true | skipped | As above. |
| #isPlainText > should return false on low bits | `properties.conformance.ts > decodeWords gives back what encodeWords encoded, and printable ASCII is left as it is` | `encodeWords` encodes control characters; libmime's `isPlainText` let them through. |
| #isPlainText > should return false on high bits | `encodeWords() > treats U+0080 as a character that needs encoding` | |
| #hasLongerLines > should detect longer lines | skipped | Not exported. |
| #encodeWord > should encode quoted-printable | `encodeWord() > encodes quoted-printable` | |
| #encodeWord > should encode base64 | `encodeWord() > encodes base64` | |
| #encodeWord > should split quoted-printable on maxLength | `encodeWord() > splits quoted-printable at maxLength` | |
| #encodeWord > should keep emoji surrogate pairs together when splitting base64 | `encodeWord() > keeps surrogate pairs together when splitting base64` | |
| #encodeWords > should treat U+0080 as a char that needs encoding | `encodeWords() > treats U+0080 as a character that needs encoding` | |
| #encodeWords > should encode Ascii range | `encodeWords() > encodes the ASCII range between non-ASCII words` | |
| #encodeWords > should encode using base64 | `encodeWords() > encodes using base64` | |
| #encodeWords > should accept fromCharset as third argument | `encodeWords() > takes bytes as UTF-8` | There is no `fromCharset`: bytes are read as UTF-8, and other input is decoded by the caller with `TextDecoder`. |
| #encodeWords > should leave pure ascii input unchanged | `encodeWords() > leaves pure ASCII input unchanged` | |
| #encodeWords > should end the encoded part with the last word that has non ascii characters | same name | |
| #encodeWords > should encode a long non ascii word in linear time | `encodeWords() > encodes a long non-ASCII word`, `linear-time.test.ts > encodeWords() of hostile text` | |
| #decodeWord > should decode quoted-printable payload | `decodeWords() > decodes a quoted-printable word` | `decodeWord(charset, encoding, payload)` is not exported; the tests decode the whole word. |
| #decodeWord > should decode base64 payload | `decodeWords() > decodes a base64 word` | |
| #decodeWord > should ignore RFC 2231 language tag in charset | `decodeWords() > ignores an RFC 2231 language in the charset` | |
| #decodeWord > should recover from whitespace between = and hex digits | `decodeWords() > recovers from whitespace between "=" and the hex digits` | |
| #decodeWords > should decode lower case hex escapes in Q encoding | same name | |
| #decodeWords > should keep an escape that is not two hex digits in Q encoding | same name | |
| #decodeWords > should decode | `decodeWords() > decodes words in text and across a fold` | |
| #decodeWords > should decode mime words | `decodeWords() > decodes words in another charset and keeps the text between them` | |
| #decodeWords > should decode ascii range | `decodeWords() > decodes the ASCII range` | |
| #decodeWords > should join before parsing | `decodeWords() > joins a character split across two base64 words` | |
| #decodeWords > should join base64 encoding which end with = and decode correctly | `decodeWords() > joins base64 words that end with padding` | |
| #decodeWords > should split QP on maxLength | `encodeWords() > splits QP at maxLength` | |
| #decodeWords > should split base64 on maxLength | `encodeWords() > splits base64 at maxLength` | |
| #decodeWords > should ignore language param | `decodeWords() > ignores an RFC 2231 language in the charset` | |
| #decodeWords > should handle invalidly split mime words | `decodeWords() > decodes words split in the wrong places and folded inside a word` | |
| #decodeWords > should decode using jconv module | `decodeWords() > decodes ISO-2022-JP` | Decoded by `TextDecoder`. |
| #decodeWords > should also decode content empty part | `decodeWords() > decodes an empty word` | |
| #decodeWords > should not join adjacent base64 words with mismatched charsets | `decodeWords() > does not join adjacent words in different charsets` | |
| #decodeWords > should not join adjacent quoted-printable words with mismatched charsets | `decodeWords() > does not join adjacent words in different charsets` | |
| #decodeWords > should not decode with the utf-7, base64 or hex codecs | `decodeWords() > reads the utf-7, base64 and hex codecs as UTF-8` | `TextDecoder` doesn't know them, so they decode as UTF-8, as libmime's fallback does. |
| #buildHeaderParam > should encode a value that looks like an encoded word | `formatValue() > encodes a value that looks like an encoded word` | `buildHeaderParam` is not exported; `formatValue` writes the sections. |
| #buildHeaderParam > should not split a plain value of exactly maxLength | `formatValue() > does not split a plain value shorter than 75` | The section length is fixed at 50 for encoded and 75 for plain values. |
| #buildHeaderParam > should return unmodified | `formatValue() > formats values and quotes the ones that need it` | |
| #buildHeaderParam > should encode and split ascii | `formatValue() > splits a long ASCII value into sections` | |
| #buildHeaderParam > should encode double byte unicode characters | `formatValue() > encodes a short Unicode value in one section` | |
| #buildHeaderParam > should encode and split unicode | `formatValue() > encodes and splits a Unicode file name` | |
| #buildHeaderParam > should encode and split filename with dashes | `formatValue() > encodes and splits a file name with dashes` | |
| #buildHeaderParam > should encode and decode | `formatValue() > formats a long text that parseValue reads back` | |
| #buildHeaderParam > should normalize input that is neither a string nor a Buffer | skipped | A parameter value is a `string` by type. |
| #buildHeaderParam > should accept a Buffer as input | skipped | Parameter values are strings; decode bytes with `TextDecoder` first. |
| #decodeHeader > should split a header line into key and value | `parseHeaders() > splits a header line into name and value` | |
| #decodeHeader > should lowercase the key | `parseHeaders() > splits a header line into name and value` | Deliberate difference: the name keeps its case. Compare names case-insensitively. |
| #decodeHeader > should split only on the first colon | `parseHeaders() > splits only at the first colon` | |
| #decodeHeader > should unfold continuation lines | `parseHeaders() > unfolds continuation lines` | Deliberate difference: unfolding removes only the line break and keeps the whitespace, as RFC 5322 says. libmime collapses it to one space. |
| #decodeHeader > should return empty key and value for an empty line | `parseHeaders() > returns nothing for an empty line or a line without a colon` | |
| #decodeHeader > should return empty key and value when no colon is present | `parseHeaders() > returns nothing for an empty line or a line without a colon` | A line without a colon is skipped instead of returned with empty fields. |
| #decodeHeaders > should decode headers | `parseHeaders() > reads a block of headers, repeated ones included` | Returns a list of `{ name, value }` in order, instead of an object of arrays. |
| #decodeHeaders > should not pollute prototype or crash on special header keys | `parseHeaders() > keeps names such as __proto__ as data` | |
| #decodeHeaders > should stop at the end of the header block | same name | |
| #decodeHeaders > should only fold lines that start with a space or a tab | `parseHeaders() > folds only lines that start with a space or a tab` | |
| #decodeHeaders > should keep a continuation line in front of the first header as is | `parseHeaders() > reads a continuation line in front of the first header as a header` | |
| #decodeHeaders > should unfold many continuation lines in linear time | `linear-time.test.ts > parseHeaders() of many continuation lines and of a whitespace run` | |
| #parseHeaderValue > should handle default value only | `parseValue() > reads a value without parameters` | |
| #parseHeaderValue > should handle unquoted params | `parseValue() > reads unquoted parameters and lowercases their names` | |
| #parseHeaderValue > should handle quoted params | `parseValue() > reads quoted parameters` | |
| #parseHeaderValue > should handle multi line values | `parseValue() > joins and decodes RFC 2231 sections over several lines` | |
| #parseHeaderValue > should handle multi line ascii values | `parseValue() > joins ASCII sections over several lines` | |
| #parseHeaderValue > should handle ARC header from MS | `parseValue() > reads an ARC-Authentication-Results value from Microsoft` | |
| #parseHeaderValue > should handle params only | `parseValue() > reads parameters without a value` | |
| #parseHeaderValue > should handle trailing key-only param | `parseValue() > reads a trailing parameter without a value` | |
| #parseHeaderValue > should handle escaped backslash inside a quoted param | `parseValue() > reads an escaped backslash in a quoted value` | |
| #parseHeaderValue > should handle a key-only param in the middle of the list | `parseValue() > reads a parameter without a value in the middle of the list` | |
| #parseHeaderValue > should keep whitespace inside quotes | `parseValue() > keeps whitespace inside quotes and drops it outside` | |
| #parseHeaderValue > should let a continuation param override a plain param in either order | `parseValue() > prefers the RFC 2231 form of a parameter in either order` | |
| #parseHeaderValue > should handle nested continuation keys | `parseValue() > assembles each section group on its own` | |
| #parseHeaderValue > should not let a charset value inject a mime word | `parseValue() > does not let a charset inject an encoded word` | |
| #parseHeaderValue > should decode an rfc2231 value once and name it in decodedParams | `parseValue() > decodes an RFC 2231 value once`, `parseValue() > decodes encoded words in a plain value` | Deliberate difference: `parseValue` decodes every parameter, plain ones through `decodeWords`, so there is no `decodedParams` list. |
| #parseHeaderValue > should keep decodedParams out of the enumerable result | `parseValue() > returns only value and params` | |
| #parseHeaderValue > should not pollute Object.prototype via __proto__ param keys | `parseValue() > stores a __proto__ parameter as an own property` | |
| #_buildHeaderValue > should encode a parameter value that looks like an encoded word | `formatValue() > encodes a value that looks like an encoded word` | |
| #_buildHeaderValue > should build header value | `formatValue() > formats values and quotes the ones that need it` | |
| #_buildHeaderValue > should handle unicode filename | `formatValue() > encodes and splits a Unicode file name` | |
| #_buildHeaderValue > should handle dashed filename | `formatValue() > encodes and splits a file name with dashes` | |
| #_buildHeaderValue > should split emoji filename | `formatValue() > splits a file name between characters` | |
| #_buildHeaderValue > should quote filename with spaces | `formatValue() > quotes a file name with spaces` | |
| #_buildHeaderValue > should quote filename with special characters | `formatValue() > quotes a file name with special characters` | |
| #_buildHeaderValue > should split long pure-ascii param via RFC 2231 continuation | `formatValue() > splits a long ASCII value into sections` | |
| #_buildHeaderValue > should handle a param value that is not a string | skipped | Values are strings by type. |
| #encodeFlowed > should wrap flowed text | skipped | format=flowed (RFC 3676) is body encoding, not a header value. It belongs in the `mail` composer. |
| #decodeFlowed > should remove soft line breaks | skipped | As above. |
| #decodeFlowed > should remove soft line breaks and spacing | skipped | As above. |
| #decodeFlowed > should remove SP CRLF before space | skipped | As above. |
| #decodeFlowed > should remove SP CRLF after space | skipped | As above. |
| #decodeFlowed > should preserve signature delimiter as a hard break | skipped | As above. |
| #decodeFlowed > should only treat a whole "-- " line as the signature delimiter | skipped | As above. |
| #decodeFlowed > should decode long soft wrapped paragraphs in linear time | skipped | As above. |
| #charset > #encode > should encode UTF-8 to Buffer | skipped | Charsets are `TextDecoder` and `@portable/charset`. |
| #charset > #decode > should decode UTF-8 to Buffer | skipped | As above. |
| #charset > #decode > should decode non UTF-8 Buffer | `decodeWords() > decodes words in another charset and keeps the text between them` | Through an encoded word. |
| #charset > #decode > should decode EUC-JP | `decodeWords() > decodes a word in a charset whose name iconv-lite and TextDecoder spell differently` | |
| #charset > #decode > should decode an ISO-2022-JP body | `decodeWords() > decodes ISO-2022-JP` | |
| #charset > #decode > should decode an ISO-2022-JP string the same as a Buffer | skipped | Charset conversion of strings is out of scope. |
| #charset > #decode > should decode NEC row 13 characters | skipped | `TextDecoder`'s ISO-2022-JP and Shift_JIS tables are the WHATWG ones. |
| #charset > #decode > should fall back to UTF-8 for an unknown charset | `decodeWords() > decodes a word in a charset whose name ...` | `x-unknown-charset` decodes as UTF-8. |
| #charset > #decode > should treat the utf-7, base64 and hex codecs as unknown charsets | `decodeWords() > reads the utf-7, base64 and hex codecs as UTF-8` | |
| #charset > #convert > should only pass a Buffer through for an exact UTF-8 name | skipped | No charset conversion API. |
| #charset > #convert > should convert non UTF-8 to Buffer | skipped | As above. |
| #charset > #normalizeCharset > should resolve curated aliases | skipped | Labels are resolved by `TextDecoder`. |
| #charset > #normalizeCharset > should resolve win-NNNN to windows-NNNN | skipped | As above. |
| #charset > #normalizeCharset > should normalize separator variants | skipped | As above. |
| #charset > #normalizeCharset > should uppercase unknown charsets | skipped | As above. |
| #charset > #normalizeCharset > should default missing or invalid input to UTF-8 | skipped | As above. |
| mimetypes > #detectExtension > should find exact match | skipped | MIME type tables are not header encoding. |
| mimetypes > #detectExtension > should find best match | skipped | As above. |
| mimetypes > #detectExtension > should find default match | skipped | As above. |
| mimetypes > #detectExtension > should not resolve inherited Object.prototype members | skipped | As above. |
| mimetypes > #detectMimeType > should find exact match | skipped | As above. |
| mimetypes > #detectMimeType > should find best match | skipped | As above. |
| mimetypes > #detectMimeType > should strip a leading dot from the extension | skipped | As above. |
| mimetypes > #detectMimeType > should pick the last segment of a multi-dot filename | skipped | As above. |
| mimetypes > #detectMimeType > should fall back to application/octet-stream for unknown extensions | skipped | As above. |
| mimetypes > #detectMimeType > should not resolve inherited Object.prototype members | skipped | As above. |
| #splitMimeEncodedString > should only walk back over UTF-8 continuation bytes | `encodeWord() > keeps astral characters outside the emoji block whole` | Not exported. `encodeWord` splits the bytes before it encodes them, so a split always falls between characters. |
| #splitMimeEncodedString > should split plain text at maxlen | `encodeWord() > splits quoted-printable at maxLength` | |
| #splitMimeEncodedString > should not split an escaped octet | `properties.conformance.ts > decodeWords gives back what encodeWord encoded, as well-formed words` | Every word decodes on its own without U+FFFD. |
| #splitMimeEncodedString > should not split a multi byte UTF-8 sequence | as above | |
| #splitMimeEncodedString > should use at least 12 characters per part | as above | A word holds at least one character, so a limit below one character's escape is exceeded instead of looping. |
| #safeEncodeURIComponent > should encode the characters encodeURIComponent leaves alone | `formatValue() > quotes a file name with special characters` | Not exported. |
| #safeEncodeURIComponent > should encode non ASCII characters as UTF-8 | `formatValue() > encodes a short Unicode value in one section` | |
| #safeEncodeURIComponent > should handle empty and non string input | `formatValue() > quotes an empty value` | |
| #safeEncodeURIComponent > should not throw on a lone surrogate | `formatValue() > keeps an unpaired surrogate from splitting a parameter` | |
| #encodeURICharComponent > should percent encode every UTF-8 byte of a char | `formatValue() > encodes and splits a Unicode file name` | Not exported. |
| #foldLines > should Fold long header line | `fold() > folds a long header line` | |
| #foldLines > should Fold flowed text | skipped | `afterSpace` folding is for format=flowed bodies. |
| #foldLines > should fold one long line | `fold() > folds in front of a word longer than a line` | |
| #normalizeCharset > should delegate to libcharset.normalizeCharset | skipped | No charset API. |
| #splitMimeEncodedString on malformed input > should not loop forever on a run of UTF-8 continuation bytes | `encodeWord() > encodes bytes as the UTF-8 text they hold, the same as the string` | Bytes are decoded as UTF-8 first, so invalid sequences are U+FFFD before splitting. |
| #splitMimeEncodedString on malformed input > should not loop forever on a dangling escape at the end | skipped | There is no function that splits an encoded payload. |
| #splitMimeEncodedString on malformed input > should only walk back over whole escapes | skipped | As above. |
| #splitMimeEncodedString on malformed input > should split a Q word of a Buffer that is not valid UTF-8 | `encodeWord() > encodes bytes as the UTF-8 text they hold, the same as the string` | |
| #encodeWord chunking > should base64 encode the chunks of a Buffer once | `encodeWord() > encodes bytes as the UTF-8 text they hold, the same as the string` | |
| #encodeWord chunking > should keep astral characters outside the emoji block whole | `encodeWord() > keeps astral characters outside the emoji block whole` | |
| #encodeWord chunking > should not let an unpaired surrogate swallow the next char | `encodeWord() > replaces an unpaired surrogate without swallowing the next character` | |
| #buildHeaderValue hardening > should not let an unpaired surrogate break a parameter apart | `formatValue() > keeps an unpaired surrogate from splitting a parameter` | |
| #buildHeaderValue hardening > should flag every continuation that holds an escape as encoded | `formatValue() > marks every section that holds an escape as encoded` | Every section is marked, which RFC 2231 allows. |
| #buildHeaderValue hardening > should encode control chars and DEL in parameter values | `formatValue() > encodes control characters and DEL` | |
| #buildHeaderValue hardening > should quote an empty parameter value | `formatValue() > quotes an empty value` | |
| #buildHeaderValue hardening > should drop control chars from the value and the parameter names | `upstream-issues.conformance.ts > a control character in the value or a parameter name is refused` | Deliberate difference: throws `InvalidInputError` instead of dropping them. |
| #buildHeaderValue hardening > should keep quoting a value with a quote mark | `formatValue() > keeps quoting a value with a quote mark` | |
| #format=flowed space stuffing > should stuff the continuation lines folding starts | skipped | format=flowed is out of scope. |
| #format=flowed space stuffing > should remove the stuffing of a continuation line | skipped | As above. |
| #format=flowed space stuffing > should trim spaces in front of a hard line break | skipped | As above. |
| #format=flowed space stuffing > should keep the signature separator | skipped | As above. |
| #mimetypes table > should resolve the corrected entries | skipped | MIME type tables are out of scope. |
| #mimetypes table > should resolve the added entries | skipped | As above. |
| #charset table lookups > should only resolve own string values | skipped | No charset tables. |
| #getCharsetName > should resolve the charsets Node.js knows, ignoring case and separators | skipped | As above. |
| #decodeWord with an unknown encoding > should keep the text as UTF-8 | `decodeWords() > decodes a word in a charset whose name ...` | A word with an encoding other than B or Q is not an encoded word and is left as text. |
| #detectMimeType name match > should prefer the type that matches the extension by name | skipped | MIME type tables are out of scope. |
| #foldLines with line breaks > should keep the existing line breaks | `fold() > keeps the line breaks already in the text` | |

## libmime `property-test.ts` and `fuzz-test.ts`

`properties.conformance.ts` unless the row names another file. Each runs 300 seeded cases.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Properties > encoded words > decodes what encodeWord encoded, as one or several well formed words | `decodeWords gives back what encodeWord encoded, as well-formed words` | |
| Properties > encoded words > replaces an unpaired surrogate and keeps everything around it | `a lone surrogate becomes U+FFFD and the text around it is kept` | |
| Properties > encoded words > decodes what encodeWords encoded and leaves ASCII as it is | `decodeWords gives back what encodeWords encoded, and printable ASCII is left as it is` | Includes text that looks like an encoded word, which `encodeWords` encodes and libmime doesn't. |
| Properties > encoded words > decodes words in other charsets the way the charset decoder does | `words in another charset decode the way TextDecoder decodes them` | ISO-8859-1 through a `CharsetEncoder`; iconv-lite is not a dependency. |
| Properties > header values > parses back the params buildHeaderValue built, whatever they hold | `parseValue gives back the params formatValue formatted, whatever they hold` | |
| Properties > header values > splits a parameter into continuations that join back into the value | as above | |
| Properties > format=flowed > decodes what encodeFlowed encoded ... | skipped | format=flowed is out of scope. |
| Properties > folding > only inserts line breaks into whitespace | `fold only inserts line breaks before whitespace, and unfold removes them` | |
| Properties > splitMimeEncodedString > splits a Q payload into chunks of whole escapes and whole characters | `decodeWords gives back what encodeWord encoded, as well-formed words` | |
| Properties > charsets > decodes valid multibyte text the way it was encoded | skipped | Charset decoding is `TextDecoder`. |
| Properties > charsets > decodes ISO-2022-JP the way encoding-japanese encoded it | skipped | As above. |
| Properties > charsets > decodes UTF-8 bytes the way TextDecoder does | skipped | As above. |
| Properties > charsets > maps every byte of the single byte charsets the way TextDecoder does | skipped | As above. |
| Properties > differential against nodemailer > encodes words the same way | `mime-headers.oracle.test.ts > encodeWord writes what libmime writes without a length limit` | Compared with libmime instead of nodemailer's copy. |
| Properties > differential against nodemailer > folds, splits and builds parameters the same way | `mime-headers.oracle.test.ts > fold breaks lines where libmime.foldLines breaks them`, `... > libmime parses what formatValue formatted` | |
| Fuzzing > parsers > decodeWords returns a string and leaves text without encoded words as it is | `decodeWords leaves text without encoded words as it is`, `decodeWords returns a string for any input` | |
| Fuzzing > parsers > decodeWords never decodes with a refused codec | `libmime.conformance.ts > decodeWords() > reads the utf-7, base64 and hex codecs as UTF-8` | |
| Fuzzing > parsers > parseHeaderValue returns plain params and never touches a prototype | `parseValue returns plain params and never sets a prototype` | |
| Fuzzing > parsers > decodeHeaders returns lowercased keys with arrays of unfolded values | `parseHeaders reads a name without line breaks or a colon for every header` | Names keep their case. |
| Fuzzing > parsers > decodeHeader splits any line into a key and a value | as above | |
| Fuzzing > parsers > decodeFlowed, the detect functions and the charset functions accept anything | skipped | Out of scope. |
| Fuzzing > builders > buildHeaderValue emits printable ASCII that parses back into the same params | `parseValue gives back the params formatValue formatted, whatever they hold` | |
| Fuzzing > builders > buildHeaderValue drops control chars from the value and the parameter names | `upstream-issues.conformance.ts > a control character in the value or a parameter name is refused` | Throws instead. |
| Fuzzing > builders > encodeWord and encodeWords emit printable ASCII that decodes back | `decodeWords gives back what encodeWord encoded ...`, `decodeWords gives back what encodeWords encoded ...` | |
| Fuzzing > builders > safeEncodeURIComponent leaves only unreserved chars and escapes | `parseValue gives back the params formatValue formatted, whatever they hold` | Checks the output is printable ASCII. |
| Fuzzing > builders > foldLines and splitMimeEncodedString only cut, never change the input | `fold only inserts line breaks before whitespace, and unfold removes them` | |
| Fuzzing > linear time on large hostile input (10 functions) | `linear-time.test.ts > ... of hostile text` | One test per function: `decodeWords`, `parseValue`, `parseHeaders`, `unfold`, `encodeWords`, `encodeWord`, `formatValue`, `fold`, `parseAddresses`. `decodeFlowed`, `encodeFlowed` and `splitMimeEncodedString` have no counterpart. |

## nodemailer `addressparser-test.ts`

`addressparser.conformance.ts` unless the row names another file. Rows grouped under a `describe` give the upstream group first.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should handle single address correctly | `addressparser > a single address` | |
| should handle multiple addresses correctly | `addressparser > several addresses` | |
| should handle unquoted name correctly | `addressparser > an unquoted name` | |
| should handle quoted name correctly | `addressparser > a quoted name with a comma` | |
| should handle quoted semicolons correctly | `addressparser > a quoted name with a semicolon` | |
| should handle unquoted name, unquoted address correctly | `addressparser > an unquoted name before a bare address` | |
| should keep a colon inside an address literal | `addressparser > a colon inside an address literal` | |
| should not let an unclosed address literal swallow later recipients | `addressparser > an unclosed address literal does not swallow later recipients` | |
| should split on a comma following an unclosed address literal | as above | |
| should keep a colon inside an address literal that follows a comment | `addressparser > a colon inside an address literal that follows a comment` | |
| should not let a "[" hide the comment, quoted string or angle-addr after it | `addressparser > a "[" does not hide ...` | |
| should not open an address literal after an "@" inside a quoted string or a comment | `addressparser > an "@" inside a quoted string or a comment does not open an address literal` | |
| should not open an address literal for a group delimiter in a display name | `addressparser > a group delimiter in a display name does not open an address literal` | |
| should handle emtpy group correctly | `addressparser > an empty group` | |
| should handle address group correctly | `addressparser > a group` | |
| should handle semicolon as a delimiter | `addressparser > a semicolon as a separator` | |
| should handle mixed group correctly | `addressparser > mailboxes and groups mixed` | |
| should flatten mixed group correctly | `addressparser > flattens mailboxes and groups mixed` | |
| semicolon as delimiter should not break group parsing | `addressparser > a semicolon separator does not break group parsing` | |
| should handle name from comment correctly | `addressparser > a name from a comment` | |
| should handle skip comment correctly | `addressparser > a comment is skipped when there is a name` | |
| should handle missing address correctly | `addressparser > a missing address` | |
| should handle apostrophe in name correctly | `addressparser > an apostrophe in a name` | |
| should handle particularily bad input, unescaped colon correctly | `addressparser > an unescaped colon in a name` | |
| should handle invalid email address correctly | `addressparser > an invalid address is not made valid` | |
| should handle unexpected < | `addressparser > an unexpected "<"` | |
| should handle escapes | `addressparser > escapes` | |
| should handle quoted usernames | `addressparser > a quoted local part` | |
| should not extract email from quoted local-part (security) | `addressparser > an address is not carved out of a quoted local part` | |
| should handle quoted local-part with attacker domain (security) | as above | |
| should handle multiple @ in quoted local-part (security) | as above | |
| should not make an address of a quoted display name that holds no "@" (security) | `addressparser > a quoted display name without "@" is not made an address`, `... with "@" is not made an address either` | Deliberate difference: a quoted display name holding "@" stays a name too. addressparser moves it into the address when the angle brackets are empty. |
| should handle quoted local-part with angle brackets | `addressparser > a quoted local part in angle brackets` | Deliberate difference: quotes a local part doesn't need are dropped inside angle brackets as well as outside, so both spellings give one address. |
| should handle escaped quotes in quoted string | `addressparser > escaped quotes and backslashes in a quoted local part` | |
| should handle escaped backslashes | as above | |
| should handle unclosed quote gracefully | `addressparser > an unclosed quote, angle bracket or comment` | |
| should handle unclosed angle bracket | as above | |
| should handle unclosed comment | as above | |
| should handle empty string | `addressparser > empty input, whitespace and empty angle brackets` | |
| should handle whitespace only | as above | |
| should handle empty angle brackets | as above | |
| should handle special characters in local-part | `addressparser > special characters in the local part` | |
| should handle leading and trailing whitespace | `addressparser > whitespace and comments around an address` | |
| should handle comment before address | as above | |
| should handle comment after address without space | as above | |
| should handle multiple consecutive delimiters | `addressparser > consecutive separators` | |
| should handle mixed quotes and unquoted text | `addressparser > a quoted name before a bare address` | |
| should handle very long local-part | `addressparser > long local parts and domains` | |
| should handle very long domain | as above | |
| should not have ReDoS vulnerability with many @ symbols | `addressparser > many "@"`, `linear-time.test.ts > parseAddresses() of many "@"` | |
| should handle double @ (malformed) | `addressparser > a double "@"` | |
| should handle address with only name, no email | `addressparser > a name without an address` | |
| should handle nested comments (RFC 5322) | `addressparser > nested comments` | |
| should not extract from quoted text even with spaces | `addressparser > an address is not carved out of a quoted local part` | |
| should flatten nested groups correctly | `addressparser > flattens groups` | |
| Nested group flattening > should flatten deeply nested groups | `nested groups are flattened into the outer one > deeply nested` | |
| Nested group flattening > should flatten multiple nested groups at same level | `... > several nested groups at the same level` | |
| Nested group flattening > should handle mixed nested and regular addresses in group | `... > nested and plain addresses in a group` | |
| Unicode and international addresses > should handle unicode in display name | `international addresses > Unicode, emoji and CJK display names` | |
| Unicode and international addresses > should handle emoji in display name | as above | |
| Unicode and international addresses > should handle unicode domain (IDN) | `international addresses > a Unicode domain` | |
| Unicode and international addresses > should handle CJK characters in name | `international addresses > Unicode, emoji and CJK display names` | |
| Real-world malformed input handling > should handle multiple angle brackets | `malformed input > doubled angle brackets` | |
| Real-world malformed input handling > should handle address with no domain | `malformed input > a missing domain or local part` | |
| Real-world malformed input handling > should handle address with no local part | as above | |
| Real-world malformed input handling > should handle mixed case in domain | `malformed input > mixed case in the domain` | |
| Real-world malformed input handling > should handle tab characters | `malformed input > tabs and line breaks between two addresses` | |
| Real-world malformed input handling > should handle newlines in input | as above | |
| Real-world malformed input handling > should handle CRLF line endings | as above | |
| Group edge cases > should handle group with only spaces | `group edge cases > a group of whitespace` | |
| Group edge cases > should handle group with invalid addresses | `group edge cases > a group of names without addresses` | |
| Group edge cases > should handle group name with special chars | `group edge cases > group names with special characters or quotes` | |
| Group edge cases > should handle quoted group name | as above | |
| Comment edge cases > should handle multiple comments | `addressparser > nested comments`, `RFC 5322 comments > a comment is the name when there is no other` | |
| Comment edge cases > should handle empty comment | `addressparser > whitespace and comments around an address` | |
| Comment edge cases > should handle comment with special characters | `nested comments > a comment ends only at the ")" that closes the outermost one` | |
| Subdomain handling > should handle multiple subdomains | `domains > subdomains` | |
| Subdomain handling > should handle numeric subdomains | as above | |
| Subdomain handling > should handle hyphenated subdomains | as above | |
| IP address domains > should handle IPv4 address as domain | `domains > IP address literals` | |
| IP address domains > should handle IPv6 address notation | as above | |
| Performance and pathological inputs > should handle very long address list efficiently | `long lists > 1000 addresses` | |
| Performance and pathological inputs > should handle deeply nested quotes | `addressparser > escaped quotes and backslashes in a quoted local part` | |
| Performance and pathological inputs > should handle many consecutive delimiters | `addressparser > consecutive separators` | |
| Unquoted display names with commas > should merge comma-separated name parts with angle-bracket address | `unquoted display names with commas > are joined to the entry with the angle address` | |
| Unquoted display names with commas > should merge multiple comma-separated name parts | as above | |
| Unquoted display names with commas > should merge multiple recipients with commas in names | as above | |
| Unquoted display names with commas > should handle bare emails mixed with comma-in-name addresses | as above | |
| Unquoted display names with commas > should not merge when bare email follows a name (no angle brackets) | `... > are not joined to a bare address` | |
| Unquoted display names with commas > should not merge when group is involved | `... > are not joined to a group` | |
| Unquoted display names with commas > should not regress quoted names with commas | `... > are joined to the entry with the angle address` | |
| Angle-addr holding unquoted whitespace > should recover the addr-spec when the recipient is written twice | `an angle address holding unquoted whitespace > the first address wins and the rest is the name` | |
| Angle-addr holding unquoted whitespace > should recover the addr-spec from a bare domain prefix | as above | |
| Angle-addr holding unquoted whitespace > should keep the leftovers out of the address of every recipient in the list | as above | |
| Angle-addr holding unquoted whitespace > should take the first addr-spec when the wreckage holds several | as above | |
| Angle-addr holding unquoted whitespace > should treat an unquoted space in the local part as wreckage | as above | |
| Angle-addr holding unquoted whitespace > should leave the value alone when nothing in it reads as an address | as above | |
| Angle-addr holding unquoted whitespace > should agree with the same wreckage written without angle brackets | `... > reads the same as without angle brackets` | |
| Angle-addr holding unquoted whitespace > should not carve an address out of a quoted local part | `... > a quoted local part keeps its domain` | Deliberate difference: `<junk "a@evil.com b"@good.com>` gives the address `"a@evil.com b"@good.com` and the name `junk`; addressparser returns the whole value as the address. |
| Angle-addr holding unquoted whitespace > should not carve an address out of the middle of a quoted local part | as above | |
| Angle-addr holding unquoted whitespace > should leave a well formed quoted local part alone even when it hides an @ | `... > well-formed quoted local parts` | |
| Angle-addr holding unquoted whitespace > should not touch whitespace inside a quoted local part | as above | |
| Angle-addr holding unquoted whitespace > should peel a quoted local part off whole when wreckage trails it | `... > a quoted local part keeps its domain` | |
| Angle-addr holding unquoted whitespace > should not touch a quoted local part without a display name | `... > well-formed quoted local parts` | |
| Nested group DoS protection > should handle moderately nested groups (depth 5) | `nested groups are flattened into the outer one > at any depth` | |
| Nested group DoS protection > should handle nested groups (depth 10) | as above | |
| Nested group DoS protection > should keep the members of a group however deep it is nested (depth 11) | as above | |
| Nested group DoS protection > should parse a large list behind many group openers in linear time | `... > a large list behind many group openers`, `linear-time.test.ts > parseAddresses() of many group openers` | |
| Nested group DoS protection > should safely truncate groups exceeding depth limit (depth 100) | `... > at any depth` | Nothing is truncated: groups are read in one pass without recursion. |
| Nested group DoS protection > should not crash with malicious deeply nested input (depth 3000) | as above | |
| Nested group DoS protection > should not crash with extreme nesting depth (depth 10000) | as above, `upstream-issues.conformance.ts > deeply nested groups do not overflow the stack` | |
| Nested group DoS protection > should keep the depth counter out of the options object | skipped | There is no depth counter. |
| Nested group DoS protection > should handle multiple deeply nested groups in same input | `... > at any depth` | |
| Nested group DoS protection > should handle mixed normal and deeply nested addresses | as above | |
| Nested group DoS protection > should preserve normal functionality while protecting against DoS | `... > as before` | |
| Nested group DoS protection > should work correctly with flatten option on deeply nested input | `... > at any depth` | |
| linear time parsing > should parse a large flat address list in linear time | `long lists > 200000 addresses`, `linear-time.test.ts > parseAddresses() of a flat list` | |
| linear time parsing > should merge display name fragments in linear time | `long lists > 80000 names split by commas`, `linear-time.test.ts > parseAddresses() of name fragments to merge` | |
| linear time parsing > should parse an address built from comment-joined atoms in linear time | `linear-time.test.ts > parseAddresses() of comment-joined atoms` | |
| linear time parsing > should parse an address built from comment-separated atoms in linear time | `linear-time.test.ts > parseAddresses() of comment-separated atoms` | |
| linear time parsing > should scan free text holding no at sign at all in linear time | `linear-time.test.ts > parseAddresses() of free text without an "@"` | |
| linear time parsing > should scan free text holding an at sign with nothing after it in linear time | `linear-time.test.ts > ... free text and a trailing "@"` | |
| linear time parsing > should scan free text holding an at sign with nothing before it in linear time | `linear-time.test.ts > ... free text after an "@"` | |
| linear time parsing > should scan free text holding an address only past a long run in linear time | `linear-time.test.ts > ... free text before an address` | |
| linear time parsing > should scan free text holding many runs and no at sign in linear time | `linear-time.test.ts > ... many runs and no "@"` | |
| linear time parsing > should scan free text holding many runs before an address in linear time | `linear-time.test.ts > ... many runs before an address` | |
| linear time parsing > should scan free text holding many runs after an address in linear time | `linear-time.test.ts > ... many runs after an address` | |
| linear time parsing > should tokenize many address literals in linear time | `linear-time.test.ts > ... many domain literals` | |
| linear time parsing > should tokenize many brackets in linear time | `linear-time.test.ts > ... many "["` | |
| linear time parsing > should still read an address out of free text | `free text > an address is read out of it` | |
| linear time parsing > should keep fragment merging identical to the previous implementation | `unquoted display names with commas > are joined to the entry with the angle address` | |
| linear time parsing > should not merge fragments across a group boundary | `... > are not joined across a group boundary` | |
| RFC 5322 comments > should not glue a domain to the text after a comment | `RFC 5322 comments > a comment ends the domain` | |
| RFC 5322 comments > should not glue across empty, repeated or nested comments | as above | |
| RFC 5322 comments > should keep both recipients when a comment splits an address list | `... > a comment splitting a list keeps both recipients` | |
| RFC 5322 comments > should still resolve an address with a comment beside the @ | `... > a comment beside the "@" belongs to the address` | |
| RFC 5322 comments > should keep quoted string and angle address joining intact | `... > a quoted string and an angle address joined to text` | |
| RFC 5322 comments > should read a comment as the display name when there is none | `... > a comment is the name when there is no other` | |
| Comments inside an angle-addr > should not carry a comment into the address | `comments inside an angle address > do not become part of the address` | |
| Comments inside an angle-addr > should not glue across empty, repeated, nested, escaped or unterminated comments | as above, `... > a quoted local part keeps its quotes only when it needs them` | |
| Comments inside an angle-addr > should keep the text around a comment but not the comment in the name | `... > the text around a comment stays in the name` | |
| Comments inside an angle-addr > should still resolve an address with a comment beside the @ or at either end | `... > a comment beside the "@" or at either end` | |
| Comments inside an angle-addr > should read brackets holding only a comment as empty ones | `... > brackets holding only a comment read as empty ones` | |
| Comments inside an angle-addr > should read a comment as the display name when there is none | `... > a comment is the name when there is no other` | |
| Comments inside an angle-addr > should leave parentheses inside a quoted local part or a domain literal alone | `... > parentheses inside a quoted local part or a domain literal stay` | |
| Comments inside an angle-addr > should strip many comments in linear time | `linear-time.test.ts > parseAddresses() of many comments in an angle address`, `... of comment openers in an angle address` | |
| Comments after a quoted local part > should not carry the text after a comment into a quoted local part address | `comments after a quoted local part > end the domain` | |
| Comments after a quoted local part > should terminate the domain at the first comment however many follow | as above | |
| Comments after a quoted local part > should agree with the same value written without the quotes | `... > read the same as without quotes` | |
| Comments after a quoted local part > should peel wreckage off a quoted local part that holds an @ | `... > text after a quoted local part becomes the name` | |
| Comments after a quoted local part > should peel wreckage off a quoted local part that holds whitespace | as above | |
| Comments after a quoted local part > should quote an empty local part back before peeling the comment off | `... > an empty local part keeps its quotes` | |
| Comments after a quoted local part > should not treat text collected before an empty quoted string as quoted | `... > the first address wins over text collected before an empty quoted string` | Deliberate difference: `a@b.com ""@good-corp.com evil@evil.com` gives `a@b.com`, the first complete address. |
| Comments after a quoted local part > should leave a well formed quoted local part alone | `... > well-formed quoted local parts lose only the quotes they do not need` | |
| Comments after a quoted local part > should not turn a quoted display name beside an address into wreckage | `... > a quoted display name beside an address` | |
| Comments after a quoted local part > should hand back no address holding unquoted whitespace for any quoted spelling | `... > no address holds unquoted whitespace` | |
| Comments after a quoted local part > should keep an escaped parenthesis inside a comment | `... > an escaped parenthesis stays inside a comment` | |
| Closers inside an angle-addr or a group > should not close an angle-addr at a ">" inside a quoted string, a comment or a domain literal | `closers inside an angle address or a group > ">" inside ...` | Deliberate difference: `<"a\>"@good.com>` gives `"a>"@good.com`, the canonical spelling without the needless escape. |
| Closers inside an angle-addr or a group > should not end a group at a ";" inside a quoted string or a comment | `... > ";" inside a quoted string or a comment does not end a group` | |
| Closers inside an angle-addr or a group > should let an escaped backslash end the quoted string it is in | `... > an escaped backslash ends the quoted string it is in` | |
| Closers inside an angle-addr or a group > should read an unclosed quoted string or comment to the end of the value | `... > an unclosed quoted string or comment runs to the end` | |
| Closers inside an angle-addr or a group > should still end an angle-addr and a group at the closer outside them | `... > the closer outside them still ends the angle address and the group` | |
| Closers inside an angle-addr or a group > should still end a group at a ";" inside a domain literal | `... > ";" ends a group even inside a domain literal outside angle brackets`, `... > an unclosed domain literal inside angle brackets runs to the end` | Deliberate difference: `<a@[x, c@d.com>` gives the whole value as one address. Inside angle brackets a domain literal runs to the `]`. |
| Closers inside an angle-addr or a group > should tokenize ${label} in linear time (5 cases) | `linear-time.test.ts > parseAddresses() of an unclosed quoted string in an angle address`, `... in a group`, `... nested comments in an angle address`, `... nested comments in a group`, `... quoted strings in a group` | |
| Nested comments > should end a comment only at the ")" that closes the outermost one | `nested comments > a comment ends only at the ")" that closes the outermost one` | |
| Nested comments > should not open a nested comment at an escaped "(" | `... > an escaped "(" does not open a nested comment` | |
| Nested comments > should read an unclosed nested comment to the end of the value | `... > an unclosed nested comment runs to the end` | |
| Nested comments > should tokenize ${label} in linear time (2 cases) | `linear-time.test.ts > parseAddresses() of deeply nested comments`, `... of an unclosed run of comment openers` | |
| Unexpected "<" inside an angle-addr > should not cut at a "<" inside a quoted string, a comment or a domain literal | `an unexpected "<" inside an angle address > inside a quoted string, a comment or a domain literal is kept` | |
| Unexpected "<" inside an angle-addr > should still drop what comes before an unexpected "<" | `... > drops what comes before it` | |
| Unexpected "<" inside an angle-addr > should read many unexpected "<" in linear time | `... > many of them`, `linear-time.test.ts > parseAddresses() of many unexpected "<"` | |
| Domain literal holding an "@" > should keep the whole domain literal as the domain | `a domain literal holding "@" > is the whole domain` | |
| Domain literal holding an "@" > should still quote a local part that holds an "@" in front of a domain literal | as above | |
| Whitespace and comments beside the "@" > should read whitespace and comments beside the "@" as nothing | `whitespace and comments beside the "@" > are read as nothing` | |
| Whitespace and comments beside the "@" > should still part two atoms a comment sits between | `... > a comment between two atoms still parts them` | |
| Whitespace and comments beside the "@" > should leave whitespace beside one of several "@" alone | `... > with several "@" the first address wins` | Deliberate difference: `<x@evil.com @good.com>` gives `x@evil.com` with the name `@good.com`, and `<"a" @b.com @c.com>` gives `a@b.com` with the name `@c.com`. addressparser returns the whole value. |
| Whitespace and comments beside the "@" > should not join whitespace inside a quoted string | `... > whitespace inside a quoted string stays` | Deliberate difference: `<"a @ b">` reads as the name `a @ b`. |
| Whitespace and comments beside the "@" > should read ${label} in linear time (4 cases) | `linear-time.test.ts > parseAddresses() of a whitespace run in an angle address`, `... whitespace runs beside the "@"`, `... a quoted local part and a whitespace run`, `... many comments beside the "@"` | |
| Obsolete route in an angle-addr > should drop the route and keep the mailbox | `obsolete route in an angle address > is dropped` | |
| Obsolete route in an angle-addr > should leave a value without a mailbox after the route alone | `... > is kept when no mailbox follows it` | |
| Mailbox read out of a comment > should keep a comment that stands alone as the display name only | `a mailbox is never read out of a comment > a comment alone is only a name` | |
| Mailbox read out of a comment > should still name a mailbox with a comment | `... > a comment still names a mailbox` | |
| Several addr-specs in the display text > should take the first one, whatever parts them | `several addresses in the display text > the first one wins` | |
| Groups read in a single pass > should flatten a nested group into the one around it, as before | `nested groups are flattened into the outer one > as before` | |
| Groups read in a single pass > should end an angle-addr left open inside a group at the group's ';' | `groups in one pass > an angle address left open in a group ends at the group's ";"` | |
| Groups read in a single pass > should not end a group at a ';' inside a domain literal of an angle-addr | `groups in one pass > ";" inside a domain literal of an angle address does not end a group` | |
| Groups read in a single pass > should merge display name fragments inside a group | `unquoted display names with commas > are joined inside a group` | |
| Groups read in a single pass > should read an angle-addr followed by a group as the group alone | `groups in one pass > an angle address followed by a group reads as the group alone` | |

## nodemailer `addressparser-heap-test.ts`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should parse a 400KB header of ${label} within 34MB of heap (3 cases) | skipped | It runs the built parser in a child process with `--max-old-space-size`. `long lists > 200000 addresses` parses the same 400 KB list in-process. |

## email-addresses `email-addresses.js` and `is_email.js`

`email-addresses.conformance.ts`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| simple one address function | `one address > a name and an angle address`, `... > a bare word is not an address`, `... > two addresses are a list of two`, `... > a quoted UTF-8 local part (RFC 6532)`, `... > whitespace in an unquoted name is collapsed` | No `local`, `domain` or `parts` fields; split the address at its last `@`. A quoted local part keeps its quotes in `address`. |
| address with @ in the name | `one address > an "@" in the display name is read in the default mode` | No `atInDisplayName` option: strict mode refuses it, the default mode reads it. |
| address with comma in the display name | `one address > a comma in the display name is read in the default mode` | No `commaInDisplayName` option, as above. |
| address with comments | `one address > a comment after the name is not part of it` | No `comments` field. |
| simple address list function | `address lists > a quoted name and a bare address` | |
| simple address list function with user-specified list separator | `address lists > ";" as the separator is read in the default mode` | No `addressListSeparator` option. |
| rfc5322 parser | `address lists > trailing text is an error in strict mode` | No AST, `partial` or `rfc6532` option: RFC 6532 UTF-8 is always allowed. |
| display-name semantic interpretation | `display names > %j` (10 cases) | Deliberate difference: whitespace inside a quoted name is kept as written. email-addresses collapses it. |
| address semantic interpretation | `addresses > %j` (9 cases) | Deliberate difference: `"foo   baz"@bar.com` keeps its quotes, so the address is usable. email-addresses gives `foo baz@bar.com`. |
| unicode support | `display names > UTF-8 names`, `one address > a quoted UTF-8 local part (RFC 6532)` | |
| rejectTLD option | `addresses > a single-label domain is allowed` | No `rejectTLD` option. Check the domain yourself. |
| dots in unquoted display-names | `display names > dots in an unquoted name (obs-phrase)` | Deliberate difference: strict mode accepts the obsolete syntax RFC 5322 says to read. email-addresses' `strict` refuses it. |
| rfc6854 - from | `groups (RFC 6854) > a group`, `... > a group, a mailbox and a group` | |
| rfc6854 - sender | `groups (RFC 6854) > a group` | No `parseSender`; check that the list has one entry. |
| rfc6854 - reply-to | `groups (RFC 6854) > a group, a mailbox and a group` | |
| whitespace in domain | `addresses > %j` | |
| isemail tests (164 cases) | `is_email > #%s %j` | Same rule as upstream: valid unless the diagnosis is an `ISEMAIL_ERR`, except a domain starting or ending with "-". #160 `"test\©"@iana.org` is valid here, because RFC 6532 adds UTF-8 to the characters a quoted-pair may escape; email-addresses runs these tests without `rfc6532`. |

## Known upstream issues

`upstream-issues.conformance.ts` unless the row names another file. The oracle test compares against libmime 5.4.9, nodemailer 10.1.2 and email-addresses 5.0.0, which are the newest versions old enough for `minimumReleaseAge`.

| Issue | Covered by | Status upstream |
| --- | --- | --- |
| [GHSA-mm7p-fcc7-pg87](https://github.com/advisories/GHSA-mm7p-fcc7-pg87): `"xclow3n@gmail.com x"@internal.domain` was sent to gmail.com | `a quoted local part holding an address is not read as that address` | Fixed in nodemailer 7.0.7 (1150d99). |
| [GHSA-9h6g-pr28-7cqp](https://github.com/advisories/GHSA-9h6g-pr28-7cqp) and GHSA-v53p-9fqp-m79j: quadratic regular expressions in addressparser | `linear-time.test.ts > parseAddresses() of ...` (29 inputs) | GHSA-9h6g-pr28-7cqp fixed in nodemailer 6.9.9; the later linear-time fixes are in 10.0.x. |
| Stack overflow on deeply nested groups (nodemailer b61b9c0) | `deeply nested groups do not overflow the stack` | Fixed in nodemailer 7.0.11 with a depth limit. 10.x reads groups without recursion. |
| An unclosed "[" swallowed later recipients ([nodemailer #1829](https://github.com/nodemailer/nodemailer/issues/1829)) | `operators inside a domain literal are part of it` | Fixed in nodemailer 9.0.2. |
| A mailbox was read out of a comment (nodemailer a1538ea) | `a comment never holds the address` | Fixed in nodemailer 10.1.4, after the 10.1.2 the oracle runs. |
| An escaped ")" ended a comment (nodemailer c4ae20d) | `an escaped ")" does not end a comment` | Fixed in nodemailer 10.0.16. |
| A quoted display name was moved into the address (nodemailer 3570d26) | `a quoted display name without "@" is not moved into the address` | Fixed in nodemailer 10.0.14 for a name without "@". A quoted name holding "@" is still moved; this package keeps it a name (`addressparser.conformance.ts > a quoted display name with "@" is not made an address either`). |
| A CRLF in a display name could start a new header | `formatAddresses encodes a CRLF in a name instead of writing a new header` | Not an upstream report; a trap for any address formatter. |
| An address that changes the list when written (`a@b.c, evil@evil.com` as one address) | `formatAddresses refuses an address that would change the list` | Not an upstream report; a trap for any address formatter. |
| Whitespace inside a domain (email-addresses) | `whitespace inside a domain is dropped` | An email-addresses test. |
| utf-7, base64 and hex accepted as charsets of an encoded word, which let `+ADw-script+AD4-` decode to `<script>` | `utf-7, base64 and hex are not read as charsets` | Fixed in libmime 5.4.9. |
| B words split astral characters outside U+1F000 to U+1FFFF into two U+FFFD | `B words keep every astral character whole` | Fixed in libmime 5.5.0; 5.4.9 still has it, so the oracle skips such input. |
| Quadratic encoding of long non-ASCII words | `long non-ASCII text is split into words that each fit`, `linear-time.test.ts > encodeWord() of hostile text` | Fixed in libmime 5.4.9. |
| Text that looks like an encoded word was left as is by `encodeWords` and decoded by the reader | `text that looks like an encoded word is encoded` | Open in libmime 5.5.1: its property test removes such text from the input. |
| A character split across two encoded words decoded as two U+FFFD | `a word split across two encoded words joins its bytes` | Handled by libmime ("should join before parsing"). |
| Prototype pollution through a `__proto__` parameter (libmime 5.4.2) | `"__proto__" is an ordinary parameter` | Fixed in libmime 5.4.2. |
| A parameter value that looks like an encoded word was decoded by the reader (libmime 5.5.1) | `a parameter value that looks like an encoded word is kept as it is` | Fixed in libmime 5.5.1. |
| Control characters and DEL in parameter values were written raw (libmime 5.5.0) | `control characters and DEL in a parameter value are percent-encoded` | Fixed in libmime 5.5.0. |
| An unpaired surrogate left delimiters unencoded in a parameter (libmime 5.5.0) | `an unpaired surrogate in a parameter becomes U+FFFD and nothing is left unencoded` | Fixed in libmime 5.5.0. |
| An empty parameter value was written as `name=` (libmime 5.5.0) | `an empty parameter value is quoted` | Fixed in libmime 5.5.0. |
| Control characters in the value or a parameter name were written raw (libmime 5.5.0) | `a control character in the value or a parameter name is refused` | libmime 5.5.0 drops them; this package throws. |
| A bare LF in a header block was read as a fold (libmime 5.4.2, parser differentials) | `a bare line break that is not followed by whitespace starts a new header` | Fixed in libmime 5.4.2. |
| Quadratic header unfolding (libmime 5.4.5) | `linear-time.test.ts > parseHeaders() of many continuation lines and of a whitespace run` | Fixed in libmime 5.4.5. |
