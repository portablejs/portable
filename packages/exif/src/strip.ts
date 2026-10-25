import * as Bytes from '@portable/bytes';
import { assertUint8Array, crc32 } from '@portable/bytes/internal';
import * as Streams from '@portable/streams';
import { InvalidInputError, UnsupportedError } from './errors.js';
import { exifHeader, pngSignature, riff, startsWith, u16be, u32be, webp } from './parse.js';
import { readTiff } from './tiff.js';

export declare namespace strip {
  type Options = {
    /**
     * If the original has an `Orientation` from 2 to 8, write an EXIF block with only that tag in
     * place of the original block, so that viewers and resizers still rotate the image.
     * @default true
     */
    keepOrientation?: boolean | undefined;
    /**
     * Keep the ICC color profile: the JPEG `ICC_PROFILE` APP2 segments, the PNG `iCCP` chunk or
     * the WebP `ICCP` chunk.
     * @default true
     */
    keepColorProfile?: boolean | undefined;
  };
}

/**
 * Removes the EXIF and XMP metadata from a JPEG, PNG or WebP file without re-encoding it. Every
 * byte of the image data is copied unchanged.
 *
 * @throws {UnsupportedError} The input is not a JPEG, PNG or WebP file.
 * @throws {InvalidInputError} A JPEG has something other than a marker between its segments, or
 * a segment length below 2.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif';
 *
 * const photo = new Uint8Array(await file.arrayBuffer());
 * const stripped = Exif.strip(photo);
 * Exif.parse(stripped).gps; // {}
 * ```
 */
export function strip(bytes: Uint8Array, options: strip.Options = {}): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const stripper = createStripper(options, (part) => parts.push(part));
  stripper.push(assertUint8Array(bytes));
  stripper.close();
  return Bytes.concat(parts);
}

