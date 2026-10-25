import { Buffer } from 'node:buffer';
import { PassThrough, Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, gunzipSync, gzipSync } from 'node:zlib';
import { byteForms, toByteForm } from '@portable/fuzz';
import * as NodeStreams from '@portable/streams/node';
import { describe, expect, test } from 'vite-plus/test';
import { collect, decode, delay, encode, fromChunks, pushable } from './utils.js';

const isPlain = (chunk: unknown) => Object.getPrototypeOf(chunk) === Uint8Array.prototype;

async function readNode(readable: Readable): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return chunks;
}

const closed = (stream: Readable | Writable) =>
  new Promise<void>((resolve) => {
    if (stream.closed) {
      resolve();
    } else {
      stream.once('close', () => resolve());
    }
  });

function sink(
  options: {
    highWaterMark?: number | undefined;
    delay?: number | undefined;
    objectMode?: boolean | undefined;
  } = {},
) {
  const chunks: unknown[] = [];
  const writable = new Writable({
    highWaterMark: options.highWaterMark ?? 16_384,
    objectMode: options.objectMode ?? false,
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      setTimeout(callback, options.delay ?? 0);
    },
  });
  return { chunks, writable };
}

describe('toWeb', () => {
  test('reads Buffer chunks as plain Uint8Arrays', async () => {
    const chunks = await collect(
      NodeStreams.toWeb(
        Readable.from([Buffer.from('ab'), Buffer.from('cd')], { objectMode: false }),
      ),
    );
    expect(chunks.every(isPlain)).toBe(true);
    expect(decode(Buffer.concat(chunks))).toBe('abcd');
  });

  test('reads a Buffer from a shared pool as a view of its own bytes', async () => {
    const pooled = Buffer.from('pooled');
    expect(pooled.byteOffset).toBeGreaterThan(0);
    const [chunk] = await collect(
      NodeStreams.toWeb(Readable.from([pooled], { objectMode: false })),
    );
    expect(isPlain(chunk)).toBe(true);
    expect(decode(chunk!)).toBe('pooled');
  });

  test('encodes strings from setEncoding back to the bytes they came from', async () => {
    const bytes = new Uint8Array([0, 0xff, 0x80, 0x41]);
    for (const encoding of ['hex', 'latin1', 'base64', 'utf8'] as const) {
      const readable = Readable.from([Buffer.from(bytes)], { objectMode: false });
      readable.setEncoding(encoding);
      const chunks = await collect(NodeStreams.toWeb(readable));
      const expected = encoding === 'utf8' ? Buffer.from(Buffer.from(bytes).toString()) : bytes;
      expect(new Uint8Array(Buffer.concat(chunks))).toEqual(new Uint8Array(expected));
    }
  });

  test('encodes string chunks of an object-mode Readable as UTF-8', async () => {
    const chunks = await collect(NodeStreams.toWeb(Readable.from(['é', 'a'])));
    expect(decode(Buffer.concat(chunks))).toBe('éa');
  });

  test('errors with a TypeError for a chunk that is not bytes, and destroys the Readable', async () => {
    const readable = Readable.from([{ id: 1 }]);
    await expect(collect(NodeStreams.toWeb(readable))).rejects.toThrow(TypeError);
    await closed(readable);
    expect(readable.destroyed).toBe(true);
  });

  test('reads from the Readable only when the stream is read', async () => {
    let reads = 0;
    const readable = new Readable({
      highWaterMark: 1024,
      read() {
        reads++;
        this.push(Buffer.alloc(1024));
      },
    });
    const stream = NodeStreams.toWeb(readable);
    await delay(20);
    expect(reads).toBeLessThanOrEqual(2);
    const reader = stream.getReader();
    await reader.read();
    await reader.read();
    await delay(20);
    expect(reads).toBeLessThanOrEqual(4);
    await reader.cancel();
  });

  test('errors with the error of the Readable', async () => {
    const error = new Error('disk');
    const readable = new Readable({ read() {} });
    const read = NodeStreams.toWeb(readable).getReader().read();
    readable.destroy(error);
    await expect(read).rejects.toBe(error);
  });

  test('errors when the Readable is destroyed before it ends', async () => {
    const readable = new Readable({ read() {} });
    const read = NodeStreams.toWeb(readable).getReader().read();
    readable.destroy();
    await expect(read).rejects.toMatchObject({ code: 'ERR_STREAM_PREMATURE_CLOSE' });
  });

  test('cancelling destroys the Readable with the reason', async () => {
    const reason = new Error('stop');
    const readable = new Readable({ read() {} });
    await NodeStreams.toWeb(readable).cancel(reason);
    await closed(readable);
    expect(readable.errored).toBe(reason);
  });

  test('aborting signal errors the stream and destroys the Readable', async () => {
    const controller = new AbortController();
    const readable = new Readable({ read() {} });
    const read = NodeStreams.toWeb(readable, { signal: controller.signal }).getReader().read();
    controller.abort(new Error('timeout'));
    await expect(read).rejects.toThrow('timeout');
    await closed(readable);
    expect(readable.destroyed).toBe(true);
  });

  test('an aborted signal errors the stream at once', async () => {
    const readable = Readable.from(['a']);
    const stream = NodeStreams.toWeb(readable, { signal: AbortSignal.abort(new Error('early')) });
    await expect(collect(stream)).rejects.toThrow('early');
  });

  test('closes when the Readable ends, and for an already ended Readable', async () => {
    const readable = Readable.from([]);
    await readNode(readable);
    expect(await collect(NodeStreams.toWeb(readable))).toEqual([]);
  });
});

