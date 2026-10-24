import { describe, expect, test } from 'vite-plus/test'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'
import { MULTIBYTE_EMOJIS, MULTIBYTE_LINES } from './fixtures/multibyte.js'
import { chunked, datas, decodeChunks, utf8 } from './utils.js'

const bom = String.fromCharCode(0xfeff)

describe('eventsource-parser', () => {
  test('reads a stream of unnamed events', async () => {
    const chunks = ['0', '1', '2', '3', '4'].map((n) => `data: ${n}\n\n`)
    chunks.push('event: done\ndata: ✔\n\n')
    const events = await decodeChunks(chunks)
    expect(events).toEqual([
      { event: 'message', data: '0', id: undefined, retry: undefined },
      { event: 'message', data: '1', id: undefined, retry: undefined },
      { event: 'message', data: '2', id: undefined, retry: undefined },
      { event: 'message', data: '3', id: undefined, retry: undefined },
      { event: 'message', data: '4', id: undefined, retry: undefined },
      { event: 'done', data: '✔', id: undefined, retry: undefined },
    ])
  })

  test('reads named events', async () => {
    const time = '2026-10-18T12:00:00.000Z'
    const events = await decodeChunks(Array(5).fill(`event: time\ndata: ${time}\n\n`))
    expect(events.map((e) => [e.event, e.data])).toEqual(Array(5).fill(['time', time]))
  })

  test('reads named events split into uneven chunks at every position', async () => {
    const text = 'id: 123456\nevent: time\ndata: 2026-10-18T12:00:00.000Z\n\n'
    for (let at = 0; at <= text.length; at++) {
      const events = await decodeChunks([text.slice(0, at), text.slice(at)])
      expect(events).toEqual([
        { event: 'time', data: '2026-10-18T12:00:00.000Z', id: '123456', retry: undefined },
      ])
    }
  })

  test('reads ids and a retry interval', () => {
    const events = Sse.decode(
      'event: tick\ndata: 1337\nid: 1337\nretry: 50\n\nevent: tick\ndata: 1338\nid: 1338\nretry: 50\n\n',
    )
    expect(events).toEqual([
      { event: 'tick', data: '1337', id: '1337', retry: 50 },
      { event: 'tick', data: '1338', id: '1338', retry: 50 },
    ])
  })

  test('ignores heartbeat comments between events', async () => {
    const chunks: string[] = []
    for (let i = 0; i < 5; i++) {
      chunks.push(': ♥\n', `data: ${String.fromCharCode(65 + i)}\n\n`)
    }
    expect(datas(await decodeChunks(chunks))).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  test('joins multi-line data with LF', async () => {
    const events = await decodeChunks([
      'event: stock\n',
      'data: YHOO\n',
      'data: +2\n',
      'data: 10\n\n',
      'event: stock\n',
      'data: GOOG\n',
      'data: -8\n',
      'data: 1881\n\n',
    ])
    expect(events.map((e) => [e.event, e.data])).toEqual([
      ['stock', 'YHOO\n+2\n10'],
      ['stock', 'GOOG\n-8\n1881'],
    ])
  })

  test('reads multi-byte text', async () => {
    const perLine = Math.ceil(MULTIBYTE_EMOJIS.length / MULTIBYTE_LINES.length)
    const chunks: string[] = []
    const expected: Sse.Event[] = []
    MULTIBYTE_LINES.forEach((text, i) => {
      const line = `${text} ${MULTIBYTE_EMOJIS.slice(perLine * i, perLine * (i + 1)).join(' ')}`
      chunks.push(`id: ${i}\n`)
      if (i % 2 === 0) {
        chunks.push(`data:${line.slice(0, 5)}\n`, `data:${line.slice(5)}\n\n`)
      } else {
        chunks.push(`data:${line}\n\n`)
      }
      const data = i % 2 === 0 ? `${line.slice(0, 5)}\n${line.slice(5)}` : line
      expected.push({ event: 'message', data, id: String(i), retry: undefined })
    })
    expect(await decodeChunks(chunks)).toEqual(expected)
    expect(await decodeChunks(chunked(utf8(chunks.join('')), 1))).toEqual(expected)
  })

  test('reads multi-byte text after empty lines', async () => {
    const events = await decodeChunks([
      '\n\n\n\nid: 1\ndata: 我現在都看實況不玩遊戲\n\n',
      'event: done\ndata: ✔\n\n',
    ])
    expect(events.map((e) => [e.event, e.data])).toEqual([
      ['message', '我現在都看實況不玩遊戲'],
      ['done', '✔'],
    ])
  })

  test('strips a leading BOM in bytes', async () => {
    const events = await decodeChunks([
      new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('data: bomful 1\n\n')]),
      utf8('data: bomless 2\n\n'),
    ])
    expect(datas(events)).toEqual(['bomful 1', 'bomless 2'])
  })

  test('strips a leading BOM in text, and ignores the line after a later one', async () => {
    const events = await decodeChunks([
      `${bom}data: bomful 1\n\n`,
      `${bom}data: bomful 2\n\n`,
      'data: bomless 3\n\n',
    ])
    expect(datas(events)).toEqual(['bomful 1', 'bomless 3'])
  })

  test('strips only one leading BOM in bytes, and ignores later ones', async () => {
    const withBom = (text: string) => new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(text)])
    const events = await decodeChunks([
      withBom('data: bomful 1\n\n'),
      withBom('data: bomful 2\n\n'),
      utf8('data: bomless 3\n\n'),
    ])
    expect(datas(events)).toEqual(['bomful 1', 'bomless 3'])
  })

  test('strips a BOM split across byte chunks, with empty chunks between', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('data: first\n\ndata: second\n\n')])
    for (const at of [1, 2]) {
      const events = await decodeChunks([
        new Uint8Array(),
        bytes.subarray(0, at),
        new Uint8Array(),
        bytes.subarray(at),
      ])
      expect(datas(events)).toEqual(['first', 'second'])
    }
    expect(datas(await decodeChunks(chunked(bytes, 1)))).toEqual(['first', 'second'])
  })

  test('an incomplete BOM is not a BOM', async () => {
    const events = await decodeChunks([
      new Uint8Array([0xef, 0xbb]),
      utf8('data: ignored\n\ndata: last\n\n'),
    ])
    expect(datas(events)).toEqual(['last'])
  })

  test('strips only one of two leading BOMs', async () => {
    expect(datas(Sse.decode(`${bom}${bom}data: ignored\n\ndata: last\n\n`))).toEqual(['last'])
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      0xef,
      0xbb,
      0xbf,
      ...utf8('data: x\n\ndata: y\n\n'),
    ])
    expect(datas(Sse.decode(bytes))).toEqual(['y'])
  })

  test('empty chunks do not make a later BOM a leading BOM', async () => {
    const events = await decodeChunks([
      'data: first\n\n',
      '',
      `${bom}data: ignored\n\ndata: last\n\n`,
    ])
    expect(datas(events)).toEqual(['first', 'last'])
  })

  test.each([
    [
      'CR',
      ['data: dog\r', 'data: bark\r\r', 'data: cat\r', 'data: meow\r\r'],
      ['dog\nbark', 'cat\nmeow'],
    ],
    [
      'LF',
      ['data: cow\n', 'data: moo\n\n', 'data: horse\n', 'data: neigh\n\n'],
      ['cow\nmoo', 'horse\nneigh'],
    ],
    [
      'CRLF',
      ['data: sheep\r\n', 'data: bleat\r\n\r\n', 'data: pig\r\n', 'data: oink\r\n\r\n'],
      ['sheep\nbleat', 'pig\noink'],
    ],
  ])('splits lines on %s', async (_name, chunks, expected) => {
    expect(datas(await decodeChunks(chunks))).toEqual(expected)
  })

  test('ignores comments of every shape', async () => {
    const events = await decodeChunks([
      ': Hello\n\n',
      ':'.repeat(300),
      '\n',
      'data: First\n\n',
      ': Первый',
      ': 第二',
      '\n',
      'data: Second\n\n',
      ...Array(10).fill(': Moop \n'),
      ': ثالث',
      '\n',
      'data: Third\n\n',
      ':നാലാമത്തെ',
      '\n',
      'data: Fourth\n\n',
      `: ${MULTIBYTE_EMOJIS.slice(0, 100).join(' ')} :`,
      '\n',
      'data: Fifth\n\n',
    ])
    expect(datas(events)).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth'])
  })

  test('ignores comments mixed with CR, CRLF and NUL, and drops an unfinished event', async () => {
    const long = 'x'.repeat(2 * 1024 + 1)
    const events = await decodeChunks([
      'data:1\r\r:\0\n:\r\ndata:2\n\n:',
      long,
      '\rdata:3\n\n:data:fail\r:',
      long,
      '\ndata:4\n\n',
      'data:5',
    ])
    expect(datas(events)).toEqual(['1', '2', '3', '4'])
  })

  test('an empty event field gives the default type', () => {
    const events = Sse.decode('event:\ndata: Hello 1\n\nevent:\n\nevent: done\ndata: ✔\n\n')
    expect(events.map((e) => [e.event, e.data])).toEqual([
      ['message', 'Hello 1'],
      ['done', '✔'],
    ])
  })

  test('ignores an empty retry field', () => {
    const events = Sse.decode(
      'id: 1\nretry: 500\ndata: 🥌\n\nid:2\nretry:\ndata:🧹\n\nid: 3\ndata: ✅\n\n',
    )
    expect(events).toEqual([
      { event: 'message', data: '🥌', id: '1', retry: 500 },
      { event: 'message', data: '🧹', id: '2', retry: undefined },
      { event: 'message', data: '✅', id: '3', retry: undefined },
    ])
  })

  test('reads data fields with and without a value', () => {
    expect(datas(Sse.decode('data:\n\ndata\ndata\n\ndata:test\n\n'))).toEqual(['', '\n', 'test'])
  })

  test('a CRLF split across chunks is one line break', async () => {
    const events = await decodeChunks(['data: A\r\n', 'data: B\r', '\n', 'data: C\r\n', '\n'])
    expect(datas(events)).toEqual(['A\nB\nC'])
  })

  test('ignores a retry field that is not all digits', () => {
    expect(Sse.decode('retry:1000\nretry:2000x\ndata:x\n\n')).toEqual([
      { event: 'message', data: 'x', id: undefined, retry: 1000 },
    ])
    expect(Sse.decode('\nretry: 500\n\ndata: first\n\nretry: 50x\n\ndata: second\n\n')).toEqual([
      { event: 'message', data: 'first', id: undefined, retry: 500 },
      { event: 'message', data: 'second', id: undefined, retry: undefined },
    ])
  })

  test('ignores an id field containing NUL', () => {
    expect(Sse.decode('id: 123\nid: bad\0id\ndata: hello\n\n')).toEqual([
      { event: 'message', data: 'hello', id: '123', retry: undefined },
    ])
  })

  test('an id from a block without data applies to later events', () => {
    const events = Sse.decode('id: 42\n\nid: bad\0id\n\ndata: a\n\nid:\n\ndata: b\n\n')
    expect(events.map((e) => [e.data, e.id])).toEqual([
      ['a', '42'],
      ['b', ''],
    ])
  })

  test.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
  ])('reads an id-only block ended with %s', (_name, end) => {
    expect(Sse.decode(`id: 42${end}${end}data: x${end}${end}`)[0]?.id).toBe('42')
  })

  test('ignores unknown fields', () => {
    const text = 'data:abc\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:123\n\n'
    expect(datas(Sse.decode(text))).toEqual(['abc\n\n123'])
  })

  test('reads an event of 10 MB of data', async () => {
    const line = `${MULTIBYTE_LINES.join(' ')} ${MULTIBYTE_EMOJIS.join(' ')}`
    const chunk = utf8(`data: ${line}\n`)
    const count = Math.ceil((10 * 1024 * 1024) / chunk.length)
    const chunks = [utf8(': hello\n\n')] satisfies Uint8Array[]
    for (let i = 0; i < count; i++) {
      chunks.push(chunk)
    }
    chunks.push(utf8('\n: END-OF-STREAM\n\nevent: done\ndata: ok\n\n'))
    const events = await decodeChunks(chunks)
    expect(events).toHaveLength(2)
    expect(events[0]!.data).toBe(Array(count).fill(line).join('\n'))
    expect(events[1]!.event).toBe('done')
  })

  test('a body that is not an event stream gives no events', () => {
    const json = JSON.stringify({ error: 'Internal Server Error' })
    expect(Sse.decode(json)).toEqual([])
    expect(Sse.decode(`${json}\n`)).toEqual([])
    expect(Sse.decode('Well, this is not what I expected\n')).toEqual([])
  })

  test('drops an unfinished line at the end', async () => {
    expect(await decodeChunks([`data: ${'x'.repeat(1_000_000)}`])).toEqual([])
  })

  test.each([
    ['comment', ':ignored\r', '\ndata: two\n\n', 'one\ntwo'],
    ['comment', ':ignored\r', 'data: two\n\n', 'one\ntwo'],
    ['unknown field', 'garbage\r', '\ndata: two\n\n', 'one\ntwo'],
    ['data field', 'data\r', '\ndata: two\n\n', 'one\n\ntwo'],
  ])('a %s ended by a CR at the end of a chunk is one line', async (_name, a, b, data) => {
    expect(datas(await decodeChunks(['data: one\n', a, b]))).toEqual([data])
    expect(datas(await decodeChunks([`data: one\n${a}`, b]))).toEqual([data])
  })

  test('a comment ended by a CRLF split across chunks is one line', async () => {
    expect(datas(await decodeChunks(['data: one\n:', 'ignored\r', '\ndata: two\n\n']))).toEqual([
      'one\ntwo',
    ])
    expect(datas(await decodeChunks(['data: one\n:', 'ignored\r\ndata: two\n\n']))).toEqual([
      'one\ntwo',
    ])
  })

  test('a blank line split across chunks as CR, CR LF dispatches once', async () => {
    expect(datas(await decodeChunks(['data: one\r', '\r', '\n']))).toEqual(['one'])
  })

  test('reads a field split across chunks', async () => {
    expect(datas(await decodeChunks(['da', 'ta\n\n']))).toEqual([''])
    expect(datas(await decodeChunks(['d', 'a', 't', 'a', ':', ' ', 'x', '\n', '\n']))).toEqual([
      'x',
    ])
  })

  test('reads a comment split across chunks', async () => {
    expect(datas(await decodeChunks([':', 'kept', '\n', 'data: x\n\n']))).toEqual(['x'])
  })
})

