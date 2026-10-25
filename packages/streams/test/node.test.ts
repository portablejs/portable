import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import * as NodeStreams from '@portable/streams/node';
import { describe, expect, test } from 'vite-plus/test';
import { collect, decode, delay, encode } from './utils.js';

const isPlain = (chunk: unknown) => Object.getPrototypeOf(chunk) === Uint8Array.prototype;

async function readNode(readable: Readable): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return chunks;
}

const closed = (stream: Readable) =>
  new Promise<void>((resolve) => {
    if (stream.closed) {
      resolve();
    } else {
      stream.once('close', () => resolve());
    }
  });

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