describe('toWebObjects', () => {
  test('passes values through and turns Buffers into plain Uint8Arrays', async () => {
    const values = await collect(
      NodeStreams.toWebObjects(Readable.from([{ id: 1 }, 'text', 7, Buffer.from('ab')])),
    );
    expect(values.slice(0, 3)).toEqual([{ id: 1 }, 'text', 7]);
    expect(isPlain(values[3])).toBe(true);
    expect(values[3]).toEqual(encode('ab'));
  });

  test('reads one value each time the stream is read', async () => {
    let reads = 0;
    const readable = new Readable({
      objectMode: true,
      highWaterMark: 1,
      read() {
        this.push({ n: reads++ });
      },
    });
    const reader = NodeStreams.toWebObjects(readable).getReader();
    expect(await reader.read()).toEqual({ done: false, value: { n: 0 } });
    expect(await reader.read()).toEqual({ done: false, value: { n: 1 } });
    await delay(20);
    expect(reads).toBeLessThanOrEqual(4);
    await reader.cancel();
  });
});

describe('fromWeb', () => {
  test('reads bytes and strings as Buffer chunks', async () => {
    const readable = NodeStreams.fromWeb(fromChunks<unknown>([encode('ab'), 'cd']));
    const chunks = await readNode(readable);
    expect(chunks.every((chunk) => Buffer.isBuffer(chunk))).toBe(true);
    expect(Buffer.concat(chunks as Buffer[]).toString()).toBe('abcd');
  });

  for (const form of byteForms) {
    test(`reads a ${form} chunk`, async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const chunks = await readNode(NodeStreams.fromWeb(fromChunks([toByteForm(bytes, form)])));
      expect(new Uint8Array(Buffer.concat(chunks as Buffer[]))).toEqual(bytes);
    });
  }

  test('destroys the Readable with a TypeError for a chunk that is not bytes', async () => {
    await expect(readNode(NodeStreams.fromWeb(fromChunks([{ id: 1 }])))).rejects.toThrow(TypeError);
  });

  test('passes values through in object mode', async () => {
    const values = [{ id: 1 }, 'a', 2, [3]];
    expect(await readNode(NodeStreams.fromWeb(fromChunks(values), { objectMode: true }))).toEqual(
      values,
    );
  });

  test('destroys an object-mode Readable with a TypeError for a null chunk', async () => {
    const readable = NodeStreams.fromWeb(fromChunks([1, null, 2]), { objectMode: true });
    await expect(readNode(readable)).rejects.toThrow(TypeError);
  });

  test('destroys the Readable with the error of the stream', async () => {
    const error = new Error('upstream');
    const { stream, push, error: fail } = pushable<Uint8Array>();
    const readable = NodeStreams.fromWeb(stream);
    push(encode('a'));
    setTimeout(() => fail(error), 10);
    await expect(readNode(readable)).rejects.toBe(error);
  });

  test('destroying the Readable cancels the stream with the error', async () => {
    let cancelled: unknown = 'not cancelled';
    const stream = new ReadableStream({
      cancel(reason) {
        cancelled = reason;
      },
    });
    const readable = NodeStreams.fromWeb(stream);
    readable.on('error', () => {});
    const error = new Error('done');
    readable.destroy(error);
    await closed(readable);
    expect(cancelled).toBe(error);
  });

  test('breaking out of a for await loop cancels the stream', async () => {
    let cancelled = false;
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([i++]));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const _ of NodeStreams.fromWeb(stream)) {
      break;
    }
    expect(cancelled).toBe(true);
  });

  test('reads from the stream only as fast as Node reads', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(1024));
        },
      },
      { highWaterMark: 0 },
    );
    const readable = NodeStreams.fromWeb(stream, { highWaterMark: 4096 });
    readable.pause();
    readable.read(0);
    await delay(20);
    expect(pulls).toBeLessThanOrEqual(6);
    readable.destroy();
  });

  test('aborting signal destroys the Readable with the reason and cancels the stream', async () => {
    let cancelled: unknown;
    const stream = new ReadableStream({
      cancel(reason) {
        cancelled = reason;
      },
    });
    const controller = new AbortController();
    const readable = NodeStreams.fromWeb(stream, { signal: controller.signal });
    const reason = new Error('timeout');
    const read = readNode(readable);
    controller.abort(reason);
    await expect(read).rejects.toBe(reason);
    expect(cancelled).toBe(reason);
  });
});

