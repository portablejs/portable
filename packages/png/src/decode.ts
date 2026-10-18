import * as Bytes from '@portable/bytes'
import { crc32 } from './crc32.js'
import { InvalidInputError, TruncatedError, UnsupportedError } from './errors.js'
import { unfilter } from './filter.js'
import * as zlib from './zlib.js'

/** PNG color type: 0 grayscale, 2 RGB, 3 palette, 4 grayscale with alpha, 6 RGBA. */
export type ColorType = 0 | 2 | 3 | 4 | 6

/** Bits per sample (per palette index for color type 3). */
export type BitDepth = 1 | 2 | 4 | 8 | 16

/** A decoded image. `data` holds 8-bit RGBA, four bytes per pixel, row by row from the top left. */
export type Decoded = {
  width: number
  height: number
  data: Uint8Array
  /** Bit depth of the file. `data` is always 8-bit. */
  depth: BitDepth
  /** Color type of the file. `data` is always RGBA. */
  colorType: ColorType
  /** Whether the file uses Adam7 interlacing. */
  interlace: boolean
  /** Whether the file has an alpha channel or a `tRNS` chunk. */
  alpha: boolean
  /** Gamma from the `gAMA` chunk, if there is one. Pixels are not gamma corrected. */
  gamma: number | undefined
}

export declare namespace decode {
  type Options = {
    /** Verify the CRC of every chunk. @default true */
    checkCrc?: boolean | undefined
    /** Decompresses zlib data. @default `DecompressionStream('deflate')` */
    inflate?: ((data: Uint8Array) => Uint8Array | Promise<Uint8Array>) | undefined
  }
}

export declare namespace decodeSync {
  type Options = {
    /** Verify the CRC of every chunk. @default true */
    checkCrc?: boolean | undefined
    /** Decompresses zlib data, such as `unzlibSync` from fflate. */
    inflate: (data: Uint8Array) => Uint8Array
  }
}

/**
 * Decodes a PNG file to 8-bit RGBA pixels. Decompresses with `DecompressionStream` unless you pass `inflate`.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png'
 *
 * const response = await fetch('https://example.com/image.png')
 * const { width, height, data } = await Png.decode(await response.bytes())
 * ```
 */
export async function decode(bytes: Uint8Array, options: decode.Options = {}): Promise<Decoded> {
  const { checkCrc = true, inflate } = options
  const png = parse(bytes, checkCrc)
  const size = rawSize(png)
  let raw: Uint8Array
  try {
    raw = inflate ? await inflate(png.idat) : await zlib.inflate(png.idat, size)
  } catch (cause) {
    throw new InvalidInputError('Image data failed to decompress.', { cause })
  }
  return finish(png, raw, size)
}

/**
 * Decodes a PNG file to 8-bit RGBA pixels synchronously, with the `inflate` function you pass.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png'
 * import { unzlibSync } from 'fflate'
 *
 * const { width, height, data } = Png.decodeSync(bytes, { inflate: unzlibSync })
 * ```
 */
export function decodeSync(bytes: Uint8Array, options: decodeSync.Options): Decoded {
  const { checkCrc = true, inflate } = options
  const png = parse(bytes, checkCrc)
  let raw: Uint8Array
  try {
    raw = inflate(png.idat)
  } catch (cause) {
    throw new InvalidInputError('Image data failed to decompress.', { cause })
  }
  return finish(png, raw, rawSize(png))
}

type Parsed = {
  width: number
  height: number
  depth: BitDepth
  colorType: ColorType
  interlace: boolean
  alpha: boolean
  gamma: number | undefined
  palette: Uint8Array | undefined
  transparent: readonly number[] | undefined
  idat: Uint8Array
}

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const IHDR = 0x49484452
const PLTE = 0x504c5445
const IDAT = 0x49444154
const IEND = 0x49454e44
const tRNS = 0x74524e53
const gAMA = 0x67414d41

const depthsByColorType: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
}

const channelsByColorType = [1, 0, 3, 1, 2, 0, 4] as const

