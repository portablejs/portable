import { UnsupportedError } from './errors.js'
import { type Ifds, type Tiff, readTiff } from './tiff.js'

/** Metadata read by `parse`. Every IFD is an object, empty when the file doesn't have it. */
export type Metadata = Ifds & {
  /**
   * GPS latitude in signed decimal degrees, south negative. Set when `gps.GPSLatitude` is numeric.
   */
  latitude?: number | undefined
  /**
   * GPS longitude in signed decimal degrees, west negative. Set when `gps.GPSLongitude` is numeric.
   */
  longitude?: number | undefined
  /** Size of the stored image in pixels, before any `Orientation` rotation. */
  imageSize?: { width: number; height: number } | undefined
  /** The JPEG thumbnail that IFD1 points to. */
  thumbnail?:
    | {
        /** Offset of the thumbnail in the input bytes. */
        offset: number
        length: number
        /** A view into the input, or `undefined` when the input ends before the thumbnail does. */
        bytes: Uint8Array | undefined
      }
    | undefined
}

/**
 * Reads EXIF metadata from a JPEG, TIFF, PNG, WebP, HEIC or AVIF file, or from raw EXIF data that
 * starts with `Exif\0\0` or a TIFF header. The input can be just the start of the file: tags
 * with values past the end of the input are left out.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const response = await fetch('https://example.com/photo.jpg', { headers: { range: 'bytes=0-65535' } })
 * const exif = Exif.parse(new Uint8Array(await response.arrayBuffer()))
 * console.log(exif.ifd0.Make, exif.exif.DateTimeOriginal, exif.latitude, exif.longitude)
 * ```
 */
export function parse(bytes: Uint8Array): Metadata {
  const b0 = bytes[0]
  const b1 = bytes[1]
  let found: Found
  if (b0 === 0xff && b1 === 0xd8) found = fromJpeg(bytes)
  else if ((b0 === 0x49 && b1 === 0x49) || (b0 === 0x4d && b1 === 0x4d)) found = fromTiff(bytes, 0)
  else if (startsWith(bytes, 0, exifHeader)) found = fromTiff(bytes, 6)
  else if (startsWith(bytes, 0, pngSignature)) found = fromPng(bytes)
  else if (startsWith(bytes, 0, riff) && startsWith(bytes, 8, webp)) found = fromWebp(bytes)
  else if (startsWith(bytes, 4, ftyp)) found = fromHeif(bytes)
  else throw new UnsupportedError()

  return toMetadata(found, bytes, 0)
}

/** Builds the result from `found`. `data` holds the input from `offset` on, for the thumbnail. */
export function toMetadata(found: Found, data: Uint8Array, offset: number): Metadata {
  const { tiff, size } = found
  const result: Metadata = {
    ...(tiff?.ifds ?? { ifd0: {}, ifd1: {}, exif: {}, gps: {}, interop: {} }),
  }
  if (size) result.imageSize = size
  if (!tiff) return result

  const latitude = degrees(result.gps.GPSLatitude, result.gps.GPSLatitudeRef, 'S')
  const longitude = degrees(result.gps.GPSLongitude, result.gps.GPSLongitudeRef, 'W')
  if (latitude !== undefined && longitude !== undefined) {
    result.latitude = latitude
    result.longitude = longitude
  }
  const { thumbnailOffset: start, thumbnailLength: length } = tiff
  if (start !== undefined && length !== undefined) {
    const end = start + length
    result.thumbnail = {
      offset: start,
      length,
      bytes:
        start >= offset && end <= offset + data.length && end <= tiff.limit
          ? data.subarray(start - offset, end - offset)
          : undefined,
    }
  }
  return result
}

export type Size = { width: number; height: number }
export type Found = { tiff: Tiff | undefined; size: Size | undefined }

export const exifHeader: readonly number[] = [0x45, 0x78, 0x69, 0x66, 0, 0]
export const pngSignature: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
export const riff: readonly number[] = [0x52, 0x49, 0x46, 0x46]
export const webp: readonly number[] = [0x57, 0x45, 0x42, 0x50]
export const ftyp: readonly number[] = [0x66, 0x74, 0x79, 0x70]

const codes = [
  'IHDR',
  'eXIf',
  'IEND',
  'VP8X',
  'VP8 ',
  'VP8L',
  'EXIF',
  'meta',
  'pitm',
  'iinf',
  'infe',
  'Exif',
  'iloc',
  'idat',
  'iprp',
  'ipco',
  'ipma',
  'ispe',
] as const
export const fourcc = Object.fromEntries(
  codes.map((code) => [code, u32be(new TextEncoder().encode(code), 0)]),
) as Record<(typeof codes)[number], number>

export function startsWith(bytes: Uint8Array, at: number, prefix: ArrayLike<number>): boolean {
  if (at + prefix.length > bytes.length) return false
  for (let i = 0; i < prefix.length; i++) if (bytes[at + i] !== prefix[i]) return false
  return true
}