describe('toWebWritable', () => {
  test('pipeTo writes every chunk and ends the Writable', async () => {
    const { chunks, writable } = sink();
    let finished = false;
    writable.on('finish', () => {
      finished = true;
    });
    await fromChunks([encode('ab'), 'cd']).pipeTo(NodeStreams.toWebWritable(writable));
    expect(finished).toBe(true);
    expect(Buffer.concat(chunks as Buffer[]).toString()).toBe('abcd');
  });

  test('writes values to an object-mode Writable', async () => {
    const { chunks, writable } = sink({ objectMode: true });
    await fromChunks([{ id: 1 }, { id: 2 }]).pipeTo(NodeStreams.toWebWritable(writable));
    expect(chunks).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('waits for drain when the Writable is full', async () => {
    const { chunks, writable } = sink({ highWaterMark: 1, delay: 20 });
    const writer = NodeStreams.toWebWritable(writable).getWriter();
    let written = false;
    const write = writer.write(encode('a')).then(() => {
      written = true;
    });
    await delay(5);
    expect(written).toBe(false);
    await write;
    await writer.close();
    expect(chunks).toHaveLength(1);
  });

  test('errors with the error of the Writable', async () => {
    const error = new Error('disk full');
    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback(error);
      },
    });
    await expect(
      fromChunks([encode('a')]).pipeTo(NodeStreams.toWebWritable(writable)),
    ).rejects.toBe(error);
  });

  test('errors with a write error and destroys the Writable for a chunk it rejects', async () => {
    const { writable } = sink();
    await expect(
      fromChunks([{ id: 1 }]).pipeTo(NodeStreams.toWebWritable(writable)),
    ).rejects.toThrow(TypeError);
    await closed(writable);
    expect(writable.destroyed).toBe(true);
  });

  test('aborting destroys the Writable with the reason, even while a write waits for drain', async () => {
    const writable = new Writable({ highWaterMark: 1, write() {} });
    const writer = NodeStreams.toWebWritable(writable).getWriter();
    const write = writer.write(encode('a'));
    const reason = new Error('stop');
    await writer.abort(reason);
    await expect(write).rejects.toBe(reason);
    await closed(writable);
    expect(writable.errored).toBe(reason);
  });

  test('aborting signal errors the stream and destroys the Writable', async () => {
    const controller = new AbortController();
    const { writable } = sink({ delay: 50 });
    const piped = fromChunks([encode('a'), encode('b')]).pipeTo(
      NodeStreams.toWebWritable(writable, { signal: controller.signal }),
    );
    controller.abort(new Error('timeout'));
    await expect(piped).rejects.toThrow('timeout');
    await closed(writable);
    expect(writable.destroyed).toBe(true);
  });
});