function parse(bytes: Uint8Array, checkCrc: boolean): Parsed {
  if (bytes.length < 8 || signature.some((byte, i) => bytes[i] !== byte))
    throw new InvalidInputError('Invalid PNG signature.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let header: Omit<Parsed, 'gamma' | 'palette' | 'transparent' | 'idat'> | undefined
  let gamma: number | undefined
  let palette: Uint8Array | undefined
  let transparent: number[] | undefined
  const idat: Uint8Array[] = []

  for (let offset = 8; ;) {
    if (offset + 12 > bytes.length) throw new TruncatedError('Unexpected end of file before IEND.')
    const length = view.getUint32(offset)
    const type = view.getUint32(offset + 4)
    const start = offset + 8
    const end = start + length
    if (end + 4 > bytes.length) throw new TruncatedError('Unexpected end of file inside a chunk.')
    const name = String.fromCharCode(...bytes.subarray(offset + 4, start))
    if (!/^[A-Za-z]{4}$/.test(name)) throw new InvalidInputError('Invalid chunk type.')
    if (checkCrc && crc32(bytes, offset + 4, end) !== view.getUint32(end))
      throw new InvalidInputError(`CRC mismatch in ${name} chunk.`)
    if (!header && type !== IHDR) throw new InvalidInputError('IHDR must be the first chunk.')
    offset = end + 4

    if (type === IHDR) {
      if (header) throw new InvalidInputError('More than one IHDR chunk.')
      if (length !== 13) throw new InvalidInputError('IHDR chunk has the wrong length.')
      header = readHeader(view, start)
    } else if (type === IDAT) {
      idat.push(bytes.subarray(start, end))
    } else if (type === IEND) {
      break
    } else if (type === PLTE) {
      palette = new Uint8Array(256 * 4)
      const entries = Math.min(256, Math.floor(length / 3))
      for (let i = 0; i < entries; i++) {
        palette[i * 4] = bytes[start + i * 3]!
        palette[i * 4 + 1] = bytes[start + i * 3 + 1]!
        palette[i * 4 + 2] = bytes[start + i * 3 + 2]!
        palette[i * 4 + 3] = 255
      }
      palette = palette.subarray(0, entries * 4)
    } else if (type === tRNS) {
      header!.alpha = true
      const { colorType } = header!
      if (colorType === 3) {
        if (!palette) throw new InvalidInputError('tRNS chunk must come after PLTE.')
        if (length > palette.length / 4)
          throw new InvalidInputError('tRNS chunk has more entries than the palette.')
        for (let i = 0; i < length; i++) palette[i * 4 + 3] = bytes[start + i]!
      } else if (colorType === 0 || colorType === 2) {
        const samples = colorType === 0 ? 1 : 3
        if (length < samples * 2) throw new InvalidInputError('tRNS chunk is too short.')
        transparent = []
        for (let i = 0; i < samples; i++) transparent.push(view.getUint16(start + i * 2))
      }
    } else if (type === gAMA) {
      if (length >= 4) gamma = view.getUint32(start) / 100000
    } else if (!(bytes[start - 4]! & 0x20)) {
      throw new UnsupportedError(`Unsupported critical chunk ${name}.`)
    }
  }

  if (idat.length === 0) throw new InvalidInputError('No IDAT chunk.')
  if (header!.colorType === 3 && !palette) throw new InvalidInputError('No PLTE chunk.')
  return {
    ...header!,
    gamma,
    palette,
    transparent,
    idat: idat.length === 1 ? idat[0]! : Bytes.concat(idat),
  }
}

function readHeader(view: DataView, start: number) {
  const width = view.getUint32(start)
  const height = view.getUint32(start + 4)
  const depth = view.getUint8(start + 8)
  const colorType = view.getUint8(start + 9)
  if (width === 0 || height === 0) throw new InvalidInputError('Image has no pixels.')
  if (!depthsByColorType[colorType]) throw new InvalidInputError(`Invalid color type ${colorType}.`)
  if (!depthsByColorType[colorType].includes(depth))
    throw new InvalidInputError(`Invalid bit depth ${depth} for color type ${colorType}.`)
  if (view.getUint8(start + 10) !== 0) throw new UnsupportedError('Unsupported compression method.')
  if (view.getUint8(start + 11) !== 0) throw new UnsupportedError('Unsupported filter method.')
  const interlace = view.getUint8(start + 12)
  if (interlace > 1) throw new UnsupportedError('Unsupported interlace method.')
  return {
    width,
    height,
    depth: depth as BitDepth,
    colorType: colorType as ColorType,
    interlace: interlace === 1,
    alpha: colorType === 4 || colorType === 6,
  }
}

type Pass = { x: number; y: number; dx: number; dy: number; width: number; height: number }

const adam7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const

function passes(png: Parsed): Pass[] {
  if (!png.interlace) return [{ x: 0, y: 0, dx: 1, dy: 1, width: png.width, height: png.height }]
  return adam7
    .map(([x, y, dx, dy]) => ({
      x,
      y,
      dx,
      dy,
      width: Math.ceil((png.width - x) / dx),
      height: Math.ceil((png.height - y) / dy),
    }))
    .filter((pass) => pass.width > 0 && pass.height > 0)
}

function rowBytes(png: Parsed, width: number): number {
  return Math.ceil((width * channelsByColorType[png.colorType] * png.depth) / 8)
}

function rawSize(png: Parsed): number {
  const size = passes(png).reduce(
    (sum, pass) => sum + (rowBytes(png, pass.width) + 1) * pass.height,
    0,
  )
  // Deflate expands at most 1032:1, so a header that claims more pixels than the data can hold
  // is rejected here instead of allocating for it.
  if (size > png.idat.length * 1032 + 1024)
    throw new TruncatedError('Image data is too short for the image size in IHDR.')
  return size
}

function finish(png: Parsed, inflated: Uint8Array, size: number): Decoded {
  if (inflated.length < size) throw new TruncatedError('Image data is shorter than the image.')
  // A Uint8Array subclass, such as Node's Buffer from zlib.inflateSync, makes the loops below
  // polymorphic and several times slower.
  const raw = new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.length)
  const { width, height, depth, colorType, interlace, alpha, gamma } = png
  const data = new Uint8Array(width * height * 4)
  const bpp = Math.max(1, (channelsByColorType[colorType] * depth) >> 3)
  let offset = 0
  for (const pass of passes(png)) {
    const stride = rowBytes(png, pass.width)
    unfilter(raw, offset, stride, pass.height, bpp)
    expand(png, raw, offset, stride, pass, data)
    offset += (stride + 1) * pass.height
  }
  return { width, height, data, depth, colorType, interlace, alpha, gamma }
}

