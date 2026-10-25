# Test parity

Upstream suites: [birpc 4.2.0 `test/`](https://github.com/antfu-collective/birpc/tree/main/test), [json-rpc-2.0 1.8.1 `src/*.spec.ts`](https://github.com/shogowada/json-rpc-2.0/tree/master/src) and [penpal 8.0.1 `test/`](https://github.com/Aaronius/penpal/tree/main/test), plus the examples in section 7 of the [JSON-RPC 2.0 specification](https://www.jsonrpc.org/specification#examples), which `spec.conformance.ts` runs one by one. `fixtures/methods.ts` adapts the method set of penpal's `generalMethods` test fixture (MIT, Aaron Hardy) to our API. No other upstream code is copied.

Test files: `connect.conformance.ts` (calls over a `MessageChannel`), `json-rpc.conformance.ts`, `http.conformance.ts`, `spec.conformance.ts`, `penpal.conformance.ts`, `window.browser.test.ts` and `rpc.oracle.test.ts`. A test is named `file > describe > test`.

## birpc

birpc's tests talk between "Alice" (`hello`) and "Bob" (`hi`, `bump`, `bumpWithReturn`, `getCount`) over a `MessageChannel`. `connect.conformance.ts` uses the same two APIs.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| close > stops the rpc promises | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason` | `$close()` is aborting the `signal` passed to `connect`. |
| close > stops the rpc promises with a custom message | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason` | The abort reason is the custom error. |
| close > custom error's cause is not overwritten | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason` | Calls reject with the reason itself, so its `cause` is never touched. |
| dynamic > dynamic | `connect > calls > looks up the method on every call, so replacing or adding one takes effect` | |
| error > on function error | `connect > errors > rejects a call to an unknown method with -32601` | There is no `onFunctionError` hook. The caller gets the error. |
| error > on serialize error | `connect > errors > answers a result the codec cannot encode with an error, and keeps serving`, `connect > errors > rejects a call whose arguments the codec cannot encode` | No `onGeneralError` hook. |
| error > on parse error | `connect > errors > answers undecodable input with a parse error` | Answered with `-32700`, as the specification says. |
| error > on async post error | `connect > errors > rejects calls and notifications when the transport fails to write` | |
| exports > exports-snapshot | skipped | Snapshots birpc's own export list. `isolatedDeclarations` keeps our exports explicit. |
| group > group | skipped | `createBirpcGroup` broadcasts one call to many channels. Call `connect` per channel and `Promise.all` the calls. The "calls before the peer listens" half is covered by `window.browser.test.ts`'s handshake tests. |
| group > broadcast optional | skipped | Group broadcast and `$callOptional`. A caller catches `-32601` instead. |
| group > group without proxify | skipped | Group and `proxify: false`. `Rpc.call` is the non-proxy form. |
| hook > cache | skipped | `onRequest` hooks into outgoing calls. Wrap the remote's methods in your own function instead. |
| index > basic | `connect > notifications > notify runs the method without waiting for a result`, `connect > both directions > each side serves an API to the other over one transport` | `eventNames` and `.asEvent()` are `Rpc.notify`. |
| index > basic without proxify | `connect > call > passes positional params as arguments` | `$call` is `Rpc.call`. |
| index > await on birpc should not throw error | `connect > calls > a remote can be awaited without making a call` | |
| index > $call | `connect > call > passes positional params as arguments`, `connect > notifications > notify runs the method without waiting for a result` | `$callEvent` is `Rpc.notify`. |
| index > $callOptional | `connect > errors > rejects a call to an unknown method with -32601` | No optional calls. The error code tells the caller the method is missing. |
| reject-pending-calls > rejects pending calls | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason`, `connect > cancellation > the transport closing rejects waiting calls with TransportError` | No `$rejectPendingCalls`. Abort the connection, or abort each call's own signal. |
| reject-pending-calls > rejects pending calls with custom handler | `connect > cancellation > aborting a call rejects it and aborts the signal the method received` | The reason passed to `abort()` is what the call rejects with. |
| reject-pending-calls > rejected calls are cleared from rpc | `json-rpc > client > ignores a response for a call that already settled` | |
| resolver > resolver | `connect > calls > looks up the method on every call, so replacing or adding one takes effect` | No `resolver` option. The API object can be a `Proxy` or have getters. |
| timeout > timeout | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | |
| timeout > custom onTimeoutError | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | The call rejects with `signal.reason`, so `AbortSignal.any` with a controller aborted by your own error gives a custom error. |
| timeout > custom onTimeoutError without custom error | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | |

## json-rpc-2.0

json-rpc-2.0 has no transport: a method returns a response object and the test passes it on. Our tests feed raw JSON text to `Rpc.provide` (`raw()` in `utils.ts`) or call through a connected remote. `rpc.oracle.test.ts` compares the wire output of both servers and clients on the same input.

### server.spec.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| having an echo method > receiving a request to the method > should echo the text | `json-rpc > server > passes by-name params to the method as one object` | |
| having an echo method > receiving a request to the method with user ID > should echo the text with the user ID | `http > handler > gives withContext methods the request` | `serverParams` is per-request data, which here comes from the `Request` through `withContext`. |
| having an echo method > removing the echo method > ... > should respond not found | `connect > calls > looks up the method on every call, so replacing or adding one takes effect`, `connect > errors > rejects a call to an unknown method with -32601` | Delete the property from the API object. |
| responding undefined > should response with null result | `connect > calls > resolves undefined results as null` | |
| throwing > should respond error | `connect > errors > sends any other thrown or rejected error as -32603 with its message` | Code `-32603`, not `0`. See the README and `rpc.oracle.test.ts`. |
| throwing JSONRPCErrorException > should respond error with custom code and data | `connect > errors > rejects with RemoteError carrying the code, message and data the method threw` | |
| rejecting > should respond error | `connect > errors > sends any other thrown or rejected error as -32603 with its message` | |
| responding to a notification > should not respond | `spec > a notification` | |
| error on a notification > should not respond | `connect > notifications > writes a notification without an id, and nothing comes back` | |
| responding null to a request > should respond error | skipped | `addMethodAdvanced` builds its own response object. A method here returns a value, and `null` is a valid result. |
| receiving a request to an unknown method > should respond error | `spec > rpc call of non-existent method` | |
| receiving an invalid JSON ([object Object]) > should respond an error | `json-rpc > server > answers parse errors for empty or malformed text` | |
| receiving an invalid JSON () > should respond an error | `json-rpc > server > answers parse errors for empty or malformed text` | |
| receiving an invalid JSON (invalid JSON) > should respond an error | `json-rpc > server > answers parse errors for empty or malformed text` | |
| receiving an invalid request ({}) > should respond an error | `json-rpc > server > answers Invalid Request for objects that are not requests` | |
| receiving an invalid request ({"jsonrpc":"2.0"}) > should respond an error | `json-rpc > server > answers Invalid Request for objects that are not requests` | |
| receiving an invalid request ({"jsonrpc":"2.0invalid","method":""}) > should respond an error | `json-rpc > server > answers Invalid Request for objects that are not requests` | |
| having a custom handleMethodNotFound method > should be called for requests | skipped | No hook. A `Proxy` as the API object can answer any name. |
| having a custom handleMethodNotFound method > should be called for notifications | skipped | Same. |
| having a custom mapErrorToJSONRPCErrorResponse method > rejecting > should respond a custom error code | `connect > errors > rejects with RemoteError carrying the code, message and data the method threw` | Throw a `RemoteError` with the code you want. |
| ... > should respond a custom error message | `connect > errors > rejects with RemoteError carrying the code, message and data the method threw` | |
| ... > should respond a custom error data | `connect > errors > rejects with RemoteError carrying the code, message and data the method threw` | |
| having an async method > using middleware > (9 tests) | skipped | No middleware. Wrapping a method is the equivalent for the server, and wrapping `fetch` for `Rpc.http`. |
| having an async method > using a middleware that changes request and server params > (2 tests) | skipped | Middleware. |
| having an async method > using a middleware that changes response > should return the changed response | skipped | Middleware. |
| having an async method > using middleware that catches exception > (2 tests) | `connect > errors > rejects with RemoteError carrying the code, message and data the method threw` | The error-mapping half: a thrown `RemoteError` sets the code. |
| having an async method > using multiple middleware > should call middleware in the applied order | skipped | Middleware. |
| receiving batch requests > of 3 requests > should return 3 responses | `json-rpc > server > answers a batch in request order` | |
| receiving batch requests > of 1 request > should return 1 response | `json-rpc > server > answers a batch of one request with an array of one response` | Upstream returns a bare object, and the specification requires an array. |
| receiving batch requests > of notifications > should return null | `spec > rpc call Batch (all notifications)` | Nothing is written, as the specification says. |
| receiving batch requests > of an empty array > should return error | `spec > rpc call with an empty Array` | |
| receiving batch requests > of a valid and an invalid request > should return a failure and a success response | `json-rpc > server > answers a batch of a valid and an invalid request with both responses` | |
| method registration > should not slow down as more methods are registered | `json-rpc > server > does not slow down with many methods` | |
| method registration > should treat prototype-related names as ordinary method names | `json-rpc > server > calls an own method named __proto__, but not hasOwnProperty` | |

### client.spec.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| requesting > should send the request | `connect > calls > sends arguments as positional params and leaves params out when there are none` | |
| ... > and succeeded on server side too > should resolve the result | `connect > calls > resolves the result of a sync or async method` | |
| ... > succeeded on server side with falsy but defined result > should resolve the result | `json-rpc > client > resolves a falsy result` | |
| ... > but failed on server side > should reject with the error message, code and data | `json-rpc > client > rejects with the code, message and data of an error response` | |
| ... > but failed on server side > should reject with a JSONRPCErrorException | `json-rpc > client > rejects with the code, message and data of an error response` | The class is `Rpc.RemoteError`. |
| ... > like having both result and error > should reject | `json-rpc > client > rejects a response that has both result and error` | |
| ... > like not having both result and error > should reject | skipped | A message with neither `result` nor `error` is not a response, so the server half answers it with Invalid Request. The call waits until its signal aborts. |
| ... > but I reject all pending requests > should reject the request | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason` | |
| ... > receiving a response > should not resolve the promise again | `json-rpc > client > ignores a response for a call that already settled` | |
| failed on client side > should reject the promise | `connect > errors > rejects calls and notifications when the transport fails to write` | |
| failed on client side with no error object > should reject the promise | `connect > errors > rejects calls and notifications when the transport fails to write` | The call rejects with whatever the transport rejected with. |
| failed on client side with an error object without message > should reject the promise | `connect > errors > rejects calls and notifications when the transport fails to write` | |
| requesting batch > should send requests in batch | `http > http > sends calls made in the same tick as one batch request` | Only `Rpc.http` sends batches. Message transports send each call when it is made. |
| requesting batch > should return responses | `http > http > sends calls made in the same tick as one batch request` | |
| requesting with client params > should pass the client params to send function | `http > handler > gives withContext methods the request` | Per-request data travels in the `Request`, set by the `fetch` passed to `Rpc.http`. |
| requesting with timeout > timing out > should reject | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | |
| requesting with timeout > not timing out > should respond | `connect > call > passes positional params as arguments` | |
| requesting advanced with timeout > timing out > should reject | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | No advanced (raw response) requests. |
| requesting advanced with timeout > not timing out > should respond | `connect > call > passes positional params as arguments` | |
| requesting with custom timeout error response > timing out > should reject with the custom error | `connect > cancellation > a call with an aborted signal rejects with its reason and sends nothing` | The signal's reason is the custom error. |
| notifying > should send the notification | `connect > notifications > writes a notification without an id, and nothing comes back` | |
| notifying with client params > should pass the client params to send function | `http > http > resolves a notification once the server accepted it` | |

### server-and-client.spec.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| requesting from server 1 > should request to server 2 | `connect > both directions > each side serves an API to the other over one transport` | |
| requesting from server 1 > removing the method > ... > should return not found | `connect > errors > rejects a call to an unknown method with -32601` | |
| requesting from server 2 > should request to server 1 | `connect > both directions > each side serves an API to the other over one transport` | |
| requesting from server 1 using advanced method > should request to server 1 | `connect > both directions > a method can call back into the side that called it` | |
| requesting in batch > should return responses | `json-rpc > server > answers a batch in request order` | |
| receiving invalid JSON-RPC message > should fail | `json-rpc > server > answers Invalid Request for objects that are not requests` | |
| having a pending request > rejecting all pending requests > should reject the pending request | `connect > cancellation > aborting the connection rejects waiting and later calls with the reason` | |
| requesting with timeout > timing out > should reject | `connect > cancellation > a call times out with AbortSignal.timeout when nothing answers` | |
| requesting with timeout > not timing out > should succeed | `connect > calls > resolves the result of a sync or async method` | |

### interfaces.spec.ts and index.spec.ts

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| interfaces > independent server and client > calling method with no args no return | `connect > calls > resolves undefined results as null` | |
| interfaces > independent server and client > calling method with no args | `connect > calls > sends arguments as positional params and leaves params out when there are none` | |
| interfaces > independent server and client > calling method with object args | `connect > call > passes params by name as one argument` | |
| interfaces > independent server and client > calling method with array args | `connect > call > passes positional params as arguments` | |
| interfaces > server and client > calling method from server A to B | `connect > both directions > each side serves an API to the other over one transport` | |
| interfaces > server and client > calling method from server B to A | `connect > both directions > each side serves an API to the other over one transport` | |
| JSONRPCClient and JSONRPCServer > sending a request should resolve the result | `connect > calls > resolves the result of a sync or async method` | Upstream's test asserts nothing: its `beforeEach` is inside the `it`. |
| JSONRPCClient and JSONRPCServer > sending a notification should send a notification | `connect > notifications > notify runs the method without waiting for a result` | Same upstream mistake. |

## penpal

Maps every penpal 8.0.1 test (140: 46 unit, 94 browser) to the `@portable/rpc` test that covers the same case, or gives the reason it doesn't apply.

Our files:

- `window.browser.test.ts` runs only in Chromium (Vitest browser mode). Child pages are `fixtures/child.html` and `fixtures/start.ts`, served by the Vitest server. A second origin is the same server reached through the other host name (`localhost` and `127.0.0.1`, same port), which works without any server change.
- `penpal.conformance.ts` runs in Node and Chromium over `MessageChannel` and `BroadcastChannel`.
- `contract.ts` holds the communication and method call lifecycle tests, which penpal also keeps as contracts. `window.browser.test.ts` runs them for "a cross-origin iframe", "a module Worker" and "a Worker over BroadcastChannel", and `penpal.conformance.ts` runs them for "a MessagePort" and "a BroadcastChannel". A row that cites `contract.ts > communication with * > ...` is covered by all five.
- The remote side serves `fixtures/methods.ts`, our copy of penpal's `generalMethods.js`.

API differences that decide many rows:

- penpal's `connect` returns `{ promise, destroy }`. We have no connection promise: `Rpc.connect` returns the remote at once, writes wait for the window handshake, and the first call's promise is where a failed handshake shows. `destroy()` is the `signal` option: aborting it rejects waiting calls with `signal.reason`.
- penpal's `timeout` option and `CallOptions({ timeout })` are `AbortSignal.timeout(ms)`, passed to `Rpc.call` for one call. A signal passed to `Rpc.window` or `Rpc.connect` closes the whole connection when it aborts, including after the handshake.
- penpal takes `allowedOrigins: (string | RegExp)[]` and defaults to the page's own origin. `Rpc.window` takes one required `origin` string, or `'*'`. There are no regular expressions and no lists.
- penpal hands each window or worker connection a `MessagePort` in the ACK2 message. `Rpc.window` posts every message through `window.postMessage` and checks `event.source` and `event.origin` on each one, and `Rpc.port` posts straight to the `Worker`, `MessagePort` or `BroadcastChannel`. No port is handed over.
- penpal has a DESTROY message that tears down the other side. We send nothing when a signal aborts, so the other side isn't told.
- penpal sends errors with their `name`, `message` and `stack`. We send JSON-RPC error objects: an `Rpc.RemoteError` keeps its `code`, `message` and `data`, and any other thrown value becomes code -32603 with its `message` (or `String(value)`).
- penpal has `Reply` and `CallOptions({ transferables })`. We never transfer: with the identity codec, values are structured-cloned and the caller keeps its buffers.

### Unit tests (46)

| penpal test | Our test or reason |
| --- | --- |
| unit/connect.spec.ts > connect > throws INVALID_ARGUMENT when messenger is undefined | Doesn't apply: the transport is a required, typed argument, and there is no runtime check for a missing one. |
| unit/connect.spec.ts > connect > throws INVALID_ARGUMENT when messenger is re-used | penpal.conformance.ts > connecting > throws when one transport is connected twice |
| unit/connect.spec.ts > connect > sends DESTROY and tears down handlers when destroy() is called | Doesn't apply: no DESTROY message. What the other side sees: window.browser.test.ts > reconnecting > leaves the child's calls unanswered after the parent's signal aborts. Teardown: penpal.conformance.ts > serving methods > removes its message listener from the port when its signal aborts |
| unit/connect.spec.ts > connect > rejects pending connection promise when destroy() is called | window.browser.test.ts > closing > rejects calls with signal.reason when the signal aborts during the handshake |
| unit/connect.spec.ts > connect > does not send DESTROY when remote sends DESTROY first | Doesn't apply: no DESTROY message. |
| unit/connect.spec.ts > connect > rejects pending connection promise when remote sends DESTROY first | Doesn't apply: no DESTROY message, so a remote can't close our side. |
| unit/connect.spec.ts > connect > tears down connection state if handshake fails | window.browser.test.ts > handshake > rejects calls with Rpc.TransportError when the child uses another protocol version |
| unit/connectCallHandler.spec.ts > connectCallHandler > sends serialized error reply when sending unclonable value throws DataCloneError | contract.ts > communication with * > rejects a call whose result cannot be cloned, and keeps working |
| unit/connectCallHandler.spec.ts > connectCallHandler > replies with METHOD_NOT_FOUND when method path does not exist | contract.ts > communication with * > rejects a missing method with code -32601 |
| unit/connectCallHandler.spec.ts > connectCallHandler > reports non-DataCloneError send failures | contract.ts > communication with * > rejects a call whose result the codec cannot encode, and keeps working. We don't log to `console`. |
| unit/connectCallHandler.spec.ts > connectCallHandler > ignores non-call messages | penpal.conformance.ts > serving methods > sends nothing back for a response to an unknown call |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > sends CALL and resolves when receiving REPLY | penpal.conformance.ts > sending calls > sends a nested method as one dotted JSON-RPC method name; contract.ts > communication with * > calls a method. We have no `log` option. |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > forwards transferables from CallOptions to messenger.sendMessage | Doesn't apply: no transfer list. contract.ts > communication with * > copies Uint8Array arguments and results with the identity codec |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > rejects with METHOD_CALL_TIMEOUT when method call timeout is exceeded | contract.ts > method call lifecycle with * > rejects a call with signal.reason when its signal times out |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > cleans up method call state when sending CALL fails | penpal.conformance.ts > sending calls > rejects a call whose arguments the codec cannot encode, and keeps working; penpal.conformance.ts > sending calls > rejects a call whose arguments cannot be cloned, and keeps working |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > rejects with deserialized Error when REPLY includes serialized error | contract.ts > communication with * > rejects with an error's message but not its name or stack |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > rejects pending method calls when proxy is destroyed | contract.ts > method call lifecycle with * > rejects a pending call with signal.reason when the connection closes |
| unit/connectRemoteProxy.spec.ts > connectRemoteProxy > clears method call timeout after receiving REPLY | penpal.conformance.ts > connecting > keeps working after the call timeout of an earlier call has passed. The timer belongs to `AbortSignal.timeout`, so there is no timer of ours to clear. |
| unit/errorSerialization.spec.ts > error serialization > round-trips a standard Error | contract.ts > communication with * > rejects with an error's message but not its name or stack. The name and stack are not sent. |
| unit/errorSerialization.spec.ts > error serialization > round-trips a PenpalError including code | contract.ts > communication with * > rejects with the code and data of an Rpc.RemoteError the method throws |
| unit/errorSerialization.spec.ts > error serialization > clears the local stack when the serialized stack is absent | Doesn't apply: remote stacks are never sent, and an `Rpc.RemoteError` has the caller's own stack. contract.ts > communication with * > rejects with an error's message but not its name or stack checks that the remote stack is absent. |
| unit/methodPath.spec.ts > method path > gets method at method path | contract.ts > communication with * > calls methods of nested objects; contract.ts > communication with * > rejects a missing method with code -32601 |
| unit/methodPath.spec.ts > method path > does not get methods from the prototype chain | Differs: penpal.conformance.ts > serving methods > calls methods inherited from a class prototype. We call inherited methods, so a class instance can be served, and refuse only `Object.prototype` names: penpal.conformance.ts > serving methods > doesn't call %s (toString, hasOwnProperty, constructor, valueOf, `__proto__.toString`, nested.toString, nested.constructor, multiply.call). |
| unit/methodPath.spec.ts > method path > does not get nested methods from the prototype chain | Differs: penpal.conformance.ts > serving methods > calls methods a nested object inherits |
| unit/methodPath.spec.ts > method path > formats method path | penpal.conformance.ts > sending calls > sends a nested method as one dotted JSON-RPC method name |
| unit/portMessenger.spec.ts > PortMessenger > forwards only validated messages to handlers | penpal.conformance.ts > serving methods > answers a message that is not JSON with a parse error, and keeps working. Every message reaches the codec, and malformed ones are answered with JSON-RPC errors. |
| unit/portMessenger.spec.ts > PortMessenger > stops forwarding incoming messages after destroy and can send messages | penpal.conformance.ts > serving methods > stops answering once its signal aborts |
| unit/shakeHands.spec.ts > shakeHands > rejects with TRANSMISSION_FAILED when sending SYN fails | window.browser.test.ts > handshake > rejects calls with Rpc.TransportError when posting to the target throws |
| unit/shakeHandsProtocol.spec.ts > shakeHands protocol behavior > completes handshake on ACK1 and wires call handler + proxy once | window.browser.test.ts > handshake > connects when the parent starts before the child page loads. The internal wiring isn't observable. |
| unit/shakeHandsProtocol.spec.ts > shakeHands protocol behavior > keeps handshake completion idempotent when ACK2 is received multiple times | window.browser.test.ts > reconnecting > runs a parent method once per call after the child reloads twice (each reload sends a new hello to a connected parent) |
| unit/shakeHandsProtocol.spec.ts > shakeHands protocol behavior > rejects with TRANSMISSION_FAILED when sending ACK2 fails | window.browser.test.ts > handshake > rejects calls with Rpc.TransportError when posting to the target throws. A failed `ready` reply fails the transport the same way as a failed hello. No test posts a `ready` that throws. |
| unit/shakeHandsProtocol.spec.ts > shakeHands protocol behavior > rejects with CONNECTION_TIMEOUT when handshake does not complete in time | window.browser.test.ts > handshake > gives up on a child that never answers when the call signal times out |
| unit/shakeHandsProtocol.spec.ts > shakeHands protocol behavior > cancels pending handshake state when destroyed before completion | window.browser.test.ts > closing > rejects calls with signal.reason when the signal aborts during the handshake |
| unit/windowMessenger.spec.ts > WindowMessenger > filters out messages from disallowed origins | window.browser.test.ts > origins > doesn't connect when the parent's origin option doesn't match the child; window.browser.test.ts > origins > connects to a cross-origin child when origin is the child origin |
| unit/windowMessenger.spec.ts > WindowMessenger > accepts repeated messages when the allowed origin regex uses the global flag | Doesn't apply: `origin` is one string, and there are no regular expressions. |
| unit/windowMessenger.spec.ts > WindowMessenger > accepts repeated messages when the allowed origin regex uses the sticky flag | Doesn't apply: no regular expressions. |
| unit/windowMessenger.spec.ts > WindowMessenger > ignores ACK2 without a MessagePort and keeps port disconnected | Doesn't apply: `Rpc.window` hands over no MessagePort. |
| unit/windowMessenger.spec.ts > WindowMessenger > sends non-handshake messages over MessagePort after ACK2 includes a port | Doesn't apply: data messages go through `window.postMessage` with the same source and origin checks as the handshake. |
| unit/windowMessenger.spec.ts > WindowMessenger > closes previous inbound MessagePort when ACK2 includes a replacement port | Doesn't apply: no MessagePort handover. |
| unit/windowMessenger.spec.ts > WindowMessenger > keeps existing inbound MessagePort when ACK2 has no MessagePort | Doesn't apply: no MessagePort handover. |
| unit/windowMessenger.spec.ts > WindowMessenger > closes previous outbound MessagePort when sending duplicate ACK2 | Doesn't apply: no MessagePort handover. |
| unit/workerMessenger.spec.ts > WorkerMessenger > keeps port disconnected when ACK2 has no MessagePort | Doesn't apply: `Rpc.port` posts straight to the Worker and has no handshake. |
| unit/workerMessenger.spec.ts > WorkerMessenger > sends over MessagePort after ACK2 contains a port | Doesn't apply: no MessagePort handover. If you want a port per connection, transfer one: window.browser.test.ts > channels > routes calls both ways for two connections to one worker over MessagePorts |
| unit/workerMessenger.spec.ts > WorkerMessenger > closes previous inbound MessagePort when ACK2 includes a replacement port | Doesn't apply: no MessagePort handover. |
| unit/workerMessenger.spec.ts > WorkerMessenger > keeps existing inbound MessagePort when ACK2 has no MessagePort | Doesn't apply: no MessagePort handover. |
| unit/workerMessenger.spec.ts > WorkerMessenger > closes previous outbound MessagePort when sending duplicate ACK2 | Doesn't apply: no MessagePort handover. |

### browser/communication.spec.ts (48: 16 contract tests × iframe, worker, port)

penpal's describe names are `communication between parent and child <type>` and `method call lifecycle between parent and child <type>`, with `<type>` = iframe, worker, port. Ours are `communication with <name>` and `method call lifecycle with <name>`: penpal's iframe is our "a cross-origin iframe", worker is "a module Worker", port is "a MessagePort", and we also run "a Worker over BroadcastChannel" and "a BroadcastChannel".

| penpal test (× iframe, worker, port) | Our test or reason |
| --- | --- |
| communication between parent and child `<type>` > calls a function on the child | contract.ts > communication with * > calls a method |
| communication between parent and child `<type>` > calls nested functions on the child | contract.ts > communication with * > calls methods of nested objects |
| communication between parent and child `<type>` > calls an asynchronous function on the child | contract.ts > communication with * > awaits a method that returns a promise |
| communication between parent and child `<type>` > treats nested apply, call, and bind calls as Function prototype method calls | Differs: contract.ts > communication with * > calls apply, call and bind of a method as remote methods. Every property of a remote method is another remote method, so `remote.multiply.call(...)` calls `multiply.call`, which doesn't exist (-32601). `Rpc.call(remote.multiply, [2, 5])` is how to pass arguments explicitly. |
| communication between parent and child `<type>` > treats top-level apply, call, and bind calls as remote method calls | contract.ts > communication with * > calls top-level methods named apply, call and bind |
| communication between parent and child `<type>` > handles transferables | Differs: contract.ts > communication with * > copies Uint8Array arguments and results with the identity codec. We never transfer, so the caller's buffer stays usable. |
| communication between parent and child `<type>` > handles a promised reply instance with a promised return value | Doesn't apply: no `Reply` class. A promise result is awaited: contract.ts > communication with * > awaits a method that returns a promise |
| communication between parent and child `<type>` > calls a function on the parent | contract.ts > communication with * > lets the remote call a method served by this side |
| communication between parent and child `<type>` > handles promises rejected with strings | Differs: contract.ts > communication with * > rejects with Rpc.RemoteError when a method rejects with a string. The caller gets an `Rpc.RemoteError` whose message is the string, not the string itself. |
| communication between parent and child `<type>` > handles promises rejected with objects | Differs: contract.ts > communication with * > rejects with Rpc.RemoteError when a method rejects with an object. The message is `String(value)`, `'[object Object]'`. Throw an `Rpc.RemoteError` with `data` to send an object. |
| communication between parent and child `<type>` > handles promises rejected with undefined | Differs: contract.ts > communication with * > rejects with Rpc.RemoteError when a method rejects with undefined (message `'undefined'`) |
| communication between parent and child `<type>` > handles promises rejected with error instances | Differs: contract.ts > communication with * > rejects with an error's message but not its name or stack |
| communication between parent and child `<type>` > handles thrown errors | contract.ts > communication with * > rejects when a method throws synchronously |
| communication between parent and child `<type>` > handles unclonable values | contract.ts > communication with * > rejects a call whose result cannot be cloned, and keeps working; contract.ts > communication with * > rejects a call whose result the codec cannot encode, and keeps working |
| communication between parent and child `<type>` > handles methods with periods in the name | contract.ts > communication with * > calls a method whose name contains a period |
| method call lifecycle between parent and child `<type>` > rejects method call promise if method call timeout is reached | contract.ts > method call lifecycle with * > rejects a call with signal.reason when its signal times out |
| method call lifecycle between parent and child `<type>` > rejects method call promise if connection is destroyed before a reply is received | contract.ts > method call lifecycle with * > rejects a pending call with signal.reason when the connection closes |

### Other browser tests (46)

| penpal test | Our test or reason |
| --- | --- |
| browser/connectionChannels.spec.ts > connection management: channels > connects to window in parallel with separate channels | window.browser.test.ts > channels > routes calls by channel both ways for two connections to one iframe |
| browser/connectionChannels.spec.ts > connection management: channels > connects to worker in parallel with separate channels | Differs: `Rpc.port` has no `channel` option. window.browser.test.ts > channels > routes calls both ways for two connections to one worker over MessagePorts |
| browser/connectionChannels.spec.ts > connection management: channels > connects through message ports in parallel with separate channels | Differs: one connection per `MessageChannel`. penpal.conformance.ts > connecting > serves separate connections over separate MessageChannels |
| browser/connectionChannels.spec.ts > connection management: channels > throws error when messenger is re-used | penpal.conformance.ts > connecting > throws when one transport is connected twice |
| browser/connectionLifecycle.spec.ts > connection management: lifecycle > keeps iframe connection alive after timeout duration elapses | window.browser.test.ts > handshake > keeps an established connection open after the time a call signal allowed. The opposite holds for the transport signal: window.browser.test.ts > handshake > closes an established connection when the transport signal aborts later |
| browser/connectionLifecycle.spec.ts > connection management: lifecycle > keeps worker connection alive after timeout duration elapses | Doesn't apply: `Rpc.port` has no handshake or connection timeout. penpal.conformance.ts > connecting > keeps working after the call timeout of an earlier call has passed |
| browser/connectionLifecycle.spec.ts > connection management: lifecycle > keeps port connection alive after timeout duration elapses | Doesn't apply: no handshake on ports. penpal.conformance.ts > connecting > keeps working after the call timeout of an earlier call has passed |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when correct origin is provided in parent | window.browser.test.ts > origins > connects to a cross-origin child when origin is the child origin |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when correct origin regex is provided in parent | Doesn't apply: no regular expressions. |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when matching origin is provided in child | window.browser.test.ts > origins > connects to a cross-origin child when origin is the child origin (the child passes the parent's origin). There are no origin lists. |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when matching origin regex is provided in child | Doesn't apply: no regular expressions. |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when incorrect origin is provided in parent | window.browser.test.ts > origins > doesn't connect when the parent's origin option doesn't match the child |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when mismatched origin is provided in child | window.browser.test.ts > origins > doesn't connect when the child's origin option doesn't match the parent |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when mismatched parent origin regex is provided in child | Doesn't apply: no regular expressions. The string case is window.browser.test.ts > origins > doesn't connect when the child's origin option doesn't match the parent |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when child redirects to a different origin and parent allowedOrigins is * | window.browser.test.ts > origins > connects to a child that navigated to another origin when origin is * |
| browser/connectionOrigins.spec.ts > connection management: origins > connects to window when parent and child are same-origin and neither side sets allowed origins | Doesn't apply: `origin` is required on both sides. Same-origin children: window.browser.test.ts > handshake > connects when the parent starts before the child page loads |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when child redirects to a different origin and parent omits allowed origins | window.browser.test.ts > origins > doesn't connect to a child that navigated away from the origin passed (the parent passes its own origin, which penpal uses when it is omitted) |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when child redirects to a different origin and parent sets a mismatched origin | window.browser.test.ts > origins > doesn't connect to a child that navigated away from the origin passed |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when child redirects to a different origin and parent sets a mismatched origin regex | Doesn't apply: no regular expressions. |
| browser/connectionOrigins.spec.ts > connection management: origins > doesn't connect to window when no origin is set in child | Doesn't apply: the child must pass `origin`. A child passing the wrong one: window.browser.test.ts > origins > doesn't connect when the child's origin option doesn't match the parent |
| browser/connectionReconnect.spec.ts > connection management: reconnect > reconnects after child reloads with a stateful allowed-origin regex | window.browser.test.ts > reconnecting > keeps working after the child reloads (without the regex, which we don't have). The parent's transport answers the reloaded child's hello, so the same remote keeps working. |
| browser/connectionReconnect.spec.ts > connection management: reconnect > reconnects after child navigates to a page with a different method set | window.browser.test.ts > reconnecting > calls the new page's methods after the child navigates |
| browser/connectionReconnect.spec.ts > connection management: reconnect > rejects method calls during reconnect with transmission error | Differs: window.browser.test.ts > reconnecting > leaves a call pending when the child reloads before answering. The parent doesn't know the child reloaded: a call posted while no page is listening, or that the old page didn't answer, stays pending until its signal aborts. |
| browser/connectionReconnect.spec.ts > connection management: reconnect > destroys the remote side when the parent destroys the connection | Differs: window.browser.test.ts > reconnecting > leaves the child's calls unanswered after the parent's signal aborts. No DESTROY message: the child's calls to the closed parent go unanswered until their signal aborts. |
| browser/connectionTargets.spec.ts > connection management: targets > connects to worker | contract.ts > communication with a module Worker > calls a method |
| browser/connectionTargets.spec.ts > connection management: targets > connects to window created with window.open() | window.browser.test.ts > targets > connects to a window opened with window.open |
| browser/connectionTargets.spec.ts > connection management: targets > connects to shared worker | window.browser.test.ts > targets > connects to a SharedWorker |
| browser/connectionTargets.spec.ts > connection management: targets > connects to service worker | window.browser.test.ts > targets > connects to a service worker over a transferred MessagePort |
| browser/connectionTimeouts.spec.ts > connection management: timeout behavior across messengers > times out for non-responsive iframe targets | window.browser.test.ts > handshake > gives up on a child that never answers when the call signal times out |
| browser/connectionTimeouts.spec.ts > connection management: timeout behavior across messengers > times out for non-responsive worker targets | window.browser.test.ts > closing > gives up on a worker that never answers when the call signal times out |
| browser/connectionTimeouts.spec.ts > connection management: timeout behavior across messengers > times out for message ports without a remote participant | penpal.conformance.ts > connecting > rejects a call with signal.reason when nothing listens on the other port |
| browser/destroy.spec.ts > parent calling destroy() > when child is iframe > rejects the connection promise when destroyed before establishment | window.browser.test.ts > closing > rejects calls with signal.reason when the signal aborts during the handshake |
| browser/destroy.spec.ts > parent calling destroy() > when child is iframe > prevents method calls from being sent | window.browser.test.ts > closing > rejects calls to an iframe made after the signal aborted with signal.reason. Ours rejects the returned promise, where penpal throws synchronously. |
| browser/destroy.spec.ts > parent calling destroy() > when child is worker > rejects the connection promise when destroyed before establishment | window.browser.test.ts > closing > rejects calls with signal.reason when the signal aborts before a worker answers |
| browser/destroy.spec.ts > parent calling destroy() > when child is worker > prevents method calls from being sent | window.browser.test.ts > closing > rejects calls to a worker made after the signal aborted with signal.reason |
| browser/destroy.spec.ts > parent calling destroy() > when child is port > rejects the connection promise when destroyed before establishment | penpal.conformance.ts > connecting > rejects calls with signal.reason when the signal aborted before connecting |
| browser/destroy.spec.ts > parent calling destroy() > when child is port > prevents method calls from being sent | contract.ts > method call lifecycle with a MessagePort > rejects calls made after the connection closed with signal.reason |
| browser/destroy.spec.ts > parent calling destroy() > removes method listener from window | window.browser.test.ts > closing > removes its message listener from window when the signal aborts |
| browser/destroy.spec.ts > parent calling destroy() > removes method listener from worker | window.browser.test.ts > closing > removes its message listener from a Worker when the signal aborts |
| browser/destroy.spec.ts > parent calling destroy() > removes method listener from message port | penpal.conformance.ts > serving methods > removes its message listener from the port when its signal aborts |
| browser/injectedContent.spec.ts > connects and calls a function on the child iframe when src is set to data URI and allowed origin is set to * | window.browser.test.ts > origins > connects to a data URL child, which has an opaque origin, when origin is * |
| browser/injectedContent.spec.ts > never connects iframe when src is set to data URI and allowed origin is not set | window.browser.test.ts > origins > doesn't connect to a data URL child when origin is the parent's origin |
| browser/injectedContent.spec.ts > connects and calls a function on the child worker when src is set to data URI | window.browser.test.ts > targets > connects to a Worker created from a data URL |
| browser/injectedContent.spec.ts > connects and calls a function on the child iframe when src is set to an object URL | window.browser.test.ts > origins > connects to a blob URL child, which has the parent origin |
| browser/injectedContent.spec.ts > connects and calls a function on the child worker when src is set to an object URL | window.browser.test.ts > targets > connects to a Worker created from a blob URL |
| browser/injectedContent.spec.ts > connects and calls a function on the child iframe when srcdoc is set | window.browser.test.ts > origins > connects to a srcdoc child, which has the parent origin |

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| json-rpc-2.0 answers a batch of one request with a bare object, not an array. | An array of one response. | `json-rpc > server > answers a batch of one request with an array of one response` |
| json-rpc-2.0 answers an all-notification batch with `null`. | Nothing is written. | `spec > rpc call Batch (all notifications)` |
| json-rpc-2.0 throws a `TypeError` for a `null` message, alone or inside a batch, instead of answering. | Invalid Request. | `json-rpc > server > answers Invalid Request for objects that are not requests`, `json-rpc > server > answers a batch of a valid and an invalid request with both responses` |
| json-rpc-2.0 answers a non-string `method` with `-32601` and accepts ids of any type. | Invalid Request (`-32600`), as the specification says. | `spec > rpc call with invalid Request object`, `json-rpc > server > answers Invalid Request for objects that are not requests` |
| json-rpc-2.0 sends thrown errors with code `0`, which the specification doesn't define. | `-32603`. | `connect > errors > sends any other thrown or rejected error as -32603 with its message` |
| json-rpc-2.0's two `index.spec.ts` tests assert nothing. | Both cases have real tests. | see above |
| birpc's and json-rpc-2.0's timeouts reject the caller but leave the method running on the other side. | Aborting a call sends `$/cancel`, which aborts the method's signal. | `connect > cancellation > aborting a call rejects it and aborts the signal the method received` |
| comlink and birpc call any property accessed through the proxy, including `constructor` and other `Object.prototype` names, if the exposed object has them through its prototype. | Only own properties and class methods, never `Object.prototype` names or `rpc.*`. | `connect > errors > does not call rpc.* methods or names inherited from Object.prototype` |

### penpal

From penpal's issue tracker (61 issues, all closed, read on 2026-10-18).

- [#18](https://github.com/Aaronius/penpal/issues/18) Parent methods ran once more after each child reload (fixed in 3.0.2). One listener per transport, so a reloaded child adds no handlers: window.browser.test.ts > reconnecting > runs a parent method once per call after the child reloads twice
- [#58](https://github.com/Aaronius/penpal/issues/58) A child that navigates to a page without penpal leaves calls hanging, and the connection timeout doesn't help because it covers only the handshake. A call's own signal covers this: window.browser.test.ts > reconnecting > rejects a call with signal.reason after the child navigates to a page that never connects
- [#109](https://github.com/Aaronius/penpal/issues/109) Calls made while a child reloads failed with "You've hit a bug in Penpal: Port is undefined" (7.0.5 changed it to TRANSMISSION_FAILED). We have no port to lose. The call is posted, and it stays pending if no page answers: window.browser.test.ts > reconnecting > leaves a call pending when the child reloads before answering
- [#85](https://github.com/Aaronius/penpal/issues/85) "Cannot read properties of null (reading 'postMessage')" after the iframe is removed. We keep the `WindowProxy` passed in, so posting to a removed iframe doesn't throw, and a call's signal ends the wait: window.browser.test.ts > reconnecting > rejects a call with signal.reason after the iframe is removed
- [#33](https://github.com/Aaronius/penpal/issues/33) A sandboxed iframe without `allow-same-origin` has the opaque origin `null`, and penpal's default origin check refused it. `'*'` accepts it: window.browser.test.ts > origins > connects to a sandboxed child, which has an opaque origin, when origin is *
- [#3](https://github.com/Aaronius/penpal/issues/3) Several children on the same origin. Messages are matched by `event.source`, so a sibling's messages are ignored: window.browser.test.ts > origins > ignores messages from a window other than the target
- [#56](https://github.com/Aaronius/penpal/issues/56) Passing an object with a function throws a `DataCloneError`. The default JSON codec drops function properties instead: penpal.conformance.ts > sending calls > drops function properties of an argument with the JSON codec. With the identity codec the call rejects with the `DataCloneError` and the connection keeps working: penpal.conformance.ts > sending calls > rejects a call whose arguments cannot be cloned, and keeps working
- [#15](https://github.com/Aaronius/penpal/issues/15) Errors as rejection reasons. We send the message and, for `Rpc.RemoteError`, `code` and `data`, but not the name or stack: contract.ts > communication with * > rejects with an error's message but not its name or stack
- [#113](https://github.com/Aaronius/penpal/issues/113) `postMessage` threw while sending SYN (iOS 13). `Rpc.window` used to throw that error out of the `Rpc.window` call, or out of a timer on a retry. It now fails the transport: window.browser.test.ts > handshake > rejects calls with Rpc.TransportError when posting to the target throws
- [#111](https://github.com/Aaronius/penpal/issues/111) Task cancellation was a feature request. We send `$/cancel` when a call's signal aborts: contract.ts > communication with * > runs the remote generator's finally block when the loop breaks, and contract.ts > method call lifecycle with * > rejects a call with signal.reason when its signal times out

Not from penpal, found while porting: a `BroadcastChannel` doesn't buffer, so calls posted before the other side opens its channel are lost and stay pending: window.browser.test.ts > BroadcastChannel > loses calls posted before the other side opens its BroadcastChannel

## Oracle differences

Each one is asserted in `packages/rpc/test/rpc.oracle.test.ts` (describe "server follows the spec where JSONRPCServer does not", and "client sends the same bytes as JSONRPCClient"). Both outputs are pinned, so a change on either side fails the test. Upstream output is `JSON.stringify(await server.receiveJSON(text))`. Ours is the exact text written to a transport and the body of `Rpc.handler`'s response.

Everything else compared byte for byte is identical, including key order: single requests, by-name and positional params, nested `a.b` methods, unknown methods, `toString`/`__proto__`, string/number/fractional/negative/null ids, results of every JSON type, `undefined` as `null`, `RemoteError` vs `JSONRPCErrorException` with code and data (including falsy data), parse errors, empty batch, batches with two or more responses, duplicate ids, notifications, and 300 seeded random messages and batches.

### Server

| Input | json-rpc-2.0 | Ours | Why ours follows the spec |
| --- | --- | --- | --- |
| `[{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}]` (batch of one request) | `{"jsonrpc":"2.0","id":1,"result":3}` | `[{"jsonrpc":"2.0","id":1,"result":3}]` | Spec section 6: the server returns an Array containing the Response objects for a batch. Upstream unwraps any batch that yields exactly one response. |
| Batch of one request among notifications | bare object | one-element array | Same rule. |
| `[1]` | bare Invalid Request object | `[{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}]` | Same rule. |
| Batch of notifications only | resolves `null` (README sends 204) | writes nothing, and `Rpc.handler` answers 204 | Spec: "there should be no response". Equivalent on the wire, but pinned because upstream's API returns `null`. |
| `crash('boom')` throws `new Error('boom')` | `{"code":0,"message":"boom"}` | `{"code":-32603,"message":"boom"}` | 0 is outside the spec's error codes, and -32603 is "Internal error". |
| Method throws the string `'boom'` | `{"code":0,"message":"An unexpected error occurred"}` | `{"code":-32603,"message":"boom"}` | Same code rule, and ours keeps `String(e)` as the message. |
| `{"jsonrpc":"2.0","id":1,"method":5}` (also `method: null`) | `id:1`, `-32601 Method not found` | `id:null`, `-32600 Invalid Request` | Spec: `method` MUST be a String, so the object is not a valid Request. |
| `id: {"a":1}` or `id: true` | runs the method and echoes the id | `id:null`, `-32600` | Spec: an id MUST be a String, Number or Null. |
| `params: "str"` or `params: null` | passes the value to the method | `-32600` | Spec: `params` MUST be a Structured value (array or object) when present. |
| `{"jsonrpc":"1.0","id":7,"method":"echo"}` | `-32600` with `id:7` | `-32600` with `id:null` | Spec, Response object: if there was an error detecting the id (e.g. Invalid Request) the id MUST be Null. Both readings are defensible, and ours matches the spec's examples. |
| JSON text `null`, `0`, `false`, `""` | `-32700 Parse error` | `-32600 Invalid Request` | The text parses as valid JSON that isn't a Request object. Upstream treats any falsy parse result as a parse failure. |
| `[null, {valid request}]` | `receiveJSON` rejects with `TypeError` (no response at all) | `[{-32600, id:null}, {result}]` | Spec: each invalid element gets its own Invalid Request response. |
| `rpc.ping` registered as a method | runs it | `-32601` | Spec: names starting with `rpc.` are reserved for rpc-internal methods. |
| `RemoteError` with `data: null` | omits `data` | `"data":null` | Spec: `data` is a primitive or structured value defined by the server, and `null` is a value. Ours sends what the method gave and omits only `undefined`. |
| Request with an extra `result` member: `{"jsonrpc":"2.0","id":1,"method":"echo","params":[1],"result":5}` | `-32600` | runs it: `{"result":1}` | The spec is silent on extra members. Ours ignores them (only `$/stream*` messages with `method` are routed to the client side). Listed so the difference is visible, not as a spec argument. |

### Client

| Input | JSONRPCClient | Ours | Why |
| --- | --- | --- | --- |
| `Rpc.call(remote.nothing, [])` vs `client.request('nothing', [])` | `{"jsonrpc":"2.0","id":1,"method":"nothing","params":[]}` | `{"jsonrpc":"2.0","id":1,"method":"nothing"}` | Spec: `params` MAY be omitted. A method that takes no arguments gets the same call either way. |
| `Rpc.notify(remote.log, [])` vs `client.notify('log', [])` | `{"jsonrpc":"2.0","method":"log","params":[]}` | `{"jsonrpc":"2.0","method":"log"}` | Same. |

All other client requests and notifications (positional, by name, nested, non-ASCII, HTTP batch body with a notification) are byte-identical once ids are normalized (both start at 1 anyway).

Interop: our `Rpc.connect` and `Rpc.http` clients resolve and reject correctly against `JSONRPCServer`, including its bare-object one-response batch, its code 0 errors (which reject with a `RemoteError` with `code: 0`), and `$/cancel` (a notification it ignores). `JSONRPCClient` works against our server over a transport and over `Rpc.handler`, including `requestAdvanced` batches of one.