export function fromTiff(bytes: Uint8Array, start: number): Found {
  const tiff = readTiff(bytes, start, bytes.length)
  const { ImageWidth: width, ImageHeight: height } = tiff.ifds.ifd0
  const size =
    typeof width === 'number' && typeof height === 'number' ? { width, height } : undefined
  return { tiff, size }
}

function embedded(bytes: Uint8Array, start: number, end: number): Tiff | undefined {
  end = Math.min(end, bytes.length)
  if (start + 8 > end) return undefined
  return readTiff(bytes, start, end)
}

export function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) | bytes[at + 1]!
}

export function u32be(bytes: Uint8Array, at: number): number {
  return u16be(bytes, at) * 0x10000 + u16be(bytes, at + 2)
}

export function u24le(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
}

function fromJpeg(bytes: Uint8Array): Found {
  let tiff: Tiff | undefined
  let size: Size | undefined
  let i = 2
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]!
    if (marker === 0xff) {
      i++
      continue
    }
    i += 2
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (marker === 0xd9 || marker === 0xda) break
    const length = u16be(bytes, i)
    if (length < 2) break
    const start = i + 2
    if (marker === 0xe1 && !tiff && startsWith(bytes, start, exifHeader))
      tiff = embedded(bytes, start + 6, i + length)
    else if (
      !size &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      start + 5 <= bytes.length
    )
      size = { width: u16be(bytes, start + 3), height: u16be(bytes, start + 1) }
    i += length
  }
  return { tiff, size }
}

function fromPng(bytes: Uint8Array): Found {
  let tiff: Tiff | undefined
  let size: Size | undefined
  for (let i = 8; i + 8 <= bytes.length;) {
    const length = u32be(bytes, i)
    const type = u32be(bytes, i + 4)
    const start = i + 8
    if (type === fourcc.IHDR && !size && start + 8 <= bytes.length)
      size = { width: u32be(bytes, start), height: u32be(bytes, start + 4) }
    else if (type === fourcc.eXIf && !tiff) {
      const tiffStart = startsWith(bytes, start, exifHeader) ? start + 6 : start
      tiff = embedded(bytes, tiffStart, start + length)
    } else if (type === fourcc.IEND) break
    i = start + length + 4
  }
  return { tiff, size }
}

function fromWebp(bytes: Uint8Array): Found {
  let tiff: Tiff | undefined
  let size: Size | undefined
  for (let i = 12; i + 8 <= bytes.length;) {
    const type = u32be(bytes, i)
    const length = u24le(bytes, i + 4) + bytes[i + 7]! * 0x1000000
    const start = i + 8
    if (!size && start + 10 <= bytes.length) {
      if (type === fourcc.VP8X)
        size = { width: u24le(bytes, start + 4) + 1, height: u24le(bytes, start + 7) + 1 }
      else if (type === fourcc['VP8 '] && bytes[start + 3] === 0x9d)
        size = {
          width: (bytes[start + 6]! | (bytes[start + 7]! << 8)) & 0x3fff,
          height: (bytes[start + 8]! | (bytes[start + 9]! << 8)) & 0x3fff,
        }
      else if (type === fourcc.VP8L && bytes[start] === 0x2f) {
        const bits = u24le(bytes, start + 1) + bytes[start + 4]! * 0x1000000
        size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
    }
    if (type === fourcc.EXIF && !tiff) {
      const tiffStart = startsWith(bytes, start, exifHeader) ? start + 6 : start
      tiff = embedded(bytes, tiffStart, start + length)
    }
    i = start + length + (length & 1)
  }
  return { tiff, size }
}

function fromHeif(bytes: Uint8Array): Found {
  let tiff: Tiff | undefined
  let size: Size | undefined
  for (const box of boxes(bytes, 0, bytes.length)) {
    if (box.type !== fourcc.meta) continue
    const meta = readMeta(bytes, box.start + 4, box.end)
    size = meta.size
    const exif = meta.exif
    if (exif && exif.start + 4 <= bytes.length) {
      let start = exif.start + 4 + u32be(bytes, exif.start)
      if (startsWith(bytes, start, exifHeader)) start += 6
      tiff = embedded(bytes, start, exif.end)
    }
    break
  }
  return { tiff, size }
}

type Box = { type: number; start: number; end: number }

function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  end = Math.min(end, bytes.length)
  for (let i = start; i + 8 <= end;) {
    let length = u32be(bytes, i)
    const type = u32be(bytes, i + 4)
    let header = 8
    if (length === 1) {
      if (i + 16 > end) return
      length = u32be(bytes, i + 8) * 0x100000000 + u32be(bytes, i + 12)
      header = 16
    } else if (length === 0) length = end - i
    if (length < header) return
    yield { type, start: i + header, end: Math.min(i + length, end) }
    i += length
  }
}

