import { describe, expect, test } from 'vite-plus/test'
import { LineStream, MaxLengthError } from '../index.js'
import empty from './fixtures/empty.txt?raw'
import rfc from './fixtures/rfc.txt?raw'
import { chunked, collect, encode, fromChunks, split, unicodeLineBreak } from './utils.js'

describe('split2', () => {
  test('splits two lines on end', async () => {
    expect(await split(['hello\nworld'])).toEqual(['hello', 'world'])
  })

  test('splits two lines on two writes', async () => {
    expect(await split(['hello', '\nworld'])).toEqual(['hello', 'world'])
  })

  test('splits four lines on three writes', async () => {
    expect(await split(['hello\nwor', 'ld\nbye\nwo', 'rld'])).toEqual([
      'hello',
      'world',
      'bye',
      'world',
    ])
  })

  test('accumulates multiple writes', async () => {
    expect(await split(['hello', 'world'])).toEqual(['helloworld'])
  })

  test('splits on a custom string separator', async () => {
    expect(await split(['hello~world'], { separator: '~' })).toEqual(['hello', 'world'])
  })

  test('splits on a custom regexp separator', async () => {
    expect(await split(['hello~world'], { separator: /~/ })).toEqual(['hello', 'world'])
  })

  test('splits on a custom Symbol.split separator', async () => {
    const separator = { [Symbol.split]: (text: string) => text.split('~') }
    expect(await split(['hello~world'], { separator })).toEqual(['hello', 'world'])
  })

  test('splits windows-style lines', async () => {
    expect(await split(['hello\r\nworld'])).toEqual(['hello', 'world'])
  })

  test('splits bytes', async () => {
    expect(await split([encode('hello\nworld')])).toEqual(['hello', 'world'])
  })

  test('splits multi-byte characters written one byte at a time', async () => {
    expect(await split(chunked(encode('烫烫烫\r\n锟斤拷'), 1))).toEqual(['烫烫烫', '锟斤拷'])
  })

  test('splits multi-byte characters written two bytes at a time', async () => {
    expect(await split(chunked(encode('烫烫烫\r\n烫烫烫'), 2))).toEqual(['烫烫烫', '烫烫烫'])
  })

  test('splits when the newline ends a chunk', async () => {
    expect(await split(['hello\n', 'world'])).toEqual(['hello', 'world'])
  })

  test('replaces a truncated multi-byte character at the end', async () => {
    const bytes = encode('烫烫')
    expect(await split([bytes.subarray(0, 3), bytes.subarray(3, 4)])).toEqual(['烫�'])
  })

  test('errors when a line exceeds maxLength', async () => {
    await expect(split(['hey'], { maxLength: 2 })).rejects.toThrow(MaxLengthError)
  })

  test('allows chunks longer than maxLength when every line fits', async () => {
    expect(await split(['a\nb'], { maxLength: 2 })).toEqual(['a', 'b'])
  })

  test('skips lines longer than maxLength', async () => {
    expect(await split(['a\n123', '456', '789\nb\nc'], { maxLength: 2, overflow: 'skip' })).toEqual(
      ['a', 'b', 'c'],
    )
  })

  test('applies maxLength to whole lines regardless of chunking', async () => {
    await expect(split(['ok\ntoolong\n'], { maxLength: 4 })).rejects.toThrow(MaxLengthError)
    expect(await split(['ok\ntoolong\nok2'], { maxLength: 4, overflow: 'skip' })).toEqual([
      'ok',
      'ok2',
    ])
  })

  test('does not modify the options object', async () => {
    const options = {}
    await split([], options)
    expect(options).toEqual({})
  })

  test('emits nothing for empty input', async () => {
    expect(await split([])).toEqual([])
  })
})

describe('byline', () => {
  test('pipes a small file', async () => {
    const lines = await split([encode(rfc.slice(0, 4096))])
    expect(lines.join('')).toBe(rfc.slice(0, 4096).replace(/\n/g, ''))
  })

  test('ignores empty lines when skipEmpty is set', async () => {
    expect(await split([encode(empty)], { skipEmpty: true })).toEqual(['Line 6'])
  })

  test('keeps empty lines by default', async () => {
    expect(await split([encode(empty)])).toEqual(['', '', '', '', '', 'Line 6'])
  })

  test('does not split a CRLF that spans two chunks', async () => {
    const text = `${'A'.repeat(65535)}\r\nB`
    const options = { separator: unicodeLineBreak }
    expect(await split(chunked(encode(text), 65536), options)).toEqual(['A'.repeat(65535), 'B'])
    expect(await split([`${'A'.repeat(10)}\r`, '\nB'], options)).toEqual(['A'.repeat(10), 'B'])
  })

  test('reads a large file', async () => {
    const expected = rfc.split(unicodeLineBreak).filter((line) => line.length > 0)
    const lines = await split(chunked(encode(rfc), 16384), {
      separator: unicodeLineBreak,
      skipEmpty: true,
    })
    expect(lines).toEqual(expected)
  })

  test('reads a file with more lines than the default high water mark', async () => {
    const huge = rfc + rfc
    const expected = huge.split(unicodeLineBreak).filter((line) => line.length > 0)
    const lines = await split(chunked(encode(huge), 16384), {
      separator: unicodeLineBreak,
      skipEmpty: true,
    })
    expect(lines).toEqual(expected)
  })

  test('keeps every line when the reader is slow', async () => {
    const expected = rfc.split('\n').filter((line) => line.length > 0)
    const stream = fromChunks(chunked(encode(rfc), 4096)).pipeThrough(
      new LineStream({ skipEmpty: true }),
    )
    const lines = await collect(stream, async (count) => {
      if (count % 500 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lines).toEqual(expected)
  })
})

describe('LineStream', () => {
  test('decodes bytes with the given encoding', async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x6f, 0x6b])
    expect(await split([latin1], { encoding: 'latin1' })).toEqual(['café', 'ok'])
  })

  test('keeps a lone trailing CR that is not part of a separator', async () => {
    expect(await split(['a\r'])).toEqual(['a\r'])
  })

  test('resumes after a skipped overflow that ends the stream', async () => {
    expect(await split(['a\n12345'], { maxLength: 2, overflow: 'skip' })).toEqual(['a'])
  })

  test('cancelling the output cancels the source', async () => {
    let cancelled = false
    const source = new ReadableStream<string>({
      pull: (controller) => controller.enqueue('line\n'),
      cancel: () => {
        cancelled = true
      },
    })
    const reader = source.pipeThrough(new LineStream()).getReader()
    expect((await reader.read()).value).toBe('line')
    await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancelled).toBe(true)
  })
})
