import { InvalidInputError, TruncatedError } from './errors.js'
import { gpsTagNames, tagNames } from './tags.js'

/**
 * A tag value. ASCII tags are strings cut at the first NUL. Numeric tags, rationals included, are a
 * number when they hold one value and an array otherwise. UNDEFINED tags are a `Uint8Array` view
 * into the input.
 */
export type TagValue = string | number | readonly number[] | Uint8Array

/** Tags of one IFD by name. A tag missing from the name table is keyed by its hex id, such as `'0xC4A5'`. */
export type Tags = { readonly [name: string]: TagValue }

export type Ifds = {
  ifd0: Tags
  ifd1: Tags
  exif: Tags
  gps: Tags
  interop: Tags
}

export type Tiff = {
  ifds: Ifds
  thumbnailOffset: number | undefined
  thumbnailLength: number | undefined
  /** End of the bytes, relative to the input, that the IFDs and thumbnail reference. */
  end: number
}

const typeSizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4]
const exifPointer = 0x8769
const gpsPointer = 0x8825
const interopPointer = 0xa005
const utf8 = new TextDecoder()

type Reader = {
  bytes: Uint8Array
  view: DataView
  start: number
  length: number
  le: boolean
  next: number
  pointers: Map<number, number>
  end: number
}

export function readTiff(bytes: Uint8Array, start: number, end: number): Tiff {
  if (end - start < 8) throw new TruncatedError()
  const order = (bytes[start]! << 8) | bytes[start + 1]!
  if (order !== 0x4949 && order !== 0x4d4d)
    throw new InvalidInputError('Invalid TIFF header: no byte order mark.')
  const length = end - start
  const r: Reader = {
    bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset + start, length),
    start,
    length,
    le: order === 0x4949,
    next: 0,
    pointers: new Map(),
    end: 8,
  }
  if (r.view.getUint16(2, r.le) !== 42)
    throw new InvalidInputError('Invalid TIFF header: magic number is not 42.')
  const ifd0Offset = r.view.getUint32(4, r.le)
  if (ifd0Offset < 8)
    throw new InvalidInputError('Invalid TIFF header: IFD0 offset is inside the header.')

  const ifd0 = readIfd(r, ifd0Offset, tagNames)
  const ifd1 = r.next ? readIfd(r, r.next, tagNames) : {}
  const exif = readPointed(r, exifPointer, tagNames)
  const gps = readPointed(r, gpsPointer, gpsTagNames)
  const interop = readPointed(r, interopPointer, tagNames)
  const thumbnailOffset = ifd1.ThumbnailOffset
  const thumbnailLength = ifd1.ThumbnailLength
  const hasThumbnail =
    typeof thumbnailOffset === 'number' &&
    typeof thumbnailLength === 'number' &&
    thumbnailOffset > 0 &&
    thumbnailLength > 0
  if (hasThumbnail) fits(r, thumbnailOffset + thumbnailLength)
  return {
    ifds: { ifd0, ifd1, exif, gps, interop },
    thumbnailOffset: hasThumbnail ? start + thumbnailOffset : undefined,
    thumbnailLength: hasThumbnail ? thumbnailLength : undefined,
    end: start + r.end,
  }
}

type Names = { readonly [tag: number]: string }

function readPointed(r: Reader, pointer: number, names: Names): Tags {
  const offset = r.pointers.get(pointer)
  return offset ? readIfd(r, offset, names) : {}
}

function readIfd(r: Reader, offset: number, names: Names): Tags {
  const { view, le } = r
  const tags: Record<string, TagValue> = {}
  r.next = 0
  if (!fits(r, offset + 2)) return tags
  const entriesEnd = offset + 2 + view.getUint16(offset, le) * 12
  for (let entry = offset + 2; entry < entriesEnd && fits(r, entry + 12); entry += 12) {
    const tag = view.getUint16(entry, le)
    const type = view.getUint16(entry + 2, le)
    const size = typeSizes[type]
    if (!size) continue
    const count = view.getUint32(entry + 4, le)
    const byteLength = size * count
    const at = byteLength <= 4 ? entry + 8 : view.getUint32(entry + 8, le)
    if (!fits(r, at + byteLength)) continue
    if (tag === exifPointer || tag === gpsPointer || tag === interopPointer) {
      if (count === 1 && size === 4 && !r.pointers.has(tag))
        r.pointers.set(tag, view.getUint32(at, le))
      continue
    }
    const name =
      names[tag] ?? tagNames[tag] ?? `0x${tag.toString(16).toUpperCase().padStart(4, '0')}`
    tags[name] ??= readValue(r, type, count, at)
  }
  if (fits(r, entriesEnd + 4)) r.next = view.getUint32(entriesEnd, le)
  return tags
}

function fits(r: Reader, end: number): boolean {
  if (end > r.end) r.end = end
  return end <= r.length
}

function readValue(r: Reader, type: number, count: number, at: number): TagValue {
  if (type === 2) return readString(r.bytes, r.start + at, r.start + at + count)
  if (type === 7) return r.bytes.subarray(r.start + at, r.start + at + count)
  if (count === 1) return readNumber(r.view, r.le, type, at)
  const values: number[] = []
  const size = typeSizes[type]!
  for (let i = 0; i < count; i++) values.push(readNumber(r.view, r.le, type, at + i * size))
  return values
}

function readNumber(view: DataView, le: boolean, type: number, at: number): number {
  switch (type) {
    case 1:
      return view.getUint8(at)
    case 3:
      return view.getUint16(at, le)
    case 4:
    case 13:
      return view.getUint32(at, le)
    case 5:
      return view.getUint32(at, le) / view.getUint32(at + 4, le)
    case 6:
      return view.getInt8(at)
    case 8:
      return view.getInt16(at, le)
    case 9:
      return view.getInt32(at, le)
    case 10:
      return view.getInt32(at, le) / view.getInt32(at + 4, le)
    case 11:
      return view.getFloat32(at, le)
    default:
      return view.getFloat64(at, le)
  }
}

function readString(bytes: Uint8Array, start: number, end: number): string {
  let text = ''
  for (let i = start; i < end; i++) {
    const byte = bytes[i]!
    if (byte === 0) return text
    if (byte > 0x7f) {
      let stop = i
      while (stop < end && bytes[stop] !== 0) stop++
      return utf8.decode(bytes.subarray(start, stop))
    }
    text += String.fromCharCode(byte)
  }
  return text
}
