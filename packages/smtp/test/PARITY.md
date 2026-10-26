# Test parity

This package replaces the SMTP client of [nodemailer](https://github.com/nodemailer/nodemailer) (MIT-0): `lib/smtp-connection` and `lib/smtp-transport`. Its tests at v10.1.7 (`test/smtp-connection/*` and `test/smtp-transport/*`) were read as the list of cases. The oracle and benchmark compare with nodemailer 10.2.1.

Test files:

- `DataStream.conformance.ts`, `connect.conformance.ts`, `tls.conformance.ts`, `auth.conformance.ts`, and `send.conformance.ts` run in Node and Chromium against a scripted fake socket (`utils.ts`). The fake replies the way upstream's `raw-smtp-server.ts` does, and each test can override a command's reply.
- `smtp-server.test.ts` runs against [smtp-server](https://github.com/nodemailer/smtp-server) 3.19.23 over real TCP and TLS, through the Node adapter from `@portable/sockets/node`. It covers what upstream's `smtp-connection-test.ts` checks against the same server.
- `send.oracle.test.ts` sends the same 12 messages through nodemailer and this package, each whole and in two random chunkings. It compares the DATA bytes on the wire, the bytes smtp-server delivers, the envelope, and the accepted and refused recipients.
- `send.bench.ts` compares sends over one connection with nodemailer's `SMTPConnection`.

Test names below are `file > describe > test`, with the file's suffix left out.

## smtp-connection/data-stream-test.ts

`DataStream` is internal and is tested by path. The cases are the same, under the same names.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Termination: all 4 | `DataStream > termination > *` | An empty message ends with `.\r\n`. Upstream writes `\r\n.\r\n`, which delivers a message of one empty line. |
| Line breaks: all 7 | `DataStream > line breaks > *` | |
| Dot stuffing: all 9 | `DataStream > dot-stuffing > *` | Also `does not let a bare LF smuggle an end of data marker`. |
| ignores empty chunks, passes 8-bit content through unchanged | `DataStream > input handling > *` | |
| accepts string chunks when decodeStrings is disabled | Not applicable | Stream input is `Uint8Array` only. A whole message can be a string. |
| tracks the input and output byte counts, counts unmodified chunks as well | Not applicable | There are no counters. `DataStream > input handling > gives the same bytes however the input is chunked` checks the output instead. |

## smtp-connection/smtp-connection-test.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Response parser: skips a stray empty line before the greeting, after the final EHLO response | `connect > EHLO and HELO > skips a stray empty line before the greeting and after the EHLO reply` | |
| joins continuation lines split across chunks, keeps consecutive replies in one chunk apart | `connect > EHLO and HELO > assembles a multi-line EHLO reply that arrives in several chunks`, `assembles a reply sent one byte at a time`; `send > pipelining > sends the whole envelope ...` | The pipelined replies of MAIL, RCPT, and DATA arrive in one chunk. |
| reassembles a very long reply in linear time | `connect > reading replies > reads a long multi-line reply in linear time` | |
| fails when a reply never completes, applies the cap however the reply is split | `connect > reading replies > fails when a reply exceeds 1 MiB, however it is split` | |
| fails when a single line never ends, absorbs a line that never ends in linear time | `connect > reading replies > fails on a line that never ends, in linear time` | |
| does not accumulate separate replies towards the cap | `connect > reading replies > does not count separate replies toward the limit` | |
| close() during DNS resolution | `connect > connecting > does not open a socket when the signal is already aborted` | There is no DNS step. The `connect` function opens the socket. |
| sets the public destroyed flag | Not applicable | There is no `destroyed` flag. A send after a close rejects with ECONNECTION (`send > signals and closing > reports a send after the server closed an idle connection`). |
| errors the reset() callback on a destroyed connection | Not applicable | No `reset()`. After a failed transaction, the client sends RSET itself. |
| no duplicate error listener after `_onConnect` | Not applicable | Internal to nodemailer's event handling. |
| does not drop an incomplete multiline response at the queue front | `connect > reading replies > *` | Replies are read one at a time, in order. |
| Version test | Not applicable | |
| Security: sanitize CRLF, bare CR and LF in name; clean name unchanged; injected commands via name | `connect > connecting > rejects a name with CR or LF before connecting` | The name is rejected with a `RangeError` instead of cleaned up (GHSA-vvjj-xcjg-gr5g). |
| decodes UTF-8 in error and success replies | `send > sending > decodes a UTF-8 reply`, `auth > AUTH replies > reports a refused PLAIN login ...` | |
| falls back when reply bytes are not valid UTF-8 | `send > sending > keeps the bytes of a reply that is not UTF-8` | Each byte is read as Latin-1. |
| multi-line UTF-8 EHLO reply | `connect > EHLO and HELO > reads a UTF-8 EHLO reply and still finds the extensions` | |
| UTF-8 sequences split across chunks | `send > sending > decodes a UTF-8 character split across chunks` | |
| leaves pure ASCII replies unchanged | `send > sending > sends a message and reports the delivery` | |
| decodes UTF-8 in `_remainder` when the connection closes mid-line | `connect > connecting > reports an unterminated 421 line ...`, `send > DATA > reports an unterminated "${fragment}" when the server closes` | |
| should connect to unsecure server | `connect > connecting > connects without TLS and introduces itself with EHLO`, `smtp-server > plaintext > *` | |
| should connect and upgrade with STARTTLS, with forced STARTTLS | `tls > STARTTLS > upgrades the connection and sends EHLO again`, `smtp-server > TLS and authentication > upgrades with STARTTLS and logs in with PLAIN` | STARTTLS is always required unless `secure: 'off'`. |
| should connect and be rejected | `connect > connecting > rejects a greeting other than 220` | |
| should try upgrade with STARTTLS where not advertised | `tls > STARTTLS > fails when the server does not offer STARTTLS`, `smtp-server > TLS and authentication > fails when STARTTLS is required ...` | |
| should close connection after STARTTLS | `tls > STARTTLS > reports a failed TLS handshake` | |
| should connect to a secure server | `tls > STARTTLS > opens a TLS socket and skips STARTTLS when secure is on`, `smtp-server > TLS and authentication > logs in over implicit TLS` | |
| should emit error for invalid port, too large port | Not applicable | The `connect` function validates the address. |
| should emit inactivity timeout error | `connect > connecting > rejects with the signal reason when the greeting never arrives`, `send > signals and closing > rejects with the signal reason when the server stalls ...` | Timeouts are signals. |
| should connect through proxy, through proxy to secure server | Not applicable | No proxy support. Pass a `connect` function that opens the tunnel. |
| should send to unsecure server | `smtp-server > plaintext > sends a string, bytes and a stream ...` | |
| Connection fallback: next address, all addresses fail | Not applicable | Address selection belongs to the `connect` function. |
| should login | `smtp-server > TLS and authentication > upgrades with STARTTLS and logs in with PLAIN` | |
| should return error for invalid login | `smtp-server > TLS and authentication > reports a wrong password with code 535` | |
| missing credentials, incomplete credentials | Not applicable | TypeScript requires `user` with `pass` or `accessToken`. |
| xoauth2: login with string, with object | `auth > AUTH XOAUTH2 > sends the user and bearer token in one command`, `smtp-server > TLS and authentication > logs in with XOAUTH2` | `accessToken` is only a string. Fetch the token yourself. |
| xoauth2: invalid token, object fails, invalid response | `auth > AUTH XOAUTH2 > answers the error challenge with an empty line and reports the failure` | |
| custom login: login, login without pass | Not applicable | No custom auth handlers. |
| Send without PIPELINING: only valid recipients | `send > pipelining > reports accepted and refused recipients without PIPELINING`, `smtp-server > plaintext > sends to the accepted recipients only, with and without PIPELINING` | |
| should send message, multiple messages | `send > sending > sends a message ...`, `sends several messages over one connection` | |
| should send only to valid recipients, reject all recipients | `send > pipelining > reports accepted and refused recipients ...`, `fails when every recipient is refused ...`; `send.oracle > reports the same recipients as nodemailer > *` | |
| reject too large SIZE arguments, too large message, declare SIZE | `send > extensions > declares the encoded size ...`, `fails before MAIL FROM when the message exceeds the server limit`, `smtp-server > plaintext > declares SIZE and fails early ...` | |
| lmtp should send only to valid recipients | `send > LMTP > *`, `smtp-server > LMTP > reports the per-recipient results of the message` | |
| should send using SMTPUTF8 | `send > extensions > declares SMTPUTF8 ...`, `smtp-server > plaintext > sends SMTPUTF8 ...` | |
| should send using 8BITMIME, error for 8-bit content without 8BITMIME | `send > extensions > declares BODY=8BITMIME when the server offers it`, `smtp-server > plaintext > declares 8BITMIME, so 8-bit content is accepted` | BODY=8BITMIME is always declared when offered, so the upstream failure does not happen. |
| invalidly formatted recipients | `send > envelope validation > rejects addresses with control characters or angle brackets ...` | |
| sanitize CRLF in envelope size | `send > envelope validation > rejects a size that is not a non-negative integer` | GHSA-c7w3-x93f-qmm8. |
| no valid recipients | `send > envelope validation > rejects an envelope without recipients` | |
| invalid sender | `send > DATA > reports a refused sender with the server text and enhanced code` | |
| should send message string, buffer, stream | `send > sending > sends a string, bytes, and a stream as the same bytes` | |

## smtp-connection/smtp-connection-errors-test.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| secure connection by default on port 465 | `connect > connecting > uses implicit TLS on port 465 and STARTTLS on other ports by default` | |
| derives the EHLO name from the machine hostname | `connect > connecting > uses an address literal as the EHLO name by default` | There is no hostname API, so the default `name` is `[127.0.0.1]`. |
| connect() on a destroyed connection, login() and send() report ECONNECTION | `send > signals and closing > reports a send after the server closed an idle connection` | `connect` returns a new client each time. |
| send() rejects an empty message | `DataStream > termination > terminates an empty message with only the dot line` | An empty message is sent. |
| refuses commands once half-closed, closes instead of writing when destroyed, ignores late events after close() | `send > signals and closing > *` | |
| non-220 greeting | `connect > connecting > rejects a greeting other than 220` | |
| unterminated 4xx line before the greeting | `connect > connecting > reports an unterminated 421 line ...` | |
| clears timers when dropped before the greeting | `connect > connecting > reports a server that drops the connection before the greeting` | There are no timers. |
| times out when the greeting never arrives | `connect > connecting > rejects with the signal reason when the greeting never arrives` | |
| 421 EHLO reply | `connect > EHLO and HELO > treats a 421 reply to EHLO as the server closing, without trying HELO` | |
| falls back to HELO, both EHLO and HELO rejected, no HELO with requireTLS | `connect > EHLO and HELO > *` | |
| multi-line EHLO reply in several chunks | `connect > EHLO and HELO > assembles a multi-line EHLO reply ...` | |
| LHLO rejection | `connect > EHLO and HELO > sends LHLO in LMTP mode and reports a refusal` | |
| continues unencrypted after a rejected STARTTLS with opportunisticTLS, requireTLS takes precedence | `tls > STARTTLS > fails when the server refuses STARTTLS, and never continues in plaintext` | No opportunistic mode. |
| ETLS when the upgrade cannot be started, on a provided connection, on a provided socket | `tls > STARTTLS > reports a connect function whose socket cannot start TLS`, `reports a failed TLS handshake` | |
| restarts LMTP with LHLO after STARTTLS | `tls > STARTTLS > sends LHLO again after STARTTLS in LMTP mode`, `smtp-server > LMTP > restarts the session with LHLO after STARTTLS` | |
| provided socket cannot connect | `connect > connecting > reports a socket that fails to open`, `reports a connect function that throws` | |
| ETIMEDOUT, EDNS, ERR_ACCESS_DENIED (2), ESOCKET for localAddress | Not applicable | Belongs to the `connect` function. Its error is kept as `cause`. |
| close() before a provided connection is picked up | `connect > connecting > does not open a socket when the signal is already aborted` | |
| envelope without recipients | `send > envelope validation > rejects an envelope without recipients` | |
| sender with CRLF or angle brackets | `send > envelope validation > rejects addresses with control characters or angle brackets ...` | |
| invalid DSN parameters | Not applicable | TypeScript checks `Dsn`. |
| sends DSN parameters, normalizes aliases, omits DSN when not advertised | `send > extensions > sends DSN parameters ...`, `omits DSN parameters ...`, `smtp-server > plaintext > sends DSN parameters` | No aliases: `ret` and `notify` take the RFC 3461 values. |
| temporary code when one recipient was deferred | `send > pipelining > reports the temporary code when one of the refused recipients was only deferred` | |
| internationalized sender, recipient rejected | `send > extensions > reports an internationalized recipient the server refused`, `fails before sending when an internationalized address meets a server without SMTPUTF8` | |
| rejected DATA | `send > DATA > reports a refused DATA command and sends no message` | |
| failed RSET | `send > pipelining > fails when every recipient is refused ..., and recovers` | |
| detaches the message stream when close() runs during DATA | `send > signals and closing > close() waits for queued sends` | `close()` waits for the send instead. |
| send callback once when the stream errors later | `send > DATA > closes the connection when the message stream fails, and reports it` | |

## smtp-connection/smtp-connection-auth-test.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| detects DSN and SASL methods, every method in either spelling, prefix names | `auth > method selection > reads every advertised method ...`, `does not take a method name that only starts with PLAIN or LOGIN` | |
| AUTH line padded with whitespace in linear time | `auth > method selection > reads an AUTH line padded with whitespace in linear time` | GHSA-4ffr-jq9g-5ffx. |
| AUTH PLAIN without authorization identity when nothing is advertised | `auth > method selection > sends AUTH PLAIN without an authorization identity`, `tries AUTH PLAIN when the server advertises no AUTH` | |
| first advertised method when XOAUTH2 is requested without a token | `auth > method selection > uses the method the caller names` | XOAUTH2 is chosen by passing `accessToken`. |
| unknown method | Not applicable | `method` is typed. |
| LOGIN: only LOGIN offered, separate base64 lines, no username challenge, no password challenge | `auth > AUTH LOGIN > *`, `smtp-server > TLS and authentication > logs in with LOGIN ...` | |
| CRAM-MD5 (4 tests) | `auth > method selection > fails without sending a password when the server offers only XOAUTH2 or CRAM-MD5` | No CRAM-MD5: WebCrypto has no MD5. |
| custom handlers (5 tests) | Not applicable | No custom handlers. |
| XOAUTH2-only server without a token (2 tests) | `auth > method selection > fails without sending a password when the server offers only XOAUTH2 or CRAM-MD5` | |
| custom XOAUTH2 handler, sendCommand promise | Not applicable | |

## Other smtp-connection files

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| connection-lifecycle: keeps extensions but not AUTH when opportunisticTLS falls back | Not applicable | No opportunistic mode. |
| connection-lifecycle: TLS handshake the server never completes | `tls > STARTTLS > reports a failed TLS handshake`, signals | |
| connection-lifecycle: plaintext after the STARTTLS response | `tls > STARTTLS > discards plaintext sent after the STARTTLS reply ...` | The plaintext is discarded without a log message, because there is no logger. |
| connection-lifecycle: destroys the socket when the server never closes | `send > signals and closing > close() sends QUIT and closes the socket`, `close() stops waiting for the QUIT reply when its signal aborts` | |
| connection-lifecycle: logs the error message as is | Not applicable | No logger. |
| connection-lifecycle: DNS lookup in the timeout, system error code, greeting timeout, keepalive and Nagle, IPv6 fallback, connectionTimeout (7 tests) | Not applicable | Belongs to the `connect` function. The Node adapter in `@portable/sockets/node` turns Nagle off. The `signal` option limits every wait. |
| connection-lifecycle: ends without an error when the server closes an idle connection | `send > signals and closing > reports a send after the server closed an idle connection` | |
| connection-lifecycle: 421 to RCPT TO with and without PIPELINING | `send > pipelining > ends the session on a 421 reply to RCPT TO ${mode} PIPELINING` | |
| connection-lifecycle: keeps the error code of the command a 421 answered | `auth > AUTH replies > treats a 421 reply to AUTH as the server closing` | Deliberate difference: every 421 is ECONNECTION. |
| connection-lifecycle: refuses a second connect() | Not applicable | `connect` returns a new client. |
| connection-lifecycle: STARTTLS and greeting against connectionTimeout | `connect > connecting > rejects with the signal reason ...` | One signal limits the whole connect. |
| message-release: destroys the stream when every recipient is refused | `send > DATA > cancels the message stream when every recipient is refused` | |
| message-release: destroys the stream when the connection closes during DATA | `send > DATA > reports a server that drops the connection while the message is in flight` | |
| message-release: closes an attachment file | Not applicable | No files. |
| pipelining: whole envelope before any reply | `send > pipelining > sends the whole envelope and DATA in one write ...` | DATA is in the same write. |
| pipelining: rejected recipients, rejected sender, closing server | `send > pipelining > *` | |
| pipelining: ends data mode of a server that took DATA without a recipient | `send > pipelining > ends the data of a server that took DATA without a recipient` | |
| pipelining: drops the connection after a refused sender | `send > pipelining > drops the connection instead of sending data after a refused sender` | |
| requiretls: detection, parameter sent, not sent | `send > extensions > sends REQUIRETLS over TLS ...`, `smtp-server > TLS and authentication > sends REQUIRETLS over TLS` | Sent only when the mail sets `requireTls`. |
| requiretls: error when unsupported, no queued response action | `send > extensions > fails before MAIL FROM when REQUIRETLS cannot be honored`, `smtp-server > TLS and authentication > fails before MAIL FROM ...` | Also fails without TLS. |
| requiretls: with DSN parameters | `send > extensions > sends REQUIRETLS over TLS when the server offers it` | |
| secure-socket: upgrades a provided socket | `tls > STARTTLS > opens a TLS socket ...` | |
| starttls-buffer: discards pre-TLS bytes | `tls > STARTTLS > discards plaintext ...`, `discards a whole injected reply ...` | |
| tls-servername: server name per connection | Not applicable | GHSA-6vj9-mwq6-2f5v. No DNS cache. |
| http-proxy-client (18 tests) | Not applicable | No proxy support. |

## smtp-transport

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| oauth2-listener-leak, oauth2-provision (3 tests) | Not applicable | No token fetching. |
| Anonymous: version, wellknown data | Not applicable | No well-known service list. |
| Anonymous: fail envelope | `send > envelope validation > *` | |
| Anonymous: not fail auth, fail auth with forceAuth | `auth > method selection > tries AUTH PLAIN when the server advertises no AUTH`, `fails when the server refuses AUTH it did not advertise` | With credentials set, the client always sends AUTH, as with `forceAuth`. |
| Anonymous: send mail | `send > signals and closing > Smtp.send connects, sends, and quits` | |
| Anonymous: recover unexpected close during transmission | `smtp-server > plaintext > reports a server that closes the connection during DATA` | |
| verify (6 tests) | `connect > connecting > *`, `smtp-server > TLS and authentication > reports a wrong password with code 535` | Calling `connect` and then `close` takes the place of `verify`. |
| Authenticated: login and send, through a proxied socket | `smtp-server > TLS and authentication > *` | A proxy goes in the `connect` function. |
| behavior: getSocket error (2 tests) | `connect > connecting > reports a connect function that throws` | |
| behavior: ECONNECTION before the greeting (2 tests) | `connect > connecting > reports a server that drops the connection before the greeting` | |
| behavior: callback error thrown by the caller, logging (3 tests) | Not applicable | The API uses promises and has no logger. |
| behavior: DSN, REQUIRETLS | `send > extensions > *` | |
| behavior: envelope from the message addresses | Not applicable | @portable/mail builds the envelope. |
| behavior: accepted and rejected of a partial envelope | `send.oracle > reports the same recipients as nodemailer > a partly refused envelope` | |
| behavior: authentication (8 tests) | `auth > *` | No OAuth2 endpoint, per-message auth, or custom handlers. |
| socket-drop: one report after a socket timeout, server drops while in flight | `send > DATA > reports a server that drops the connection while the message is in flight`, `smtp-server > plaintext > reports a server that closes the connection during DATA` | |
| socket-drop: ETLS for a socket lost during STARTTLS | `tls > STARTTLS > reports a failed TLS handshake` | |

## Known upstream issues

- **GHSA-4ffr-jq9g-5ffx, GHSA-4g23-2xm8-66gc** (quadratic regex on an AUTH line, quadratic reply reassembly). Replies are read line by line, searching only new bytes, with a 1 MiB cap per reply. `connect > reading replies > *` and `auth > method selection > reads an AUTH line padded with whitespace in linear time`.
- **GHSA-vvjj-xcjg-gr5g** (CRLF in `name`). The name is rejected, not cleaned up.
- **GHSA-c7w3-x93f-qmm8** (CRLF in `size`). `size` must be a safe non-negative integer.
- **GHSA-6vj9-mwq6-2f5v** (a DNS cache reused the TLS server name). Doesn't apply: there is no DNS step.
- **STARTTLS command injection** (CVE-2011-0411 class). Bytes after the 220 reply to STARTTLS are dropped before the TLS handshake.
- **SMTP smuggling.** Bare CR and bare LF become CRLF before dot-stuffing, so `\r.\r` and `\n.\n` cannot end DATA. The oracle compares a smuggling attempt byte for byte.
- **Opportunistic TLS.** nodemailer continues in plaintext when STARTTLS fails unless `requireTLS` is set. Here STARTTLS is required unless you pass `secure: 'off'`.
- **Credentials over plaintext.** nodemailer sends them when the server asks. Here that requires `allowInsecureAuth`.
- **AUTH skipped silently.** nodemailer skips AUTH when the server does not advertise it unless `forceAuth` is set, and the mail is then sent unauthenticated. Here the client always sends AUTH when credentials are set.
- **8-bit content without BODY=8BITMIME.** nodemailer declares it only with `use8BitMime`, so strict servers refuse 8-bit messages. Here it is declared whenever the server offers it.
- **DSN ORCPT.** nodemailer applies one ORCPT to every recipient (issue #1374). ORCPT is not supported.
- **421 error codes.** nodemailer keeps the stage code (EAUTH, EENVELOPE) for a 421. Here a 421 is always ECONNECTION, so one check of `code` tells you to retry on a new connection.
- **Empty message.** nodemailer refuses it. Here it is sent as `.\r\n`.

## Benchmarks

`send.bench.ts` runs with the Node adapter on localhost, against a server that answers at once. Upstream's `SMTPConnection` runs on the same server. The machine had a load average of about 50 during the runs, so the error is ±10–35%.

| Case | @portable/smtp | nodemailer |
| --- | --- | --- |
| 10 small messages over one connection | 930–1,120 ops/s | 790–810 ops/s |
| One 1 MB message streamed in 64 KB chunks | 10.9–11.8 ops/s | 7.9–9.6 ops/s |