describe('maxLength', () => {
  test('fails when an unfinished line grows past it', async () => {
    const error = await decodeChunks(['data: short', ' and now too long'], { maxLength: 24 }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Sse.MaxLengthError)
    expect(error).toMatchObject({ name: 'Sse.MaxLengthError', maxLength: 24 })
  })

  test('fails when an event has more data than it allows, before a blank line', async () => {
    const chunks = Array.from({ length: 50 }, (_, i) => `data: chunk-${i}\n`)
    await expect(decodeChunks(chunks, { maxLength: 32 })).rejects.toThrow(Sse.MaxLengthError)
  })

  test('counts the LF between data lines', () => {
    expect(() => Sse.decode('data:1234\ndata:5678\n\n', { maxLength: 8 })).toThrow(
      Sse.MaxLengthError,
    )
    expect(Sse.decode('data:1234\ndata:5678\n\n', { maxLength: 10 })).toHaveLength(1)
    expect(() => Sse.decode('data:1234\ndata\n\n', { maxLength: 4 })).toThrow(Sse.MaxLengthError)
  })

  test('applies to every line, including complete ones in one chunk', () => {
    expect(() => Sse.decode(`:${'x'.repeat(64)}\ndata: ok\n\n`, { maxLength: 16 })).toThrow(
      Sse.MaxLengthError,
    )
    expect(() => Sse.decode(`unknown-${'x'.repeat(64)}\n\n`, { maxLength: 16 })).toThrow(
      Sse.MaxLengthError,
    )
  })

  test('gives the same result however the input is chunked', async () => {
    const text = 'data: 1234\ndata: 5678\n\ndata: later\n\n'
    for (let at = 0; at <= text.length; at++) {
      await expect(
        decodeChunks([text.slice(0, at), text.slice(at)], { maxLength: 8 }),
      ).rejects.toThrow(Sse.MaxLengthError)
    }
  })

  test.each(['\n', '\r\n', '\r'])('allows events up to the limit (%j)', (end) => {
    const text = ['data: 1234', 'data: 5678', '', 'data: 1234', 'data: 5678', '', ''].join(end)
    expect(datas(Sse.decode(text, { maxLength: 10 }))).toEqual(['1234\n5678', '1234\n5678'])
  })

  test('allows many small events', () => {
    const text = Array.from({ length: 100 }, (_, i) => `data: ${i}\n\n`).join('')
    expect(Sse.decode(text, { maxLength: 16 })).toHaveLength(100)
  })

  test('delivers the events before the one that fails', async () => {
    const reader = Streams.fromIterable(['data: first\n\n', 'data: 123456\ndata: 789012\n\n'])
      .pipeThrough(new Sse.DecoderStream({ maxLength: 12 }))
      .getReader()
    expect((await reader.read()).value?.data).toBe('first')
    await expect(reader.read()).rejects.toThrow(Sse.MaxLengthError)
  })
})

