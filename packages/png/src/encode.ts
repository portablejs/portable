import { crc32, isUint8Array } from '@portable/bytes/internal'
import { InvalidInputError, UnsupportedError } from './errors.js'
import { type FilterType, filterRows } from './filter.js'
import * as zlib from './zlib.js'

/** 8-bit RGBA pixels, four bytes per pixel, row by row from the top left. A decoded image or a canvas `ImageData` fits. */
export type RgbaImage = {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
  /** Written to a `gAMA` chunk when set. The pixels are not changed. */
  gamma?: number | undefined
}

export declare namespace encode {
  type Options = {
    /** Color type to write: 0 grayscale, 2 RGB, 4 grayscale with alpha, 6 RGBA. Gray is the BT.709 luma of each pixel. @default 6 */
    colorType?: 0 | 2 | 4 | 6 | undefined
    /**
     * Filter for every row, or the filters to choose from per row. With more than one, each row
     * gets the filter whose output has the smallest sum of absolute values. @default [0, 1, 2, 3, 4]
     */
    filter?: FilterType | readonly FilterType[] | undefined
    /**
     * Color to blend transparent pixels onto when `colorType` has no alpha.
     * @default white
     */
    background?: { red: number; green: number; blue: number } | undefined
    /** Compresses to zlib format. Set it to choose a compression level. @default `CompressionStream('deflate')` */
    deflate?: ((data: Uint8Array) => Uint8Array | Promise<Uint8Array>) | undefined
    /** Rejects with `signal.reason` when aborted, and stops compressing. */
    signal?: AbortSignal | undefined
  }
}

export declare namespace encodeSync {
  type Options = Omit<encode.Options, 'deflate' | 'signal'> & {
    /** Compresses to zlib format, such as `zlibSync` from fflate. */
    deflate: (data: Uint8Array) => Uint8Array
  }
}

/**
 * Encodes 8-bit RGBA pixels as a PNG file. Compresses with `CompressionStream` unless you pass `deflate`.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png'
 *
 * const data = new Uint8Array(16 * 16 * 4).fill(255)
 * const bytes = await Png.encode({ width: 16, height: 16, data })
 * return new Response(bytes, { headers: { 'content-type': 'image/png' } })
 * ```
 */
export async function encode(
  image: RgbaImage,
  options: encode.Options = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { signal } = options
  signal?.throwIfAborted()
  const colorType = options.colorType ?? 6
  const raw = filtered(image, colorType, options)
  const compressed = options.deflate ? await options.deflate(raw) : await zlib.deflate(raw, signal)
  signal?.throwIfAborted()
  return assemble(image, colorType, compressed)
}

/**
 * Encodes 8-bit RGBA pixels as a PNG file synchronously, with the `deflate` function you pass.
 *
 * @example
 * ```ts
 * import * as Png from '@portable/png'
 * import { zlibSync } from 'fflate'
 *
 * const bytes = Png.encodeSync({ width, height, data }, { deflate: (raw) => zlibSync(raw, { level: 9 }) })
 * ```
 */
export function encodeSync(image: RgbaImage, options: encodeSync.Options): Uint8Array<ArrayBuffer> {
  const colorType = options.colorType ?? 6
  return assemble(image, colorType, options.deflate(filtered(image, colorType, options)))
}

const channelsByColorType = { 0: 1, 2: 3, 4: 2, 6: 4 } as const

function filtered(image: RgbaImage, colorType: 0 | 2 | 4 | 6, options: encode.Options) {
  const { width, height, data } = image
  if (
    !isUint8Array(data) &&
    Object.prototype.toString.call(data) !== '[object Uint8ClampedArray]'
  ) {
    throw new TypeError('data must be a Uint8Array or a Uint8ClampedArray.')
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new InvalidInputError('width and height must be positive integers.')
  }
  if (data.length !== width * height * 4) {
    throw new InvalidInputError(`data must have width * height * 4 = ${width * height * 4} bytes.`)
  }
  if (!(colorType in channelsByColorType)) {
    throw new UnsupportedError(`Unsupported color type ${colorType}.`)
  }
  const { filter = [0, 1, 2, 3, 4], background } = options
  const filters = typeof filter === 'number' ? [filter] : filter
  if (filters.length === 0 || filters.some((f) => !Number.isInteger(f) || f < 0 || f > 4)) {
    throw new RangeError('filter must be 0 to 4 or a non-empty list of them.')
  }

  const bpp = channelsByColorType[colorType]
  const pixels = pack(data, colorType, background)
  return filterRows(pixels, width * bpp, height, bpp, filters)
}

function pack(
  data: Uint8Array | Uint8ClampedArray,
  colorType: 0 | 2 | 4 | 6,
  background: encode.Options['background'],
): Uint8Array {
  if (colorType === 6) {
    return new Uint8Array(data.buffer, data.byteOffset, data.length)
  }
  const { red = 255, green = 255, blue = 255 } = background ?? {}
  const pixels = data.length / 4
  const out = new Uint8Array(pixels * channelsByColorType[colorType])
  for (let p = 0, i = 0, o = 0; p < pixels; p++, i += 4) {
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!
    const a = data[i + 3]!
    if (colorType === 4) {
      out[o++] = bt709Luma(r, g, b)
      out[o++] = a
      continue
    }
    if (a !== 255) {
      const alpha = a / 255
      r = Math.round((1 - alpha) * red + alpha * r)
      g = Math.round((1 - alpha) * green + alpha * g)
      b = Math.round((1 - alpha) * blue + alpha * b)
    }
    if (colorType === 0) {
      out[o++] = bt709Luma(r, g, b)
    } else {
      out[o++] = r
      out[o++] = g
      out[o++] = b
    }
  }
  return out
}

function assemble(
  image: RgbaImage,
  colorType: number,
  compressed: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, image.width)
  view.setUint32(4, image.height)
  header[8] = 8
  header[9] = colorType
  const chunks = Array.of<[number, Uint8Array]>([0x49484452, header])
  if (image.gamma) {
    const gamma = new Uint8Array(4)
    new DataView(gamma.buffer).setUint32(0, Math.floor(image.gamma * 100000))
    chunks.push([0x67414d41, gamma])
  }
  chunks.push([0x49444154, compressed], [0x49454e44, new Uint8Array(0)])

  const out = new Uint8Array(8 + chunks.reduce((sum, [, data]) => sum + data.length + 12, 0))
  const outView = new DataView(out.buffer)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let offset = 8
  for (const [type, data] of chunks) {
    outView.setUint32(offset, data.length)
    outView.setUint32(offset + 4, type)
    out.set(data, offset + 8)
    outView.setUint32(
      offset + 8 + data.length,
      crc32(out.subarray(offset + 4, offset + 8 + data.length)),
    )
    offset += data.length + 12
  }
  return out
}

const bt709Luma = (r: number, g: number, b: number) =>
  (13933 * r + 46871 * g + 4732 * b + 32768) >> 16
