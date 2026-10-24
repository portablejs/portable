import * as Csv from '@portable/csv';
import { describe, expect, test } from 'vite-plus/test';

async function abortMidway<chunk>(
  chunk: chunk,
  transform: (signal: AbortSignal) => TransformStream<chunk, unknown>,
): Promise<boolean> {
  const controller = new AbortController();
  let cancelled: unknown;
  const source = new ReadableStream<chunk>({
    pull: (c) => c.enqueue(chunk),
    cancel: (reason) => {
      cancelled = reason;
    },
  });
  const reader = source.pipeThrough(transform(controller.signal)).getReader();
  await reader.read();
  const reason = new Error('stop');
  controller.abort(reason);
  await expect(reader.read()).rejects.toBe(reason);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return cancelled === reason;
}

describe('signal', () => {
  test('aborting errors the DecoderStream and cancels its source', async () => {
    expect(await abortMidway('a,b\n', (signal) => new Csv.DecoderStream({ signal }))).toBe(true);
  });

  test('an aborted signal errors the DecoderStream at once', async () => {
    const reason = new Error('stop');
    const stream = new Csv.DecoderStream({ signal: AbortSignal.abort(reason) });
    await expect(stream.readable.getReader().read()).rejects.toBe(reason);
  });

  test('aborting errors the EncoderStream and cancels its source', async () => {
    expect(await abortMidway(['a', 'b'], (signal) => new Csv.EncoderStream({ signal }))).toBe(true);
  });

  test('an aborted signal errors the EncoderStream at once', async () => {
    const reason = new Error('stop');
    const stream = new Csv.EncoderStream({ signal: AbortSignal.abort(reason) });
    await expect(stream.readable.getReader().read()).rejects.toBe(reason);
  });
});
