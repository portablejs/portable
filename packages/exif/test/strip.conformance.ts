import { describe, expect, test } from 'vite-plus/test'
import * as Exif from '@portable/exif'
import * as Png from '@portable/png'
import {
  ascii,
  buildTiff,
  concat,
  entry,
  exifPrefix,
  fixture,
  fixtures,
  randomChunks,
  tracked,
} from './utils.js'

const supported = fixtures.filter((name) => /\.(jpg|png)$/.test(name))
const unsupported = fixtures.filter((name) => !supported.includes(name))

function includes(bytes: Uint8Array, text: string): boolean {
  const needle = ascii(text)
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

/** Walks the JPEG segments to the start-of-scan marker. */
function indexOfScan(bytes: Uint8Array): number {
  let i = 2
  while (bytes[i + 1] !== 0xda) i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!)
  return i
}

/** Reads `stream` to the end. `Response.arrayBuffer` would replace a stream error with a `TypeError` in Chromium. */
async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return concat(...parts)
    parts.push(value)
  }
}

async function stripStream(chunks: readonly Uint8Array[], options?: Exif.StripStream.Options) {
  return collect(tracked(chunks).stream.pipeThrough(new Exif.StripStream(options)))
}

const empty = { ifd1: {}, exif: {}, gps: {}, interop: {} }

function keptOrientation(original: Exif.Metadata): Exif.Tags {
  const orientation = original.ifd0.Orientation
  return typeof orientation === 'number' && orientation >= 2 && orientation <= 8
    ? { Orientation: orientation }
    : {}
}

