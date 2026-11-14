---
'@portable/rpc': minor
---

`Rpc.handler` and `Rpc.http` take a `codec` option, as `Rpc.connect` does, so HTTP can carry CBOR or another format instead of JSON. Codecs have a new optional `contentType`, which `handler` and `http` send as the `content-type` header. `Rpc.json` sets it to `application/json`. Results still stream with any codec. If the codec's `encode` returns a string, `handler` sends one message per line as `application/x-ndjson`, as before. If it returns bytes, `handler` sends the stream as `application/x-rpc-envelope`, with each message after a 5-byte header: a flags byte and a 32-bit big-endian length, as in the Connect protocol. `http` reads either framing, chosen by the response's `content-type`.

Code that uses JSON needs no change. To switch HTTP to CBOR, pass the same codec to both sides:

```ts
// Before: HTTP always used JSON.
const rpc = Rpc.handler(api);
const remote = Rpc.http<Api>(url);

// After
const codec = { encode: cbor.encode, decode: cbor.decode, contentType: 'application/cbor' };
const rpc = Rpc.handler(api, { codec });
const remote = Rpc.http<Api>(url, { codec });
```
