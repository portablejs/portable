import { MaxBytesError, UnsupportedError } from './errors.js'
import {
  type Found,
  type Metadata,
  type Size,
  exifHeader,
  fourcc,
  fromTiff,
  ftyp,
  pngSignature,
  readMeta,
  riff,
  startsWith,
  toMetadata,
  u16be,
  u24le,
  u32be,
  webp,
} from './parse.js'
import { type Tiff, readTiff } from './tiff.js'

export declare namespace parseStream {
  type Options = {
    /**
     * Most bytes of the stream to hold in memory at once. Bytes that are skipped without being
     * kept don't count.
     * @default 16777216
     */
    maxBytes?: number | undefined
    /** Aborting rejects with `signal.reason` and cancels the stream. */
    signal?: AbortSignal | undefined
  }
}

/**
 * Reads EXIF metadata from a stream of a JPEG, TIFF, PNG, WebP, HEIC or AVIF file, or of raw EXIF
 * data. It reads only until the metadata is found, cancels the stream, and returns what `parse`
 * returns for the whole file.
 *
 * @throws {MaxBytesError} Reading the metadata needs more than `maxBytes` of the stream in memory.
 * @throws `signal.reason` when `signal` is aborted.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const response = await fetch('https://example.com/photo.jpg')
 * const exif = await Exif.parseStream(response.body!)
 * console.log(exif.ifd0.Make, exif.exif.DateTimeOriginal)
 * ```
 */
export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  options: parseStream.Options = {},
): Promise<Metadata> {
  const { maxBytes = 16 * 1024 * 1024, signal } = options
  const reader = stream.getReader()
  const source = new Source(reader, maxBytes, signal)
  const abort = () => reader.cancel(signal!.reason).catch(() => {})
  signal?.addEventListener('abort', abort)
  try {
    signal?.throwIfAborted()
    const head = await source.read(0, 12)
    const b0 = head[0]
    const b1 = head[1]
    if (b0 === 0xff && b1 === 0xd8) return finish(await fromJpeg(source))
    if ((b0 === 0x49 && b1 === 0x49) || (b0 === 0x4d && b1 === 0x4d))
      return await fromTiffStream(source, 0)
    if (startsWith(head, 0, exifHeader)) return await fromTiffStream(source, 6)
    if (startsWith(head, 0, pngSignature)) return finish(await fromPng(source))
    if (startsWith(head, 0, riff) && startsWith(head, 8, webp))
      return finish(await fromWebp(source))
    if (startsWith(head, 4, ftyp)) return finish(await fromHeif(source))
    throw new UnsupportedError()
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.cancel().catch(() => {})
  }
}

type Region = { offset: number; bytes: Uint8Array }
type FoundIn = Found & { region: Region | undefined }

function finish(found: FoundIn): Metadata {
  const { offset, bytes } = found.region ?? { offset: 0, bytes: new Uint8Array(0) }
  return toMetadata(found, bytes, offset)
}

/**
 * `buffer` holds the stream from offset `start` to `end`, the count of bytes pulled so far.
 * While skipping, `start` is past `end`.
 */
class Source {
  readonly reader: ReadableStreamDefaultReader<Uint8Array>
  readonly maxBytes: number
  readonly signal: AbortSignal | undefined
  buffer = new Uint8Array(0)
  start = 0
  end = 0
  done = false
  keep = false

  constructor(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    maxBytes: number,
    signal: AbortSignal | undefined,
  ) {
    this.reader = reader
    this.maxBytes = maxBytes
    this.signal = signal
  }