describe('strip', () => {
  for (const name of supported) {
    test(`leaves no tags but Orientation in ${name}`, async () => {
      const bytes = await fixture(name)
      const stripped = Exif.parse(Exif.strip(bytes))
      expect(stripped).toMatchObject({ ...empty, ifd0: keptOrientation(Exif.parse(bytes)) })
      expect(stripped.thumbnail).toBeUndefined()
      expect(Exif.parse(Exif.strip(bytes, { keepOrientation: false }))).toMatchObject({
        ...empty,
        ifd0: {},
      })
    })

    test(`StripStream matches strip for ${name} in random chunks`, async () => {
      const bytes = await fixture(name)
      for (const options of [{}, { keepOrientation: false, keepColorProfile: false }]) {
        const expected = Exif.strip(bytes, options)
        for (const seed of [1, 2]) {
          const chunks = randomChunks(bytes, seed, seed === 1 && bytes.length < 50_000 ? 64 : 4096)
          expect(await stripStream(chunks, options)).toEqual(expected)
        }
      }
    })

    test(`leaves no tags but Orientation in truncated copies of ${name}`, async () => {
      const bytes = await fixture(name)
      for (let i = 1; i < 16; i++) {
        const prefix = bytes.subarray(0, Math.floor((bytes.length * i) / 16))
        const ifds = Exif.parse(Exif.strip(prefix, { keepOrientation: false }))
        expect(ifds).toMatchObject({ ...empty, ifd0: {} })
      }
    })
  }

  for (const name of unsupported) {
    test(`throws UnsupportedError for ${name}`, async () => {
      const bytes = await fixture(name)
      expect(() => Exif.strip(bytes)).toThrow(Exif.UnsupportedError)
      await expect(stripStream([bytes])).rejects.toThrow(Exif.UnsupportedError)
    })
  }

  test('keeps the Orientation of a JPEG', async () => {
    const stripped = Exif.strip(await fixture('orientation-f6t.jpg'))
    expect(Exif.parse(stripped).ifd0).toEqual({ Orientation: 6 })
  })

  test('removes the XMP and Photoshop segments of a JPEG and keeps its scan data and ICC profile', async () => {
    const bytes = await fixture('issue-fast-exif-2.jpg')
    for (const text of ['Exif\0\0', 'http://ns.adobe.com/xap/1.0/', 'Photoshop 3.0', 'ICC_PROFILE'])
      expect(includes(bytes, text)).toBe(true)
    const stripped = Exif.strip(bytes)
    expect(includes(stripped, 'http://ns.adobe.com/xap/1.0/')).toBe(false)
    expect(includes(stripped, 'Photoshop 3.0')).toBe(false)
    expect(includes(stripped, 'ICC_PROFILE')).toBe(true)
    expect(includes(stripped, 'JFIF')).toBe(true)
    expect(stripped.subarray(indexOfScan(stripped))).toEqual(bytes.subarray(indexOfScan(bytes)))
    expect(includes(Exif.strip(bytes, { keepColorProfile: false }), 'ICC_PROFILE')).toBe(false)
  })

  test('removes eXIf and XMP from a PNG without changing its pixels', async () => {
    const bytes = await fixture('png_with_exif_and_gps.png')
    expect(Exif.parse(bytes).gps).not.toEqual({})
    expect(includes(bytes, 'XML:com.adobe.xmp')).toBe(true)
    const stripped = Exif.strip(bytes)
    expect(includes(stripped, 'XML:com.adobe.xmp')).toBe(false)
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(bytes)).data)
  })

  test('writes an eXIf chunk with a valid CRC when a PNG has an Orientation', async () => {
    const tiff = buildTiff({ ifd0: [entry(0x010f, 2, 'Canon'), entry(0x0112, 3, [8])] })
    const source = await fixture('png_with_exif_and_gps.png')
    const end = source.length - 12
    const exif = concat([0, 0, 0, tiff.length], ascii('eXIf'), tiff, [0, 0, 0, 0])
    const bytes = concat(source.subarray(0, end), exif, source.subarray(end))
    const stripped = Exif.strip(bytes)
    expect(Exif.parse(stripped).ifd0).toEqual({ Orientation: 8 })
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(source)).data)
  })

  test('removes the color profile of a PNG only when asked', async () => {
    const bytes = await fixture('IMG_20180725_163423-1.png')
    expect(includes(Exif.strip(bytes), 'iCCP')).toBe(true)
    const stripped = Exif.strip(bytes, { keepColorProfile: false })
    expect(includes(stripped, 'iCCP')).toBe(false)
    expect((await Png.decode(stripped)).data).toEqual((await Png.decode(bytes)).data)
  })

  describe('WebP', () => {
    const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]
    const chunk = (type: string, data: Uint8Array) =>
      concat(ascii(type), le32(data.length), data, data.length & 1 ? [0] : [])
    const riff = (...chunks: readonly Uint8Array[]) => {
      const body = concat(ascii('WEBP'), ...chunks)
      return concat(ascii('RIFF'), le32(body.length), body)
    }
    const vp8x = (flags: number) =>
      chunk('VP8X', new Uint8Array([flags, 0, 0, 0, 99, 0, 0, 49, 0, 0]))
    const icc = chunk('ICCP', ascii('profile'))
    const image = chunk('VP8L', new Uint8Array(1001).fill(7))
    const tiff = buildTiff({ ifd0: [entry(0x010f, 2, 'Canon'), entry(0x0112, 3, [6])] })
    const minimal = buildTiff({ ifd0: [entry(0x0112, 3, [6])] })
    const bytes = riff(
      vp8x(0x20 | 0x10 | 0x08 | 0x04),
      icc,
      image,
      chunk('EXIF', concat(exifPrefix, tiff)),
      chunk('XMP ', ascii('<x:xmpmeta/>')),
    )

    test('removes EXIF and XMP, keeps the image chunk, and fixes the header and flags', () => {
      const stripped = Exif.strip(bytes)
      expect(stripped).toEqual(riff(vp8x(0x20 | 0x10 | 0x08), icc, image, chunk('EXIF', minimal)))
      expect(Exif.parse(stripped)).toMatchObject({
        ...empty,
        ifd0: { Orientation: 6 },
        imageSize: { width: 100, height: 50 },
      })
    })

    test('clears the EXIF and ICC flags when nothing is kept', () => {
      const stripped = Exif.strip(bytes, { keepOrientation: false, keepColorProfile: false })
      expect(stripped).toEqual(riff(vp8x(0x10), image))
    })

    test('StripStream matches strip in random chunks', async () => {
      for (const seed of [1, 2, 3])
        expect(await stripStream(randomChunks(bytes, seed, 64))).toEqual(Exif.strip(bytes))
    })
  })

  test('throws InvalidInputError for a JPEG with bytes between segments', () => {
    const bytes = concat([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0], [0x12, 0x34], [0xff, 0xd9])
    expect(() => Exif.strip(bytes)).toThrow(Exif.InvalidInputError)
  })

  test('StripStream errors with the abort reason', async () => {
    const controller = new AbortController()
    const source = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([0xff, 0xd8]))
      },
    })
    const result = collect(source.pipeThrough(new Exif.StripStream({ signal: controller.signal })))
    controller.abort(new Error('stop'))
    await expect(result).rejects.toThrow('stop')
  })
})
