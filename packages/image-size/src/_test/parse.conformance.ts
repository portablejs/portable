import { describe, expect, test } from 'vite-plus/test'
import * as ImageSize from '../index.js'
import { chunked, encode, fixture, fixtures, tracked } from './utils.js'

const sample = { width: 123, height: 456 }
const icoSizes = [256, 128, 96, 72, 64, 48, 32, 24, 16].map((size) => ({
  width: size,
  height: size,
}))

const expected: Record<string, ImageSize.Size> = {
  'valid/bmp/sample.bmp': { ...sample, type: 'bmp' },
  'valid/cur/sample.cur': { width: 32, height: 32, type: 'cur' },
  'valid/dds/sample.dds': { ...sample, type: 'dds' },
  'valid/gif/sample.gif': { ...sample, type: 'gif' },
  'valid/heif/sample-garbled.avif': { ...sample, type: 'avif' },
  'valid/heif/sample-multi.heic': { ...sample, type: 'heic' },
  'valid/heif/sample.avif': { ...sample, type: 'avif' },
  'valid/heif/sample.heic': { ...sample, type: 'heic' },
  'valid/heif/sample.heif': { ...sample, type: 'heic' },
  'valid/icns/sample.icns': {
    width: 128,
    height: 128,
    type: 'icns',
    images: [
      { width: 16, height: 16, type: 'is32' },
      { width: 16, height: 16, type: 's8mk' },
      { width: 32, height: 32, type: 'il32' },
      { width: 32, height: 32, type: 'l8mk' },
      { width: 48, height: 48, type: 'ih32' },
      { width: 48, height: 48, type: 'h8mk' },
      { width: 128, height: 128, type: 'it32' },
      { width: 128, height: 128, type: 't8mk' },
    ],
  },
  'valid/ico/multi-size-compressed.ico': { width: 256, height: 256, type: 'ico', images: icoSizes },
  'valid/ico/multi-size.ico': { width: 256, height: 256, type: 'ico', images: icoSizes },
  'valid/ico/sample-256-compressed.ico': { width: 256, height: 256, type: 'ico' },
  'valid/ico/sample-256.ico': { width: 256, height: 256, type: 'ico' },
  'valid/ico/sample-compressed.ico': { width: 32, height: 32, type: 'ico' },
  'valid/ico/sample.ico': { width: 32, height: 32, type: 'ico' },
  'valid/jp2/sample.jp2': { ...sample, type: 'jp2' },
  'valid/jpg/1x2-flipped-big-endian.jpg': { width: 1, height: 2, type: 'jpg', orientation: 8 },
  'valid/jpg/1x2-flipped-little-endian.jpg': { width: 1, height: 2, type: 'jpg', orientation: 8 },
  'valid/jpg/large.jpg': { width: 1600, height: 1200, type: 'jpg', orientation: 1 },
  'valid/jpg/optimized.jpg': { ...sample, type: 'jpg' },
  'valid/jpg/progressive.jpg': { ...sample, type: 'jpg' },
  'valid/jpg/sample.jpg': { ...sample, type: 'jpg' },
  'valid/jpg/sampleExported.jpg': { ...sample, type: 'jpg' },
  'valid/jpg/very-large.jpg': { width: 4800, height: 3600, type: 'jpg', orientation: 1 },
  'valid/jxl/sample.jxl': { ...sample, type: 'jxl' },
  'valid/jxl-stream/large_16_9.jxl': { width: 1920, height: 1080, type: 'jxl-stream' },
  'valid/jxl-stream/large_explicit.jxl': { width: 3000, height: 2000, type: 'jxl-stream' },
  'valid/jxl-stream/max_small.jxl': { width: 256, height: 256, type: 'jxl-stream' },
  'valid/jxl-stream/min_large.jxl': { width: 257, height: 257, type: 'jxl-stream' },
  'valid/jxl-stream/sample.jxl.stream': { ...sample, type: 'jxl-stream' },
  'valid/jxl-stream/small_rect.jxl': { width: 120, height: 80, type: 'jxl-stream' },
  'valid/jxl-stream/small_square.jxl': { width: 64, height: 64, type: 'jxl-stream' },
  'valid/ktx/sample.ktx': { ...sample, type: 'ktx' },
  'valid/ktx/sample.ktx2': { ...sample, type: 'ktx2' },
  'valid/png/animated.png': { ...sample, type: 'png' },
  'valid/png/sample.png': { ...sample, type: 'png' },
  'valid/png/sample_fried.png': { width: 128, height: 68, type: 'png' },
  'valid/pnm/sample-ascii.pbm': { ...sample, type: 'pnm' },
  'valid/pnm/sample-ascii.pgm': { ...sample, type: 'pnm' },
  'valid/pnm/sample-ascii.ppm': { ...sample, type: 'pnm' },
  'valid/pnm/sample.pam': { ...sample, type: 'pnm' },
  'valid/pnm/sample.pbm': { ...sample, type: 'pnm' },
  'valid/pnm/sample.pfm': { ...sample, type: 'pnm' },
  'valid/pnm/sample.pgm': { ...sample, type: 'pnm' },
  'valid/pnm/sample.ppm': { ...sample, type: 'pnm' },
  'valid/psd/sample.psd': { ...sample, type: 'psd' },
  'valid/svg/exponent-width-height.svg': { ...sample, type: 'svg' },
  'valid/svg/ignore-stroke-width.svg': { ...sample, type: 'svg' },
  'valid/svg/percentage.svg': { ...sample, type: 'svg' },
  'valid/svg/single-quotes.svg': { ...sample, type: 'svg' },
  'valid/svg/units-inches.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-height.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-lowercase.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-units.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-width-height-brackets.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-width-height.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox-width.svg': { ...sample, type: 'svg' },
  'valid/svg/viewbox.svg': { ...sample, type: 'svg' },
  'valid/svg/width-height.svg': { ...sample, type: 'svg' },
  'valid/tga/sample.tga': { ...sample, type: 'tga' },
  'valid/tiff/big-endian.tiff': { ...sample, type: 'tiff' },
  'valid/tiff/bigtiff-big-endian.tiff': { ...sample, type: 'bigtiff' },
  'valid/tiff/bigtiff-jpeg.tiff': { ...sample, type: 'bigtiff' },
  'valid/tiff/bigtiff-little-endian.tiff': { ...sample, type: 'bigtiff' },
  'valid/tiff/jpeg.tiff': { ...sample, type: 'tiff' },
  'valid/tiff/little-endian.tiff': { ...sample, type: 'tiff' },
  'valid/webp/extended.webp': { ...sample, type: 'webp' },
  'valid/webp/lossless.webp': { ...sample, type: 'webp' },
  'valid/webp/lossy.webp': { ...sample, type: 'webp' },
}

