import { unzlibSync, zlibSync } from 'fflate'
import { describe, expect, test } from 'vite-plus/test'
import * as Png from '@portable/png'
import {
  adam7Scanlines,
  buildPng,
  encodeChunk,
  fixture,
  fixtures,
  hex,
  idat,
  pixel,
  randomBytes,
} from './utils.js'

const pngsuite = [...fixtures.keys()].filter((path) => path.startsWith('pngsuite/'))

describe('pngjs png-parse-spec', () => {
  test('parses a 1-bit colormap image', async () => {
    const png = await Png.decode(fixture('pngjs/1bit.png'))
    expect(png.width).toBe(1024)
    expect(png.height).toBe(1024)
    expect(png.data.length).toBe(1024 * 1024 * 4)
    const black = png.data.every((value, i) => value === (i % 4 === 3 ? 255 : 0))
    expect(black).toBe(true)
  })

  test('parses an 8-bit grayscale image', async () => {
    const png = await Png.decode(fixture('pngjs/grayscale.png'))
    expect([png.width, png.height, png.data.length]).toEqual([16, 16, 16 * 16 * 4])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(pixel(png, x, y)).toBe((x ^ y) * 286331136 + 255)
  })

  test('parses an 8-bit truecolor image', async () => {
    const png = await Png.decode(fixture('pngjs/truecolor.png'))
    expect([png.width, png.height, png.data.length]).toEqual([16, 16, 16 * 16 * 4])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        expect(pixel(png, x, y)).toBe(x * 285212672 + y * 1114112 + (x ^ y) * 4352 + 255)
  })

  test('parses an 8-bit truecolor image with alpha', async () => {
    const png = await Png.decode(fixture('pngjs/truecoloralpha.png'))
    expect([png.width, png.height, png.data.length]).toEqual([16, 16, 16 * 16 * 4])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        expect(pixel(png, x, y)).toBe(x * 285212672 + y * 1114112 + (x ^ y) * 17)
  })

  test('reads an image with scanline filters', async () => {
    const png = await Png.decode(fixture('pngjs/accum.png'))
    expect([png.width, png.height, png.data.length]).toEqual([1024, 1024, 1024 * 1024 * 4])
    expect(pixel(png, 0, 0)).toBe(0xff0000ff)
    expect(pixel(png, 1, 0)).toBe(0xff0000ff)
    expect(pixel(png, 420, 308)).toBe(0xff0029ff)
    expect(pixel(png, 433, 308)).toBe(0x0a299dff)
    expect(pixel(png, 513, 308)).toBe(0x0066ffff)
    expect(pixel(png, 728, 552)).toBe(0xff0047ff)
  })

  const indexedColor = (x: number, y: number) =>
    x + y < 8 ? 0xff0000ff : x + y < 16 ? 0x00ff00ff : x + y < 24 ? 0x0000ffff : 0x000000ff

  test('reads an indexed color image', async () => {
    const png = await Png.decode(fixture('pngjs/indexed.png'))
    expect([png.width, png.height, png.data.length]).toEqual([16, 16, 16 * 16 * 4])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) expect(pixel(png, x, y)).toBe(indexedColor(x, y))
  })

  test('reads an indexed color image with alpha', async () => {
    const png = await Png.decode(fixture('pngjs/indexedalpha.png'))
    expect([png.width, png.height, png.data.length]).toEqual([16, 16, 16 * 16 * 4])
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        expect(pixel(png, x, y)).toBe(x >= 4 && x < 12 ? 0 : indexedColor(x, y))
  })

  test('reads an image that uses every filter type', async () => {
    const png = await Png.decode(fixture('pngjs/paeth.png'))
    expect([png.width, png.height, png.data.length]).toEqual([512, 512, 512 * 512 * 4])
    const expected: [number, number, number][] = [
      [0, 0, 0xff000000],
      [1, 0, 0xff000000],
      [0, 1, 0xff000000],
      [2, 2, 0xff000000],
      [0, 50, 0xff000000],
      [219, 248, 0xff000d00],
      [220, 248, 0xff000d00],
      [215, 249, 0xff000c00],
      [216, 249, 0xff000c00],
      [217, 249, 0xff000d00],
      [218, 249, 0xff000d00],
      [219, 249, 0xff000e00],
      [220, 249, 0xff000e00],
      [263, 319, 0xff002100],
      [145, 318, 0x05535a00],
      [395, 286, 0x0007ff00],
      [152, 167, 0x052c3500],
      [153, 167, 0x04303600],
      [154, 167, 0x042f3700],
      [100, 168, 0xff000400],
      [120, 168, 0xff000900],
      [140, 168, 0xff001b00],
      [150, 168, 0x05313600],
      [152, 168, 0x04343c00],
      [153, 168, 0x03343f00],
      [154, 168, 0x03344100],
      [155, 168, 0x02344300],
      [156, 168, 0x02314400],
      [157, 168, 0x02323f00],
      [158, 168, 0x03313900],
    ]
    for (const [x, y, value] of expected) expect(pixel(png, x, y)).toBe(value)
  })

  test('rejects input that is not a PNG', async () => {
    await expect(Png.decode(new TextEncoder().encode('I AM NOT ACTUALLY A PNG'))).rejects.toThrow(
      Png.InvalidInputError,
    )
  })

  test('rejects an empty file', async () => {
    await expect(Png.decode(new Uint8Array(0))).rejects.toThrow(Png.InvalidInputError)
  })

  test('rejects a bad chunk type', async () => {
    await expect(Png.decode(fixture('pngjs/with_bad_type.png'))).rejects.toThrow(
      Png.InvalidInputError,
    )
  })

  test('rejects a truncated file', async () => {
    await expect(Png.decode(hex('89504e470d0a1a0a000000'))).rejects.toThrow(Png.TruncatedError)
  })

  test('rejects a file with no IEND', async () => {
    const bytes = hex(
      '89504e470d0a1a0a0000000d49484452000000100000001008000000003a98a0bd000000017352474200aece1ce90000002174455874536f6674776172650047726170686963436f6e7665727465722028496e74656c297787fa190000008849444154789c448e4111c020100363010b58c00216b080052c60010b58c0c259c00216ae4d3b69df99dd0d1062caa5b63ee6b27d1c012996dceae86b6ef38398106acb65ae3e8edbbef780564b5e73743fdb409e1ef2f4803c3de4e901797ac8d3f3f0f490a7077ffffd03f5f507eaeb0fd4d71fa8af3f505f7fa0befe7c7dfdb9000000ffff0300c0fd7f8179301408',
    )
    await expect(Png.decode(bytes)).rejects.toThrow(Png.TruncatedError)
  })

  test('reports alpha for an image with a tRNS chunk', async () => {
    const png = await Png.decode(fixture('pngsuite/tbbn0g04.png'))
    expect(png.colorType).toBe(0)
    expect(png.alpha).toBe(true)
  })
})