describe('WPT eventsource', () => {
  test('format-bom: a BOM after the first is part of the line', () => {
    expect(datas(Sse.decode(`${bom}data:1\n\n${bom}data:2\n\ndata:3\n\n`))).toEqual(['1', '3'])
  })

  test('format-bom-2: of two leading BOMs only the first is stripped', () => {
    expect(datas(Sse.decode(`${bom}${bom}data:1\n\ndata:2\n\ndata:3\n\n`))).toEqual(['2', '3'])
  })

  test('format-comments', () => {
    const long = 'x'.repeat(2 * 1024)
    const text = `data:1\r:\0\n:\r\ndata:2\n:${long}\rdata:3\n:data:fail\r:${long}\ndata:4\n\n`
    expect(datas(Sse.decode(text))).toEqual(['1\n2\n3\n4'])
  })

  test('format-data-before-final-empty-line: an event without its blank line is dropped', () => {
    expect(Sse.decode('retry:1000\ndata:test1\n\nid:test\ndata:test2\n')).toEqual([
      { event: 'message', data: 'test1', id: undefined, retry: 1000 },
    ])
  })

  test('format-field-data', () => {
    expect(datas(Sse.decode('data:\n\ndata\ndata\n\ndata:test\n\n'))).toEqual(['', '\n', 'test'])
  })

  test('format-field-event-empty', () => {
    expect(Sse.decode('event: \ndata:data\n\n')[0]?.event).toBe('message')
  })

  test('format-field-event', () => {
    expect(Sse.decode('event:test\ndata:x\n\ndata:x\n\n').map((e) => e.event)).toEqual([
      'test',
      'message',
    ])
  })

  test('format-field-id: the last event ID persists until an id field changes it', () => {
    const events = Sse.decode('id: 1\ndata: 1\n\ndata: 2\n\nid: 2\ndata:3\n\ndata:4\n\n')
    expect(events.map((e) => e.id)).toEqual(['1', '1', '2', '2'])
  })

  test.each(['id:\n', 'id\n'])('format-field-id-3: %j resets the last event ID', (reset) => {
    const events = Sse.decode(`id: 1\ndata: 1\n\n${reset}data:2\n\ndata:3\n\n`)
    expect(events.map((e) => e.id)).toEqual(['1', '', ''])
  })

  test.each(['\0\0', 'x\0', '\0x', 'x\0x', ' \0'])('format-field-id-null: ignores %j', (id) => {
    expect(Sse.decode(`id: ${id}\nretry: 200\ndata: hello\n\n`)[0]?.id).toBeUndefined()
  })

  test('format-field-id: a non-ASCII id', () => {
    expect(Sse.decode('id: …\ndata: hello\n\n')[0]?.id).toBe('…')
  })

  test('format-field-parsing', () => {
    const text =
      'data:\0\ndata:  2\rData:1\ndata\0:2\ndata:1\r\0data:4\nda-ta:3\rdata_5\ndata:3\rdata:\r\n data:32\ndata:4\n\n'
    expect(datas(Sse.decode(text))).toEqual(['\0\n 2\n1\n3\n\n4'])
  })

  test('format-field-retry: reads digits in base 10', () => {
    expect(Sse.decode('retry:03000\ndata:x\n\n')[0]?.retry).toBe(3000)
  })

  test('format-field-retry-bogus: ignores a value with other characters', () => {
    expect(Sse.decode('retry:3000\nretry:1000x\ndata:x\n\n')[0]?.retry).toBe(3000)
  })

  test('format-field-retry-empty', () => {
    expect(Sse.decode('retry\ndata:test\n\n')).toEqual([
      { event: 'message', data: 'test', id: undefined, retry: undefined },
    ])
  })

  test('format-field-unknown', () => {
    const text =
      'data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n'
    expect(datas(Sse.decode(text))).toEqual(['test\n\ntest'])
  })

  test('format-leading-space: only one leading space is removed', () => {
    expect(datas(Sse.decode('data:\ttest\rdata: \ndata:test\n\n'))).toEqual(['\ttest\n\ntest'])
  })

  test('format-newlines', () => {
    expect(datas(Sse.decode('data:test\r\ndata\ndata:test\r\n\r'))).toEqual(['test\n\ntest'])
  })

  test('format-null-character', () => {
    expect(datas(Sse.decode('data:\0\n\n'))).toEqual(['\0'])
  })

  test('format-utf-8: bytes are always UTF-8', () => {
    expect(
      datas(Sse.decode(new Uint8Array([...utf8('data:ok'), 0xe2, 0x80, 0xa6, 10, 10]))),
    ).toEqual(['ok…'])
  })

  test('event-data: field names are case-sensitive', () => {
    const text =
      'data:msg\ndata: msg\n\n:\nfalsefield:msg\n\nfalsefield:msg\nData:data\n\ndata\n\ndata:end\n\n'
    expect(datas(Sse.decode(text))).toEqual(['msg\nmsg', '', 'end'])
  })
})