const invalid = [
  'invalid/broken-quotes.svg',
  'invalid/malformed.svg',
  'invalid/no-quotes.svg',
  'invalid/sample.png',
  'invalid/width.svg',
]

const u32be = (value: number) => [
  value >>> 24,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]
const u16be = (value: number) => [value >> 8, value & 0xff]
const u16le = (value: number) => [value & 0xff, value >> 8]

function concat(...parts: readonly (string | readonly number[] | Uint8Array)[]): Uint8Array {
  const arrays = parts.map((part) =>
    typeof part === 'string'
      ? Uint8Array.from(part, (c) => c.charCodeAt(0))
      : Uint8Array.from(part),
  )
  const result = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of arrays) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

/** An ISO BMFF box. */
const box = (name: string, ...content: (string | readonly number[] | Uint8Array)[]) => {
  const body = concat(...content)
  return concat(u32be(8 + body.length), name, body)
}
const fullBox = (
  name: string,
  version: number,
  flags: number,
  ...content: (string | readonly number[] | Uint8Array)[]
) => box(name, [version, 0, 0, flags], ...content)
const ispe = (width: number, height: number) => fullBox('ispe', 0, 0, u32be(width), u32be(height))

/** A HEIF file whose `ipco` holds `properties` and whose primary item 1 uses `associations`. */
function heif(brand: string, properties: readonly Uint8Array[], associations: readonly number[]) {
  return concat(
    box('ftyp', brand, u32be(0), 'mif1'),
    fullBox(
      'meta',
      0,
      0,
      fullBox('pitm', 0, 0, u16be(1)),
      box(
        'iprp',
        box('ipco', ...properties),
        fullBox('ipma', 0, 0, u32be(1), u16be(1), [associations.length], associations),
      ),
    ),
    box('mdat', new Uint8Array(64)),
  )
}

