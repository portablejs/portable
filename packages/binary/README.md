# @portable/binary

Reads and writes integers, varints, and strings in binary data, and splits byte streams into length-prefixed frames. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [smart-buffer](https://www.npmjs.com/package/smart-buffer), [varint](https://www.npmjs.com/package/varint), [it-length-prefixed](https://www.npmjs.com/package/it-length-prefixed), and [length-prefixed-stream](https://www.npmjs.com/package/length-prefixed-stream).

```sh
npm install @portable/binary
```

This example reads and writes Minecraft packets, which are a VarInt length followed by a VarInt packet id and the packet's fields:

```ts
import * as Binary from '@portable/binary';
import * as Streams from '@portable/streams';

const packets = socket.readable.pipeThrough(new Binary.FrameDecoderStream({ maxBytes: 2_097_151 }));
for await (const packet of Streams.toAsyncIterable(packets)) {
  const reader = Binary.createReader(packet);
  const id = reader.varint();
  if (id === 0x00) {
    const protocol = reader.varint() | 0;
    const host = reader.string(reader.varint());
    const port = reader.uint16();
    console.log(protocol, host, port);
  }
}

const writer = Binary.createWriter();
writer.varint(0x00);
writer.varint(767);
writer.varint(Binary.utf8Length('mc.example.com'));
writer.string('mc.example.com');
writer.uint16(25565);
writer.varint(1);

const frames = new Binary.FrameEncoderStream();
frames.readable.pipeTo(socket.writable);
await frames.writable.getWriter().write(writer.toBytes());
```

## Reading

`Binary.createReader(bytes, options)` returns a `Reader` that reads values one after another from a `Uint8Array`. Each read moves `reader.offset` past the value. A read that fails throws and leaves `offset` where it was, so you can catch a `Binary.TruncatedError`, wait for more bytes and try again. The reader doesn't copy `bytes`.

| Option | Default | Description |
| --- | --- | --- |
| `endian` | `'big'` | Byte order of multi-byte values. `'big'` is network byte order. |

| Member | Returns | Description |
| --- | --- | --- |
| `uint8()`, `int8()`, `uint16()`, `int16()`, `uint32()`, `int32()` | `number` | An integer of 1, 2, or 4 bytes. |
| `bigUint64()`, `bigInt64()` | `bigint` | A 64-bit integer. |
| `float32()`, `float64()` | `number` | An IEEE 754 float. |
| `uint(byteLength)`, `int(byteLength)` | `number` | An integer of 1 to 6 bytes, such as the 24-bit lengths in TLS. |
| `varint(options)` | `number` | A varint that fits in a safe integer. A larger one throws `Binary.InvalidInputError`. |
| `bigVarint(options)` | `bigint` | A varint of up to 64 bits. |
| `bytes(byteLength)` | `Uint8Array` | The next bytes, as a view of the reader's bytes. Copy them with `.slice()` to keep them after the input changes. |
| `string(byteLength, options)` | `string` | The next bytes, decoded as UTF-8. A leading byte order mark is kept. |
| `cstring(options)` | `string` | UTF-8 up to the next zero byte. `offset` moves past the zero byte. |
| `skip(byteLength)` | | Moves `offset` forward. |
| `offset` | `number` | Where the next read starts. You can set it to any position from 0 to `length`. |
| `endian` | `'big' \| 'little'` | The byte order. You can change it between reads. |
| `length` | `number` | The number of bytes the reader was created with. |
| `remaining` | `number` | `length - offset`. |

`varint` and `bigVarint` take an `encoding` option, which defaults to `'unsigned'`:

| `encoding` | Format | Used by |
| --- | --- | --- |
| `'unsigned'` | LEB128 | protobuf `uint32`, `uint64`, and `int64`; Minecraft VarInt and VarLong; WebAssembly `u32` |
| `'zigzag'` | 0, -1, 1, -2 stored as 0, 1, 2, 3 | protobuf `sint32` and `sint64` |
| `'signed'` | SLEB128 | WebAssembly `i32` and `i64`, DWARF |

`string` and `cstring` take `fatal`, which defaults to `false`. With `fatal: true`, malformed UTF-8 throws `Binary.InvalidInputError` instead of decoding to U+FFFD.

## Writing

`Binary.createWriter(options)` returns a `Writer` with a buffer that grows as you write. It takes the same `endian` option as `createReader`, and each read method has a write method of the same name that takes the value: `writer.uint16(value)`, `writer.uint(byteLength, value)`, `writer.varint(value, options)`, `writer.bytes(value)`, `writer.string(text)`, and `writer.cstring(text)`. `writer.toBytes()` returns a copy of the bytes written so far.

A value that doesn't fit its type throws a `RangeError` and writes nothing, as `Buffer.writeUInt8(256)` does. `DataView.setUint8(0, 256)` writes 0 instead. A value of the wrong type, such as a number passed to `bigUint64`, throws a `TypeError`. `string` writes only the UTF-8 bytes, so write the length first with `Binary.utf8Length(text)`. `cstring` throws a `RangeError` for text that contains U+0000.

To fill in a length after writing what it counts, set `offset` back, write the length, and set `offset` to `length` to continue at the end:

```ts
import * as Binary from '@portable/binary';

const writer = Binary.createWriter();
writer.uint32(0);
writer.string('hello');
writer.cstring('world');
const end = writer.offset;
writer.offset = 0;
writer.uint32(end - 4);
writer.offset = writer.length;
```

`length` counts up to the furthest byte any write reached, so writing at an earlier offset doesn't shorten the output.

## `Binary.utf8Length(text)`

Returns the number of bytes in the UTF-8 encoding of `text` without encoding it. A lone surrogate counts as 3 bytes, because `TextEncoder` and `writer.string` write it as U+FFFD.

## Frames

`Binary.FrameDecoderStream` is a `TransformStream<Uint8Array, Uint8Array>` that reads a length prefix and that many bytes, and emits the bytes without the prefix. A frame can arrive split across chunks, and one chunk can hold many frames. Each frame is a copy, so it stays valid after later chunks arrive. `Binary.FrameEncoderStream` does the reverse: for each chunk, it writes one output chunk with the length prefix followed by the chunk's bytes.

| Option | Default | Description |
| --- | --- | --- |
| `prefix` | `'varint'` | `'uint8'`, `'uint16'`, `'uint32'`, or `'varint'`. The length counts only the frame's bytes, not the prefix. |
| `endian` | `'big'` | Byte order of a `uint16` or `uint32` prefix. |
| `maxBytes` | `Infinity` | `FrameDecoderStream` only. The largest frame, not counting the prefix. A larger length errors the stream with `Binary.MaxBytesError` as soon as the prefix is read, before any of the frame is buffered. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

`FrameDecoderStream` errors with `Binary.TruncatedError` if the input ends inside a frame or a prefix, and with `Binary.InvalidInputError` if a varint prefix is longer than 10 bytes. `FrameEncoderStream` errors with `Binary.InvalidInputError` for a chunk too long for its prefix, such as 256 bytes with `prefix: 'uint8'`.

## Errors

| Error | Thrown when |
| --- | --- |
| `Binary.TruncatedError` | A read needs more bytes than remain, or a stream ends inside a frame. `offset` is where the value or frame starts. |
| `Binary.InvalidInputError` | A varint is longer than 10 bytes or too large for its type, `fatal` text isn't valid UTF-8, or a frame is too long for its prefix. |
| `Binary.MaxBytesError` | A frame's length is larger than `maxBytes`. `maxBytes` holds the limit. |

## Types

| Type | Description |
| --- | --- |
| `Binary.Reader` | What `createReader` returns. `Binary.Reader.VarintOptions` and `Binary.Reader.StringOptions` are the types of its methods' options. |
| `Binary.Writer` | What `createWriter` returns. `Binary.Writer.VarintOptions` is the type of the options that `varint` and `bigVarint` take. |
| `Binary.Endian` | `'big' \| 'little'`. |
| `Binary.VarintEncoding` | `'unsigned' \| 'zigzag' \| 'signed'`. |
| `Binary.Prefix` | `'uint8' \| 'uint16' \| 'uint32' \| 'varint'`. |

## Why use this over smart-buffer, varint, and it-length-prefixed

smart-buffer wraps a Node `Buffer`, so a browser or a Worker needs a `Buffer` polyfill to run it. varint and it-length-prefixed work everywhere, but it-length-prefixed reads iterables of `Uint8ArrayList` instead of streams and installs six other packages. `@portable/binary` uses only `Uint8Array`, `DataView`, `TextEncoder`, and Web Streams, and covers all three jobs.

- In Node, it wrote mixed records about 5 times as fast as smart-buffer and read them about 10 times as fast. It encoded and decoded unsigned varints slightly faster than `@bufbuild/protobuf`, and 18 to 38 times as fast as varint.
- `FrameDecoderStream` split frames at about half the speed of it-length-prefixed, because each frame passes through a `TransformStream` queue, which costs more than an async generator's `yield`.
- varint's `decode` throws the same `RangeError` for a truncated varint and for one longer than 8 bytes, and it returns rounded values from 2<sup>53</sup> to 2<sup>56</sup>: the bytes for 2<sup>53</sup> + 1 decode to 2<sup>53</sup>. `reader.varint()` throws `Binary.TruncatedError` for a truncated varint and `Binary.InvalidInputError` for one past the safe integer range, so it never returns a rounded value. Use `bigVarint` for 64-bit values.
- `bigVarint` throws `Binary.InvalidInputError` for a 10-byte varint with bits above 64, where `@bufbuild/protobuf` keeps the low 64 bits.
- smart-buffer's write methods take an optional offset that inserts at that position and shifts later bytes along. Here a write at an earlier `offset` overwrites the bytes there, so you can go back and fill in a length.
- `string` keeps a leading byte order mark. `TextDecoder` and `Buffer.toString` remove it by default.
- A Minecraft VarInt and a protobuf `int32` encode negative numbers differently. Read a Minecraft VarInt with `reader.varint() | 0` and write it with `writer.varint(value >>> 0)`. A negative protobuf `int32` is 10 bytes: write it with `writer.bigVarint(BigInt.asUintN(64, BigInt(value)))`.
- `FrameDecoderStream` checks `maxBytes` as soon as it reads the length, so a peer can't make it buffer a large frame before the check. Its default is `Infinity`, while it-length-prefixed rejects frames over 4 MB by default, so set `maxBytes` when the input comes from the network.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Write 1,000 mixed records</th></tr>
<tr><td>@portable/binary</td><td align="right">6,250</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>smart-buffer</td><td align="right">1,110</td><td>5.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="28" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read 1,000 mixed records</th></tr>
<tr><td>@portable/binary</td><td align="right">8,630</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>DataView</code> and <code>TextDecoder</code></td><td align="right">1,390</td><td>6.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="26" height="12" alt="" /></td></tr>
<tr><td>smart-buffer</td><td align="right">878</td><td>9.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="16" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 10,000 varints</th></tr>
<tr><td>@portable/binary</td><td align="right">4,740</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@bufbuild/protobuf</td><td align="right">4,370</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="148" height="12" alt="" /></td></tr>
<tr><td>varint</td><td align="right">255</td><td>19× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="9" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 10,000 varints</th></tr>
<tr><td>@portable/binary</td><td align="right">18,600</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@bufbuild/protobuf</td><td align="right">15,600</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="134" height="12" alt="" /></td></tr>
<tr><td>varint</td><td align="right">492</td><td>38× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="4" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Split 2,000 frames from a stream</th></tr>
<tr><td>it-length-prefixed</td><td align="right">1,080</td><td>1.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/binary</td><td align="right">575</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="85" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Write 2,000 frames to a stream</th></tr>
<tr><td>it-length-prefixed</td><td align="right">456</td><td>1.5× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/binary</td><td align="right">305</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="107" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.1, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/binary, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/binary | – | 4.7 kB | 3 | none | included |
| smart-buffer | 4.2.0 | 3.1 kB | 0 | `buffer` | included |
| varint | 6.0.0 | 0.8 kB | 0 | none | `@types/varint` |
| @bufbuild/protobuf | 2.16.0 | 3.4 kB | 0 | none | included |
| it-length-prefixed | 11.0.1 | 3.0 kB | 6 | none | included |
| `DataView` and `TextDecoder` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