describe('fromWebWritable', () => {
  function webSink(
    options: { highWaterMark?: number | undefined; delay?: number | undefined } = {},
  ) {
    const chunks: unknown[] = [];
    let aborted: unknown = 'not aborted';
    let closedStream = false;
    const stream = new WritableStream(
      {
        async write(chunk) {
          chunks.push(chunk);
          await delay(options.delay ?? 0);
        },
        close() {
          closedStream = true;
        },
        abort(reason) {
          aborted = reason;
        },
      },
      { highWaterMark: options.highWaterMark ?? 1 },
    );
    return { chunks, stream, aborted: () => aborted, closed: () => closedStream };
  }

  test('writes Buffer and string chunks as plain Uint8Arrays and closes the stream', async () => {
    const target = webSink();
    await pipeline(
      Readable.from([Buffer.from('ab'), 'cd'], { objectMode: false }),
      NodeStreams.fromWebWritable(target.stream),
    );
    expect(target.closed()).toBe(true);
    expect(target.chunks.every(isPlain)).toBe(true);
    expect(decode(Buffer.concat(target.chunks as Uint8Array[]))).toBe('abcd');
  });

  for (const form of byteForms) {
    test(`writes a ${form} chunk`, async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const target = webSink();
      const writable = NodeStreams.fromWebWritable(target.stream);
      writable.end(toByteForm(bytes, form));
      await closed(writable);
      expect(new Uint8Array(Buffer.concat(target.chunks as Uint8Array[]))).toEqual(bytes);
    });
  }

  test('passes values through in object mode', async () => {
    const target = webSink();
    await pipeline(
      Readable.from([{ id: 1 }, 'a']),
      NodeStreams.fromWebWritable(target.stream, { objectMode: true }),
    );
    expect(target.chunks).toEqual([{ id: 1 }, 'a']);
  });

  test('waits for the stream when its queue is full', async () => {
    const target = webSink({ highWaterMark: 1, delay: 30 });
    const writable = NodeStreams.fromWebWritable(target.stream, { highWaterMark: 1 });
    writable.write(encode('a'));
    writable.write(encode('b'));
    writable.write(encode('c'));
    await delay(10);
    expect(target.chunks.length).toBeLessThan(3);
    writable.end();
    await closed(writable);
    expect(target.chunks).toHaveLength(3);
  });

  test('destroys the Writable with the error of the stream', async () => {
    const error = new Error('rejected');
    const stream = new WritableStream({
      write() {
        throw error;
      },
    });
    await expect(
      pipeline(Readable.from(['a', 'b', 'c']), NodeStreams.fromWebWritable(stream)),
    ).rejects.toBe(error);
  });

  test('destroying the Writable aborts the stream with the error', async () => {
    const target = webSink();
    const writable = NodeStreams.fromWebWritable(target.stream);
    writable.on('error', () => {});
    const error = new Error('stop');
    writable.destroy(error);
    await closed(writable);
    expect(target.aborted()).toBe(error);
  });

  test('aborting signal destroys the Writable with the reason and aborts the stream', async () => {
    const target = webSink();
    const controller = new AbortController();
    const writable = NodeStreams.fromWebWritable(target.stream, { signal: controller.signal });
    writable.on('error', () => {});
    const reason = new Error('timeout');
    controller.abort(reason);
    await closed(writable);
    expect(writable.errored).toBe(reason);
    expect(target.aborted()).toBe(reason);
  });
});