export declare namespace StripStream {
  type Options = strip.Options & {
    /** Aborting errors the stream with `signal.reason`. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * A `TransformStream` that removes the EXIF and XMP metadata from a JPEG, PNG or WebP file, as
 * `strip` does. A JPEG or PNG is written out as it arrives, and the stream holds at most one
 * metadata segment or chunk. A WebP is held whole, because its RIFF header and `VP8X` flags come
 * before the chunks that change them.
 *
 * @example
 * ```ts
 * import * as Exif from '@portable/exif';
 *
 * const [stored, inspected] = request.body!.tee();
 * const [, exif] = await Promise.all([
 *   bucket.put(key, stored.pipeThrough(new Exif.StripStream())),
 *   Exif.parseStream(inspected),
 * ]);
 * ```
 */
export class StripStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(options: StripStream.Options = {}) {
    let stripper: Stripper;
    super(
      Streams.abortable(
        {
          start(controller) {
            stripper = createStripper(options, (part) => controller.enqueue(part));
          },
          transform(chunk) {
            stripper.push(assertUint8Array(chunk));
          },
          flush() {
            stripper.close();
          },
        },
        options,
      ),
    );
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
  | 'webp';

const exifPrefix = ascii('Exif\0\0');
const xmp = ascii('http://ns.adobe.com/xap/1.0/\0');
const xmpExtension = ascii('http://ns.adobe.com/xmp/extension/\0');
const iccProfile = ascii('ICC_PROFILE\0');
const pngMetadataKeywords = new Set([
  'XML:com.adobe.xmp',
  'Raw profile type exif',
  'Raw profile type APP1',
  'Raw profile type xmp',
  'Raw profile type iptc',
]);
const pngTextTypes = new Set(['tEXt', 'zTXt', 'iTXt']);

type Stripper = { push(chunk: Uint8Array): void; close(): void };

/**
 * Takes the file in chunks of any size and emits the stripped file. Each state waits until the
 * buffer holds `want` bytes, or the input ends, then consumes some of them. `pass` and `skip`
 * count bytes to copy or drop without buffering them.
 */
function createStripper(options: strip.Options, emit: (part: Uint8Array) => void): Stripper {
  const keepOrientation = options.keepOrientation ?? true;
  const keepColorProfile = options.keepColorProfile ?? true;
  let state: State = 'detect';
  let buffer: Uint8Array = new Uint8Array(0);
  let bufferStart = 0;
  let bufferEnd = 0;
  let want = 12;
  let pass = 0;
  let skip = 0;
  let orientationWritten = false;

  function push(chunk: Uint8Array): void {
    for (let at = 0; at < chunk.length;) {
      if (bufferStart === bufferEnd && pass > 0) {
        const n = Math.min(pass, chunk.length - at);
        emit(chunk.subarray(at, at + n));
        pass -= n;
        at += n;
      } else if (bufferStart === bufferEnd && skip > 0) {
        const n = Math.min(skip, chunk.length - at);
        skip -= n;
        at += n;
      } else {
        const n = Math.min(want - (bufferEnd - bufferStart), chunk.length - at);
        append(chunk.subarray(at, at + n));
        at += n;
        drain(false);
      }
    }
  }

  function close(): void {
    drain(true);
  }

  function append(bytes: Uint8Array): void {
    const held = bufferEnd - bufferStart;
    if (bufferEnd + bytes.length > buffer.length) {
      const grown = new Uint8Array(Math.max(held + bytes.length, held * 2, 64));
      grown.set(buffer.subarray(bufferStart, bufferEnd));
      buffer = grown;
      bufferStart = 0;
      bufferEnd = held;
    }
    buffer.set(bytes, bufferEnd);
    bufferEnd += bytes.length;
  }

  function drain(final: boolean): void {
    while (bufferStart < bufferEnd) {
      const held = bufferEnd - bufferStart;
      if (pass > 0 || skip > 0) {
        const n = Math.min(held, pass || skip);
        if (pass > 0) {
          emit(buffer.slice(bufferStart, bufferStart + n));
          pass -= n;
        } else {
          skip -= n;
        }
        bufferStart += n;
      } else if (held >= want || final) {
        bufferStart += step(buffer.subarray(bufferStart, bufferEnd), final);
      } else {
        return;
      }
    }
  }

  /** Handles the buffered `bytes` in the current state and returns how many it consumed. */
  function step(bytes: Uint8Array, final: boolean): number {
    switch (state) {
      case 'detect':
        return detect(bytes);
      case 'jpegMarker':
        return jpegMarker(bytes, final);
      case 'jpegSegment':
        return jpegSegment(bytes);
      case 'pngSignature':
        out(bytes.subarray(0, 8));
        next('pngChunk', 8);
        return Math.min(8, bytes.length);
      case 'pngChunk':
        return pngChunk(bytes, final);
      case 'pngExif':
        return pngExif(bytes);
      case 'pngText':
        return pngText(bytes);
      case 'webp':
        emit(stripWebp(bytes));
        return bytes.length;
    }
  }

  /** Emits a copy of buffered bytes, which the buffer may overwrite later. */
  function out(bytes: Uint8Array): void {
    emit(bytes.slice());
  }

  function next(nextState: State, nextWant: number): void {
    state = nextState;
    want = nextWant;
  }

  function detect(bytes: Uint8Array): number {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      out(bytes.subarray(0, 2));
      next('jpegMarker', 4);
      return 2;
    }
    if (startsWith(bytes, 0, pngSignature)) {
      next('pngSignature', 8);
    } else if (startsWith(bytes, 0, riff) && startsWith(bytes, 8, webp)) {
      next('webp', Infinity);
    } else {
      throw new UnsupportedError();
    }
    return 0;
  }

  function jpegMarker(bytes: Uint8Array, final: boolean): number {
    if (bytes[0] !== 0xff) {
      throw new InvalidInputError('Invalid JPEG: expected a marker.');
    }
    const marker = bytes[1];
    if (marker === undefined || bytes.length < 4) {
      out(bytes);
      return bytes.length;
    }
    if (marker === 0xff) {
      out(bytes.subarray(0, 1));
      return 1;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      out(bytes.subarray(0, 2));
      return 2;
    }
    if (marker === 0xda || marker === 0xd9) {
      pass = Infinity;
      return 0;
    }
    const length = u16be(bytes, 2);
    if (length < 2) {
      throw new InvalidInputError('Invalid JPEG: segment length is less than 2.');
    }
    if (marker === 0xe1 || marker === 0xe2 || marker === 0xed) {
      next('jpegSegment', 2 + length);
      return final ? jpegSegment(bytes) : 0;
    }
    out(bytes.subarray(0, 4));
    pass = length - 2;
    return 4;
  }

  function jpegSegment(buffered: Uint8Array): number {
    const bytes = buffered.subarray(0, 2 + u16be(buffered, 2));
    const marker = bytes[1];
    const payload = bytes.subarray(4);
    next('jpegMarker', 4);
    if (marker === 0xe1 && startsWith(payload, 0, exifHeader)) {
      const tiff = orientationTiff(payload.subarray(6));
      if (tiff) {
        emit(Bytes.concat([new Uint8Array([0xff, 0xe1, 0, tiff.length + 8]), exifPrefix, tiff]));
      }
    } else if (keepJpegSegment(marker!, payload)) {
      out(bytes);
    }
    return bytes.length;
  }

  function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
    if (marker === 0xed) {
      return false;
    }
    if (marker === 0xe1) {
      return !startsWith(payload, 0, xmp) && !startsWith(payload, 0, xmpExtension);
    }
    return keepColorProfile || !startsWith(payload, 0, iccProfile);
  }

  function pngChunk(bytes: Uint8Array, final: boolean): number {
    if (bytes.length < 8) {
      out(bytes);
      return bytes.length;
    }
    const length = u32be(bytes, 0);
    const type = String.fromCharCode(...bytes.subarray(4, 8));
    if (type === 'IEND') {
      pass = Infinity;
      return 0;
    }
    if (type === 'eXIf') {
      if (keepOrientation) {
        next('pngExif', 8 + length + 4);
        return final ? pngExif(bytes) : 0;
      }
      skip = length + 4;
      return 8;
    }
    if (pngTextTypes.has(type)) {
      next('pngText', 8 + Math.min(length, 80));
      return final ? pngText(bytes) : 0;
    }
    if (type === 'iCCP' && !keepColorProfile) {
      skip = length + 4;
      return 8;
    }
    out(bytes.subarray(0, 8));
    pass = length + 4;
    return 8;
  }

  function pngExif(buffered: Uint8Array): number {
    const bytes = buffered.subarray(0, 12 + u32be(buffered, 0));
    let data = bytes.subarray(8, 8 + u32be(bytes, 0));
    if (startsWith(data, 0, exifHeader)) {
      data = data.subarray(6);
    }
    const tiff = orientationTiff(data);
    if (tiff) {
      const chunk = Bytes.concat([bigEndian32(tiff.length), ascii('eXIf'), tiff]);
      emit(Bytes.concat([chunk, bigEndian32(crc32(chunk.subarray(4)))]));
    }
    next('pngChunk', 8);
    return bytes.length;
  }

  function pngText(bytes: Uint8Array): number {
    const length = u32be(bytes, 0);
    const payload = bytes.subarray(8, 8 + Math.min(length, 80));
    const nul = payload.indexOf(0);
    const keyword = String.fromCharCode(...payload.subarray(0, nul < 0 ? payload.length : nul));
    next('pngChunk', 8);
    if (pngMetadataKeywords.has(keyword)) {
      skip = length + 4 - payload.length;
    } else {
      out(bytes.subarray(0, 8 + payload.length));
      pass = length + 4 - payload.length;
    }
    return 8 + payload.length;
  }

  function stripWebp(bytes: Uint8Array): Uint8Array {
    const parts = [bytes.subarray(0, 12)] satisfies Uint8Array[];
    let vp8x: Uint8Array | undefined;
    let hasExif = false;
    let hasIcc = false;
    for (let i = 12; i < bytes.length;) {
      if (i + 8 > bytes.length) {
        parts.push(bytes.subarray(i));
        break;
      }
      const type = String.fromCharCode(...bytes.subarray(i, i + 4));
      const length =
        bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! * 0x1000000);
      const end = Math.min(i + 8 + length + (length & 1), bytes.length);
      const chunk = bytes.subarray(i, end);
      i = end;
      if (type === 'EXIF') {
        let data = chunk.subarray(8, 8 + length);
        if (startsWith(data, 0, exifHeader)) {
          data = data.subarray(6);
        }
        const tiff = orientationTiff(data);
        if (!tiff) {
          continue;
        }
        hasExif = true;
        parts.push(Bytes.concat([ascii('EXIF'), littleEndian32(tiff.length), tiff]));
      } else if (type === 'XMP ') {
        continue;
      } else if (type === 'ICCP') {
        if (!keepColorProfile) {
          continue;
        }
        hasIcc = true;
        parts.push(chunk);
      } else if (type === 'VP8X' && !vp8x) {
        vp8x = chunk.slice();
        parts.push(vp8x);
      } else {
        parts.push(chunk);
      }
    }
    if (vp8x && vp8x.length > 8) {
      vp8x[8] = (vp8x[8]! & ~0x2c) | (hasIcc ? 0x20 : 0) | (hasExif ? 0x08 : 0);
    }
    const file = Bytes.concat(parts);
    file.set(littleEndian32(file.length - 8), 4);
    return file;
  }

  /** Returns a TIFF block holding only the Orientation tag of `data`, if it should be kept. */
  function orientationTiff(data: Uint8Array): Uint8Array | undefined {
    if (!keepOrientation || orientationWritten) {
      return undefined;
    }
    let orientation: unknown;
    try {
      orientation = readTiff(data, 0, data.length).ifds.ifd0.Orientation;
    } catch {
      return undefined;
    }
    if (typeof orientation !== 'number' || orientation < 2 || orientation > 8) {
      return undefined;
    }
    orientationWritten = true;
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
    ]);
  }

  return { push, close };
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bigEndian32(n: number): Uint8Array {
  return new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function littleEndian32(n: number): Uint8Array {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]);
}