  /**
   * Returns the bytes from `offset` to `offset + length`, fewer if the stream ends first. Unless
   * `keep` is set, discards the bytes before `offset`.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    if (!this.keep && offset > this.start) {
      this.buffer =
        offset < this.end ? this.buffer.subarray(offset - this.start) : new Uint8Array(0)
      this.start = offset
    }
    const want = offset + Math.max(length, 0)
    while (this.end < want && !this.done) {
      const held = Math.max(this.end - this.start, 0)
      if (held >= this.maxBytes) throw new MaxBytesError({ maxBytes: this.maxBytes })
      const { done, value } = await this.reader.read()
      this.signal?.throwIfAborted()
      if (done) {
        this.done = true
        break
      }
      const chunkStart = this.end
      this.end += value.length
      if (this.end <= this.start) continue
      const chunk = chunkStart < this.start ? value.subarray(this.start - chunkStart) : value
      if (held + chunk.length > this.buffer.length) {
        const grown = new Uint8Array(Math.max(held + chunk.length, held * 2))
        grown.set(this.buffer.subarray(0, held))
        this.buffer = grown
      }
      this.buffer.set(chunk, held)
    }
    const available = Math.min(want, this.end)
    if (available <= offset) return new Uint8Array(0)
    return this.buffer.subarray(offset - this.start, available - this.start)
  }
}

async function embedded(source: Source, start: number, end: number): Promise<Region | undefined> {
  if (start + 8 > end) return undefined
  const bytes = (await source.read(start, end - start)).slice()
  if (bytes.length < 8) return undefined
  return { offset: start, bytes }
}

async function exifPayload(source: Source, start: number, end: number) {
  const prefix = await source.read(start, 6)
  return embedded(source, startsWith(prefix, 0, exifHeader) ? start + 6 : start, end)
}

function tiffOf(region: Region | undefined): Tiff | undefined {
  if (!region) return undefined
  const tiff = readTiff(region.bytes, 0, region.bytes.length)
  if (tiff.thumbnailOffset !== undefined) tiff.thumbnailOffset += region.offset
  return tiff
}

async function fromTiffStream(source: Source, start: number): Promise<Metadata> {
  let want = start + 8
  for (;;) {
    const bytes = await source.read(0, want)
    const found = fromTiff(bytes, start)
    if (found.tiff!.end <= bytes.length || source.done) return toMetadata(found, bytes, 0)
    want = found.tiff!.end
  }
}

async function fromJpeg(source: Source): Promise<FoundIn> {
  let region: Region | undefined
  let tiff: Tiff | undefined
  let size: Size | undefined
  let i = 2
  while (!(tiff && size)) {
    const head = await source.read(i, 4)
    if (head.length < 4 || head[0] !== 0xff) break
    const marker = head[1]!
    if (marker === 0xff) {
      i++
      continue
    }
    i += 2
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (marker === 0xd9 || marker === 0xda) break
    const length = u16be(head, 2)
    if (length < 2) break
    const start = i + 2
    if (marker === 0xe1 && !tiff) {
      const prefix = await source.read(start, 6)
      if (startsWith(prefix, 0, exifHeader)) {
        region = await embedded(source, start + 6, i + length)
        tiff = tiffOf(region)
      }
    } else if (
      !size &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const frame = await source.read(start, 5)
      if (frame.length === 5) size = { width: u16be(frame, 3), height: u16be(frame, 1) }
    }
    i += length
  }
  return { tiff, size, region }
}

async function fromPng(source: Source): Promise<FoundIn> {
  let region: Region | undefined
  let tiff: Tiff | undefined
  let size: Size | undefined
  for (let i = 8; !(tiff && size);) {
    const head = await source.read(i, 16)
    if (head.length < 8) break
    const length = u32be(head, 0)
    const type = u32be(head, 4)
    const start = i + 8
    if (type === fourcc.IHDR && !size && head.length === 16)
      size = { width: u32be(head, 8), height: u32be(head, 12) }
    else if (type === fourcc.eXIf && !tiff) {
      region = await exifPayload(source, start, start + length)
      tiff = tiffOf(region)
    } else if (type === fourcc.IEND) break
    i = start + length + 4
  }
  return { tiff, size, region }
}

async function fromWebp(source: Source): Promise<FoundIn> {
  let region: Region | undefined
  let tiff: Tiff | undefined
  let size: Size | undefined
  for (let i = 12; !(tiff && size);) {
    const head = await source.read(i, 18)
    if (head.length < 8) break
    const type = u32be(head, 0)
    const length = u24le(head, 4) + head[7]! * 0x1000000
    const start = i + 8
    if (!size && head.length === 18) {
      if (type === fourcc.VP8X) size = { width: u24le(head, 12) + 1, height: u24le(head, 15) + 1 }
      else if (type === fourcc['VP8 '] && head[11] === 0x9d)
        size = {
          width: (head[14]! | (head[15]! << 8)) & 0x3fff,
          height: (head[16]! | (head[17]! << 8)) & 0x3fff,
        }
      else if (type === fourcc.VP8L && head[8] === 0x2f) {
        const bits = u24le(head, 9) + head[12]! * 0x1000000
        size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
    }
    if (type === fourcc.EXIF && !tiff) {
      region = await exifPayload(source, start, start + length)
      tiff = tiffOf(region)
    }
    i = start + length + (length & 1)
  }
  return { tiff, size, region }
}

async function fromHeif(source: Source): Promise<FoundIn> {
  source.keep = true
  for (let i = 0; ;) {
    const head = await source.read(i, 16)
    if (head.length < 8) break
    let length = u32be(head, 0)
    const type = u32be(head, 4)
    let header = 8
    if (length === 1) {
      if (head.length < 16) break
      length = u32be(head, 8) * 0x100000000 + u32be(head, 12)
      header = 16
    } else if (length === 0) {
      if (type !== fourcc.meta) break
      length = Infinity
    }
    if (length < header) break
    if (type !== fourcc.meta) {
      i += length
      continue
    }
    const file = await source.read(0, i + length)
    const meta = readMeta(file, i + header + 4, file.length)
    source.keep = false
    let region: Region | undefined
    if (meta.exif) {
      const offset = await source.read(meta.exif.start, 4)
      if (offset.length === 4)
        region = await exifPayload(source, meta.exif.start + 4 + u32be(offset, 0), meta.exif.end)
    }
    return { tiff: tiffOf(region), size: meta.size, region }
  }
  return { tiff: undefined, size: undefined, region: undefined }
}