describe('fetch-event-source', () => {
  test('reads a single line', () => {
    expect(Sse.decode('id: abc\n\ndata: x\n\n')[0]?.id).toBe('abc')
  })

  test('reads a line split across chunks', async () => {
    expect(await decodeChunks([utf8('id: a'), utf8('bc\ndata:'), utf8(' x\n\n')])).toEqual([
      { event: 'message', data: 'x', id: 'abc', retry: undefined },
    ])
  })

  test('reads a value with several colons', () => {
    expect(datas(Sse.decode('data: abc:def:ghi\n\n'))).toEqual(['abc:def:ghi'])
  })

  test('reads every field of one event', () => {
    expect(Sse.decode('retry: 42\nid: abc\nevent:def\ndata:ghi\n\n')).toEqual([
      { event: 'def', data: 'ghi', id: 'abc', retry: 42 },
    ])
  })

  test('a block without data is not an event', () => {
    expect(Sse.decode('id: abc\nfoo: null\n\n')).toEqual([])
    expect(Sse.decode('retry: def\n\n')).toEqual([])
    expect(Sse.decode('id:123\n:\n:    \nevent: foo \n\n')).toEqual([])
  })

  test('keeps a trailing space in the event type', () => {
    expect(Sse.decode('event: foo \ndata\n\n')[0]?.event).toBe('foo ')
  })

  test('appends data split across lines', () => {
    expect(datas(Sse.decode('data:YHOO\ndata: +2\ndata\ndata: 10\n\n'))).toEqual(['YHOO\n+2\n\n10'])
  })

  test('the last id field of a block wins', () => {
    expect(Sse.decode('id: foo\nid\ndata\n\n')[0]?.id).toBe('')
  })
})

