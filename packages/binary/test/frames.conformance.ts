import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';
import { readAll, streamOf } from '@portable/fuzz';

const bytes = (...values: number[]) => new Uint8Array(values);

const decode = (chunks: Uint8Array[], options?: Binary.FrameDecoderStream.Options) =>
  readAll(streamOf(chunks).pipeThrough(new Binary.FrameDecoderStream(options)));

const encode = (frames: Uint8Array[], options?: Binary.FrameEncoderStream.Options) =>
  readAll(streamOf(frames).pipeThrough(new Binary.FrameEncoderStream(options)));

describe('FrameDecoderStream', () => {
  test('splits varint-prefixed frames by default', async () => {
    expect(await decode([bytes(2, 0xa, 0xb, 0, 1, 0xc)])).toEqual([
      bytes(0xa, 0xb),
      bytes(),
      bytes(0xc),
    ]);
  });

  test('joins a frame and its prefix split across chunks', async () => {
    const long = new Uint8Array(300).fill(5);
    const input = new Uint8Array([0xac, 0x02, ...long, 1, 9]);
    const chunks = [input.subarray(0, 1), input.subarray(1, 100), input.subarray(100)];
    expect(await decode(chunks)).toEqual([long, bytes(9)]);
  });

  test('reads each fixed-size prefix in either byte order', async () => {
    expect(await decode([bytes(1, 7)], { prefix: 'uint8' })).toEqual([bytes(7)]);
    expect(await decode([bytes(0, 1, 7)], { prefix: 'uint16' })).toEqual([bytes(7)]);
    expect(await decode([bytes(1, 0, 7)], { prefix: 'uint16', endian: 'little' })).toEqual([
      bytes(7),
    ]);
    expect(await decode([bytes(0, 0, 0, 1, 7)], { prefix: 'uint32' })).toEqual([bytes(7)]);
    expect(await decode([bytes(1, 0, 0, 0, 7)], { prefix: 'uint32', endian: 'little' })).toEqual([
      bytes(7),
    ]);
  });

  test('emits copies that later chunks do not change', async () => {
    const chunk = bytes(1, 7);
    const stream = new Binary.FrameDecoderStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    void writer.write(chunk);
    const { value } = await reader.read();
    chunk[1] = 8;
    expect(value).toEqual(bytes(7));
    expect(value!.buffer).toBeInstanceOf(ArrayBuffer);
  });

  test('fails with MaxBytesError as soon as it reads a prefix over maxBytes', async () => {
    const stream = new Binary.FrameDecoderStream({ prefix: 'uint32', maxBytes: 10 });
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    void writer.write(bytes(0, 0, 0, 11)).catch(() => {});
    const error = await reader.read().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Binary.MaxBytesError);
    expect((error as Binary.MaxBytesError).maxBytes).toBe(10);
  });

  test('accepts a frame of exactly maxBytes', async () => {
    expect(await decode([bytes(2, 1, 2)], { maxBytes: 2 })).toEqual([bytes(1, 2)]);
  });

  test('fails with TruncatedError when the input ends inside a frame', async () => {
    const error = await decode([bytes(1, 5, 3, 1)]).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Binary.TruncatedError);
    expect((error as Binary.TruncatedError).offset).toBe(2);
  });

  test('fails with TruncatedError when the input ends inside a prefix', async () => {
    await expect(decode([bytes(0x80)])).rejects.toThrow(Binary.TruncatedError);
    await expect(decode([bytes(0)], { prefix: 'uint16' })).rejects.toThrow(Binary.TruncatedError);
  });

  test('fails with InvalidInputError for a varint prefix longer than 10 bytes', async () => {
    await expect(decode([new Uint8Array(11).fill(0x80)])).rejects.toThrow(Binary.InvalidInputError);
  });

  test('reports the stream offset of a bad varint prefix', async () => {
    const bad = new Uint8Array(11).fill(0x80);
    for (const chunks of [
      [bytes(1, 5, 2, 6, 7), bad],
      [bytes(1, 5, 2, 6), bytes(7, ...bad.subarray(0, 4)), bad.subarray(4)],
    ]) {
      const error = await decode(chunks).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Binary.InvalidInputError);
      expect((error as Binary.InvalidInputError).offset).toBe(5);
    }
  });

  test('throws a RangeError for invalid options', () => {
    expect(() => new Binary.FrameDecoderStream({ maxBytes: -1 })).toThrow(RangeError);
    expect(() => new Binary.FrameDecoderStream({ prefix: 'uint64' as never })).toThrow(RangeError);
    expect(() => new Binary.FrameDecoderStream({ endian: 'middle' as never })).toThrow(RangeError);
  });
});

describe('FrameEncoderStream', () => {
  test('writes each chunk with a varint prefix by default', async () => {
    expect(await encode([bytes(0xa, 0xb), bytes()])).toEqual([bytes(2, 0xa, 0xb), bytes(0)]);
    expect((await encode([new Uint8Array(300)]))[0]!.subarray(0, 2)).toEqual(bytes(0xac, 0x02));
  });

  test('writes each fixed-size prefix in either byte order', async () => {
    expect(await encode([bytes(7)], { prefix: 'uint8' })).toEqual([bytes(1, 7)]);
    expect(await encode([bytes(7)], { prefix: 'uint16' })).toEqual([bytes(0, 1, 7)]);
    expect(await encode([bytes(7)], { prefix: 'uint32', endian: 'little' })).toEqual([
      bytes(1, 0, 0, 0, 7),
    ]);
  });

  test('fails with InvalidInputError for a chunk too long for the prefix', async () => {
    await expect(encode([new Uint8Array(256)], { prefix: 'uint8' })).rejects.toThrow(
      Binary.InvalidInputError,
    );
    expect(await encode([new Uint8Array(255)], { prefix: 'uint8' })).toHaveLength(1);
  });

  test('round-trips through FrameDecoderStream', async () => {
    const frames = [bytes(1, 2, 3), bytes(), new Uint8Array(1000).fill(4)];
    for (const prefix of ['uint16', 'uint32', 'varint'] as const) {
      const encoded = await encode(frames, { prefix });
      expect(await decode(encoded, { prefix })).toEqual(frames);
    }
  });
});
