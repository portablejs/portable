# Test parity

Upstream suite: [mailsplit 5.4.26 `test/`](https://github.com/zone-eu/mailsplit/tree/master/test) (`@zone-eu/mailsplit`, formerly `andris9/mailsplit`). The oracle tests run against `@zone-eu/mailsplit` 5.4.23, the newest release older than a day. Fixtures `message.eml`, `mimetorture.eml`, `original.txt`, `source1.eml`, and `source2.eml` are copied from mailsplit (MIT, Andris Reinman, and Zone Media OÜ). `form-data.eml` (2.4 MB) and `large_image.eml` (3.7 MB) are not copied. The tests that used them build an equivalent message instead.

Tests are in `mailsplit.conformance.ts` unless noted. `MimeStream.conformance.ts` has this package's own tests, and `mailsplit.oracle.test.ts` compares with mailsplit.

## message-splitter-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Split simple message | `message-splitter > splits a simple message` | |
| Split simple message with line ending | `message-splitter > keeps the line break at the end of the body` | |
| Split message with header only 1, 2 | `message-splitter > reads a message that ends inside the headers` | |
| Split message with empty body | `message-splitter > reads a message with an empty body` | |
| Split message with no header | `message-splitter > reads a message with no headers` | |
| Split multipart message | `message-splitter > splits a multipart message` | mailsplit's `data` chunk is a `delimiter` chunk here. |
| Split multipart message without terminating boundary | `message-splitter > splits a multipart message without a close delimiter` | |
| Split and join mimetorture message | `message-splitter > splits and joins mimetorture.eml`, `round trip > writes mimetorture.eml back byte for byte at any chunking` | |
| Fetch attachment from form-data | `message-splitter > gets an attachment out of multipart/form-data` | Builds a form-data request with a binary file instead of copying the 2.4 MB fixture, and checks the file's bytes instead of an MD5. |
| Split multipart message with embedded message/rfc88 | `message-splitter > keeps a message/rfc822 part as one body by default` | |
| Split multipart message with embedded inline message/rfc88 | `message-splitter > reads the message inside a message/rfc822 part with embedded` | mailsplit reads inline embedded messages by default. Here all of them are read, but only with `embedded: true`. |
| handles line break lines split into 2-byte chunks | `message-splitter > reads original.txt written two bytes at a time` | Upstream only logs. Our test compares the chunks with those of a single write. |
| Split multipart message with embedded message/rfc822 with header only | `message-splitter > reads a message/rfc822 part with only headers` | Also checks it with `embedded: true`. |
| Split multipart message and ignore embedded message/rfc88 | `message-splitter > keeps a message/rfc822 part as one body by default` | `ignoreEmbedded: true` is the default here. |
| Split multipart message and embedded message/rfc88 | `message-splitter > reads the message inside a message/rfc822 part with embedded` | `defaultInlineEmbedded: true` is `embedded: true`. |
| Strange split | `message-splitter > reads a header block split in an odd place` | Upstream waits a second between writes and asserts nothing. |
| Fail on large header | `message-splitter > fails on a header block over maxHeaderBytes` | |
| Handle really large header | `message-splitter > reads a header block of 100,000 lines` | |
| Do not parse nodes after closing boundary | `message-splitter > does not read parts after the close delimiter` | The `structure` helper checks chunk sizes 1, 7, 64, and 1024, as `testStructure` does. |
| Do not parse nodes after closing boundary of a nested multipart | `message-splitter > does not read parts after the close delimiter of a nested multipart` | |
| Do not parse nodes after closing boundary of an unterminated multipart | `message-splitter > does not read parts after the close delimiter of an unterminated multipart` | |
| Do not parse nodes after closing boundary of an embedded message | `message-splitter > does not read parts after the close delimiter of an embedded message` | |
| Keep parsing siblings after a bogus boundary on a leaf node | `message-splitter > keeps reading parts after a boundary parameter on a leaf part` | |
| Keep parsing parts after a closing boundary in the preamble | `message-splitter > keeps reading parts after a close delimiter in the preamble` | |
| Keep the boundary of emitted nodes intact | `message-splitter > reports the boundary of each multipart` | |
| Attribute body content independently of the write chunk size | `message-splitter > gives the body the same bytes at any chunk size` | |
| Flush an overlong body line instead of buffering it | `message-splitter > reads a delimiter at the end of a long line as body` | |
| Fail on oversized single header line while writing | `message-splitter > fails on a header line over maxHeaderBytes before the input ends` | |
| Accept a header block closed by a boundary at the size limit | `message-splitter > does not count a delimiter line against maxHeaderBytes` | The limit is the header's own length here. The line break before the delimiter belongs to the delimiter, so mailsplit's extra 2 bytes aren't needed. |
| Flush an overlong line in multipart data | `message-splitter > streams a long preamble line` | |
| Handle a closing delimiter without a parent multipart | `message-splitter > reads a close delimiter outside any multipart as body` | |
| Count a header line for at least 64 bytes | `message-splitter > counts header bytes, not lines, against maxHeaderBytes` | Deliberate difference: the limit counts bytes. `part.headers` holds one object per field, so the memory a header block costs is bounded by its bytes. |
| Fail on too many child nodes | `message-splitter > fails on more than maxParts parts` | |
| Keep parsing siblings after a bogus boundary on an rfc822 leaf | `message-splitter > keeps reading parts after a boundary parameter on a message/rfc822 part` | |
| Report a body that is only a line ending | `message-splitter > gives the line break before a delimiter to the delimiter, even when it is the whole body` | Deliberate difference from 5.4.26: the body is empty, because RFC 2046 makes that line break part of the delimiter. 5.4.23, the oracle, agrees with us. |
| Keep an overlong body line free of a spurious CR | `message-splitter > never ends a body with the CR of the line break before a delimiter` | |
| Keep parsing siblings after a nested inline message closes | `message-splitter > keeps reading parts after a nested embedded message ends` | |
| Split line-dense input without a setImmediate per line | `message-splitter > reads a body of 100,000 empty lines` | Upstream counts event loop turns. `DecoderStream` handles each chunk in one synchronous call and finds line breaks with `indexOf`, so only the result applies. |
| Yield to the event loop while splitting a large chunk | skipped | `DecoderStream` handles a chunk in one call and never schedules work. To get smaller steps, write smaller chunks. |
| Close unterminated nested multiparts on an outer boundary | `message-splitter > closes unterminated nested multiparts on an outer delimiter` | Checks `part.parent` instead of IMAP part numbers, which this package doesn't compute. |

## headers-test.js

mailsplit's `Headers` class parses, edits, and rebuilds a header block. Here the bytes are in the `headers` chunk, the fields are in `part.headers`, and to send other headers, you enqueue other bytes. The tests of editing and rebuilding have no counterpart, because nothing here rebuilds a header block.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Return original headers | `headers > returns the header block as received` | |
| Return modified headers | skipped | No rebuilding. |
| Return original MBOX headers | `headers > returns an mbox header block as received and skips its From line` | |
| Return modified MBOX headers | skipped | No rebuilding. |
| Get specific headers, Get first header value, Get header boolean if it exists, Get all rows | `headers > lists every header field in order` | Filter `part.headers` instead. |
| Add new header, Remove header, Replace header, Replace header at relative key index | `headers > writes a replaced header block instead of the original` | There is no editing API, so the test writes a replacement header block. |
| Preserve SMTPUTF8 mailbox local part, with UTF-8 domain, UTF-8 display name and mailbox, ASCII address round-trip | `headers > decodes UTF-8 header values and keeps their bytes` | |
| Strip CR and LF from added header values, Strip CR and LF from added header keys, Strip injected header lines from addFormatted, from supplied header objects, from a Buffer header line, Drop a leading fold from an added header line, Use lineEnd literally when rebuilding | skipped | They test the escaping of values added through `Headers`. Header text you enqueue is written as given. `MimeHeaders.fold` and `formatValue` build safe header lines. |
| Drop lone CR from modified headers | `headers > does not end a header line at a bare CR` | |
| Drop lone CR that precedes whitespace, Keep a trailing CR from ending the header block | `headers > does not end the header block at a bare CR before a line break` | |
| Keep an indented first header line folded | `headers > does not read an indented first line as a header field` | |
| Keep a whitespace only header line from ending the block | `headers > does not end the header block at a line of whitespace` | |
| Keep folded header lines when rebuilding, Keep a large folded header block byte exact and parse it | `headers > unfolds folded header fields` | |
| Keep unmodified headers byte exact | `headers > does not end a header line at a bare CR` | Checks the bytes of the `headers` chunk. |
| Unfold header continuation lines in linear time | `headers > reads a block of many folded lines and keeps it byte for byte` | |
| Strip trailing line breaks in linear time | `headers > keeps a header line of carriage returns byte for byte` | |
| Find the key of a header line without a colon in linear time | `headers > skips a line without a colon and its continuation lines` | A field without a colon is skipped, as `MimeHeaders.parseHeaders` does, instead of being given an empty key. |

## mime-node-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Add and parse headers | `headers > returns the header block as received` | |
| Update Content-Type, Set filename, Delete filename, Update existing filename, Set character set, Update character set, Remove character set | skipped | No header editing. Build values with `MimeHeaders.formatValue`. |
| Get filename from Content-Type, Get split filename from Content-Type, Get filename from Content-Disposition, Get split filename from Content-Disposition, Do not decode an RFC 2231 filename a second time | `mime-node > reads a filename from the header fields with MimeHeaders.parseValue` | Parameter decoding belongs to `@portable/mime-headers`, whose tests cover each of these cases. |
| Strip comments from Content-Transfer-Encoding | `mime-node > reads Content-Transfer-Encoding without comments` | Deliberate difference: an unclosed comment is dropped too. mailsplit keeps `base64 (unclosed` as it is. |
| Parse Content-Transfer-Encoding with many comment openers in linear time | `mime-node > reads Content-Transfer-Encoding with many comment openers in linear time` | |

## message-joiner-test.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Join split message | `message-joiner > joins chunks, bytes, and text` | |

## rewriter-test.js and streamer-test.js

`Rewriter` and `Streamer` decode the transfer encoding of chosen parts. This package leaves decoding to `@portable/base64` and `@portable/quoted-printable`, so these tests check what a caller gets from the chunks instead.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Recreate message and extract image | `node-rewriter and node-streamer > gets the image out of the message and writes the message back unchanged` | Builds a message with a base64 image instead of copying `large_image.eml`. |
| Recreate message with updated format=flow text node | skipped | format=flowed decoding isn't in this package. |
| Recreate message with large image very slowly | `node-rewriter and node-streamer > gets the image out of the message and writes the message back unchanged` | Reads the message in 1-byte, 50-byte, and 16 KiB chunks. |
| Recreate message with large image one byte at a time | `node-rewriter and node-streamer > writes message.eml back unchanged when read one byte at a time` | |
| Decode a base64 format=flowed text node once | skipped | No decoding. |
| Extract image from message stream, and return immediatelly | `node-rewriter and node-streamer > gets the image out of the message and writes the message back unchanged` | |

## Benchmarks

mailsplit's `bench/` streams messages from a local mail archive through a `PassThrough` and through `Splitter` and `Joiner`. `MimeStream.bench.ts` splits and joins 1.5 MB of mail (three fixtures inside an embedded message, and a base64 image) with this package, mailsplit, and an empty `TransformStream` for reference, and compares `splitHeaders` with mailsplit's `ignoreEmbedded` mode.

## Known upstream issues

| Issue | Test |
| --- | --- |
| A part with headers and no body, followed by a non-final delimiter, is dropped from mailsplit's output, so a split and join loses bytes. | `mailsplit.oracle.test.ts > differs from mailsplit on purpose > keeps a part that has only headers when the next delimiter follows`; `round trip > writes random messages back byte for byte at any chunking` |
| A delimiter followed by spaces or tabs (RFC 2046 transport padding) is read as body text, so mailsplit and mail clients see different parts. | `differs from mailsplit on purpose > reads a delimiter followed by whitespace`; `DecoderStream > reads a delimiter followed by whitespace (RFC 2046 transport padding)` |
| #21: header values are Latin-1 strings, so UTF-8 addresses come out as mojibake. | `headers > decodes UTF-8 header values and keeps their bytes` |
| #15: a part with no `Content-Type` gets a type guessed from its file name. | `differs from mailsplit on purpose > does not guess a content type from the file name` |
| Whether an embedded message is split depends on its `Content-Disposition`. | `differs from mailsplit on purpose > reads an embedded message whatever its Content-Disposition` |
| #4: a message with millions of parts used unbounded memory. | `message-splitter > fails on more than maxParts parts` |
| #2: a large header block overflowed the call stack. | `message-splitter > reads a header block of 100,000 lines` |
| A body could end with the CR of the line break before a delimiter, depending on chunking (fixed in 5.4.18). | `message-splitter > never ends a body with the CR of the line break before a delimiter`; `round trip` tests compare every chunking with a single write |
| A close delimiter of a multipart kept matching after the multipart ended, so parts after it in the epilogue were read (fixed in 5.4.15). | `message-splitter > does not read parts after the close delimiter` and the three tests after it |
