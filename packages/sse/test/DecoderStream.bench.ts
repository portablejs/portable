import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import { describe, expect, test } from 'vite-plus/test';
import * as Sse from '@portable/sse';
import { randomChunks, seededRandom, utf8 } from './utils.js';

const random = seededRandom(7);
const word = () => Math.floor(random() * 1e9).toString(36);

const llm = Array.from({ length: 2000 }, (_, i) =>
  utf8(
    `data: ${JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: `${word()} ` }, finish_reason: null }], n: i })}\n\n`,
  ),
);
const named = randomChunks(
  utf8(
    Array.from(
      { length: 2000 },
      (_, i) => `id: ${i}\nevent: block-delta\ndata: {"type":"text-delta","text":"${word()}"}\n\n`,
    ).join(''),
  ),
  1,
  16384,
);
const small = randomChunks(
  utf8(Array.from({ length: 500 }, () => `event: tick\ndata: ${word()} ${word()}\n\n`).join('')),
  2,
  16,
);
const huge = randomChunks(utf8(`data: ${'x'.repeat(1_000_000)}\n\n`), 3, 128);

const fixtures = {
  'LLM tokens, one event per chunk': llm,
  'named events in 16 KB chunks': named,
  'small chunks': small,
  '1 MB data line in 128-byte chunks': huge,
};

function source(
  chunks: readonly Uint8Array<ArrayBuffer>[],
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let i = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]!);
      } else {
        controller.close();
      }
    },
  });
}

async function drain<chunk>(stream: ReadableStream<chunk>): Promise<number> {
  const reader = stream.getReader();
  let count = 0;
  while (!(await reader.read()).done) {
    count++;
  }
  return count;
}

// What a caller writes without a library: buffer the text, split events on a blank line and
// keep the `data:` lines. It handles only LF line breaks, and splitting the whole buffer on
// every chunk makes a long line quadratic, so it doesn't run on the 1 MB fixture.
class HandWrittenStream extends TransformStream<Uint8Array, { event: string; data: string }> {
  constructor() {
    const decoder = new TextDecoder();
    let buffer = '';
    super({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop()!;
        for (const block of blocks) {
          let event = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('data:')) {
              data.push(line.slice(line[5] === ' ' ? 6 : 5));
            } else if (line.startsWith('event:')) {
              event = line.slice(line[6] === ' ' ? 7 : 6);
            }
          }
          if (data.length > 0) {
            controller.enqueue({ event, data: data.join('\n') });
          }
        }
      },
    });
  }
}

describe('decodes an event stream', () => {
  for (const [name, chunks] of Object.entries(fixtures)) {
    test(`stream: ${name}`, async ({ bench }) => {
      const result = await bench.compare(
        bench('@portable/sse', async () => {
          await drain(source(chunks).pipeThrough(new Sse.DecoderStream()));
        }),
        bench('eventsource-parser', async () => {
          await drain(
            source(chunks)
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(new EventSourceParserStream()),
          );
        }),
        ...(chunks === huge
          ? []
          : [
              bench('hand-written', async () => {
                await drain(source(chunks).pipeThrough(new HandWrittenStream()));
              }),
            ]),
      );
      expect(result.get('eventsource-parser')).not.toBeFasterThan(result.get('@portable/sse'), {
        delta: 0.25,
      });
    });
  }

  for (const [name, chunks] of Object.entries(fixtures)) {
    const text = chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
    test(`whole text: ${name}`, async ({ bench }) => {
      const parsed: EventSourceMessage[] = [];
      createParser({ onEvent: (event) => parsed.push(event) }).feed(text);
      expect(Sse.decode(text).map((event) => event.data)).toEqual(
        parsed.map((event) => event.data),
      );
      await bench.compare(
        bench('@portable/sse', () => {
          Sse.decode(text);
        }),
        bench('eventsource-parser', () => {
          const events: EventSourceMessage[] = [];
          createParser({ onEvent: (event) => events.push(event) }).feed(text);
        }),
      );
    });
  }
});
