import { EventSource } from 'eventsource';
import { EventSourceParserStream } from 'eventsource-parser/stream';
import { expect, test } from 'vite-plus/test';
import * as Sse from '@portable/sse';
import * as Streams from '@portable/streams';
import { utf8 } from './utils.js';

const chunks = Array.from({ length: 2000 }, (_, i) =>
  utf8(`id: ${i}\ndata: ${JSON.stringify({ delta: { content: `token ${i} ` } })}\n\n`),
);

const fetch = (_request: Request): Promise<Response> =>
  Promise.resolve(
    new Response(Streams.fromIterable(chunks), {
      headers: { 'content-type': 'text/event-stream' },
    }),
  );

const connect = () =>
  Sse.connect('https://example.com/events', { fetch, reconnectIf: () => false });

test('connect: one response of 2000 events', async ({ bench }) => {
  expect(await Streams.toArray(connect())).toHaveLength(chunks.length);
  await bench.compare(
    bench('@portable/sse', async () => {
      await Streams.toArray(connect());
    }),
    bench('fetch and eventsource-parser', async () => {
      const response = await fetch(new Request('https://example.com/events'));
      await Streams.toArray(
        response
          .body!.pipeThrough(new TextDecoderStream())
          .pipeThrough(new EventSourceParserStream()),
      );
    }),
    bench('eventsource', async () => {
      await new Promise<void>((resolve, reject) => {
        let count = 0;
        const source = new EventSource('https://example.com/events', {
          fetch: (url) => fetch(new Request(url)),
        });
        source.onmessage = () => {
          if (++count < chunks.length) {
            return;
          }
          source.close();
          resolve();
        };
        source.onerror = (event) => {
          source.close();
          reject(event);
        };
      });
    }),
  );
});
