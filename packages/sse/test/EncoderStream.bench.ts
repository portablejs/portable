import { describe, expect, test } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'

const tokens: Sse.Message[] = Array.from({ length: 2000 }, (_, i) => ({
  data: JSON.stringify({ choices: [{ index: 0, delta: { content: `token ${i} ` } }] }),
}))
const named: Sse.Message[] = Array.from({ length: 2000 }, (_, i) => ({
  id: String(i),
  event: 'block-delta',
  data: `line one ${i}\nline two ${i}`,
}))

const fixtures = { 'LLM tokens': tokens, 'named events with multi-line data': named }

function handWritten(message: Sse.Message): string {
  let text = message.event === undefined ? '' : `event: ${message.event}\n`
  for (const line of (message.data ?? '').split('\n')) text += `data: ${line}\n`
  if (message.id !== undefined) text += `id: ${message.id}\n`
  return `${text}\n`
}

describe('encodes events', () => {
  for (const [name, messages] of Object.entries(fixtures)) {
    test(`encode: ${name}`, async ({ bench }) => {
      expect(messages.map(Sse.encode)).toEqual(messages.map(handWritten))
      await bench.compare(
        bench('@portable/sse', () => {
          for (const message of messages) Sse.encode(message)
        }),
        bench('hand-written', () => {
          for (const message of messages) handWritten(message)
        }),
      )
    })

    test(`EncoderStream: ${name}`, async ({ bench }) => {
      expect(
        await Streams.toText(Streams.fromIterable(messages).pipeThrough(new Sse.EncoderStream())),
      ).toBe(messages.map(handWritten).join(''))
      await bench.compare(
        bench('@portable/sse', async () => {
          await Streams.toArray(Streams.fromIterable(messages).pipeThrough(new Sse.EncoderStream()))
        }),
        bench('hand-written with TextEncoderStream', async () => {
          await Streams.toArray(
            Streams.fromIterable(messages)
              .pipeThrough(Streams.map(handWritten))
              .pipeThrough(new TextEncoderStream()),
          )
        }),
      )
    })
  }
})
