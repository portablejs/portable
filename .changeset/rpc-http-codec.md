---
'@portable/rpc': minor
---

`Rpc.handler` and `Rpc.http` take a `codec` option, as `Rpc.connect` does, so HTTP can carry CBOR or another format instead of JSON. Codecs have a new optional `contentType`, which `handler` and `http` send as the `content-type` header. `Rpc.json` sets it to `application/json`. `handler` sends streamed results as one message per line. `JSON.stringify` writes a message without line breaks, but a binary encoding can contain the newline byte, so `handler` streams only when the codec's `contentType` is `application/json`. With any other codec, a method that returns a stream is answered with error code `-32603`.

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