const scale16 = (raw: Uint8Array, i: number) => ((((raw[i]! << 8) | raw[i + 1]!) + 128) / 257) | 0

function expand(
  png: Parsed,
  raw: Uint8Array,
  start: number,
  stride: number,
  pass: Pass,
  out: Uint8Array,
) {
  const { width, depth, colorType, palette, transparent } = png
  const step = pass.dx * 4
  const [t0 = -1, t1 = -1, t2 = -1] = transparent ?? []
  const lowDepth = depth < 8
  const mask = (1 << depth) - 1
  const grayScale = 255 / mask

  for (let row = 0; row < pass.height; row++) {
    const line = start + row * (stride + 1) + 1
    let o = ((pass.y + row * pass.dy) * width + pass.x) * 4
    const n = pass.width

    if (colorType === 6 && depth === 8) {
      if (step === 4) out.set(raw.subarray(line, line + stride), o)
      else
        for (let x = 0, i = line; x < n; x++, i += 4, o += step) {
          out[o] = raw[i]!
          out[o + 1] = raw[i + 1]!
          out[o + 2] = raw[i + 2]!
          out[o + 3] = raw[i + 3]!
        }
    } else if (colorType === 6) {
      for (let x = 0, i = line; x < n; x++, i += 8, o += step) {
        out[o] = scale16(raw, i)
        out[o + 1] = scale16(raw, i + 2)
        out[o + 2] = scale16(raw, i + 4)
        out[o + 3] = scale16(raw, i + 6)
      }
    } else if (colorType === 2 && depth === 8) {
      for (let x = 0, i = line; x < n; x++, i += 3, o += step) {
        const r = raw[i]!
        const g = raw[i + 1]!
        const b = raw[i + 2]!
        out[o] = r
        out[o + 1] = g
        out[o + 2] = b
        out[o + 3] = r === t0 && g === t1 && b === t2 ? 0 : 255
      }
    } else if (colorType === 2) {
      for (let x = 0, i = line; x < n; x++, i += 6, o += step) {
        const r = (raw[i]! << 8) | raw[i + 1]!
        const g = (raw[i + 2]! << 8) | raw[i + 3]!
        const b = (raw[i + 4]! << 8) | raw[i + 5]!
        out[o] = scale16(raw, i)
        out[o + 1] = scale16(raw, i + 2)
        out[o + 2] = scale16(raw, i + 4)
        out[o + 3] = r === t0 && g === t1 && b === t2 ? 0 : 255
      }
    } else if (colorType === 4) {
      const size = depth === 8 ? 2 : 4
      for (let x = 0, i = line; x < n; x++, i += size, o += step) {
        const gray = depth === 8 ? raw[i]! : scale16(raw, i)
        out[o] = out[o + 1] = out[o + 2] = gray
        out[o + 3] = depth === 8 ? raw[i + 1]! : scale16(raw, i + 2)
      }
    } else if (colorType === 0) {
      for (let x = 0; x < n; x++, o += step) {
        let value: number
        let gray: number
        if (lowDepth) {
          const bit = x * depth
          value = (raw[line + (bit >> 3)]! >> (8 - depth - (bit & 7))) & mask
          gray = value * grayScale
        } else if (depth === 8) {
          value = gray = raw[line + x]!
        } else {
          value = (raw[line + x * 2]! << 8) | raw[line + x * 2 + 1]!
          gray = scale16(raw, line + x * 2)
        }
        out[o] = out[o + 1] = out[o + 2] = gray
        out[o + 3] = value === t0 ? 0 : 255
      }
    } else {
      const entries = palette!.length / 4
      for (let x = 0; x < n; x++, o += step) {
        const bit = x * depth
        const index = lowDepth
          ? (raw[line + (bit >> 3)]! >> (8 - depth - (bit & 7))) & mask
          : raw[line + x]!
        if (index >= entries) throw new InvalidInputError(`Palette index ${index} is out of range.`)
        const p = index * 4
        out[o] = palette![p]!
        out[o + 1] = palette![p + 1]!
        out[o + 2] = palette![p + 2]!
        out[o + 3] = palette![p + 3]!
      }
    }
  }
}
