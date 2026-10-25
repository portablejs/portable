import { describe, expect, test } from 'vite-plus/test';
import { tee } from '@portable/streams';
import { collect, delay, encode, fromChunks } from './utils.js';

/** A source of 1 to 50 that counts how many times it was pulled. */
function counting(options: { onCancel?: ((reason: unknown) => void) | undefined } = {}) {
  const source = {
    pulls: 0,
    stream: new ReadableStream<number>(
      {
        pull(controller) {
          controller.enqueue(++source.pulls);
          if (source.pulls === 50) {
            controller.close();
          }
        },
        cancel: (reason) => options.onCancel?.(reason),
      },
      { highWaterMark: 0 },
    ),
  };
  return source;
}

function drain<chunk>(stream: ReadableStream<chunk>): chunk[] {
  const received: chunk[] = [];
  const reader = stream.getReader();
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      received.push(value);
    }
  })().catch(() => {});
  return received;
}

describe('tee', () => {
  test('every branch gets every chunk in order', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => i);
    const branches = tee(fromChunks(chunks), 3);
    expect(await Promise.all(branches.map(collect))).toEqual([chunks, chunks, chunks]);
  });

  test('reads iterables', async () => {
    const [a, b] = tee(['x', 'y'], 2);
    expect(await Promise.all([collect(a!), collect(b!)])).toEqual([
      ['x', 'y'],
      ['x', 'y'],
    ]);
  });

  test('a branch read after the source ended still gets every chunk', async () => {
    const [a, b] = tee(fromChunks([1, 2, 3]), 2, { highWaterMark: Infinity });
    expect(await collect(a!)).toEqual([1, 2, 3]);
    expect(await collect(b!)).toEqual([1, 2, 3]);
  });

  test('branches share chunk objects', async () => {
    const chunk = encode('abc');
    const [a, b] = tee(fromChunks([chunk]), 2);
    const [[fromA], [fromB]] = await Promise.all([collect(a!), collect(b!)]);
    expect(fromA).toBe(chunk);
    expect(fromB).toBe(chunk);
  });

  test('a cancelled branch does not stop the others', async () => {
    let cancelled = false;
    const [a, b, c] = tee(
      new ReadableStream<number>({
        start(controller) {
          for (let i = 0; i < 5; i++) {
            controller.enqueue(i);
          }
          controller.close();
        },
        cancel: () => void (cancelled = true),
      }),
      3,
    );
    await b!.cancel('not needed');
    expect(await Promise.all([collect(a!), collect(c!)])).toEqual([
      [0, 1, 2, 3, 4],
      [0, 1, 2, 3, 4],
    ]);
    expect(cancelled).toBe(false);
  });

  test('cancelling every branch cancels the source with the last reason', async () => {
    const reasons: unknown[] = [];
    const source = counting({ onCancel: (reason) => reasons.push(reason) });
    const [a, b, c] = tee(source.stream, 3);
    const reader = a!.getReader();
    await reader.read();
    await b!.cancel('first');
    await reader.cancel('second');
    expect(reasons).toEqual([]);
    await c!.cancel('last');
    expect(reasons).toEqual(['last']);
  });

  test('an error in the source errors every branch', async () => {
    const error = new Error('boom');
    let controller!: ReadableStreamDefaultController<number>;
    const branches = tee(new ReadableStream<number>({ start: (c) => void (controller = c) }), 3);
    const results = Promise.allSettled(branches.map(collect));
    controller.enqueue(1);
    await delay(5);
    controller.error(error);
    expect(await results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
  });

  test('aborting the signal errors every branch and cancels the source', async () => {
    const reason = new Error('aborted');
    let cancelled: unknown;
    const source = counting({ onCancel: (r) => void (cancelled = r) });
    const controller = new AbortController();
    const branches = tee(source.stream, 2, { signal: controller.signal });
    const reader = branches[0]!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 1 });
    controller.abort(reason);
    await expect(reader.read()).rejects.toBe(reason);
    await expect(collect(branches[1]!)).rejects.toBe(reason);
    expect(cancelled).toBe(reason);
  });

  test('an aborted signal errors every branch at once', async () => {
    const reason = new Error('aborted');
    const source = counting();
    const branches = tee(source.stream, 2, { signal: AbortSignal.abort(reason) });
    const results = await Promise.allSettled(branches.map(collect));
    expect(results).toEqual([
      { status: 'rejected', reason },
      { status: 'rejected', reason },
    ]);
    expect(source.pulls).toBe(0);
  });

  test('stops reading the source while a branch holds highWaterMark unread chunks', async () => {
    const source = counting();
    const [fast, slow] = tee(source.stream, 2, { highWaterMark: 4 });
    const received = drain(fast!);
    await delay(20);
    expect(source.pulls).toBe(4);
    expect(received).toEqual([1, 2, 3, 4]);

    const reader = slow!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 1 });
    await delay(20);
    expect(source.pulls).toBe(5);
    expect(received).toEqual([1, 2, 3, 4, 5]);
    await reader.cancel();
  });

  test('defaults highWaterMark to 16 chunks', async () => {
    const source = counting();
    const [fast, slow] = tee(source.stream, 2);
    drain(fast!);
    await delay(20);
    expect(source.pulls).toBe(16);
    await slow!.cancel();
  });

  test('counts highWaterMark in bytes with unit: bytes', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array | string>(
      {
        pull(c) {
          c.enqueue(++pulls % 2 ? new Uint8Array(4) : '€€');
          if (pulls === 50) {
            c.close();
          }
        },
      },
      { highWaterMark: 0 },
    );
    const [fast, slow] = tee(stream, 2, { highWaterMark: 14, unit: 'bytes' });
    drain(fast!);
    await delay(20);
    expect(pulls).toBe(3);
    await slow!.cancel();
  });

  test('errors every branch with a TypeError for a non-byte chunk with unit: bytes', async () => {
    let cancelled: unknown;
    const stream = new ReadableStream<unknown>({
      start: (c) => c.enqueue(42),
      cancel: (reason) => void (cancelled = reason),
    });
    const results = await Promise.allSettled(tee(stream, 2, { unit: 'bytes' }).map(collect));
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(TypeError);
    expect(cancelled).toBeInstanceOf(TypeError);
  });

  test('cancelling the slowest branch lets the others continue', async () => {
    const source = counting();
    const [fast, slow] = tee(source.stream, 2, { highWaterMark: 2 });
    const received = drain(fast!);
    await delay(20);
    expect(received).toEqual([1, 2]);
    await slow!.cancel();
    await delay(20);
    expect(received).toHaveLength(50);
  });

  test('rejects a count below 1', () => {
    expect(() => tee(fromChunks([]), 0)).toThrow(RangeError);
    expect(() => tee(fromChunks([]), 1.5)).toThrow(RangeError);
  });
});
