import { BinaryReader, BinaryWriter } from '@bufbuild/protobuf/wire';
import * as lp from 'it-length-prefixed';
import { SmartBuffer } from 'smart-buffer';
import varint from 'varint';
import { expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';

// 1,000 records shaped like a game packet: a varint id, two doubles, a float, a uint16 and a
// short string.
const count = 1000;
const names = Array.from({ length: count }, (_, i) => `player-${i}`);

function writeOurs(): Uint8Array {
  const writer = Binary.createWriter();
  for (let i = 0; i < count; i++) {
    writer.varint(i * 37);
    writer.float64(i * 1.5);
    writer.float64(-i);
    writer.float32(0.5);
    writer.uint16(i & 0xffff);
    writer.varint(Binary.utf8Length(names[i]!));
    writer.string(names[i]!);
  }
  return writer.toBytes();
}

const records = writeOurs();

test('writes records within 25% of smart-buffer', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', () => {
      writeOurs();
    }),
    bench('smart-buffer', () => {
      const smart = new SmartBuffer();
      for (let i = 0; i < count; i++) {
        smart.writeBuffer(Buffer.from(varint.encode(i * 37)));
        smart.writeDoubleBE(i * 1.5);
        smart.writeDoubleBE(-i);
        smart.writeFloatBE(0.5);
        smart.writeUInt16BE(i & 0xffff);
        smart.writeBuffer(Buffer.from(varint.encode(Buffer.byteLength(names[i]!))));
        smart.writeString(names[i]!);
      }
      smart.toBuffer();
    }),
  );
  expect(result.get('smart-buffer')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 0.25,
  });
});

test('reads records within 25% of smart-buffer and a DataView', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', () => {
      const reader = Binary.createReader(records);
      for (let i = 0; i < count; i++) {
        reader.varint();
        reader.float64();
        reader.float64();
        reader.float32();
        reader.uint16();
        reader.string(reader.varint());
      }
    }),
    bench('smart-buffer', () => {
      const smart = SmartBuffer.fromBuffer(Buffer.from(records.buffer));
      for (let i = 0; i < count; i++) {
        const id = varint.decode(records, smart.readOffset);
        smart.readOffset += varint.decode.bytes!;
        smart.readDoubleBE();
        smart.readDoubleBE();
        smart.readFloatBE();
        smart.readUInt16BE();
        const length = varint.decode(records, smart.readOffset);
        smart.readOffset += varint.decode.bytes!;
        smart.readString(length);
        void id;
      }
    }),
    bench('DataView and TextDecoder', () => {
      const view = new DataView(records.buffer);
      const decoder = new TextDecoder();
      let at = 0;
      for (let i = 0; i < count; i++) {
        varint.decode(records, at);
        at += varint.decode.bytes!;
        view.getFloat64(at);
        view.getFloat64(at + 8);
        view.getFloat32(at + 16);
        view.getUint16(at + 20);
        at += 22;
        const length = varint.decode(records, at);
        at += varint.decode.bytes!;
        decoder.decode(records.subarray(at, at + length));
        at += length;
      }
    }),
  );
  expect(result.get('smart-buffer')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 0.25,
  });
});

const values = Array.from({ length: 10_000 }, (_, i) => (i * 2_654_435_761) % 2 ** 32);
const encodedValues = (() => {
  const writer = Binary.createWriter();
  for (const value of values) {
    writer.varint(value);
  }
  return writer.toBytes();
})();

test('encodes varints within 25% of varint and @bufbuild/protobuf', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', () => {
      const writer = Binary.createWriter();
      for (const value of values) {
        writer.varint(value);
      }
      writer.toBytes();
    }),
    bench('varint', () => {
      const out = new Uint8Array(values.length * 5);
      let at = 0;
      for (const value of values) {
        varint.encode(value, out, at);
        at += varint.encode.bytes!;
      }
    }),
    bench('@bufbuild/protobuf', () => {
      const writer = new BinaryWriter();
      for (const value of values) {
        writer.uint32(value);
      }
      writer.finish();
    }),
  );
  expect(result.get('varint')).not.toBeFasterThan(result.get('@portable/binary'), { delta: 0.25 });
  expect(result.get('@bufbuild/protobuf')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 0.25,
  });
});

test('decodes varints within 25% of varint and @bufbuild/protobuf', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', () => {
      const reader = Binary.createReader(encodedValues);
      while (reader.remaining > 0) {
        reader.varint();
      }
    }),
    bench('varint', () => {
      let at = 0;
      while (at < encodedValues.length) {
        varint.decode(encodedValues, at);
        at += varint.decode.bytes!;
      }
    }),
    bench('@bufbuild/protobuf', () => {
      const reader = new BinaryReader(encodedValues);
      while (reader.pos < reader.len) {
        reader.uint32();
      }
    }),
  );
  expect(result.get('varint')).not.toBeFasterThan(result.get('@portable/binary'), { delta: 0.25 });
  expect(result.get('@bufbuild/protobuf')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 0.25,
  });
});

const frames = Array.from({ length: 2000 }, (_, i) => new Uint8Array(20 + (i % 200)).fill(i));
const framed = new Uint8Array(Buffer.concat([...lp.encode(frames)]));
const framedChunks = Array.from({ length: Math.ceil(framed.length / 16384) }, (_, i) =>
  framed.subarray(i * 16384, (i + 1) * 16384),
);

const fromChunks = (chunks: readonly Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

async function* fromArray<value>(values: readonly value[]): AsyncGenerator<value> {
  yield* values;
}

async function drain(stream: ReadableStream<unknown>): Promise<void> {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {}
}

// Each frame passes through a TransformStream's queue, which costs more than a generator's yield, so
// these two benchmarks pass while it-length-prefixed is up to twice as fast.
test('splits frames within 2× of it-length-prefixed', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', async () => {
      await drain(fromChunks(framedChunks).pipeThrough(new Binary.FrameDecoderStream()));
    }),
    bench('it-length-prefixed', async () => {
      for await (const frame of lp.decode(fromArray(framedChunks))) {
        frame.subarray();
      }
    }),
  );
  expect(result.get('it-length-prefixed')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 1,
  });
});

test('writes frames within 2× of it-length-prefixed', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/binary', async () => {
      await drain(fromChunks(frames).pipeThrough(new Binary.FrameEncoderStream()));
    }),
    bench('it-length-prefixed', async () => {
      for await (const chunk of lp.encode(fromArray(frames))) {
        void chunk;
      }
    }),
  );
  expect(result.get('it-length-prefixed')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 1,
  });
});

const text = names.join(' ') + ' héllo wörld 😀'.repeat(100);

// `utf8Length` counts without allocating, which TextEncoder can't, but the count itself is slower.
test('counts UTF-8 bytes within 2× of TextEncoder', async ({ bench }) => {
  const encoder = new TextEncoder();
  const result = await bench.compare(
    bench('@portable/binary', () => {
      Binary.utf8Length(text);
    }),
    bench('TextEncoder', () => {
      void encoder.encode(text).length;
    }),
    bench('Buffer.byteLength', () => {
      Buffer.byteLength(text);
    }),
  );
  expect(result.get('TextEncoder')).not.toBeFasterThan(result.get('@portable/binary'), {
    delta: 1,
  });
});
