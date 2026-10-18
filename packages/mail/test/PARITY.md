# Parity with nodemailer

`@portable/mail` replaces nodemailer's `MailComposer` (`src/mail-composer`) and `MimeNode` (`src/mime-node`), version 10.1.7. Each upstream test below maps to the test here that covers the same case, or gives the reason it doesn't apply. Many `MimeNode` tests exercise its tree-editing API or Node-specific options, which this package doesn't have: callers describe a message as one object and `Mail.encode` builds the tree.

Our test files:

| Short name | File |
| --- | --- |
| structure | `structure.conformance.ts` |
| headers | `headers.conformance.ts` |
| body | `body.conformance.ts` |
| addresses | `addresses.conformance.ts` |
| stream | `stream.conformance.ts` |
| oracle | `mail.oracle.test.ts`: 300 generated messages compared with `MailComposer` |
| postal-mime | `postal-mime.test.ts`: our output parsed by postal-mime |

Address parsing itself is `@portable/mime-headers`' `parseAddresses`, which ports nodemailer's addressparser tests. The cases below that only exercise the parser are listed here too, with the envelope test that checks the result.

## `test/mail-composer/mail-composer-test.ts`

| Upstream test | Ours |
| --- | --- |
| should create new MailComposer | Not applicable: there is no composer object, `Mail.encode` is a function. |
| should use Mixed structure with text and attachment | structure: text and one attachment make multipart/mixed |
| should use Mixed structure with multiple attachments | structure: several attachments make multipart/mixed |
| should create Alternative structure with text and html | structure: text and html make multipart/alternative, text first |
| should create Alternative structure with text, watchHtml and html | Not applicable: `watchHtml` is not supported. Apple Watch reads `text/watch-html` from `alternatives`, which structure: alternatives go after html covers. |
| should create Alternative structure with text, amp and html | structure: amp goes between text and html |
| should create Alternative structure with text, icalEvent and html | structure: a calendar invitation is an alternative and an attachment |
| should create Alternative structure using encoded icalEvent | structure: a calendar invitation is an alternative and an attachment. There is no `icalEvent` option; the README shows the alternative plus attachment recipe. |
| should create Alternative structure with text, html and cid attachment | structure: text, html and cid attachments nest multipart/related in multipart/alternative |
| should create Related structure with html and cid attachment | structure: html and cid attachments make multipart/related |
| should create content node with only text | structure: only text is a single part |
| should create content node with only an attachment | structure: only an attachment is a single part; oracle |
| should create content node with encoded buffer | Not applicable: there is no `encoding` option for string content. Callers pass the bytes. |
| should create content node from data url | body: a Blob from a data URL gives the content type. Callers fetch the data URL themselves. |
| should not treat invalid content-type as multipart | body: a content type that is not type/subtype throws; a multipart content type throws |
| should not let boundary material inject lines into the multipart structure | structure: the boundary … throws a RangeError because RFC 2046 does not allow it |
| should create the same output | structure: html and cid images with other attachments nest multipart/related in multipart/mixed (byte-exact); oracle |
| should use raw input for the message | Not applicable: `raw` is not supported. A caller that already has a message doesn't need this package. |
| should use raw input for different parts | Not applicable: `raw` parts are not supported. |
| should discard BCC | headers: Bcc is left out unless keepBcc is set |
| should autodetect text encoding | headers: non-ASCII text is encoded, Q for mostly Latin text and B otherwise (byte-exact) |
| should use quoted-printable text encoding | Not applicable: there is no `textEncoding` option. body: mostly Latin text is quoted-printable |
| should use base64 text encoding | Not applicable: there is no `textEncoding` option. body: mostly non-Latin text is base64 |
| should keep BCC | headers: Bcc is left out unless keepBcc is set |
| should set headers for attachment | body: headers, name and filename |
| should encode filename | body: filename table; a long non-ASCII filename is split into sections that each carry a star |
| should keep plaintext for attachment | body: a given transfer encoding is kept |
| should use default transfer encoding | body: application/octet-stream and base64 by default |
| should keep provided transfer encoding | body: a given transfer encoding is kept |
| should use 8bit transfer encoding for message/rfc822 | body: message/rfc822 is 8bit and keeps non-ASCII text |
| should handle message/rfc822 attachments with non-ASCII content | body: message/rfc822 is 8bit and keeps non-ASCII text |
| should ignore attachment filename | body: without a filename there are no name parameters |
| should add ical alternative | structure: alternatives go after html |
| should load icalEvent from file for both alternative and attachment parts | Not applicable: no file access. |
| should not let an own \_\_proto\_\_ key of icalEvent replace the content | Not applicable: no `icalEvent`, and content is read from `content` only. |
| should not let an own \_\_proto\_\_ key of icalEvent fetch an url | Not applicable: no URL fetching. |
| should load icalEvent from data uri for both alternative and attachment parts | Not applicable: no `icalEvent`; body: a Blob from a data URL gives the content type |
| should load icalEvent from an url for both alternative and attachment parts | Not applicable: no URL fetching; body: a response body can be an attachment |
| should not load icalEvent from file if disableFileAccess is set | Not applicable: no file access. |
| should use load attachment from file | Not applicable: no file access. |
| should not load attachment from file | Not applicable: no file access. |
| should load raw message from file | Not applicable: no `raw`, no file access. |
| should not load raw message from file if disableFileAccess is set | Not applicable: no `raw`, no file access. |
| should not load raw message from url if disableUrlAccess is set | Not applicable: no `raw`, no URL fetching. |
| should create an empty text node when there is no content | structure: a message without a body has an empty text part; an empty text or html string counts as no body |
| should force the transfer encoding of text nodes with the encoding option | Not applicable: no message-wide `encoding` option. A part's `transferEncoding` covers it: structure: a part given as an alternative can force its transfer encoding |
| should nest the related node in the mixed node when there is no text alternative | structure: html and cid images with other attachments nest multipart/related in multipart/mixed |
| should map an http path of an attachment to an href | Not applicable: no `path` or `href`. |
| should derive the attachment filename from a Windows path | Not applicable: no `path`. body: a File gives the filename and content type |
| should keep the request headers and tls settings of an href attachment | Not applicable: no URL fetching. |
| should keep the request headers and tls settings of an href alternative | Not applicable: no URL fetching. |
| should map an http path of an alternative to an href | Not applicable: no URL fetching. |
| should keep the filename of an alternative | Not applicable: alternatives have no filename. A part with a file name is an attachment. |
| should map an http path of the icalEvent to an href | Not applicable: no URL fetching. |
| should keep the tls settings of an href icalEvent | Not applicable: no URL fetching. |
| should fetch attachments and alternatives given as an url | Not applicable: no URL fetching; body: a response body can be an attachment |
| should return empty content for a data url over the size limit | Not applicable: no data URL parsing. |
| should handle malicious data URLs without ReDoS | Not applicable: no data URL parsing. |
| should handle various data URL formats correctly | Not applicable: no data URL parsing. |
| should reject excessively long data URLs gracefully | Not applicable: no data URL parsing. |
| should handle malformed data URLs without crashing | Not applicable: no data URL parsing. |
| should process data URLs in attachments safely | Not applicable: no data URL parsing. |
| should handle data URLs in alternatives safely | Not applicable: no data URL parsing. |
| should process PoC examples quickly | Not applicable: no data URL parsing. |

