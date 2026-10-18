import { describe, expect, test } from 'vite-plus/test'
import { big5 } from '@portable/charset/big5'
import { gb18030, gbk } from '@portable/charset/gbk'
import * as Charset from '@portable/charset'
import { iso2022Jp } from '@portable/charset/iso-2022-jp'
import { shiftJis } from '@portable/charset/shift_jis'
import { windows1251, windows1252 } from '@portable/charset/single-byte'
import { utf16be, utf16le } from '@portable/charset/utf-16'
import { binary, collect, encodeStream, fromChunks, hex } from './utils.js'

const latin1Text = 'Hello123!£Å÷×çþÿ¿®'
const sample = '<?xml version="1.0" encoding="UTF-8"?>\n<俄语>данные</俄语>'
const utf8 = (text: string) => new TextEncoder().encode(text)

describe('encode', () => {
  test('returns a Uint8Array', () => {
    expect(Charset.encode('Hello123!', windows1252)).toBeInstanceOf(Uint8Array)
  })

  test('encodes Latin-1 text with the latin1 label', async () => {
    expect(Charset.encode(latin1Text, await Charset.load('latin1'))).toEqual(binary(latin1Text))
  })

  test('encodes UTF-8 and UTF-16LE text that decodes back to the input', async () => {
    for (const label of ['utf8', 'UTF-8', 'UCS2']) {
      const bytes = Charset.encode(latin1Text, await Charset.load(label))
      expect(new TextDecoder(label === 'UCS2' ? 'utf-16le' : 'utf-8').decode(bytes)).toBe(
        latin1Text,
      )
    }
  })

  test('reads Uint8Array input as UTF-8', () => {
    expect(Charset.encode(utf8('Привет'), windows1251)).toEqual(
      Charset.encode('Привет', windows1251),
    )
    expect(Charset.encode(utf8(latin1Text), Charset.utf8)).toEqual(utf8(latin1Text))
  })

  test('encodes empty input to no bytes', () => {
    expect(Charset.encode('', windows1251)).toEqual(new Uint8Array())
    expect(Charset.encode('', iso2022Jp)).toEqual(new Uint8Array())
    expect(Charset.encode(new Uint8Array(), shiftJis)).toEqual(new Uint8Array())
  })

  test('encodes NUL', () => {
    expect(Charset.encode('\0a\0', windows1251)).toEqual(new Uint8Array([0, 0x61, 0]))
    expect(Charset.encode('\0', gb18030)).toEqual(new Uint8Array([0]))
  })
})

describe('unmappable characters', () => {
  test("are written as '?' by default", () => {
    expect(hex(Charset.encode('外国人', windows1252))).toBe('3f3f3f')
    expect(hex(Charset.encode('a😀b', windows1251))).toBe('613f62')
    expect(hex(Charset.encode('😀', gbk))).toBe('3f')
  })

  test("are written as HTML numeric character references with 'html'", () => {
    const bytes = Charset.encode('a日😀', windows1251, { unmappable: 'html' })
    expect(new TextDecoder().decode(bytes)).toBe('a&#26085;&#128512;')
  })

  test("throw UnsupportedError with 'error'", () => {
    expect(() => Charset.encode('ok 日', windows1251, { unmappable: 'error' })).toThrow(
      Charset.UnsupportedError,
    )
    expect(() => Charset.encode('ok 日', windows1251, { unmappable: 'error' })).toThrow(/U\+65E5/)
    expect(Charset.encode('ok', windows1251, { unmappable: 'error' })).toEqual(binary('ok'))
  })

  test('are replaced with the text a function returns', () => {
    const seen: number[] = []
    const bytes = Charset.encode('a日本b', windows1251, {
      unmappable: (codePoint) => {
        seen.push(codePoint)
        return codePoint === 0x65e5 ? 'Д' : ''
      },
    })
    expect(seen).toEqual([0x65e5, 0x672c])
    expect(hex(bytes)).toBe('61c462')
  })

  test('throw UnsupportedError when the replacement is unmappable too', () => {
    expect(() => Charset.encode('日', windows1251, { unmappable: () => '本' })).toThrow(
      Charset.UnsupportedError,
    )
  })

  test('grow the output when replacements are longer than the input', () => {
    const text = '日'.repeat(10_000)
    const bytes = Charset.encode(text, windows1251, { unmappable: 'html' })
    expect(new TextDecoder().decode(bytes)).toBe('&#26085;'.repeat(10_000))
  })

  test('in ISO-2022-JP leave JIS X 0208 only for a replacement outside it', () => {
    const geta = Charset.encode('日😀本', iso2022Jp, { unmappable: () => '〓' })
    expect(hex(geta)).toBe('1b2442467c222e4b5c1b2842')
    const empty = Charset.encode('日😀本', iso2022Jp, { unmappable: () => '' })
    expect(new TextDecoder('iso-2022-jp').decode(empty)).toBe('日本')
  })

  test('in ISO-2022-JP are written in ASCII after leaving JIS X 0208', () => {
    const bytes = Charset.encode('日😀', iso2022Jp, { unmappable: 'html' })
    expect(new TextDecoder('iso-2022-jp').decode(bytes)).toBe('日&#128512;')
    expect(hex(bytes)).toBe('1b2442467c1b2842' + hex(binary('&#128512;')))
  })
})

