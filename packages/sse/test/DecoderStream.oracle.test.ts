import { createParser } from 'eventsource-parser'
import { describe, expect, test } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import { MULTIBYTE_EMOJIS, MULTIBYTE_LINES } from './fixtures/multibyte.js'
import { decodeChunks, randomChunks, seededRandom, utf8 } from './utils.js'

// eventsource-parser reports `event: undefined` for the default type and an `id` only on the
// block that set it. These callbacks turn its output into `MessageEvent` terms for comparison.
function viaEventsourceParser(chunks: readonly Uint8Array[]): Sse.Event[] {
  const events: Sse.Event[] = []
  let id: string | undefined
  let retry: number | undefined
  const parser = createParser({
    onId: (value) => {
      id = value
    },
    onRetry: (value) => {
      retry = value
    },
    onEvent: (event) => {
      events.push({ event: event.event ?? 'message', data: event.data, id, retry })
      retry = undefined
    },
  })
  const decoder = new TextDecoder()
  for (const chunk of chunks) parser.feed(decoder.decode(chunk, { stream: true }))
  parser.feed(decoder.decode())
  return events
}

function randomStream(seed: number): string {
  const random = seededRandom(seed)
  const pick = <value>(items: readonly value[]): value =>
    items[Math.floor(random() * items.length)]!
  const breaks = ['\n', '\r', '\r\n']
  const values = [
    '',
    ' ',
    'x',
    '  two spaces',
    'a:b:c',
    'NUL\0inside',
    '{"json":true}',
    pick(MULTIBYTE_LINES),
    MULTIBYTE_EMOJIS.slice(0, 20).join(''),
    '123',
    '0042',
    '12x',
  ]
  const lines: string[] = []
  if (random() < 0.3) lines.push(String.fromCharCode(0xfeff))
  for (let i = 0; i < 200; i++) {
    const roll = random()
    const value = pick(values)
    if (roll < 0.35) lines.push(`data:${value}`)
    else if (roll < 0.45) lines.push('data')
    else if (roll < 0.55) lines.push(`event:${value}`)
    else if (roll < 0.62) lines.push(`id:${value}`)
    else if (roll < 0.65) lines.push('id')
    else if (roll < 0.7) lines.push(`retry:${value}`)
    else if (roll < 0.75) lines.push(`:${value}`)
    else if (roll < 0.78) lines.push(`${pick(['Data', 'foo', 'data ', ' data'])}:${value}`)
    else lines.push('')
  }
  return lines.map((line) => line + pick(breaks)).join('')
}

const inputs: Record<string, string> = {
  wpt: 'data:\0\ndata:  2\rData:1\ndata\0:2\ndata:1\r\0data:4\nda-ta:3\rdata_5\ndata:3\rdata:\r\n data:32\ndata:4\n\n',
  ids: 'id: 1\ndata: 1\n\ndata: 2\n\nid\ndata:3\n\nid: 4\n\nid: x\0\ndata:5\n\n',
  retry: 'retry: 10\n\ndata: a\n\nretry: 0x\ndata: b\nretry: 20\n\nretry: 30\n',
  multibyte: MULTIBYTE_LINES.map((line, i) => `id: ${i}\nevent: ${line}\ndata: ${line}\n\n`).join(
    '',
  ),
  crlf: 'event: a\r\ndata: 1\r\ndata: 2\r\n\r\n: comment\r\ndata: 3\r\n\r\n',
  bom: `${String.fromCharCode(0xfeff)}data: 1\n\n${String.fromCharCode(0xfeff)}data: 2\n\ndata: 3\n\n`,
  unfinished: 'data: 1\n\ndata: 2\n',
}

describe('matches eventsource-parser on random chunks', () => {
  for (const [name, text] of Object.entries(inputs)) {
    for (const seed of [1, 2, 3]) {
      test(`${name}, chunking ${seed}`, async () => {
        const chunks = randomChunks(utf8(text), seed, 8)
        expect(await decodeChunks(chunks)).toEqual(viaEventsourceParser(chunks))
      })
    }
  }

  for (let seed = 1; seed <= 30; seed++) {
    test(`random stream ${seed}`, async () => {
      const bytes = utf8(randomStream(seed))
      const chunks = randomChunks(bytes, seed, 32)
      const expected = viaEventsourceParser(chunks)
      expect(expected.length).toBeGreaterThan(0)
      expect(await decodeChunks(chunks)).toEqual(expected)
      expect(Sse.decode(bytes)).toEqual(expected)
    })
  }
})
