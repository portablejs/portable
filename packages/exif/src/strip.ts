import { InvalidInputError, UnsupportedError } from './errors.js'
import { exifHeader, pngSignature, riff, startsWith, u16be, u32be, webp } from './parse.js'
import { readTiff } from './tiff.js'

export declare namespace strip {
  type Options = {
    /**
     * Write back an EXIF block that holds only the `Orientation` tag, when the original has one
     * other than 1, so that viewers and resizers still rotate the image.
     * @default true
     */
    keepOrientation?: boolean | undefined
    /**
     * Keep the ICC color profile: the JPEG `ICC_PROFILE` APP2 segments, the PNG `iCCP` chunk or
     * the WebP `ICCP` chunk.
     * @default true
     */
    keepColorProfile?: boolean | undefined
  }
}

/**
 * Removes the EXIF and XMP metadata from a JPEG, PNG or WebP file without re-encoding it. Every
 * byte of the image data is copied unchanged.
 *
 * @throws {UnsupportedError} The input is not a JPEG, PNG or WebP file.
 * @throws {InvalidInputError} A JPEG has something other than a marker between its segments.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const photo = new Uint8Array(await file.arrayBuffer())
 * const stripped = Exif.strip(photo)
 * Exif.parse(stripped).gps // {}
 * ```
 */
export function strip(bytes: Uint8Array, options: strip.Options = {}): Uint8Array {
  const parts: Uint8Array[] = []
  const stripper = new Stripper(options, (part) => parts.push(part))
  stripper.push(bytes)
  stripper.close()
  return concat(parts)
}