describe('pngjs convert-images-spec', () => {
  const invalid = pngsuite.filter((path) => path.startsWith('pngsuite/x'))
  for (const path of invalid) {
    test(`rejects ${path}`, async () => {
      const bytes = fixture(path)
      await expect(Png.decode(bytes)).rejects.toThrow(Png.InvalidInputError)
      expect(() => Png.decodeSync(bytes, { inflate: unzlibSync })).toThrow(Png.InvalidInputError)
    })
  }
  for (const path of pngsuite.filter((path) => !invalid.includes(path))) {
    test(`converts ${path}`, async () => {
      const bytes = fixture(path)
      const png = await Png.decode(bytes)
      expect(Png.decodeSync(bytes, { inflate: unzlibSync }).data).toEqual(png.data)
      const roundTrip = await Png.decode(await Png.encode(png))
      expect(roundTrip.data).toEqual(png.data)
      const roundTripSync = Png.decodeSync(Png.encodeSync(png, { deflate: zlibSync }), {
        inflate: unzlibSync,
      })
      expect(roundTripSync.data).toEqual(png.data)
    })
  }
})

describe('pngjs bg-spec', () => {
  test('writes a checkerboard created from scratch', async () => {
    const width = 10
    const height = 10
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = x < width >> 1 !== y < height >> 1 ? 0xe5 : 0xff
        data.set([color, color, color, 0xff], (y * width + x) * 4)
      }
    }
    const reference = await Png.decode(fixture('pngjs/bg-ref.png'))
    expect((await Png.decode(await Png.encode({ width, height, data }))).data).toEqual(
      reference.data,
    )
  })
})