describe('DecoderStream', () => {
  test('reads a Response body', async () => {
    const body = Array.from(
      { length: 10 },
      (_, i) => `event: foo\nid: evt-${i}\ndata: Hello ${i}\n\n`,
    )
    const events = await Streams.toArray(
      new Response(body.join('')).body!.pipeThrough(new Sse.DecoderStream()),
    )
    expect(events).toHaveLength(10)
    expect(events[9]).toEqual({ event: 'foo', data: 'Hello 9', id: 'evt-9', retry: undefined })
  })

  test('a retry from a block without data is reported on the next event', async () => {
    expect(await decodeChunks(['retry: 3000\n\n', 'data: a\n\n', 'data: b\n\n'])).toEqual([
      { event: 'message', data: 'a', id: undefined, retry: 3000 },
      { event: 'message', data: 'b', id: undefined, retry: undefined },
    ])
  })

  test('replaces invalid UTF-8 with U+FFFD', async () => {
    const events = await decodeChunks([new Uint8Array([...utf8('data: a'), 0xff]), utf8('b\n\n')])
    expect(datas(events)).toEqual(['a�b'])
  })

  test('reads text and byte chunks in one stream', async () => {
    expect(datas(await decodeChunks(['data: a', utf8('b\n'), '\n']))).toEqual(['ab'])
  })

  test('the signal fails the stream with its reason and cancels the source', async () => {
    const controller = new AbortController()
    let cancelled: unknown
    const source = new ReadableStream<string>({
      pull: (c) => c.enqueue('data: x\n\n'),
      cancel: (reason) => {
        cancelled = reason
      },
    })
    const reader = source
      .pipeThrough(new Sse.DecoderStream({ signal: controller.signal }))
      .getReader()
    await reader.read()
    const reason = new Error('stop')
    controller.abort(reason)
    await expect(reader.read()).rejects.toBe(reason)
    expect(cancelled).toBe(reason)
  })

  test('an aborted signal fails the stream at once', async () => {
    const reason = new Error('already')
    await expect(decodeChunks(['data: x\n\n'], { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
  })

  test('cancelling the output cancels the source', async () => {
    // The pipe cancels the source after `reader.cancel()` resolves, a tick later in some runtimes.
    let onCancel!: () => void
    const cancelled = new Promise<void>((resolve) => (onCancel = resolve))
    const source = new ReadableStream<string>({
      pull: (controller) => controller.enqueue('data: x\n\n'),
      cancel: () => onCancel(),
    })
    const reader = source.pipeThrough(new Sse.DecoderStream()).getReader()
    await reader.read()
    await reader.cancel()
    await expect(cancelled).resolves.toBeUndefined()
  })
})

describe('known upstream issues', () => {
  test('eventsource #326: mixed CRLF and LF line breaks drop no events', async () => {
    const text = 'data: 1\r\n\r\ndata: 2\n\ndata: 3\r\n\ndata: 4\n\r\n'
    expect(datas(Sse.decode(text))).toEqual(['1', '2', '3', '4'])
    expect(datas(await decodeChunks(text.split('')))).toEqual(['1', '2', '3', '4'])
  })

  test('eventsource-parser #11 and #13: empty data lines keep their line breaks', () => {
    expect(datas(Sse.decode('data: a\ndata\ndata\ndata: b\n\n'))).toEqual(['a\n\n\nb'])
  })

  test('eventsource-parser #19: a large line in many small chunks is read in linear time', async () => {
    const chunks = Array.from({ length: 20_000 }, () => 'x'.repeat(50))
    const events = await decodeChunks(['data: ', ...chunks, '\n\n'])
    expect(events[0]!.data).toHaveLength(1_000_000)
  })

  test('eventsource-parser #26: an invalid retry value is ignored', () => {
    expect(Sse.decode('retry: abc\ndata: x\n\n')[0]?.retry).toBeUndefined()
  })
})