/** A JPEG with an optional Exif segment before a frame header with `marker`. */
function jpeg(marker: number, exif?: Uint8Array) {
  const app1 = exif ? concat([0xff, 0xe1], u16be(exif.length + 8), 'Exif\0\0', exif) : []
  const frame = concat([0xff, marker], u16be(11), [8], u16be(456), u16be(123), [1, 1, 0x11, 0])
  return concat([0xff, 0xd8], app1, frame, [0xff, 0xda])
}

async function parseChunks(chunks: readonly Uint8Array[], options?: ImageSize.parseStream.Options) {
  return ImageSize.parseStream(tracked(chunks).stream, options)
}

describe('valid images', () => {
  test('every fixture has an expected size', () => {
    expect(fixtures.filter((path) => path.startsWith('valid/')).sort()).toEqual(
      Object.keys(expected).sort(),
    )
  })

  for (const [path, size] of Object.entries(expected)) {
    test(`${path}`, async () => {
      const bytes = await fixture(path)
      expect(ImageSize.parse(bytes)).toEqual(size)
      expect(await parseChunks(chunked(bytes, 4096))).toEqual(size)
      expect(
        await parseChunks(chunked(bytes, 1).slice(0, 4096).concat(bytes.subarray(4096))),
      ).toEqual(size)
    })
  }
})

describe('invalid images', () => {
  for (const path of invalid) {
    test(`${path}`, async () => {
      const bytes = await fixture(path)
      expect(() => ImageSize.parse(bytes)).toThrow(ImageSize.InvalidInputError)
      await expect(parseChunks([bytes])).rejects.toThrow(ImageSize.InvalidInputError)
    })
  }

  test('error names are namespaced', async () => {
    const svg = await fixture('invalid/width.svg')
    expect(() => ImageSize.parse(svg)).toThrow(
      expect.objectContaining({ name: 'ImageSize.InvalidInputError', message: 'Invalid SVG' }),
    )
    expect(() => ImageSize.parse(encode('hello world'))).toThrow(
      expect.objectContaining({ name: 'ImageSize.UnsupportedError' }),
    )
    expect(() => ImageSize.parse(new Uint8Array())).toThrow(
      expect.objectContaining({ name: 'ImageSize.TruncatedError' }),
    )
  })

  test('rejects bytes that match no format', async () => {
    expect(() => ImageSize.parse(encode('hello world, this is plain text'))).toThrow(
      ImageSize.UnsupportedError,
    )
    await expect(parseChunks([encode('hello world')])).rejects.toThrow(ImageSize.UnsupportedError)
  })

  test('a TIFF cut off before its first IFD is truncated', async () => {
    const bytes = await fixture('valid/tiff/little-endian.tiff')
    expect(() => ImageSize.parse(bytes.subarray(0, 2048))).toThrow(ImageSize.TruncatedError)
  })
})