describe('decode', () => {
  test('decodes every interlaced PngSuite image to the same pixels as its non-interlaced twin', async () => {
    const pairs = pngsuite
      .filter((path) => /^pngsuite\/(bas|s\d\d)i/.test(path))
      .map((path) => [path, path.replace(/i(\d\w\d\d\.png)$/, 'n$1')] as const)
    expect(pairs.length).toBe(33)
    for (const [interlaced, plain] of pairs) {
      const a = await Png.decode(fixture(interlaced))
      const b = await Png.decode(fixture(plain))
      expect(a.interlace).toBe(true)
      expect(b.interlace).toBe(false)
      expect(a.data).toEqual(b.data)
    }
  })

  test('decodes data split across many IDAT chunks', async () => {
    const reference = await Png.decode(fixture('pngsuite/basn2c16.png'))
    for (const path of ['oi1n2c16', 'oi2n2c16', 'oi4n2c16', 'oi9n2c16'])
      expect((await Png.decode(fixture(`pngsuite/${path}.png`))).data).toEqual(reference.data)
  })

  test('scales every bit depth to 8 bits', async () => {
    const gray = async (name: string) =>
      (await Png.decode(fixture(`pngsuite/${name}.png`))).data.filter((_, i) => i % 4 === 0)
    expect(new Set(await gray('basn0g01'))).toEqual(new Set([0, 255]))
    expect(new Set(await gray('basn0g02'))).toEqual(new Set([0, 85, 170, 255]))
    expect((await gray('basn0g04')).every((value) => value % 17 === 0)).toBe(true)
  })

  test('makes the tRNS color fully transparent and keeps its value', async () => {
    const png = await Png.decode(fixture('pngsuite/tbrn2c08.png'))
    const transparent = new Set<string>()
    for (let i = 0; i < png.data.length; i += 4)
      if (png.data[i + 3] === 0) transparent.add(png.data.subarray(i, i + 3).join())
    expect([...transparent]).toEqual(['255,255,255'])
    const gray = await Png.decode(fixture('pngsuite/tbbn0g04.png'))
    expect(gray.data.some((value, i) => i % 4 === 3 && value === 0)).toBe(true)
  })

  test('returns the gamma from the gAMA chunk', async () => {
    const low = await Png.decode(fixture('pngsuite/g03n2c08.png'))
    const high = await Png.decode(fixture('pngsuite/g25n2c08.png'))
    expect(low.gamma).toBe(0.35)
    expect(high.gamma).toBe(2.5)
    expect((await Png.decode(await Png.encode(low))).gamma).toBe(0.35)
    expect((await Png.decode(await Png.encode({ ...low, gamma: undefined }))).gamma).toBeUndefined()
  })

  test('ignores bytes after IEND', async () => {
    const bytes = fixture('pngsuite/basn0g08.png')
    const padded = new Uint8Array(bytes.length + 5)
    padded.set(bytes)
    expect((await Png.decode(padded)).data).toEqual((await Png.decode(bytes)).data)
  })

  test('decodes a view into a larger buffer', async () => {
    const bytes = fixture('pngsuite/basn6a08.png')
    const buffer = new Uint8Array(bytes.length + 7)
    buffer.set(bytes, 3)
    const view = buffer.subarray(3, 3 + bytes.length)
    expect((await Png.decode(view)).data).toEqual((await Png.decode(bytes)).data)
  })

  test('rejects a CRC mismatch unless checkCrc is false', async () => {
    const bytes = fixture('pngsuite/basn0g08.png').slice()
    const at = bytes.length - 20
    bytes[at] = bytes[at]! ^ 0xff
    await expect(Png.decode(bytes)).rejects.toThrow(Png.InvalidInputError)
    expect(() => Png.decodeSync(bytes, { inflate: unzlibSync })).toThrow(Png.InvalidInputError)
    const header = fixture('pngsuite/xhdn0g08.png')
    const reference = await Png.decode(fixture('pngsuite/basn0g08.png'))
    expect((await Png.decode(header, { checkCrc: false })).data).toEqual(reference.data)
  })

  test('rejects an unknown critical chunk and skips an unknown ancillary chunk', async () => {
    const bytes = fixture('pngsuite/basn0g08.png')
    const withChunk = (type: string) => {
      const chunk = encodeChunk(type, new Uint8Array([1, 2, 3]))
      const out = new Uint8Array(bytes.length + chunk.length)
      out.set(bytes.subarray(0, 33))
      out.set(chunk, 33)
      out.set(bytes.subarray(33), 33 + chunk.length)
      return out
    }
    await expect(Png.decode(withChunk('CRIT'))).rejects.toThrow(Png.UnsupportedError)
    expect((await Png.decode(withChunk('ancl'))).data).toEqual((await Png.decode(bytes)).data)
  })

  test('uses the inflate function it is given', async () => {
    const bytes = fixture('pngsuite/basn3p08.png')
    let calls = 0
    const inflate = async (data: Uint8Array) => {
      calls++
      return unzlibSync(data)
    }
    expect((await Png.decode(bytes, { inflate })).data).toEqual((await Png.decode(bytes)).data)
    expect(calls).toBe(1)
  })

  test('wraps an inflate failure in InvalidInputError', async () => {
    const failure = new Error('boom')
    const inflate = () => {
      throw failure
    }
    const bytes = fixture('pngsuite/basn0g08.png')
    await expect(Png.decode(bytes, { inflate })).rejects.toMatchObject({
      name: 'Png.InvalidInputError',
      cause: failure,
    })
    expect(() => Png.decodeSync(bytes, { inflate })).toThrow(Png.InvalidInputError)
  })

  test('rejects image data shorter than the image', async () => {
    const bytes = fixture('pngsuite/basn0g08.png')
    const inflate = (data: Uint8Array) => unzlibSync(data).subarray(0, 100)
    await expect(Png.decode(bytes, { inflate })).rejects.toThrow(Png.TruncatedError)
  })
})