describe('surrogates', () => {
  test('encodes a lone surrogate as U+FFFD', () => {
    expect(hex(Charset.encode('a\ud800b', Charset.utf8))).toBe('61efbfbd62')
    expect(hex(Charset.encode('a\udc00', utf16le))).toBe('6100fdff')
    expect(hex(Charset.encode('\ud800', gb18030))).toBe('8431a437')
    expect(hex(Charset.encode('Ê\ud800', big5))).toBe('3f3f')
    expect(hex(Charset.encode('\ud800', windows1251, { unmappable: 'html' }))).toBe(
      hex(binary('&#65533;')),
    )
  })

  test('encodes a surrogate pair as one character', () => {
    expect(hex(Charset.encode('𠕇', big5))).toBe('fa40')
    expect(hex(Charset.encode('𠕇', big5))).toBe('fa40')
    expect(hex(Charset.encode('😀', utf16be))).toBe('d83dde00')
  })
})

describe('byte order mark', () => {
  test('is written for UTF-8 with bom', () => {
    expect(Charset.encode(sample, Charset.utf8, { bom: true })).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(sample)]),
    )
  })

  test('is written for UTF-16LE and UTF-16BE with bom', () => {
    expect(hex(Charset.encode('a', utf16le, { bom: true }))).toBe('fffe6100')
    expect(hex(Charset.encode('a', utf16be, { bom: true }))).toBe('feff0061')
  })

  test('is not written by default, also for the utf-16 label', async () => {
    expect(hex(Charset.encode('a', await Charset.load('utf-16')))).toBe('6100')
    expect(hex(Charset.encode('a', Charset.utf8))).toBe('61')
  })

  test('is ignored for charsets without one', () => {
    expect(hex(Charset.encode('a', windows1251, { bom: true }))).toBe('61')
  })

  test('is written for empty input', () => {
    expect(hex(Charset.encode('', utf16le, { bom: true }))).toBe('fffe')
  })
})

describe('UTF-16', () => {
  const text = '1aя中文☃💩'

  test('encodes UTF-16BE', () => {
    expect(hex(Charset.encode(text, utf16be))).toBe('00310061044f4e2d65872603d83ddca9')
  })

  test('encodes UTF-16LE', () => {
    expect(hex(Charset.encode(text, utf16le))).toBe('310061004f042d4e876503263dd8a9dc')
  })
})

