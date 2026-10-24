import { describe, expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import {
  decode,
  difference,
  encode,
  fixture,
  formats,
  gzipMarkers,
  hex,
  randomBytes,
  samples,
  storedGzip,
} from './utils.js'

describe('round trips', () => {
  for (const format of formats) {
    for (const name of samples) {
      test(`${format}: ${name}`, async () => {
        const data = await fixture(name)
        const compressed = await Compress.encode(data, { format })
        expect(difference(await Compress.decode(compressed, { format }), data)).toBe(undefined)
      })
    }
  }

  test('defaults to gzip', async () => {
    const compressed = await Compress.encode('hello')
    expect([...compressed.subarray(0, 2)]).toEqual([0x1f, 0x8b])
    expect(decode(await Compress.decode(compressed))).toBe('hello')
    expect(decode(await Compress.decode(compressed, { format: 'gzip' }))).toBe('hello')
  })

  test('empty input', async () => {
    for (const format of formats) {
      const compressed = await Compress.encode(new Uint8Array(0), { format })
      expect(difference(await Compress.decode(compressed, { format }), new Uint8Array(0))).toBe(
        undefined,
      )
    }
  })

  test('encodes a string as UTF-8', async () => {
    const text = await fixture('lorem_utf_100k.txt')
    const fromString = await Compress.encode(decode(text))
    expect(difference(await Compress.decode(fromString), text)).toBe(undefined)
  })

  test('text with every UTF-8 length survives', async () => {
    const text = '🎵a♪5\u{e800}\u{10ffff}\u{fffff}'
    expect(decode(await Compress.decode(await Compress.encode(text)))).toBe(text)
  })

  test('reads a view with a byte offset', async () => {
    const compressed = await Compress.encode('offset')
    const padded = new Uint8Array(compressed.length + 7)
    padded.set(compressed, 3)
    expect(decode(await Compress.decode(padded.subarray(3, 3 + compressed.length)))).toBe('offset')
  })

  test('incompressible data larger than 128 KiB', async () => {
    const data = randomBytes(300_000, 1)
    for (const format of formats) {
      expect(
        difference(
          await Compress.decode(await Compress.encode(data, { format }), { format }),
          data,
        ),
      ).toBe(undefined)
    }
  })

  test('pako issue #78 sample', async () => {
    const data = await fixture('issue_78.bin')
    expect(difference(await Compress.decode(await Compress.encode(data)), data)).toBe(undefined)
  })
})

describe('decoding existing data', () => {
  for (const name of ['KW_Rocketry_1', 'shapefile', 'sheet2', 'sheet3', 'sheet4']) {
    test(`raw deflate sample ${name}`, async () => {
      const data = await Compress.decode(await fixture(`raw-${name}.deflate-raw`), {
        format: 'deflate-raw',
      })
      expect(data.length).toBeGreaterThan(0)
      const again = await Compress.encode(data, { format: 'deflate-raw' })
      expect(difference(await Compress.decode(again, { format: 'deflate-raw' }), data)).toBe(
        undefined,
      )
    })
  }
})

describe('gzip members', () => {
  test('joins every member, as gunzip does', async () => {
    const joined = new Uint8Array([
      ...(await Compress.encode('foo')),
      ...(await Compress.encode('bar')),
    ])
    expect(decode(await Compress.decode(joined))).toBe('foobar')
  })

  test('joins many members, including empty ones', async () => {
    const parts = ['a', '', 'bc', '', '', 'def']
    const members = await Promise.all(parts.map((part) => Compress.encode(part)))
    const joined = new Uint8Array(members.flatMap((member) => [...member]))
    expect(decode(await Compress.decode(joined))).toBe(parts.join(''))
  })

  test('the multi-member file from pako', async () => {
    const text = decode(await Compress.decode(await fixture('gzip-joined.gz')))
    expect(text).toHaveLength(48)
    expect(text.startsWith('0\n1\n2\n')).toBe(true)
  })

  test('a BGZF file', async () => {
    const text = decode(await Compress.decode(await fixture('gzip-joined-bgzip.gz')))
    expect(text).toHaveLength(65569)
    expect(text.startsWith('##genome-build b37\n')).toBe(true)
  })

  test('maxBytes counts every member', async () => {
    const joined = new Uint8Array([
      ...(await Compress.encode('foo')),
      ...(await Compress.encode('bar')),
    ])
    await expect(Compress.decode(joined, { maxBytes: 5 })).rejects.toThrow(Compress.MaxBytesError)
    expect(decode(await Compress.decode(joined, { maxBytes: 6 }))).toBe('foobar')
  })

  test('a member whose bytes repeat the gzip header', async () => {
    const data = gzipMarkers(3000)
    const first = storedGzip(data)
    const joined = new Uint8Array([
      ...first,
      ...storedGzip(data),
      ...(await Compress.encode('end')),
    ])
    const expected = new Uint8Array([...data, ...data, ...encode('end')])
    expect(difference(await Compress.decode(joined), expected)).toBe(undefined)
    await expect(
      Compress.decode(new Uint8Array([...first, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).rejects.toThrow(Compress.InvalidInputError)
  })

  test('a truncated second member', async () => {
    const second = await Compress.encode('bar')
    const joined = new Uint8Array([...(await Compress.encode('foo')), ...second.subarray(0, 12)])
    await expect(Compress.decode(joined)).rejects.toThrow(Compress.TruncatedError)
  })
})

describe('data after the end', () => {
  test('rejects zero padding after a gzip member', async () => {
    const padded = new Uint8Array([...(await Compress.encode('padded')), 0, 0, 0, 0, 0, 0, 0, 0])
    await expect(Compress.decode(padded)).rejects.toThrow(Compress.InvalidInputError)
  })

  test('rejects a second zlib stream', async () => {
    const data = hex('78 9c 73 74 74 4 0 1 89 0 c4 78 9c 73 72 72 2 0 1 8f 0 c7')
    await expect(Compress.decode(data, { format: 'deflate' })).rejects.toThrow(
      Compress.InvalidInputError,
    )
    await expect(Compress.decode(data.subarray(0, 11), { format: 'deflate' })).resolves.toEqual(
      encode('AAA'),
    )
  })

  test('rejects bytes after a raw deflate stream', async () => {
    const data = new Uint8Array([...(await Compress.encode('raw', { format: 'deflate-raw' })), 1])
    await expect(Compress.decode(data, { format: 'deflate-raw' })).rejects.toThrow(
      Compress.InvalidInputError,
    )
  })
})

describe('truncated input', () => {
  for (const format of formats) {
    test(`${format} cut before its end`, async () => {
      const full = await Compress.encode('some longer payload to truncate', { format })
      await expect(Compress.decode(full.subarray(0, full.length - 5), { format })).rejects.toThrow(
        Compress.TruncatedError,
      )
      expect(decode(await Compress.decode(full, { format }))).toBe(
        'some longer payload to truncate',
      )
    })
  }

  test('empty input', async () => {
    await expect(Compress.decode(new Uint8Array(0))).rejects.toThrow(Compress.TruncatedError)
  })

  test('a raw stream ended by a sync flush has no final block', async () => {
    const flushed = hex('ca 48 cd c9 c9 57 28 cf 2f ca 49 51 c8 40 b0 1 0 0 0 ff ff')
    const error = await Compress.decode(flushed, { format: 'deflate-raw' }).catch((e) => e)
    expect(error).toBeInstanceOf(Compress.TruncatedError)
    expect(error.name).toBe('Compress.TruncatedError')
    expect(error.cause).toBeInstanceOf(Error)
  })
})

describe('corrupt input', () => {
  test('a changed gzip CRC-32', async () => {
    const data = await Compress.encode('checksum')
    data[data.length - 8]! ^= 1
    await expect(Compress.decode(data)).rejects.toThrow(Compress.InvalidInputError)
  })

  test('a gzip length field that disagrees with the data', async () => {
    const data = await Compress.encode('length')
    data[data.length - 4]! += 1
    await expect(Compress.decode(data)).rejects.toThrow(Compress.InvalidInputError)
    data[data.length - 4]! -= 2
    await expect(Compress.decode(data)).rejects.toThrow(Compress.InvalidInputError)
  })

  test('a changed zlib Adler-32', async () => {
    const data = await Compress.encode('checksum', { format: 'deflate' })
    data[data.length - 1]! ^= 1
    await expect(Compress.decode(data, { format: 'deflate' })).rejects.toThrow(
      Compress.InvalidInputError,
    )
  })

  test('the wrong format', async () => {
    const gzip = await Compress.encode('format')
    await expect(Compress.decode(gzip, { format: 'deflate' })).rejects.toThrow(
      Compress.InvalidInputError,
    )
    const zlib = await Compress.encode('format', { format: 'deflate' })
    await expect(Compress.decode(zlib)).rejects.toThrow(Compress.InvalidInputError)
  })

  test('the error names its class', async () => {
    const error = await Compress.decode(encode('not gzip at all')).catch((e) => e)
    expect(error).toBeInstanceOf(Compress.InvalidInputError)
    expect(error.name).toBe('Compress.InvalidInputError')
  })
})

describe('maxBytes', () => {
  test('rejects output past the limit', async () => {
    const compressed = await Compress.encode(new Uint8Array(1_000_000))
    const error = await Compress.decode(compressed, { maxBytes: 999_999 }).catch((e) => e)
    expect(error).toBeInstanceOf(Compress.MaxBytesError)
    expect(error.name).toBe('Compress.MaxBytesError')
    expect(error.maxBytes).toBe(999_999)
  })

  test('accepts output exactly at the limit', async () => {
    const compressed = await Compress.encode(new Uint8Array(1_000_000))
    expect((await Compress.decode(compressed, { maxBytes: 1_000_000 })).length).toBe(1_000_000)
  })

  test('stops a zip bomb early', async () => {
    const bomb = await Compress.encode(new Uint8Array(20_000_000))
    expect(bomb.length).toBeLessThan(50_000)
    await expect(Compress.decode(bomb, { maxBytes: 1_000_000 })).rejects.toThrow(
      Compress.MaxBytesError,
    )
  })
})

// zlib's infcover.c cases, as pako ports them in test/zlib/inflate_cover.test.mjs. pako feeds
// the bytes without finishing the stream, so an incomplete stream passes there and is
// truncated here.
const cover = [
  ['bad gzip method', '1f 8b 0 0', 'gzip', 'invalid'],
  ['bad gzip flags', '1f 8b 8 80', 'gzip', 'invalid'],
  ['bad zlib method', '77 85', 'deflate', 'invalid'],
  ['set window size from header', '8 99', 'deflate', 'truncated'],
  ['bad zlib window size', '78 9c', 'deflate', 'truncated'],
  ['check adler32', '78 9c 63 0 0 0 1 0 1', 'deflate', '1'],
  ['bad header crc', '1f 8b 8 1e 0 0 0 0 0 0 1 0 0 0 0 0 0', 'gzip', 'invalid'],
  ['check gzip length', '1f 8b 8 2 0 0 0 0 0 0 1d 26 3 0 0 0 0 0 0 0 0 0', 'gzip', '0'],
  ['bad zlib header check', '78 90', 'deflate', 'invalid'],
  ['need dictionary', '8 b8 0 0 0 1', 'deflate', 'invalid'],
  ['compute adler32', '78 9c 63 0', 'deflate', 'truncated'],
  ['invalid stored block lengths', '0 0 0 0 0', 'deflate-raw', 'invalid'],
  ['fixed', '3 0', 'deflate-raw', '0'],
  ['invalid block type', '6', 'deflate-raw', 'invalid'],
  ['stored', '1 1 0 fe ff 0', 'deflate-raw', '1'],
  ['too many length or distance symbols', 'fc 0 0', 'deflate-raw', 'invalid'],
  ['invalid code lengths set', '4 0 fe ff', 'deflate-raw', 'invalid'],
  ['invalid bit length repeat', '4 0 24 49 0', 'deflate-raw', 'invalid'],
  ['invalid bit length repeat (2)', '4 0 24 e9 ff ff', 'deflate-raw', 'invalid'],
  ['invalid code -- missing end-of-block', '4 0 24 e9 ff 6d', 'deflate-raw', 'invalid'],
  [
    'invalid literal/lengths set',
    '4 80 49 92 24 49 92 24 71 ff ff 93 11 0',
    'deflate-raw',
    'invalid',
  ],
  [
    'invalid literal/length code',
    '4 80 49 92 24 49 92 24 f b4 ff ff c3 84',
    'deflate-raw',
    'invalid',
  ],
  ['invalid distance code', '2 7e ff ff', 'deflate-raw', 'invalid'],
  ['invalid distance too far back', 'c c0 81 0 0 0 0 0 90 ff 6b 4 0', 'deflate-raw', 'invalid'],
  ['incorrect data check', '1f 8b 8 0 0 0 0 0 0 0 3 0 0 0 0 1', 'gzip', 'invalid'],
  ['incorrect length check', '1f 8b 8 0 0 0 0 0 0 0 3 0 0 0 0 0 0 0 0 1', 'gzip', 'invalid'],
  ['pull 17', '5 c0 21 d 0 0 0 80 b0 fe 6d 2f 91 6c', 'deflate-raw', '0'],
  [
    'long code',
    '5 e0 81 91 24 cb b2 2c 49 e2 f 2e 8b 9a 47 56 9f fb fe ec d2 ff 1f',
    'deflate-raw',
    '0',
  ],
  ['length extra', 'ed c0 1 1 0 0 0 40 20 ff 57 1b 42 2c 4f', 'deflate-raw', '516'],
  [
    'long distance and extra',
    'ed cf c1 b1 2c 47 10 c4 30 fa 6f 35 1d 1 82 59 3d fb be 2e 2a fc f c',
    'deflate-raw',
    '518',
  ],
  ['window end', `ed c0 81 0 0 0 0 80 a0 fd a9 17 a9${' 0'.repeat(32)} 6`, 'deflate-raw', '33025'],
  ['inflate_fast TYPE return', '2 8 20 80 0 3 0', 'deflate-raw', '0'],
  ['window wrap', '63 18 5 40 c 0', 'deflate-raw', '262'],
  [
    'fast length extra bits',
    'e5 e0 81 ad 6d cb b2 2c c9 1 1e 59 63 ae 7d ee fb 4d fd b5 35 41 68 ff 7f f 0 0 0',
    'deflate-raw',
    'invalid',
  ],
  [
    'fast distance extra bits',
    '25 fd 81 b5 6d 59 b6 6a 49 ea af 35 6 34 eb 8c b9 f6 b9 1e ef 67 49 50 fe ff ff 3f 0 0',
    'deflate-raw',
    'invalid',
  ],
  ['fast invalid literal/length code', '1b 7 0 0 0 0 0', 'deflate-raw', 'invalid'],
  [
    'fast 2nd level codes and too far back',
    'd c7 1 ae eb 38 c 4 41 a0 87 72 de df fb 1f b8 36 b1 38 5d ff ff 0',
    'deflate-raw',
    'invalid',
  ],
  ['very common case', '63 18 5 8c 10 8 0 0 0 0', 'deflate-raw', 'invalid'],
  [
    'contiguous and wrap around window',
    '63 60 60 18 c9 0 8 18 18 18 26 c0 28 0 29 0 0 0',
    'deflate-raw',
    'invalid',
  ],
  ['copy direct from output', '63 0 3 0 0 0 0 0', 'deflate-raw', 'invalid'],
] satisfies readonly [name: string, bytes: string, format: Compress.Format, result: string][]

describe('zlib inflate coverage', () => {
  for (const [name, bytes, format, result] of cover) {
    test(`${name}`, async () => {
      const outcome = await Compress.decode(hex(bytes), { format }).then(
        (output) => String(output.length),
        (error) =>
          error instanceof Compress.InvalidInputError
            ? 'invalid'
            : error instanceof Compress.TruncatedError
              ? 'truncated'
              : error,
      )
      expect(outcome).toBe(result)
    })
  }
})
