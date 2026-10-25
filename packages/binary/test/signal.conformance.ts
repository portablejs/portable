import { describe, expect, test } from 'vite-plus/test';
import * as Binary from '@portable/binary';

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
  const streams = {
    FrameDecoderStream: (signal: AbortSignal) => new Binary.FrameDecoderStream({ signal }),
    FrameEncoderStream: (signal: AbortSignal) => new Binary.FrameEncoderStream({ signal }),
  };

  for (const [name, create] of Object.entries(streams)) {
    test(`aborting errors the ${name} and cancels its source`, async () => {
      expect(await abortMidway(new Uint8Array([1, 7]), create)).toBe(true);
    });

    test(`an aborted signal errors the ${name} at once`, async () => {
      const reason = new Error('stop');
      const stream = create(AbortSignal.abort(reason));
      await expect(stream.readable.getReader().read()).rejects.toBe(reason);
    });
  }
});