describe('truncated input', () => {
  test('throws TruncatedError, not a RangeError, when the header is cut short', async () => {
    const cuts = {
      'valid/png/sample.png': 20,
      'valid/gif/sample.gif': 8,
      'valid/webp/lossy.webp': 25,
    }
    for (const [path, length] of Object.entries(cuts)) {
      const bytes = await fixture(path)
      expect(() => ImageSize.parse(bytes.subarray(0, length))).toThrow(ImageSize.TruncatedError)
    }
  })

  test('throws TruncatedError for an empty input or stream', async () => {
    expect(() => ImageSize.parse(new Uint8Array())).toThrow(ImageSize.TruncatedError)
    await expect(parseChunks([])).rejects.toThrow(ImageSize.TruncatedError)
  })

  test('throws TruncatedError for a JPEG that ends before its frame header', async () => {
    const bytes = await fixture('valid/jpg/sample.jpg')
    expect(() => ImageSize.parse(bytes.subarray(0, 100))).toThrow(ImageSize.TruncatedError)
  })

  test('throws TruncatedError when maxBytes is reached first', async () => {
    const bytes = jpeg(0xc0, new Uint8Array(1000))
    await expect(parseChunks(chunked(bytes, 100), { maxBytes: 500 })).rejects.toThrow(
      ImageSize.TruncatedError,
    )
    expect(await parseChunks(chunked(bytes, 100), { maxBytes: 2000 })).toEqual({
      ...sample,
      type: 'jpg',
    })
  })
})

describe('prefixes and corrupt headers', () => {
  const errors = [ImageSize.TruncatedError, ImageSize.InvalidInputError, ImageSize.UnsupportedError]
  const outcome = (bytes: Uint8Array) => {
    try {
      return ImageSize.parse(bytes)
    } catch (error) {
      return errors.find((type) => error instanceof type) ?? error
    }
  }

  test('a prefix gives the full answer or throws TruncatedError', async () => {
    for (const path of Object.keys(expected).filter((path) => !path.endsWith('.svg'))) {
      const bytes = await fixture(path)
      for (const length of [0, 1, 2, 7, 16, 31, 64, 256, 1024, 4096]) {
        const result = outcome(bytes.subarray(0, length))
        expect(
          [expected[path], ImageSize.TruncatedError],
          `${path} cut to ${length}`,
        ).toContainEqual(result)
      }
    }
  })

  test('corrupt headers give a size or one of the package errors, never a RangeError', async () => {
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (const path of Object.keys(expected)) {
      const original = await fixture(path)
      for (let round = 0; round < 20; round++) {
        const bytes = original.slice(0, 2048)
        for (let flips = 0; flips < 4; flips++) {
          bytes[Math.floor(random() * Math.min(bytes.length, 64))] = Math.floor(random() * 256)
        }
        const result = outcome(bytes)
        expect(
          errors.includes(result as never) || typeof (result as ImageSize.Size).width === 'number',
        ).toBe(true)
      }
    }
  })
})

describe('parseStream', () => {
  test('reads only the header of a large JPEG, then cancels the stream', async () => {
    const bytes = await fixture('valid/jpg/large.jpg')
    const { stream, read, cancelled } = tracked(chunked(bytes, 1024))
    expect(await ImageSize.parseStream(stream)).toEqual(expected['valid/jpg/large.jpg'])
    expect(read()).toBe(5 * 1024)
    expect(cancelled()).toBe(true)
  })

  test('reads a PNG one byte at a time and stops after the IHDR chunk', async () => {
    const bytes = await fixture('valid/png/sample.png')
    const { stream, read, cancelled } = tracked(chunked(bytes, 1))
    expect(await ImageSize.parseStream(stream)).toEqual({ ...sample, type: 'png' })
    expect(read()).toBe(24)
    expect(cancelled()).toBe(true)
  })

  test('cancels the stream when the input is invalid', async () => {
    const bytes = await fixture('invalid/sample.png')
    const { stream, cancelled } = tracked(chunked(bytes, 4))
    await expect(ImageSize.parseStream(stream)).rejects.toThrow(ImageSize.InvalidInputError)
    expect(cancelled()).toBe(true)
  })

  test('passes on an error from the source stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('network down'))
      },
    })
    await expect(ImageSize.parseStream(stream)).rejects.toThrow('network down')
  })
})