## `test/mime-node/mime-node-test.ts`

### Tree editing

`MimeNode` is a mutable tree. `Mail.encode` takes the whole message at once, so none of these apply.

| Upstream test | Ours |
| --- | --- |
| should create MimeNode object; #createChild: should create child, should accept the options as the only argument; #appendChild: should append child node, should take the node out of the tree it was in; #replace: should replace node, should leave the tree alone when a node replaces itself; #remove: should remove node, should return a node without a parent as it is | Not applicable: no tree API. |
| #setHeader: should set header, should set multiple headers with the same key, should set a single key value pair object, should collapse repeated headers into the set value | headers: custom headers come first and keep the given name and order (a list writes one field per value) |
| #addHeader: should add header, should set multiple headers with the same key, should add a single key value pair object | headers: custom headers come first and keep the given name and order |
| #getHeader: should return first matching header value | Not applicable: no header accessor. |
| #setContent: should set the contents for a node | Not applicable: content is given in the message object. |

### `#build`

| Upstream test | Ours |
| --- | --- |
| should build root node | headers: a single part message lists generated headers last |
| should resolve with the message when no callback is given | Not applicable: the result is a `ReadableStream`. |
| should reject when no callback is given and the content fails | stream: an error in a content stream errors the output and cancels the other streams |
| should format a Date object for the Date header | headers: a Date is written in RFC 5322 form; an invalid Date throws |
| should report an error for content that can not be streamed | body: content of another type throws a TypeError |
| should report an error for raw content that can not be streamed | Not applicable: no `raw`. |
| should not let an own \_\_proto\_\_ key of a header value emit the value raw | Not applicable: header values are strings or lists of strings; there are no `{ prepared, value }` objects. |
| should build child node | structure: text and one attachment make multipart/mixed |
| should build multipart node | structure: text and html make multipart/alternative, text first |
| should strip line breaks from custom boundary material | structure: the boundary … throws a RangeError. We refuse the value instead of cleaning it. |
| should drop control characters from boundary material | structure: the boundary … throws a RangeError |
| should fall back to a generated boundary when a boundary of … strips to nothing | Not applicable: an invalid boundary throws, nothing is stripped. |
| should strip control characters from an explicit boundary parameter | body: a multipart content type throws. Callers can't set a boundary parameter. |
| should declare a single boundary when a parameter ahead of it has no value | body: a multipart content type throws |
| should strip line breaks from an explicit boundary parameter | body: a multipart content type throws |
| should not emit a blank line before the boundary when base64 body length is an exact multiple of lineLength (regression #1810) | body: a body that fills its last line exactly has no empty line before the boundary |
| should not emit a blank line before the internal boundary when an earlier sibling base64 body is an exact multiple of lineLength | body: a body that fills its last line exactly has no empty line before the boundary |
| should build root with generated headers | headers: Date, Message-ID and MIME-Version are generated |
| should not include bcc missing in output, but in envelope | headers: Bcc is left out unless keepBcc is set; addresses: to lists To, Cc and Bcc once each, in order |
| should include bcc missing in output and in envelope | headers: Bcc is left out unless keepBcc is set |
| should use set envelope | Not applicable: no envelope override. A transport takes whatever envelope the caller gives it. |
| should have unicode subject | headers: a unicode subject is one Q word |
| should have unicode subject with strange characters | headers: a subject of mostly symbols is split into B words |
| should keep 7bit text as is | body: short ASCII lines are 7bit |
| should prefer base64 | body: mostly non-Latin text is base64 |
| should force quoted-printable | Not applicable: no `textEncoding`. structure: a part given as an alternative can force its transfer encoding |
| should prefer quoted-printable | body: mostly Latin text is quoted-printable |
| should not flow text | body: a line longer than 76 characters is quoted-printable with soft breaks |
| should not flow html | body: a line longer than 76 characters is quoted-printable with soft breaks |
| should use 7bit for html | body: html with short lines is 7bit |
| should emit the name parameter once when the content type already carries one | body: the name parameter in the content type is replaced by the filename |
| should keep the name parameter of the content type when there is no filename | body: a name parameter in the content type is kept without a filename |
| should fetch ascii filename | body: filename table (`jogeva.txt`) |
| should set unicode filename | body: filename table (`jõgeva.txt`) |
| should set dashed filename | body: filename table (`test-file.txt`) |
| should clean the content type before the multipart check reads it | body: a multipart content type throws |
| should not let a normalizeHeaderKey result inject a header | Not applicable: no `normalizeHeaderKey`. headers: a header name outside printable ASCII or with a colon throws |
| should not leave a control char anywhere in the headers | headers: a control character in a header value is encoded; body: filename table |
| should encode filename with a tab | body: filename table |
| should encode filename with a DEL | body: filename table |
| should star every continuation segment that holds percent escapes | body: a long non-ASCII filename is split into sections that each carry a star |
| should encode filename with a line break | body: filename table |
| should encode filename with a space | body: filename table |
| should escape a trailing backslash in filename | body: filename table |
| should escape a backslash inside filename | body: filename table |
| should encode a quote in filename as a mime word | body: filename table. See differences: `filename` is a quoted string with `\"`. |
| should not let an unpaired surrogate in filename inject a header parameter | body: an unpaired surrogate in a filename stays inside the parameter |
| should detect content type from filename | Not applicable: no extension lookup. The content type comes from `contentType` or a Blob's `type`. The README points to `@remix-run/mime`. |
| should convert address objects | addresses: strings, mailboxes and lists of both give the same header |
| should skip empty header | headers: empty values leave the header out |
| should not process prepared headers | Not applicable: no prepared headers. headers: a long custom header is folded at whitespace |
| should set default transfer encoding for application content | body: application/octet-stream and base64 by default |
| should not set transfer encoding for multipart content | structure: every multipart test (no Content-Transfer-Encoding on multipart parts) |
| should not set transfer encoding for message/ content | Different: message/\* gets `8bit`, as `MailComposer` sets it. body: message/rfc822 is 8bit and keeps non-ASCII text |
| should use from domain for message-id | headers: a generated Message-ID uses the From domain |
| should fallback to hostname for message-id | headers: Date, Message-ID and MIME-Version are generated (`@localhost`, since there is no hostname API) |

### `#getEnvelope`, `#messageId`, `#getAddresses`

| Upstream test | Ours |
| --- | --- |
| should not carry a comment inside an angle-addr into the envelope | addresses: the recipients of … are … |
| should get envelope | addresses: from is the first From address, else the first Sender address; to lists To, Cc and Bcc once each |
| should not let an own \_\_proto\_\_ key of an address inject an envelope recipient | addresses: an own \_\_proto\_\_ key cannot add a recipient |
| should not let an own \_\_proto\_\_ key of an envelope mutate the prototype chain | Not applicable: no envelope input. |
| should keep a custom envelope field that shares a name with an Object member | Not applicable: no envelope input. |
| should keep envelope domains as UTF-8 when local part is non-ASCII | addresses: a domain is kept as UTF-8 when the local part is not ASCII |
| should normalize a punycoded envelope back to UTF-8 when local part is non-ASCII | Different: an A-label domain is kept as given. See differences. |
| should keep a bare username of an explicit envelope | Not applicable: no envelope input. addresses: a bare name is not an address |
| should not turn a display name of an explicit envelope into an address | addresses: a bare name is not an address |
| should still normalize an explicit envelope that carries a quoted local part (security) | addresses: a quoted local part is kept; an unquoted special or second @ in the local part throws |
| #messageId: should create and return message-Id | headers: a generated Message-ID uses the From domain |
| #getAddresses: should get address object | Not applicable: no address accessor. `Mail.envelope` returns the SMTP addresses. |

### `#_parseAddresses`, `#_normalizeHeaderKey`, `#_handleContentType`, `#_generateBoundary`

| Upstream test | Ours |
| --- | --- |
| should normalize header key (`_parseAddresses`) | addresses: strings, mailboxes and lists of both give the same header |
| should normalize an address parsed out of a string | addresses: the domain is lowercased and the local part is kept |
| should normalize the addresses of a parsed group | addresses: a group is written with its members |
| should not modify the address object it was given | addresses: a mailbox is not changed by encode |
| should flatten arrays nested to any depth | Not applicable: `Addresses` is one level, a string or `Mailbox` or a list of them. |
| should not loop on an array that contains itself | Not applicable: no nested lists. |
| should normalize header key (`_normalizeHeaderKey`) | Not applicable: header names keep the caller's case. See differences. |
| should strip control chars from a header key | headers: a header name outside printable ASCII or with a colon throws |
| should strip the colon and whitespace from a header key | headers: a header name outside printable ASCII or with a colon throws |
| should not let a header key smuggle a second From or a visible Bcc into the message | headers: a header name … throws; headers the package writes itself are refused in headers |
| should do nothing on non multipart | Not applicable: internal. |
| should use provided boundary | structure: every test passes `boundary` |
| should generate boundary | structure: the default boundary is random and holds "=\_" |
| should genereate boundary string | structure: the default boundary is random and holds "=\_" |

### `#_encodeHeaderValue`, `#_convertAddresses`

| Upstream test | Ours |
| --- | --- |
| should do noting if possible | headers: custom headers come first and keep the given name and order |
| should encode non ascii characters | headers: non-ASCII text is encoded |
| should encode a control char | headers: a control character in a header value is encoded |
| should keep a tab in a header value | headers: a control character in a header value is encoded (`X-Tab`) |
| should format references in linear time | headers: References of 100,000 ids finish within the test timeout |
| should keep an unclosed angle bracket as it is | headers: References of 100,000 ids … (ends in 100,000 `<`) |
| should format a references list longer than the argument limit | headers: References of 100,000 ids … |
| should format references | headers: References are split at whitespace and each id gets angle brackets |
| should strip control chars from references | headers: References are split at whitespace and each id gets angle brackets |
| should keep tab separated references apart | headers: References are split at whitespace and each id gets angle brackets |
| should format message-id | headers: Message-ID and In-Reply-To get angle brackets |
| should strip control chars from message-id | headers: Message-ID and In-Reply-To get angle brackets |
| should format addresses | addresses: strings, mailboxes and lists of both give the same header |
| should keep domain as UTF-8 when local part is non-ASCII (`_encodeHeaderValue`) | addresses: a domain is kept as UTF-8 when the local part is not ASCII |
| should convert address object to a string | addresses: strings, mailboxes and lists of both give the same header |
| should keep ascii name as is | addresses: strings, mailboxes and lists of both give the same header |
| should encode single quote | Different: an apostrophe is an atext character and stays unquoted. Covered by mime-headers. |
| should include name in quotes for special symbols | addresses: a name with specials is quoted |
| should escape quotes | addresses: a name with specials is quoted; mime-headers `formatAddresses` tests |
| should mime encode unicode names | addresses: each name gets its own Q or B encoding |
| should keep domain as UTF-8 when local part is non-ASCII (`_convertAddresses`) | addresses: a domain is kept as UTF-8 when the local part is not ASCII |
| should keep a plain address outside of angle brackets | addresses: strings, mailboxes and lists of both give the same header |
| should wrap an address carrying a special into angle brackets | addresses: a quoted local part is kept (a quoted local part is unambiguous without brackets) |
| should emit as many recipients as the envelope carries (security) | addresses: the header lists exactly the recipients of the envelope; the address … throws because it is not one addr-spec |
| should dedupe against a prefilled unique list | addresses: to lists To, Cc and Bcc once each, in order |

### `#_normalizeAddress`

| Upstream test | Ours |
| --- | --- |
| should split a domain literal off at the "@" in front of it | addresses: a domain literal is split off at the @ in front of it; the address `"a"@evil.com"@good.com` throws |
| should punycode the domain when local part is ASCII | addresses: a domain is punycoded when the local part is ASCII |
| should keep ASCII domain unchanged | addresses: strings, mailboxes and lists of both give the same header |
| should not leave DEL in an address | addresses: the address … throws because it is not one addr-spec (control characters) |
| should keep domain as UTF-8 when local part is non-ASCII | addresses: a domain is kept as UTF-8 when the local part is not ASCII |
| should decode an already punycoded domain when local part is non-ASCII | Different: the A-label is kept. See differences. |
| should lowercase the domain regardless of branch | addresses: a domain is punycoded when the local part is ASCII; a domain is kept as UTF-8 when the local part is not ASCII |
| should fall back to the supplied domain when punycode throws | addresses: a domain the URL parser rejects is kept as written |
| should keep the supplied domain when only domainToUnicode accepts it | Not applicable: no A-label decoding. |
| should keep the supplied domain when its A-label form does not decode | Not applicable: no A-label decoding. |
| should re-quote a quoted local-part that lost its quotes in parsing (security) | addresses: an unquoted special or second @ in the local part throws |
| should leave an intact quoted local-part untouched | addresses: a quoted local part is kept |
| should escape quotes and backslashes when quoting a local-part | Different: an unquoted local part that needs quoting throws. Quoting is mime-headers' `formatAddresses`. |
| should keep a bare dot-atom local-part unquoted | addresses: strings, mailboxes and lists of both give the same header |
| should quote local-part specials without touching SMTPUTF8 bytes | addresses: a domain is kept as UTF-8 when the local part is not ASCII |
| should re-quote a local-part that only starts and ends with a quote (security) | addresses: the address … throws because it is not one addr-spec |
| should re-quote a local-part whose closing quote is a quoted-pair (security) | addresses: the address … throws because it is not one addr-spec |
| should quote a local-part with dots outside dot-atom positions | Different: throws. mime-headers `formatAddresses` tests |
| should quote an empty local-part | Different: throws. |
| should keep an empty address empty | addresses: the address "" throws |
| should quote a bare username that carries a special | addresses: a bare name is not an address |
| should be idempotent | addresses: the header lists exactly the recipients of the envelope |
| #\_generateMessageId: should generate uuid-looking message-id | headers: Date, Message-ID and MIME-Version are generated |
| should use default header keys | Not applicable: header names keep the caller's case. |
| should use custom header keys | Not applicable: no `normalizeHeaderKey`. |

### Attachment streaming

| Upstream test | Ours |
| --- | --- |
| should pipe URL as an attachment; should reject URL attachment; should reject an URL for a child of a closed root; should reject non-http(s) URL attachment; should not take the process down on an unparseable URL attachment; should pipe URL as an attachment for …; should return an error on invalid url | Not applicable: no URL fetching. Callers pass `(await fetch(url)).body`: body: a response body can be an attachment |
| should pipe file as an attachment; should reject file as an attachment; should reject a file for a child of a closed root; should reject a file for a grandchild attached before its parent was; should not read a file for a child re-parented into a second tree; should resolve a file for a child of an open root; should return an error on invalid file path | Not applicable: no file access. |
| should return a error for an errored stream | stream: an error in a content stream errors the output and cancels the other streams |
| should return a stream error | stream: an error in a content stream errors the output and cancels the other streams |
| #transform: should pipe through provided stream, should accept a function that creates the transform, should pass a content error through the transforms | Not applicable: no transforms. Callers use `pipeThrough` on the result. |
| Line breaks: should convert line breaks to LF when newline is linux, should convert line breaks to CRLF when newline is win, should pass a content error through the newline transform | Not applicable: no `newline` option, output always uses CRLF. body: line breaks in text become CRLF |
| #processFunc: should pipe through provided process function | Not applicable: no process function. |
| Raw content: should return pregenerated content, …for a child node, …from a stream, should catch error from a raw stream 1, should catch error from a raw stream 2 | Not applicable: no `raw`. |

### Recipient lists, comments and UTS #46

| Upstream test | Ours |
| --- | --- |
| should build an envelope for a large unique recipient list in linear time | addresses: 100,000 recipients finish within the test timeout |
| should accept a recipient array past the argument limit | addresses: 100,000 recipients finish within the test timeout |
| should stay linear when recipients are spread over many headers | addresses: 100,000 recipients finish within the test timeout |
| should dedupe recipients across To, Cc and Bcc | addresses: to lists To, Cc and Bcc once each, in order |
| should dedupe a group against the addresses around it | addresses: a group is replaced by its members and deduped against the addresses around it |
| should keep the rendered header list intact while deduping the envelope | addresses: the header keeps every entry while the envelope is deduped |
| should deliver to the domain before a comment, not the text after it | addresses: the domain before a comment is used, not the text after it |
| should keep a comment beside the @ inside the same address | addresses: the domain before a comment is used, not the text after it |
| should not let a quoted local part carry the text after a comment into the envelope | addresses: the recipients of … are … |
| should deliver to the domain of the angle-addr when a quoted local part holds a ">" | addresses: the recipients of … are …. The `>` stays inside the quoted local part, where `RCPT TO` allows it; nodemailer replaces it with a space. |
| should not take a recipient out of a quoted string or a comment inside a group | addresses: the recipients of … are … |
| should not deliver a domain literal holding an "@" to the domain inside it | addresses: the recipients of … are … |
| should read whitespace and comments beside the "@" as nothing | addresses: the recipients of … are … |
| should deliver to the mailbox after an obsolete route | addresses: the recipients of … are … |
| should not take a recipient out of a comment that stands alone | addresses: a comment that stands alone in … is not taken as a recipient |
| should deliver to the first of several addr-specs in the display text | addresses: the recipients of … are … |
| should not take a recipient out of a nested comment | addresses: the recipients of … are … |
| should fold away an ignored code point like a validator does | addresses: the domain is mapped with UTS #46 as browsers do |
| should map full width characters to their canonical form | addresses: the domain is mapped with UTS #46 as browsers do |
| should agree with url.domainToASCII on every encodable domain | addresses: the domain is mapped with UTS #46 as browsers do. We call the URL host parser, which is `domainToASCII` in Node. |
| should map the domain for an SMTPUTF8 address too | Different: a domain beside a non-ASCII local part is only lowercased. See differences. |
| should leave address literals and non hostnames alone | addresses: a domain literal is split off at the @ in front of it; a domain the URL parser rejects is kept as written |
| should not let a URL delimiter truncate the domain | addresses: the URL delimiter in … does not truncate the domain; a backslash in the domain throws |
| should keep a truncating domain out of the envelope | addresses: the URL delimiter in … does not truncate the domain |
| should carry the mapped domain into the envelope | addresses: the domain is mapped with UTS #46 as browsers do |
| should keep a domain over the DNS length limits as supplied without encoding it | Not applicable: the URL host parser applies the limits, and a domain it rejects is kept as written. |
| should apply the DNS length limits per label and to the whole domain | Not applicable: as above, the URL host parser applies them. |

## `test/mime-node/stream-lifecycle-test.ts`

| Upstream test | Ours |
| --- | --- |
| reports a failing … with DKIM; reports a failing … without DKIM; reports a failing user transform with DKIM | Not applicable: no DKIM or transforms. `@portable/dkim` signs a finished message. stream: an error in a content stream errors the output |
| reports an error from every stage once on the returned stream | stream: an error in a content stream errors the output and cancels the other streams |
| does not throw when a content stream emits error twice | Not applicable: a `ReadableStream` errors once. |
| fails a content stream that is destroyed without an error instead of waiting forever | Not applicable: a `ReadableStream` that is cancelled elsewhere is locked, and stream: a locked stream or one given twice throws |
| fails an icalEvent stream that is destroyed without an error | Not applicable: no `icalEvent`. |
| refuses a stream that was already read to the end as … | stream: a locked stream or one given twice throws |
| refuses a stream that was destroyed with an error before it was read | stream: an error in a content stream errors the output |
| fails a json transport content stream that is destroyed without an error | Not applicable: no transports. |
| still streams zero length content | stream: a zero-length stream gives an empty body |
| closes a file attachment when the message stream is destroyed | stream: cancelling the output cancels every content stream |
| does not start the attachments that follow once the message stream is destroyed | stream: cancelling the output cancels every content stream (`unread.state.pulls`) |
| aborts the request of a URL attachment when the message stream is destroyed | stream: cancelling the output cancels every content stream. Cancelling a `fetch` body aborts the request. |
| removes the DKIM cache file when the signed message stream is destroyed | Not applicable: no DKIM. |
| removes the DKIM cache file when the content fails after the cache was started | Not applicable: no DKIM. |
| destroys the content streams when the message is refused before it is streamed | stream: cancelling before the first read cancels every content stream |
| destroys the streams that were not read yet when an earlier one fails | stream: an error in a content stream errors the output and cancels the other streams |
| leaves the streams of a sent message alone | stream: a 1 MB attachment read slowly in odd chunks encodes to the same base64 (a stream read to the end is not cancelled) |
| writes every encoded byte of a part before the next part starts | stream: a 1 MB attachment read slowly …; stream: the message is written while an attachment is still being read |
| sends a whole stream attachment to a slow reader | stream: a 1 MB attachment read slowly in odd chunks encodes to the same base64 |
| keeps the bytes of a binary part when line endings are converted | body: binary quoted-printable keeps every byte; stream: a 1 MB attachment as quoted-printable decodes to the same bytes |

## `test/mime-node/mime-node-tls-test.ts`

| Upstream test | Ours |
| --- | --- |
| rejects a self-signed attachment host by default | Not applicable: no URL fetching. |
| allows a self-signed attachment host when the attachment opts out | Not applicable: no URL fetching. |

## Known upstream issues

Each of these is a nodemailer behavior we handle differently, with the test that checks ours.

| Upstream behavior | Ours | Test |
| --- | --- | --- |
| libqp's `wrap` breaks the last quoted-printable line at a space even when the line already fits, which adds a soft line break. | Lines are broken only past 76 characters. The decoded text is the same. | body: a line longer than 76 characters is quoted-printable with soft breaks |
| A text body given as a `Buffer` is never `7bit`; only strings are scanned. | A `Uint8Array` text body is scanned like a string. | body: bytes are read as UTF-8 text |
| Without the `newline` option, a bare LF or CR in a `7bit` or `8bit` body is written as is. A bare LF after a line ending is how SMTP smuggling starts. | Line breaks in `7bit`, `8bit` and text quoted-printable bodies become CRLF, including a CR and LF split across stream chunks. | body: line breaks in text become CRLF; a CR and LF split across stream chunks make one line break; an 8bit message with LF line endings is written with CRLF |
| An address that isn't valid, such as `a,b@good.com`, `a@evil.com@good.com` or a bare `root`, is quoted or kept so that something is sent. | It throws `Mail.InvalidInputError`, so the caller sees the mistake. | addresses: an unquoted special or second @ in the local part throws; a bare name is not an address |
| A recipient made only of a comment, such as `(a@evil.com)`, is dropped silently. | It throws. | addresses: a comment that stands alone in … is not taken as a recipient |
| 10.1.7 encodes a `"` in a subject as an encoded word, which makes the subject unreadable in clients that don't decode it. | Quotes stay as they are. They are allowed in unstructured text. | headers: quotes in a subject stay readable |
| Text that only looks like an encoded word (`=?x?q?y?=`) is written raw, and a client decodes it. | It is encoded, so the reader sees the text that was given. | headers: a subject that reads as an encoded word is encoded |
| `message/rfc822` attachments default to `Content-Disposition: inline`, so some clients render the forwarded message in the body. | They default to `attachment`, like every other attachment without a cid. | body: message/rfc822 is 8bit and keeps non-ASCII text |
| `path` and `href` read files and fetch URLs, which needs `disableFileAccess` and `disableUrlAccess` to be safe with untrusted input. | Content is a value or a stream the caller opened. | Not tested: the options don't exist. |

## Differences

These are deliberate and documented in the README. The oracle test's generator avoids them.

- Header names keep the caller's case. nodemailer capitalizes each word (`X-Processed`), which is the same for the names most callers write.
- An address name over about 40 bytes is encoded in words of up to 75 characters, as `@portable/mime-headers` writes them; nodemailer uses 52.
- A file name holding `"` is written as a quoted string with `\"` in `filename` instead of RFC 2231 encoding.
- An A-label domain beside a non-ASCII local part (`jõser@xn--jgeva-dua.ee`) is kept as given. nodemailer decodes it to UTF-8, which needs a Punycode decoder; WinterTC has none.
- A domain beside a non-ASCII local part is lowercased but not mapped with UTS #46, since the URL host parser always returns an A-label.
- A backslash in a domain throws: the URL parser reads it as a path separator and the address can't be checked.