describe('encode', () => {
  const source = Png.decodeSync(fixture('pngsuite/basn6a08.png'), { inflate: unzlibSync })

  test('writes RGBA by default', async () => {
    const png = await Png.decode(await Png.encode(source))
    expect(png).toMatchObject({ width: 32, height: 32, colorType: 6, depth: 8, interlace: false })
    expect(png.data).toEqual(source.data)
  })

  for (const filter of [0, 1, 2, 3, 4] as const) {
    test(`writes rows with filter ${filter}`, async () => {
      const random = { width: 23, height: 17, data: randomBytes(23 * 17 * 4, filter + 1) }
      const encoded = await Png.encode(random, { filter })
      expect((await Png.decode(encoded)).data).toEqual(random.data)
      const raw = unzlibSync(idat(encoded))
      for (let row = 0; row < random.height; row++) expect(raw[row * (23 * 4 + 1)]).toBe(filter)
    })
  }

  test('chooses only from the filters it is given', async () => {
    const random = { width: 31, height: 9, data: randomBytes(31 * 9 * 4, 42) }
    const allowed: Png.FilterType[] = [1, 3]
    const raw = unzlibSync(idat(await Png.encode(random, { filter: allowed })))
    for (let row = 0; row < random.height; row++) expect(allowed).toContain(raw[row * (31 * 4 + 1)])
  })

  test('writes grayscale as BT.709 luma, blended onto white', async () => {
    const data = new Uint8Array([30, 60, 90, 255, 0, 0, 0, 0, 255, 255, 255, 128])
    const png = await Png.decode(await Png.encode({ width: 3, height: 1, data }, { colorType: 0 }))
    expect(png.colorType).toBe(0)
    // 0.2126 * 30 + 0.7152 * 60 + 0.0722 * 90 = 56.29
    expect([...png.data]).toEqual([56, 56, 56, 255, 255, 255, 255, 255, 255, 255, 255, 255])
  })

  test('writes grayscale with alpha', async () => {
    const data = new Uint8Array([30, 60, 91, 7, 255, 0, 0, 0])
    const png = await Png.decode(await Png.encode({ width: 2, height: 1, data }, { colorType: 4 }))
    expect(png.colorType).toBe(4)
    expect([...png.data]).toEqual([56, 56, 56, 7, 54, 54, 54, 0])
  })

  test('writes RGB by blending onto the background', async () => {
    const data = new Uint8Array([10, 20, 30, 255, 200, 100, 50, 0, 200, 100, 50, 51])
    const background = { red: 0, green: 255, blue: 100 }
    const png = await Png.decode(
      await Png.encode({ width: 3, height: 1, data }, { colorType: 2, background }),
    )
    expect(png.colorType).toBe(2)
    expect([...png.data]).toEqual([10, 20, 30, 255, 0, 255, 100, 255, 40, 224, 90, 255])
  })

  test('writes the gamma it is given', async () => {
    const png = await Png.decode(await Png.encode({ ...source, gamma: 0.45455 }))
    expect(png.gamma).toBe(0.45455)
  })

  test('accepts Uint8ClampedArray pixels', async () => {
    const data = new Uint8ClampedArray(source.data)
    expect((await Png.decode(await Png.encode({ ...source, data }, { colorType: 2 }))).width).toBe(
      32,
    )
  })

  test('uses the deflate function it is given', async () => {
    const levels = await Promise.all(
      [0, 9].map(async (level) =>
        Png.encode(source, { deflate: (data) => zlibSync(data, { level: level as 0 | 9 }) }),
      ),
    )
    expect(levels[0]!.length).toBeGreaterThan(levels[1]!.length)
    for (const bytes of levels) expect((await Png.decode(bytes)).data).toEqual(source.data)
  })

  test('rejects pixel data of the wrong length', async () => {
    const data = new Uint8Array(10)
    await expect(Png.encode({ width: 2, height: 2, data })).rejects.toThrow(Png.InvalidInputError)
    expect(() => Png.encodeSync({ width: 0, height: 0, data }, { deflate: zlibSync })).toThrow(
      Png.InvalidInputError,
    )
  })

  test('rejects an unknown filter', async () => {
    await expect(Png.encode(source, { filter: 5 as Png.FilterType })).rejects.toThrow(RangeError)
    await expect(Png.encode(source, { filter: [] })).rejects.toThrow(RangeError)
  })
})

