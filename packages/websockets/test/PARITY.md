# Test parity

Upstream suites: [reconnecting-websocket 4.4.0 `__tests__/test.ts`](https://github.com/pladaria/reconnecting-websocket/blob/master/__tests__/test.ts), [partysocket 1.3.0 `src/tests/`](https://github.com/cloudflare/partykit/tree/main/packages/partysocket/src/tests) and [websocket-ts 3.0.0 `tests/`](https://github.com/jjxxs/websocket-ts/tree/master/tests). No fixtures are copied.

The three libraries are `EventTarget` wrappers with `onopen`/`onclose` handlers, `send()`, `close()`, `reconnect()` and getters such as `retryCount` and `bufferedAmount`. `connect()` returns a readable and a writable stream instead. Upstream tests of event listener bookkeeping, getters and builder methods have no counterpart, because the streams replace them. Each row below says what the test checked and where we check the same behavior.

Test names refer to `connect.conformance.ts` (`connect >`), `fromSocket.conformance.ts` (`fromSocket >`), `server.test.ts` (`server >`, a real `ws` server in Node) and `connect.oracle.test.ts` (`oracle >`).

## reconnecting-websocket

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| throws with invalid constructor | `connect > connecting > throws a TypeError when there is no WebSocket class` | |
| throws with missing constructor | `connect > connecting > throws a TypeError when there is no WebSocket class` | |
| throws with non-constructor object | `connect > connecting > throws a TypeError when there is no WebSocket class` | |
| throws if not created with `new` | skipped | `connect` is a function. |
| global WebSocket is used if available | `server > connect against a ws server > echoes text and binary messages` | Uses Node's global `WebSocket`. |
| getters when not ready | skipped | No getters. |
| debug on | skipped | No debug logging. |
| debug off | skipped | No debug logging. |
| pass WebSocket via options | `connect > connecting > passes the URL and protocols to the WebSocket class` | Every conformance test passes a class. |
| URL provider | `connect > connecting > calls a URL function on every attempt` | A string, a `URL` and a sync or async function are accepted. Other types are a type error. |
| websocket protocol | `connect > connecting > passes the URL and protocols to the WebSocket class` | |
| undefined websocket protocol | `connect > connecting > passes the URL and protocols to the WebSocket class` | |
| null websocket protocol | skipped | `null` is a type error. |
| connection status constants | skipped | No `readyState`. |
| max retries: 0 / 1 / 5 | `connect > reconnecting > gives up with the last error when attempts is %i` | The same three cases, as `attempts` 1, 2 and 6. |
| level0 event listeners are kept after reconnect | `connect > sending and receiving > keeps the same streams across reconnects` | The streams play the role of the handlers. |
| level2 event listeners | skipped | No `addEventListener`. |
| level2 event listeners using object with handleEvent | skipped | No `addEventListener`. |
| connection timeout | `connect > reconnecting > times out an attempt that never opens` | Fails with a `TimeoutError` `DOMException`. |
| getters | skipped | No getters. |
| binaryType | `connect > connecting > sets binaryType to arraybuffer on every socket` | Fixed to `'arraybuffer'`, so binary data comes out as `Uint8Array`. |
| calling to close multiple times | `connect > closing > closing twice closes the socket once` | |
| calling to reconnect when not ready | skipped | No `reconnect()`. The heartbeat replaces a dead connection. |
| start closed | skipped | No `startClosed`. Call `connect` when you want the connection. |
| connect, send, receive, close | `connect > sending and receiving > sends and receives text`, `connect > closing > writable.close() sends queued writes, then closes with 1000 for good`, `server > connect against a ws server > writable.close() closes the connection with 1000` | |
| connect, send, receive, reconnect | `connect > sending and receiving > keeps the same streams across reconnects` | |
| immediately-failed connection should not timeout | `connect > reconnecting > reconnects after a failed attempt` | |
| immediately-failed connection with 0 maxRetries must not retry | `connect > reconnecting > gives up with the last error when attempts is 1` | |
| connect and close before establishing connection | `connect > closing > writable.close() before the socket opens opens nothing` | |
| enqueue messages | `connect > writes while disconnected > are queued and sent in order once connected` | |
| respect maximum enqueued messages | `connect > writes while disconnected > wait once maxQueued writes are queued` | Upstream drops writes past the limit. We make the writer wait. |
| enqueue messages before websocket initialization with expected order | `connect > writes while disconnected > are queued and sent in order once connected`, `oracle > sends queued messages in order once connected` | |
| closing from the other side should reconnect | `connect > reconnecting > reconnects after a dropped connection`, `server > connect against a ws server > reconnects after the server terminates the connection and sends queued writes` | |
| closing from the other side should allow to keep closed | `connect > reconnecting > reconnectIf decides which closes are final` | Upstream calls `close()` from the close handler. |
| reconnection delay grow factor | `connect > reconnecting > waits the backoff cap when jitter is off`, `connect > reconnecting > passes the failure count and error to a delay function` | |
| minUptime | `connect > reconnecting > a successful connection resets the attempt count` | The count resets when `open` finishes, not after a minimum uptime. A connection that opens and drops at once waits `delay(1)` each time, so a nonzero delay prevents a tight loop. |
| reconnect after closing | skipped | No `reconnect()`. Call `connect` again. |

## partysocket

`reconnecting.test.ts` repeats every reconnecting-websocket test above, so the table lists only its additions.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| reconnecting: websocket invalid protocolsProvider | skipped | `protocols` is a value, not a function. |
| reconnecting: websocket sync protocolsProvider | skipped | Same. |
| reconnecting: websocket async protocolsProvider | skipped | Same. |
| reconnecting: shouldReconnectOnClose=false stops reconnecting before close listeners run | `connect > reconnecting > reconnectIf decides which closes are final` | |
| reconnecting: shouldReconnectOnClose preserves default reconnect behavior when omitted | `connect > reconnecting > reconnects after a dropped connection` | Our default treats 1008 as final. See the README. |
| reconnecting: reconnect() re-enables a socket stopped by shouldReconnectOnClose | skipped | No `reconnect()`. |
| reconnecting: send() returns true when transmitted and false when buffered | skipped | Writes return promises. |
| reconnecting: drainQueuedMessages() removes and returns buffered messages | skipped | The queue is private, and `writable.abort()` drops it. |
| reconnecting: close() dispatches its close event synchronously, exactly once | `connect > closing > writable.close() sends queued writes, then closes with 1000 for good` | `readable` ends once. |
| reconnecting: close() while still CONNECTING dispatches its close event synchronously | `connect > closing > writable.close() before the socket opens opens nothing` | |
| reconnecting: close() inside a close listener does not dispatch a duplicate close event | skipped | No close listeners. |
| reconnecting: reconnect() immediately after close() does not dispatch a duplicate close event | skipped | No `reconnect()`. |
| reconnecting: warns when send() is called after close() | `connect > closing > cancelling readable closes the socket and stops reconnecting` | A write after closing rejects instead of being queued forever. |
| reconnecting: messages sent after close() are delivered after reconnect(), and the warning resets | skipped | No `reconnect()`. |
| reconnecting: reconnect() works after maxRetries has been exhausted | skipped | No `reconnect()`. After `attempts`, the streams fail and the caller calls `connect` again. |
| reconnecting-node: pass WebSocket via options | `server > connect against a ws server > aborting while the ws client is still connecting does not crash` | Passes the `ws` package's class. |
| partysocket: throws if host or room is not set; room is updated after updateProperties | skipped | PartyKit URLs. Pass a URL function. |
| partysocket-url (53 tests: host, room, party, path, prefix, query, id, name validation, protocols, option pass-through) | skipped | PartyKit URL building. `connect` takes a URL or a function that returns one. |
| partysocket-fetch (25 tests) | skipped | `PartySocket.fetch` is an HTTP helper, not part of a WebSocket. |
| react-hooks, react-ssr, use-* (React) | skipped | React hooks. |
| react-native (5 tests) | skipped | Event cloning for React Native's `EventTarget`. We dispatch no events. |
| module-scope: does not generate random values while importing | skipped | No connection ids. |
| edge-cases: Connection ID (4 tests) | skipped | No connection ids. |
| edge-cases: BinaryType: default, before connection, after connection, across reconnections | `connect > connecting > sets binaryType to arraybuffer on every socket` | |
| edge-cases: localhost and private IP detection (11 tests) | skipped | PartyKit picks `ws:` or `wss:`, and we use the URL as given. |
| edge-cases: queue messages up to / not beyond / exactly maxEnqueuedMessages | `connect > writes while disconnected > wait once maxQueued writes are queued` | |
| edge-cases: bufferedAmount for string, Blob, ArrayBuffer, ArrayBufferView messages | skipped | No `bufferedAmount` getter. Writes are `string` or `Uint8Array`. |
| edge-cases: should flush message queue on connection | `connect > writes while disconnected > are queued and sent in order once connected` | |
| edge-cases: readyState constants, startClosed, CONNECTING by default | skipped | No `readyState` or `startClosed`. |
| edge-cases: close() when not connected | `connect > closing > writable.close() before the socket opens opens nothing` | |
| edge-cases: multiple close() calls | `connect > closing > closing twice closes the socket once` | |
| edge-cases: close() sets shouldReconnect to false | `connect > closing > writable.close() sends queued writes, then closes with 1000 for good` | Checks that no socket opens afterwards. |
| edge-cases: retryCount starts at 0; reset by reconnect() | `connect > reconnecting > passes the failure count and error to a delay function` | The delay function receives the count. |
| edge-cases: extensions, protocol, url empty when not connected | skipped | No getters. |
| error-handling: async URL provider that throws | `connect > connecting > retries when the URL function throws` | |
| error-handling: sync URL provider that throws | `connect > connecting > retries when the URL function throws` | |
| error-handling: invalid URL provider type | skipped | A type error. |
| error-handling: invalid / null protocol provider | skipped | No protocol provider. |
| error-handling: PartyKit path, host, room and basePath checks (6 tests) | skipped | PartyKit URLs. |
| error-handling: missing WebSocket constructor | `connect > connecting > throws a TypeError when there is no WebSocket class` | |
| error-handling: immediate connection failure | `connect > reconnecting > reconnects after a failed attempt` | |
| error-handling: stops retrying after maxRetries | `connect > reconnecting > gives up with the last error when attempts is %i` | |
| error-handling: connection timeout | `connect > reconnecting > times out an attempt that never opens` | |
| error-handling: respects maxEnqueuedMessages limit | `connect > writes while disconnected > wait once maxQueued writes are queued` | |
| error-handling: buffered amount for different message types | skipped | No `bufferedAmount` getter. |
| error-handling: warns when EventTarget is not available | skipped | No `EventTarget` subclass. |
| error-handling: close before connection established | `connect > closing > writable.close() before the socket opens opens nothing` | |
| error-handling: multiple close calls | `connect > closing > closing twice closes the socket once` | |
| error-handling: reconnect while already connecting | skipped | No `reconnect()`. |
| error-handling: fetch errors, async query provider, path in fetch | skipped | `PartySocket.fetch`. |
| error-handling: extremely long message queue | `connect > writes while disconnected > wait once maxQueued writes are queued` | The queue is bounded. |
| error-handling: empty message send | `connect > sending and receiving > sends and receives text` | Any string, including `''`, is sent as is. |
| error-handling: rapid reconnect calls | skipped | No `reconnect()`. |
| error-handling: binaryType changes while disconnected | skipped | `binaryType` is fixed. |
| error-handling: resets retry count on successful connection | `connect > reconnecting > a successful connection resets the attempt count` | |
| error-handling: exponential backoff increases delay correctly | `connect > reconnecting > waits the backoff cap when jitter is off` | |
| error-handling: custom debugLogger, debug mode logs | skipped | No logging. |
| integration: complete lifecycle: connect, send, receive, close | `server > connect against a ws server > echoes text and binary messages`, `server > connect against a ws server > writable.close() closes the connection with 1000` | |
| integration: handles server disconnect and reconnect | `server > connect against a ws server > reconnects after the server terminates the connection and sends queued writes` | |
| integration: maintains message order during high load | `oracle > echoes random text and binary messages sent before the socket opens` | 50 messages up to 2000 bytes, compared with reconnecting-websocket. |
| integration: multiple instances; different configurations | skipped | `connect` keeps no shared state. |
| integration: chat, collaborative editing, gaming scenarios | `oracle > echoes random text and binary messages sent before the socket opens` | Scenario names for send-and-echo traffic. |
| integration: recovers from network interruption | `server > connect against a ws server > reconnects after the server terminates the connection and sends queued writes` | |
| integration: handles server restart | `server > connect against a ws server > reconnects after the server restarts on the same port` | |
| integration: fetch and WebSocket use same URL structure | skipped | `PartySocket.fetch`. |
| performance (15 tests: message volume, small and large messages, connect and reconnect speed, queue, delay calculation, listeners, URL construction, memory) | `connect.bench.ts` | Timing assertions in unit tests fail under load, so the benchmark compares throughput instead. The bounded queue covers "message queue doesn't grow unbounded". |

## websocket-ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Getter/setter: Url (2 tests) | `connect > connecting > calls a URL function on every attempt` | No `url` getter. |
| Getter/setter: Protocols (3 tests) | `connect > connecting > passes the URL and protocols to the WebSocket class` | |
| Getter/setter: Buffer (2 tests) | skipped | No pluggable buffer. `maxQueued` bounds the queue. |
| Getter/setter: MaxRetries (2 tests) | `connect > reconnecting > gives up with the last error when attempts is %i` | |
| Getter/setter: InstantReconnect (2 tests) | `connect > reconnecting > passes the failure count and error to a delay function` | `delay: ({ attempt }) => (attempt === 1 ? 0 : 1000)` gives an instant first retry. |
| Getter/setter: Backoff (2 tests) | `connect > reconnecting > waits the backoff cap when jitter is off` | |
| Getter/setter: Listeners | skipped | No listeners. |
| Getter/setter: ClosedByUser (3 tests) | `connect > closing > writable.close() sends queued writes, then closes with 1000 for good`, `connect > reconnecting > reconnects after a dropped connection` | A close by the caller is final, and one by the server is not. |
| Getter/setter: LastConnection (3 tests) | skipped | No connection timestamps. |
| Getter/setter: UnderlyingWebsocket (4 tests) | skipped | The socket is private. Use `fromSocket` to manage a socket yourself. |
| Getter/setter: ReadyState, BufferedAmount, Extensions (5 tests) | skipped | No getters. |
| Getter/setter: BinaryType (2 tests) | `connect > connecting > sets binaryType to arraybuffer on every socket` | |
| Event: 'open' when connecting / reconnecting | `connect > open > runs on every connection before queued writes are sent` | |
| Event: no 'open' after the listener was removed | skipped | No listeners. |
| Event: 'close' when the server closes | `connect > reconnecting > closes readable when the server closes with 1000` | |
| Event: 'close' when the client closes | `connect > closing > writable.close() sends queued writes, then closes with 1000 for good` | |
| Event: 'close' when the server closes with a code other than 1000 | `connect > reconnecting > fails with a CloseError for a final close code` | |
| Event: 'close' when the client closes with a code other than 1000 | skipped | The client always closes with 1000. |
| Event: 'error' when the server rejects the connection | `connect > reconnecting > reconnects after a failed attempt` | |
| Event: 'message' | `connect > sending and receiving > sends and receives text` | |
| Retry & Reconnect: retry event detail holds a copy of the last connection date | skipped | No retry events. |
| Retry & Reconnect: no 'retry' on the first attempt, 'retry' when retrying, 'reconnect' when reconnecting | `connect > reconnecting > passes the failure count and error to a delay function` | The delay function runs only before a retry. |
| Retry & Reconnect: retry delays beyond the timer limit are capped | `connect > reconnecting > caps a delay longer than the timer limit instead of retrying at once` | |
| UrlProvider: called on each connection attempt | `connect > connecting > calls a URL function on every attempt` | |
| InstantReconnect: reconnects immediately when true / not when false | `connect > reconnecting > passes the failure count and error to a delay function`, `connect > reconnecting > waits the delay before reconnecting` | |
| MaxRetries: stops when maxRetries is reached | `connect > reconnecting > gives up with the last error when attempts is %i` | |
| Send: server receives a message | `server > connect against a ws server > echoes text and binary messages` | |
| Send: server receives a Uint8Array | `connect > sending and receiving > sends Uint8Array writes as binary` | |
| Send: buffers messages before open | `connect > writes while disconnected > are queued and sent in order once connected` | |
| Send: without a buffer, drops messages while disconnected | `connect > writes while disconnected > with maxQueued 0 wait for a connection` | We wait instead of dropping. |
| Send: RingQueue drops the oldest message when over capacity | `connect > writes while disconnected > wait once maxQueued writes are queued` | We wait instead of dropping. |
| Send: short circuits if closed by user | `connect > closing > cancelling readable closes the socket and stops reconnecting` | The write rejects. |
| binarytype_reconnect (2 tests) | `connect > connecting > sets binaryType to arraybuffer on every socket` | |
| buffer_drain: draining does not cycle when an 'open' listener closes the socket | `connect > writes while disconnected > are not sent on a socket that is closing` | |
| buffer_drain: kept messages are delivered once a connection succeeds | `connect > open > closes the socket and reconnects when it throws, keeping queued writes` | |
| builder (every test) | skipped | No builder. Options are one object. |
| callback_reentrancy: URL provider calling close() during a manual or automatic retry (3 tests) | `connect > closing > writable.close() before the socket opens opens nothing` | `writable.close()` stops the pending attempt. |
| callback_reentrancy: URL provider calling reconnect() (3 tests) | skipped | No `reconnect()`. |
| callback_reentrancy: URL provider is called without the websocket as receiver | skipped | `connect` calls it as a plain function. |
| callback_reentrancy: URL rejected by the WebSocket constructor leaves url unchanged | `connect > connecting > fails without retrying when the WebSocket class rejects a fixed URL` | |
| dispatch_mutation (3 tests) | skipped | No listeners. |
| exhausted_reconnect: 'exhausted' fires once after maxRetries and retrying stops | `connect > reconnecting > gives up with the last error when attempts is %i` | The streams fail once. |
| exhausted_reconnect: no 'exhausted' when reconnected within budget | `connect > reconnecting > a successful connection resets the attempt count` | |
| exhausted_reconnect: reconnect() after exhausted / after close / on an open socket (3 tests) | skipped | No `reconnect()`. |
| exhausted_reconnect: retry options require a backoff (4 tests) | skipped | `delay` has a default. |
| exhausted_reconnect: maxRetries must be Infinity or a non-negative integer (3 tests) | `connect > connecting > throws a RangeError for invalid options` | |
| exhausted_reconnect: maxRetries of Infinity never exhausts | `connect > reconnecting > reconnects after a dropped connection` | The default is `Infinity`. |
| exhausted_reconnect: maxRetries of zero exhausts on the first disconnect | `connect > reconnecting > gives up with the last error when attempts is 1` | |
| initial_failure_recovery (3 tests) | `connect > reconnecting > a successful connection resets the attempt count`, `server > connect against a ws server > reconnects after the server restarts on the same port` | |
| instant_reconnect: skip the backoff only for the first retry | `connect > reconnecting > passes the failure count and error to a delay function` | |
| lifecycle_reentrancy (6 tests: close or reconnect from close, retry, error, open and reconnect listeners) | `connect > open > closes the socket and reconnects when it throws, keeping queued writes`, `connect > closing > the signal closes the socket with 1000 and fails both streams` | There are no listeners to re-enter. `open` throwing and aborting the signal are the two ways a caller interrupts a connection. |
| listener_exception (7 tests) | `connect > open > closes the socket and reconnects when it throws, keeping queued writes` | `open` is the only callback, and a throw from it reconnects. |
| listener_options (11 tests) | skipped | No listeners. |
| remove_listener (6 tests) | skipped | No listeners. |
| url_provider_throw: dispatches 'error' and keeps retrying when the URL provider throws | `connect > connecting > retries when the URL function throws` | |
| backoff: backoff_series, constantbackoff, exponentialbackoff, linearbackoff (54 tests) | `connect > reconnecting > waits the backoff cap when jitter is off`, `connect > reconnecting > passes the failure count and error to a delay function`, `connect > connecting > throws a RangeError for invalid options` | No backoff classes. `delay` is a number, `{ initial, max, factor, jitter }` or a function of the failure count, which expresses constant and linear backoff. |
| queue: array_queue, ring_queue (52 tests) | skipped | No queue classes. |

## Benchmarks

None of the three libraries has benchmarks. `connect.bench.ts` echoes 1000 messages of 100 bytes through a local `ws` server with `connect`, reconnecting-websocket and a bare `WebSocket`, and a server that echoes through `fromSocket` against one that uses `ws` listeners.

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| reconnecting-websocket [#91](https://github.com/pladaria/reconnecting-websocket/issues/91): the first connection waited for the reconnect delay. | The first socket opens at once. | `connect > connecting > opens the first socket without waiting for the delay` |
| reconnecting-websocket [#197](https://github.com/pladaria/reconnecting-websocket/issues/197): closing a `ws` client that is still connecting emits an error event with no listener, which crashes Node. | An error listener stays on every socket. | `server > connect against a ws server > aborting while the ws client is still connecting does not crash` |
| reconnecting-websocket [#170](https://github.com/pladaria/reconnecting-websocket/issues/170): a close event from an old socket arriving after a reconnect could close the new one. | Listeners are removed from a socket when its connection ends. | `connect > sending and receiving > ignores events from a replaced socket` |
| reconnecting-websocket [#98](https://github.com/pladaria/reconnecting-websocket/issues/98): no heartbeat, so a silently dropped connection stays open. | `heartbeat` option. | `connect > heartbeat > reconnects when no pong arrives in time`, `server > connect against a ws server > the heartbeat replaces a connection whose server stopped answering` |
| reconnecting-websocket and partysocket flush queued messages in the `open` event, before the app can authenticate. | Queued writes wait for `open` to finish. | `connect > open > holds queued writes until it resolves` |
| reconnecting-websocket and partysocket queue without limit by default, and drop messages past `maxEnqueuedMessages`. | The queue holds `maxQueued` writes, then the writer waits. | `connect > writes while disconnected > wait once maxQueued writes are queued` |
| partysocket: `send()` after `close()` queues the message forever (it now logs a warning). | Writes after closing reject. | `connect > closing > cancelling readable closes the socket and stops reconnecting` |
| partysocket [#252](https://github.com/cloudflare/partykit/issues/252): `reconnect()` did nothing after `maxRetries`. | The streams fail with the last error, so the caller sees that it gave up. | `connect > reconnecting > gives up with the last error when attempts is %i` |
| websocket-ts: a URL function that throws on a retry stopped reconnecting permanently. | The attempt counts as failed and the next one runs after `delay`. | `connect > connecting > retries when the URL function throws` |
| websocket-ts: a delay above 2^31 - 1 ms overflowed `setTimeout` and retried at once. | Delays are capped at 2^31 - 1 ms. | `connect > reconnecting > caps a delay longer than the timer limit instead of retrying at once` |
| websocket-ts: draining the buffer re-added messages forever when an `open` listener closed the socket. | The queue is sent only while the socket is open, and the rest waits for the next connection. | `connect > writes while disconnected > are not sent on a socket that is closing` |
| All three: a write on a socket the browser has closed but not yet reported is discarded silently. | Writes are queued unless `readyState` is `OPEN`. Writes the old socket accepted before the drop are still lost, as the README says. | `connect > writes while disconnected > are not sent on a socket that is closing` |
| None of the three apply backpressure: `send()` returns while `bufferedAmount` grows without limit. | Writes wait while `bufferedAmount` is above `highWaterMark`. | `connect > backpressure > writes wait while bufferedAmount is above highWaterMark` |