describe('toWebTransform', () => {
  test('pipeThrough runs a zlib stream', async () => {
    const text = 'portable '.repeat(10_000);
    const [compressed] = [
      Buffer.concat(
        await collect(
          fromChunks([encode(text)]).pipeThrough(NodeStreams.toWebTransform(createGzip())),
        ),
      ),
    ];
    expect(gunzipSync(compressed).toString()).toBe(text);
  });

  test('a Transform error errors the output and cancels the source', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encode('x'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const error = new Error('bad input');
    const failing = new Transform({
      transform(_chunk, _encoding, callback) {
        callback(error);
      },
    });
    await expect(collect(source.pipeThrough(NodeStreams.toWebTransform(failing)))).rejects.toBe(
      error,
    );
    await delay(10);
    expect(cancelled).toBe(true);
  });

  test('cancelling the output destroys the Duplex and errors the input side', async () => {
    const duplex = new PassThrough();
    const { readable, writable } = NodeStreams.toWebTransform(duplex);
    const writer = writable.getWriter();
    await readable.cancel(new Error('enough'));
    await closed(duplex);
    expect(duplex.destroyed).toBe(true);
    await expect(writer.closed).rejects.toThrow('enough');
  });
});

describe('fromWebTransform', () => {
  test('runs a CompressionStream in a pipeline', async () => {
    const text = 'portable '.repeat(10_000);
    const out: Buffer[] = [];
    await pipeline(
      Readable.from([Buffer.from(text)], { objectMode: false }),
      NodeStreams.fromWebTransform(new CompressionStream('gzip')),
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          out.push(chunk);
          callback();
        },
      }),
    );
    expect(gunzipSync(Buffer.concat(out)).toString()).toBe(text);
  });

  test('keeps output strings apart with readableObjectMode', async () => {
    const lines = new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        for (const line of decode(chunk).split('\n')) {
          controller.enqueue(line);
        }
      },
    });
    const duplex = NodeStreams.fromWebTransform(lines, { readableObjectMode: true });
    duplex.end(encode('a\nb\nc'));
    expect(await readNode(duplex)).toEqual(['a', 'b', 'c']);
  });

  test('takes values with writableObjectMode', async () => {
    const json = new TransformStream<unknown, string>({
      transform(value, controller) {
        controller.enqueue(`${JSON.stringify(value)}\n`);
      },
    });
    const duplex = NodeStreams.fromWebTransform(json, { writableObjectMode: true });
    duplex.write({ id: 1 });
    duplex.end({ id: 2 });
    const chunks = await readNode(duplex);
    expect(Buffer.concat(chunks as Buffer[]).toString()).toBe('{"id":1}\n{"id":2}\n');
  });

  test('an error in the transform destroys the Duplex', async () => {
    const error = new Error('bad chunk');
    const failing = new TransformStream({
      transform() {
        throw error;
      },
    });
    await expect(
      pipeline(Readable.from(['a']), NodeStreams.fromWebTransform(failing), sink().writable),
    ).rejects.toBe(error);
  });

  test('destroying the Duplex cancels the readable side and aborts the writable side', async () => {
    let cancelled: unknown;
    let aborted: unknown;
    const pair = {
      readable: new ReadableStream({
        cancel(reason) {
          cancelled = reason;
        },
      }),
      writable: new WritableStream({
        abort(reason) {
          aborted = reason;
        },
      }),
    };
    const duplex = NodeStreams.fromWebTransform(pair);
    duplex.on('error', () => {});
    const error = new Error('stop');
    duplex.destroy(error);
    await closed(duplex);
    expect(cancelled).toBe(error);
    expect(aborted).toBe(error);
  });

  test('aborting signal destroys the Duplex with the reason', async () => {
    const controller = new AbortController();
    const duplex = NodeStreams.fromWebTransform(new TransformStream(), {
      signal: controller.signal,
    });
    duplex.on('error', () => {});
    const reason = new Error('timeout');
    controller.abort(reason);
    await closed(duplex);
    expect(duplex.errored).toBe(reason);
  });

  test('round-trips through toWebTransform', async () => {
    const duplex = NodeStreams.fromWebTransform(new TransformStream());
    const output = await collect(
      fromChunks([gzipSync('ab')]).pipeThrough(NodeStreams.toWebTransform(duplex)),
    );
    expect(gunzipSync(Buffer.concat(output)).toString()).toBe('ab');
  });
});