export function readMeta(
  bytes: Uint8Array,
  start: number,
  end: number,
): { size: Size | undefined; exif: { start: number; end: number } | undefined } {
  let primary = 0
  let exifItem = -1
  let idat = 0
  const locations = new Map<number, { start: number; end: number; idat: boolean }>()
  const properties: Box[] = []
  const associations = new Map<number, number[]>()
  for (const box of boxes(bytes, start, end)) {
    const version = bytes[box.start]
    const at = box.start + 4
    if (box.type === fourcc.pitm) primary = version === 0 ? u16be(bytes, at) : u32be(bytes, at)
    else if (box.type === fourcc.iinf) {
      const infeStart = at + (version === 0 ? 2 : 4)
      for (const infe of boxes(bytes, infeStart, box.end)) {
        const infeVersion = bytes[infe.start]!
        if (infe.type !== fourcc.infe || infeVersion < 2) continue
        const idSize = infeVersion === 2 ? 2 : 4
        const id = idSize === 2 ? u16be(bytes, infe.start + 4) : u32be(bytes, infe.start + 4)
        if (u32be(bytes, infe.start + 6 + idSize) === fourcc.Exif) exifItem = id
      }
    } else if (box.type === fourcc.iloc) readItemLocations(bytes, box, locations)
    else if (box.type === fourcc.idat) idat = box.start
    else if (box.type === fourcc.iprp) {
      for (const child of boxes(bytes, box.start, box.end)) {
        if (child.type === fourcc.ipco) properties.push(...boxes(bytes, child.start, child.end))
        else if (child.type === fourcc.ipma) readAssociations(bytes, child, associations)
      }
    }
  }

  let size: Size | undefined
  for (const index of associations.get(primary) ?? []) {
    const property = properties[index - 1]
    if (property?.type === fourcc.ispe && property.start + 12 <= bytes.length)
      size = { width: u32be(bytes, property.start + 4), height: u32be(bytes, property.start + 8) }
  }
  const location = locations.get(exifItem)
  const exif =
    location &&
    (location.idat
      ? { start: idat + location.start, end: idat + location.end }
      : { start: location.start, end: location.end })
  return { size, exif }
}

function readSized(bytes: Uint8Array, at: number, size: number): number {
  if (size === 0) return 0
  if (size === 2) return u16be(bytes, at)
  if (size === 4) return u32be(bytes, at)
  return u32be(bytes, at) * 0x100000000 + u32be(bytes, at + 4)
}

function readItemLocations(
  bytes: Uint8Array,
  box: Box,
  locations: Map<number, { start: number; end: number; idat: boolean }>,
) {
  const version = bytes[box.start]!
  let at = box.start + 4
  if (at + 4 > box.end) return
  const offsetSize = bytes[at]! >> 4
  const lengthSize = bytes[at]! & 15
  const baseOffsetSize = bytes[at + 1]! >> 4
  const indexSize = version === 0 ? 0 : bytes[at + 1]! & 15
  const idSize = version < 2 ? 2 : 4
  const count = readSized(bytes, at + 2, idSize)
  at += 2 + idSize
  for (let item = 0; item < count; item++) {
    if (at + idSize + 8 > box.end) return
    const id = readSized(bytes, at, idSize)
    at += idSize
    const method = version === 0 ? 0 : bytes[at + 1]! & 15
    if (version !== 0) at += 2
    at += 2
    const base = readSized(bytes, at, baseOffsetSize)
    at += baseOffsetSize
    const extents = u16be(bytes, at)
    at += 2
    const extentSize = indexSize + offsetSize + lengthSize
    if (at + extents * extentSize > box.end) return
    if (extents === 1 && method < 2) {
      const start = base + readSized(bytes, at + indexSize, offsetSize)
      const length = readSized(bytes, at + indexSize + offsetSize, lengthSize)
      locations.set(id, { start, end: start + length, idat: method === 1 })
    }
    at += extents * extentSize
  }
}

function readAssociations(bytes: Uint8Array, box: Box, associations: Map<number, number[]>) {
  const version = bytes[box.start]!
  const wide = (bytes[box.start + 3]! & 1) === 1
  let at = box.start + 4
  if (at + 4 > box.end) return
  const count = u32be(bytes, at)
  at += 4
  for (let entry = 0; entry < count && at + 3 <= box.end; entry++) {
    const id = version < 1 ? u16be(bytes, at) : u32be(bytes, at)
    at += version < 1 ? 2 : 4
    const n = bytes[at++]!
    const indices: number[] = []
    for (let i = 0; i < n && at < box.end; i++) {
      indices.push(wide ? u16be(bytes, at) & 0x7fff : bytes[at]! & 0x7f)
      at += wide ? 2 : 1
    }
    associations.set(id, indices)
  }
}

function degrees(value: unknown, ref: unknown, negative: string): number | undefined {
  let result: number
  if (typeof value === 'number') result = value
  else if (Array.isArray(value) && value.length > 0) {
    const [d = 0, m = 0, s = 0] = value as number[]
    result = d + m / 60 + s / 3600
  } else return undefined
  if (!Number.isFinite(result)) return undefined
  return ref === negative ? -result : result
}