describe('JPEG', () => {
  test('reads every start-of-frame marker, including lossless and arithmetic-coded', () => {
    for (const marker of [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]) {
      expect(ImageSize.parse(jpeg(marker))).toEqual({ ...sample, type: 'jpg' })
    }
  })

  test('reads a frame header that directly follows the start-of-image marker', () => {
    expect(ImageSize.parse(jpeg(0xc0))).toEqual({ ...sample, type: 'jpg' })
  })

  test('skips segments that look like a frame header but are not one', () => {
    const dht = concat([0xff, 0xc4], u16be(6), [0, 0, 0, 0])
    const bytes = concat([0xff, 0xd8], dht, jpeg(0xc2).subarray(2))
    expect(ImageSize.parse(bytes)).toEqual({ ...sample, type: 'jpg' })
  })

  test('follows the IFD0 offset in the Exif header instead of assuming 8', () => {
    const orientation = concat(u16be(0x0112), u16be(3), u32be(1), u16be(6), [0, 0])
    const exif = concat('MM', u16be(42), u32be(16), new Uint8Array(8), u16be(1), orientation)
    expect(ImageSize.parse(jpeg(0xc0, exif))).toEqual({ ...sample, type: 'jpg', orientation: 6 })
  })

  test('ignores an orientation that is not a single SHORT', () => {
    const orientation = concat(u16be(0x0112), u16be(4), u32be(1), u32be(6))
    const exif = concat('MM', u16be(42), u32be(8), u16be(1), orientation)
    expect(ImageSize.parse(jpeg(0xc0, exif))).toEqual({ ...sample, type: 'jpg' })
  })

  test('ignores an Exif segment whose IFD runs past the segment', () => {
    const exif = concat('II', u16le(42), [8, 0, 0, 0], u16le(5))
    expect(ImageSize.parse(jpeg(0xc0, exif))).toEqual({ ...sample, type: 'jpg' })
  })

  test('rejects a JPEG whose scan starts before any frame header', () => {
    expect(() => ImageSize.parse(concat([0xff, 0xd8, 0xff, 0xda], u16be(2)))).toThrow(
      ImageSize.InvalidInputError,
    )
  })
})

describe('HEIF', () => {
  test('applies the clean aperture to the primary image', () => {
    const clap = box('clap', u32be(100), u32be(1), u32be(50), u32be(1), new Uint8Array(16))
    expect(ImageSize.parse(heif('heic', [ispe(124, 456), clap], [1, 2]))).toEqual({
      width: 100,
      height: 50,
      type: 'heic',
    })
  })

  test('swaps width and height for a 90 degree rotation', () => {
    const irot = box('irot', [1])
    expect(ImageSize.parse(heif('avif', [ispe(123, 456), irot], [1, 2]))).toEqual({
      width: 456,
      height: 123,
      type: 'avif',
    })
  })

  test('keeps width and height for a 180 degree rotation', () => {
    const irot = box('irot', [2])
    expect(ImageSize.parse(heif('avif', [ispe(123, 456), irot], [1, 2]))).toEqual({
      ...sample,
      type: 'avif',
    })
  })

  test('reports the primary item, not the first or largest image property', () => {
    const bytes = heif('heic', [ispe(1024, 1024), ispe(123, 456)], [2])
    expect(ImageSize.parse(bytes)).toEqual({ ...sample, type: 'heic' })
  })

  test('detects animated AVIF', () => {
    expect(ImageSize.parse(heif('avis', [ispe(123, 456)], [1]))).toEqual({
      ...sample,
      type: 'avis',
    })
  })

  test('throws TruncatedError for a file that ends before its meta box', () => {
    expect(() => ImageSize.parse(box('ftyp', 'heic', u32be(0)))).toThrow(ImageSize.TruncatedError)
  })
})