describe('known upstream issues', () => {
  const rgba = { width: 1, height: 1, depth: 8, colorType: 6 }

  test('decodes a zlib stream followed by garbage inside IDAT', async () => {
    const compressed = zlibSync(new Uint8Array([0, 1, 2, 3, 4]))
    const padded = new Uint8Array(compressed.length + 6)
    padded.set(compressed)
    padded.set([0xde, 0xad, 0xbe, 0xef, 0, 0], compressed.length)
    expect([...(await Png.decode(buildPng(rgba, padded))).data]).toEqual([1, 2, 3, 4])
  })

  test('stops at the image size when IDAT inflates to more data than the image needs', async () => {
    const compressed = zlibSync(new Uint8Array(1_000_000).fill(7, 1, 5))
    const png = await Png.decode(buildPng(rgba, compressed))
    expect([...png.data]).toEqual([7, 7, 7, 7])
  })

  test('round-trips a single pixel', async () => {
    const image = { width: 1, height: 1, data: new Uint8Array([9, 8, 7, 6]) }
    expect([...(await Png.decode(await Png.encode(image))).data]).toEqual([9, 8, 7, 6])
  })

  test('decodes interlaced images of every small width and height', async () => {
    for (let width = 1; width <= 17; width++) {
      for (let height = 1; height <= 17; height += 3) {
        const image = { width, height, data: randomBytes(width * height * 4, width * 31 + height) }
        const bytes = buildPng(
          { width, height, depth: 8, colorType: 6, interlace: 1 },
          zlibSync(adam7Scanlines(image)),
        )
        const png = await Png.decode(bytes)
        expect(png.interlace).toBe(true)
        expect(png.data).toEqual(image.data)
      }
    }
  })

  test('rejects a file with no IDAT instead of returning nothing', async () => {
    await expect(Png.decode(fixture('pngsuite/xdtn0g01.png'))).rejects.toThrow(
      Png.InvalidInputError,
    )
  })

  test('rejects every truncation of a file instead of hanging', async () => {
    const bytes = fixture('pngsuite/basi6a08.png')
    for (let length = 0; length < bytes.length; length += 97) {
      const error = await Png.decode(bytes.subarray(0, length)).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toMatch(/^Png\.(TruncatedError|InvalidInputError)$/)
    }
  })

  test('rejects a header that claims more pixels than the data can hold, before allocating', async () => {
    const huge = { width: 0x7fffffff, height: 0x7fffffff, depth: 8, colorType: 6 }
    await expect(Png.decode(buildPng(huge, zlibSync(new Uint8Array(10))))).rejects.toThrow(
      Png.TruncatedError,
    )
  })

  test('rejects a palette index past the end of PLTE', async () => {
    const plte = encodeChunk('PLTE', new Uint8Array([255, 0, 0]))
    const bytes = buildPng(
      { width: 1, height: 1, depth: 8, colorType: 3 },
      zlibSync(new Uint8Array([0, 1])),
    )
    const withPalette = new Uint8Array(bytes.length + plte.length)
    withPalette.set(bytes.subarray(0, 33))
    withPalette.set(plte, 33)
    withPalette.set(bytes.subarray(33), 33 + plte.length)
    await expect(Png.decode(withPalette)).rejects.toThrow(Png.InvalidInputError)
  })
})