describe('EncoderStream', () => {
  test('encodes string chunks', async () => {
    expect(await encodeStream(['hello ', 'world!'], await Charset.load('us-ascii'))).toEqual(
      binary('hello world!'),
    )
  })

  test('reads Uint8Array chunks as UTF-8, also when a character is split', async () => {
    const bytes = utf8('абв')
    expect(hex(await encodeStream([bytes.subarray(0, 3), bytes.subarray(3)], windows1251))).toBe(
      'e0e1e2',
    )
  })

  test('accepts string and Uint8Array chunks in one stream', async () => {
    const bytes = utf8('б')
    expect(
      hex(await encodeStream(['а', bytes.subarray(0, 1), bytes.subarray(1), 'в'], windows1251)),
    ).toBe('e0e1e2')
  })

  test('writes U+FFFD for a truncated UTF-8 sequence before a string chunk', async () => {
    expect(hex(await encodeStream([utf8('б').subarray(0, 1), 'в'], windows1251))).toBe('3fe2')
  })

  test('errors on chunks that are neither strings nor Uint8Arrays', async () => {
    const stream = fromChunks<unknown>([42]).pipeThrough(
      new Charset.EncoderStream(windows1251) as unknown as TransformStream<unknown, Uint8Array>,
    )
    await expect(collect(stream)).rejects.toThrow(TypeError)
  })

  test('round-trips through TextDecoderStream', async () => {
    const decoded = await collect(
      fromChunks(['абв', 'где'])
        .pipeThrough(new Charset.EncoderStream(windows1251))
        .pipeThrough(new TextDecoderStream('windows-1251')),
    )
    expect(decoded.join('')).toBe('абвгде')
  })

  test('encodes UTF-8', async () => {
    expect(hex(await encodeStream(['丂'], Charset.utf8))).toBe('e4b882')
  })

  test('collects into one Uint8Array', async () => {
    expect(hex(await encodeStream(['абв', 'где'], windows1251))).toBe('e0e1e2e3e4e5')
  })

  test('writes the byte order mark once', async () => {
    expect(hex(await encodeStream(['a', 'b'], utf16le, { bom: true }))).toBe('fffe61006200')
    expect(hex(await encodeStream([], Charset.utf8, { bom: true }))).toBe('efbbbf')
  })

  test('writes the byte order mark once when a chunk holds no text', async () => {
    expect(hex(await encodeStream([''], Charset.utf8, { bom: true }))).toBe('efbbbf')
    expect(hex(await encodeStream(['', 'a'], utf16le, { bom: true }))).toBe('fffe6100')
    expect(hex(await encodeStream(['\ud83d', '\ude00'], utf16le, { bom: true }))).toBe(
      'fffe3dd800de',
    )
  })

  test('keeps ISO-2022-JP state across chunks and returns to ASCII at the end', async () => {
    const bytes = await encodeStream(['日', '本', 'a'], iso2022Jp)
    expect(hex(bytes)).toBe('1b2442467c4b5c1b284261')
    expect(hex(await encodeStream(['日'], iso2022Jp))).toBe('1b2442467c1b2842')
  })

  test('throws UnsupportedError from the stream with unmappable: error', async () => {
    await expect(encodeStream(['ok', '日'], windows1251, { unmappable: 'error' })).rejects.toThrow(
      Charset.UnsupportedError,
    )
  })

  describe('surrogate pairs split across chunks', () => {
    const cases: Record<string, string[]> = {
      'a single string': ['😻'],
      normal: ['\ud83d', '\ude3b'],
      reverse: ['\ude3b', '\ud83d'],
      'multiple surrogates': ['\ud83d', '\ude3b\ud83d', '\ude3b'],
      'more than one character with left': ['abc\ud83d', '\ude3b'],
      'more than one character with right': ['\ud83d', '\ude3befg'],
      'more than one character at both ends': ['abc\ud83d', '\ude3befg'],
      'surrogate pair interrupted': ['abc\ud83d', 'efg\ude3b'],
      'only the high surrogate': ['abc\ud83d'],
      'only the low surrogate': ['\ude3befg'],
      'a high surrogate in an empty chunk sequence': ['\ud83d', '', '\ude3b'],
    }
    test.for(Object.entries(cases))('%s', async ([, chunks]) => {
      const text = chunks.join('')
      expect(await encodeStream(chunks, Charset.utf8)).toEqual(utf8(text))
      expect(await encodeStream(chunks, gb18030)).toEqual(Charset.encode(text, gb18030))
      expect(await encodeStream(chunks, utf16le)).toEqual(Charset.encode(text, utf16le))
    })
  })
})