describe('TIFF', () => {
  test('reads only the entries the IFD declares', () => {
    const entry = (tag: number, value: number) =>
      concat(u16le(tag), u16le(3), [1, 0, 0, 0], u16le(value), [0, 0])
    const bytes = concat(
      'II',
      u16le(42),
      [8, 0, 0, 0],
      u16le(2),
      entry(256, 123),
      entry(257, 456),
      [100, 0, 0, 0],
      entry(256, 9999),
    )
    expect(ImageSize.parse(bytes)).toEqual({ ...sample, type: 'tiff' })
  })

  test('rejects an IFD without width and height', () => {
    const bytes = concat('MM', u16be(42), u32be(8), u16be(0), u32be(0))
    expect(() => ImageSize.parse(bytes)).toThrow(ImageSize.InvalidInputError)
  })
})

describe('ICNS', () => {
  test('skips entries that are not icons, such as the table of contents', () => {
    const entry = (type: string, length: number) =>
      concat(type, u32be(length), new Uint8Array(length - 8))
    const body = concat(entry('TOC ', 16), entry('ic07', 12), entry('icnV', 12))
    const bytes = concat('icns', u32be(8 + body.length), body)
    expect(ImageSize.parse(bytes)).toEqual({ width: 128, height: 128, type: 'icns' })
  })

  test('throws TruncatedError when the entries run past the input', async () => {
    const bytes = await fixture('valid/icns/sample.icns')
    expect(() => ImageSize.parse(bytes.subarray(0, 1000))).toThrow(ImageSize.TruncatedError)
  })
})

describe('SVG', () => {
  test('reads a viewBox separated by commas or repeated spaces', () => {
    expect(ImageSize.parse(encode('<svg viewBox="0,0,123,456"></svg>'))).toEqual({
      ...sample,
      type: 'svg',
    })
    expect(ImageSize.parse(encode('<svg viewBox=" 0  0 123   456 "></svg>'))).toEqual({
      ...sample,
      type: 'svg',
    })
  })

  test('waits for the whole root tag when streamed', async () => {
    const bytes = encode(
      `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="123" height="456"></svg>`,
    )
    expect(await parseChunks(chunked(bytes, 3))).toEqual({ ...sample, type: 'svg' })
  })
})

describe('PNM', () => {
  test('reads width and height split across lines with comments between', () => {
    expect(ImageSize.parse(encode('P6\n# made by hand\n123\n# height next\n456\n255\n'))).toEqual({
      ...sample,
      type: 'pnm',
    })
  })

  test('reads a PAM header in any order', () => {
    const header = 'P7\nHEIGHT 456\nDEPTH 3\nWIDTH 123\nMAXVAL 255\nTUPLTYPE RGB\nENDHDR\n'
    expect(ImageSize.parse(encode(header))).toEqual({ ...sample, type: 'pnm' })
  })

  test('rejects a header whose dimensions are not numbers', () => {
    expect(() => ImageSize.parse(encode('P5\nabc def\n255\n'))).toThrow(ImageSize.InvalidInputError)
  })
})

describe('other formats', () => {
  test('BMP stored top-down reports a positive height', () => {
    const bytes = concat(
      'BM',
      new Uint8Array(16),
      [123, 0, 0, 0],
      [0x38, 0xfe, 0xff, 0xff],
      new Uint8Array(4),
    )
    expect(ImageSize.parse(bytes)).toEqual({ ...sample, type: 'bmp' })
  })

  test('ICO with one image has no images list', async () => {
    expect(ImageSize.parse(await fixture('valid/ico/sample.ico'))).not.toHaveProperty('images')
  })
})