export declare namespace StripStream {
  type Options = strip.Options & {
    /** Aborting errors the stream with `signal.reason`. */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that removes the EXIF and XMP metadata from a JPEG, PNG or WebP file, as
 * `strip` does. A JPEG or PNG is written as it arrives, holding at most one metadata segment or
 * chunk. A WebP is held whole, because its RIFF header and `VP8X` flags come before the chunks
 * that change them.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif'
 *
 * const [stored, inspected] = request.body!.tee()
 * await bucket.put(key, stored.pipeThrough(new Exif.StripStream()))
 * const exif = await Exif.parseStream(inspected)
 * ```
 */
export class StripStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(options: StripStream.Options = {}) {
    const { signal } = options
    let stripper: Stripper
    let abort: (() => void) | undefined
    super({
      start(controller) {
        stripper = new Stripper(options, (part) => controller.enqueue(part))
        if (!signal) return
        signal.throwIfAborted()
        abort = () => controller.error(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
      },
      transform(chunk) {
        stripper.push(chunk)
      },
      flush() {
        if (abort) signal!.removeEventListener('abort', abort)
        stripper.close()
      },
    })
  }
}

type State =
  | 'detect'
  | 'jpegMarker'
  | 'jpegSegment'
  | 'pngSignature'
  | 'pngChunk'
  | 'pngExif'
  | 'pngText'
  | 'webp'

const exifPrefix = ascii('Exif\0\0')
const xmp = ascii('http://ns.adobe.com/xap/1.0/\0')
const xmpExtension = ascii('http://ns.adobe.com/xmp/extension/\0')
const iccProfile = ascii('ICC_PROFILE\0')
const pngMetadataKeywords = new Set([
  'XML:com.adobe.xmp',
  'Raw profile type exif',
  'Raw profile type APP1',
  'Raw profile type xmp',
  'Raw profile type iptc',
])
const pngTextTypes = new Set(['tEXt', 'zTXt', 'iTXt'])

/**
 * Takes the file in chunks of any size and emits the stripped file. Each state waits until the
 * buffer holds `want` bytes, or the input ends, then consumes some of them. `pass` and `skip`
 * count bytes to copy or drop without buffering them.
 */
class Stripper {
  readonly emit: (part: Uint8Array) => void
  readonly keepOrientation: boolean
  readonly keepColorProfile: boolean
  state: State = 'detect'
  data: Uint8Array = new Uint8Array(0)
  start = 0
  end = 0
  want = 12
  pass = 0
  skip = 0
  orientationWritten = false

  constructor(options: strip.Options, emit: (part: Uint8Array) => void) {
    this.emit = emit
    this.keepOrientation = options.keepOrientation ?? true
    this.keepColorProfile = options.keepColorProfile ?? true
  }

  push(chunk: Uint8Array): void {
    for (let at = 0; at < chunk.length;) {
      if (this.start === this.end && this.pass > 0) {
        const n = Math.min(this.pass, chunk.length - at)
        this.emit(chunk.subarray(at, at + n))
        this.pass -= n
        at += n
      } else if (this.start === this.end && this.skip > 0) {
        const n = Math.min(this.skip, chunk.length - at)
        this.skip -= n
        at += n
      } else {
        const n = Math.min(this.want - (this.end - this.start), chunk.length - at)
        this.append(chunk.subarray(at, at + n))
        at += n
        this.drain(false)
      }
    }
  }

  close(): void {
    this.drain(true)
  }

  append(bytes: Uint8Array): void {
    const held = this.end - this.start
    if (this.end + bytes.length > this.data.length) {
      const data = new Uint8Array(Math.max(held + bytes.length, held * 2, 64))
      data.set(this.data.subarray(this.start, this.end))
      this.data = data
      this.start = 0
      this.end = held
    }
    this.data.set(bytes, this.end)
    this.end += bytes.length
  }

  drain(final: boolean): void {
    while (this.start < this.end) {
      const held = this.end - this.start
      if (this.pass > 0 || this.skip > 0) {
        const n = Math.min(held, this.pass || this.skip)
        if (this.pass > 0) {
          this.emit(this.data.slice(this.start, this.start + n))
          this.pass -= n
        } else this.skip -= n
        this.start += n
      } else if (held >= this.want || final) {
        this.start += this.step(this.data.subarray(this.start, this.end), final)
      } else return
    }
  }

  /** Handles the buffered `bytes` in the current state and returns how many it consumed. */
  step(bytes: Uint8Array, final: boolean): number {
    switch (this.state) {
      case 'detect':
        return this.detect(bytes)
      case 'jpegMarker':
        return this.jpegMarker(bytes, final)
      case 'jpegSegment':
        return this.jpegSegment(bytes)
      case 'pngSignature':
        this.out(bytes.subarray(0, 8))
        this.next('pngChunk', 8)
        return Math.min(8, bytes.length)
      case 'pngChunk':
        return this.pngChunk(bytes, final)
      case 'pngExif':
        return this.pngExif(bytes)
      case 'pngText':
        return this.pngText(bytes)
      case 'webp':
        this.emit(this.webp(bytes))
        return bytes.length
    }
  }

  /** Emits a copy of buffered bytes, which the buffer may overwrite later. */
  out(bytes: Uint8Array): void {
    this.emit(bytes.slice())
  }

  next(state: State, want: number): void {
    this.state = state
    this.want = want
  }

  detect(bytes: Uint8Array): number {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      this.out(bytes.subarray(0, 2))
      this.next('jpegMarker', 4)
      return 2
    }
    if (startsWith(bytes, 0, pngSignature)) this.next('pngSignature', 8)
    else if (startsWith(bytes, 0, riff) && startsWith(bytes, 8, webp)) this.next('webp', Infinity)
    else throw new UnsupportedError()
    return 0
  }

  jpegMarker(bytes: Uint8Array, final: boolean): number {
    if (bytes[0] !== 0xff) throw new InvalidInputError('Invalid JPEG: expected a marker.')
    const marker = bytes[1]
    if (marker === undefined || bytes.length < 4) {
      this.out(bytes)
      return bytes.length
    }
    if (marker === 0xff) {
      this.out(bytes.subarray(0, 1))
      return 1
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      this.out(bytes.subarray(0, 2))
      return 2
    }
    if (marker === 0xda || marker === 0xd9) {
      this.pass = Infinity
      return 0
    }
    const length = u16be(bytes, 2)
    if (length < 2) throw new InvalidInputError('Invalid JPEG: segment length is less than 2.')
    if (marker === 0xe1 || marker === 0xe2 || marker === 0xed) {
      this.next('jpegSegment', 2 + length)
      return final ? this.jpegSegment(bytes) : 0
    }
    this.out(bytes.subarray(0, 4))
    this.pass = length - 2
    return 4
  }

  jpegSegment(buffered: Uint8Array): number {
    const bytes = buffered.subarray(0, 2 + u16be(buffered, 2))
    const marker = bytes[1]
    const payload = bytes.subarray(4)
    this.next('jpegMarker', 4)
    if (marker === 0xe1 && startsWith(payload, 0, exifHeader)) {
      const tiff = this.orientationTiff(payload.subarray(6))
      if (tiff)
        this.emit(concat([new Uint8Array([0xff, 0xe1, 0, tiff.length + 8]), exifPrefix, tiff]))
    } else if (this.keepJpegSegment(marker!, payload)) this.out(bytes)
    return bytes.length
  }

  keepJpegSegment(marker: number, payload: Uint8Array): boolean {
    if (marker === 0xed) return false
    if (marker === 0xe1)
      return !startsWith(payload, 0, xmp) && !startsWith(payload, 0, xmpExtension)
    return this.keepColorProfile || !startsWith(payload, 0, iccProfile)
  }

  pngChunk(bytes: Uint8Array, final: boolean): number {
    if (bytes.length < 8) {
      this.out(bytes)
      return bytes.length
    }
    const length = u32be(bytes, 0)
    const type = String.fromCharCode(...bytes.subarray(4, 8))
    if (type === 'IEND') {
      this.pass = Infinity
      return 0
    }
    if (type === 'eXIf') {
      if (this.keepOrientation) {
        this.next('pngExif', 8 + length + 4)
        return final ? this.pngExif(bytes) : 0
      }
      this.skip = length + 4
      return 8
    }
    if (pngTextTypes.has(type)) {
      this.next('pngText', 8 + Math.min(length, 80))
      return final ? this.pngText(bytes) : 0
    }
    if (type === 'iCCP' && !this.keepColorProfile) {
      this.skip = length + 4
      return 8
    }
    this.out(bytes.subarray(0, 8))
    this.pass = length + 4
    return 8
  }

  pngExif(buffered: Uint8Array): number {
    const bytes = buffered.subarray(0, 12 + u32be(buffered, 0))
    let data = bytes.subarray(8, 8 + u32be(bytes, 0))
    if (startsWith(data, 0, exifHeader)) data = data.subarray(6)
    const tiff = this.orientationTiff(data)
    if (tiff) {
      const chunk = concat([bigEndian32(tiff.length), ascii('eXIf'), tiff])
      this.emit(concat([chunk, bigEndian32(crc32(chunk.subarray(4)))]))
    }
    this.next('pngChunk', 8)
    return bytes.length
  }

  pngText(bytes: Uint8Array): number {
    const length = u32be(bytes, 0)
    const payload = bytes.subarray(8, 8 + Math.min(length, 80))
    const nul = payload.indexOf(0)
    const keyword = String.fromCharCode(...payload.subarray(0, nul < 0 ? payload.length : nul))
    this.next('pngChunk', 8)
    if (pngMetadataKeywords.has(keyword)) this.skip = length + 4 - payload.length
    else {
      this.out(bytes.subarray(0, 8 + payload.length))
      this.pass = length + 4 - payload.length
    }
    return 8 + payload.length
  }

  webp(bytes: Uint8Array): Uint8Array {
    const parts: Uint8Array[] = [bytes.subarray(0, 12)]
    let vp8x: Uint8Array | undefined
    let hasExif = false
    let hasIcc = false
    for (let i = 12; i < bytes.length;) {
      if (i + 8 > bytes.length) {
        parts.push(bytes.subarray(i))
        break
      }
      const type = String.fromCharCode(...bytes.subarray(i, i + 4))
      const length =
        bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! * 0x1000000)
      const end = Math.min(i + 8 + length + (length & 1), bytes.length)
      const chunk = bytes.subarray(i, end)
      i = end
      if (type === 'EXIF') {
        let data = chunk.subarray(8, 8 + length)
        if (startsWith(data, 0, exifHeader)) data = data.subarray(6)
        const tiff = this.orientationTiff(data)
        if (!tiff) continue
        hasExif = true
        parts.push(concat([ascii('EXIF'), littleEndian32(tiff.length), tiff]))
      } else if (type === 'XMP ') continue
      else if (type === 'ICCP') {
        if (!this.keepColorProfile) continue
        hasIcc = true
        parts.push(chunk)
      } else if (type === 'VP8X' && !vp8x) {
        vp8x = chunk.slice()
        parts.push(vp8x)
      } else parts.push(chunk)
    }
    if (vp8x && vp8x.length > 8) {
      vp8x[8] = (vp8x[8]! & ~0x2c) | (hasIcc ? 0x20 : 0) | (hasExif ? 0x08 : 0)
    }
    const out = concat(parts)
    out.set(littleEndian32(out.length - 8), 4)
    return out
  }

  /** Returns a TIFF block holding only the Orientation tag of `data`, if it should be kept. */
  orientationTiff(data: Uint8Array): Uint8Array | undefined {
    if (!this.keepOrientation || this.orientationWritten) return undefined
    let orientation: unknown
    try {
      orientation = readTiff(data, 0, data.length).ifds.ifd0.Orientation
    } catch {
      return undefined
    }
    if (typeof orientation !== 'number' || orientation < 2 || orientation > 8) return undefined
    this.orientationWritten = true
    return new Uint8Array([
      0x4d,
      0x4d,
      0,
      42,
      0,
      0,
      0,
      8,
      0,
      1,
      0x01,
      0x12,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      orientation,
      0,
      0,
      0,
      0,
      0,
      0,
    ])
  }
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length
  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function bigEndian32(n: number): Uint8Array {
  return new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function littleEndian32(n: number): Uint8Array {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24])
}

let crcTable: Uint32Array | undefined

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
