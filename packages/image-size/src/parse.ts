import { assertUint8Array } from '@portable/bytes/internal';
import { NeedMore } from './bytes.js';
import { MaxBytesError, TruncatedError, UnsupportedError } from './errors.js';
import type { Format } from './formats/format.js';
import { heif } from './formats/heif.js';
import { icns } from './formats/icns.js';
import { cur, ico } from './formats/ico.js';
import { jp2 } from './formats/jp2.js';
import { jpg } from './formats/jpg.js';
import { jxl, jxlStream } from './formats/jxl.js';
import { pnm } from './formats/pnm.js';
import { bmp, dds, gif, j2c, ktx, png, psd, tga } from './formats/simple.js';
import { svg } from './formats/svg.js';
import { tiff } from './formats/tiff.js';
import { webp } from './formats/webp.js';

/** The type and dimensions of an image, in the shape image-size returns. */
export type Size = {
  /** Width in pixels. For a file with several images, the width of the largest. */
  width: number;
  /** Height in pixels. For a file with several images, the height of the largest. */
  height: number;
  /** The detected format. */
  type: Type;
  /** EXIF orientation (1 to 8) of a JPEG, when the file has a non-zero one. */
  orientation?: number | undefined;
  /** Every image in an ICO, CUR or ICNS file that holds more than one. */
  images?: readonly Image[] | undefined;
};

/**
 * The detected format. HEIF files report their brand (`avif`, `heic`, `mif1` and so on), KTX 2
 * reports `ktx2`, and BigTIFF reports `bigtiff`.
 */
export type Type =
  | 'avif'
  | 'avis'
  | 'bigtiff'
  | 'bmp'
  | 'cur'
  | 'dds'
  | 'gif'
  | 'heic'
  | 'heix'
  | 'hevc'
  | 'hevx'
  | 'icns'
  | 'ico'
  | 'j2c'
  | 'jp2'
  | 'jpg'
  | 'jxl'
  | 'jxl-stream'
  | 'ktx'
  | 'ktx2'
  | 'mif1'
  | 'msf1'
  | 'png'
  | 'pnm'
  | 'psd'
  | 'svg'
  | 'tga'
  | 'tiff'
  | 'webp';

/** One image of a multi-image file. ICNS entries include their icon type, such as `ic08`. */
export type Image = { width: number; height: number; type?: string | undefined };

/** Detection order, the same as image-size's. */
const formats = [
  bmp,
  cur,
  dds,
  gif,
  heif,
  icns,
  ico,
  j2c,
  jp2,
  jpg,
  jxl,
  jxlStream,
  ktx,
  png,
  pnm,
  psd,
  svg,
  tga,
  tiff,
  webp,
] satisfies readonly Format[];

const byFirstByte = new Map<number, Format>([
  [0x00, heif],
  [0x38, psd],
  [0x42, bmp],
  [0x44, dds],
  [0x47, gif],
  [0x49, tiff],
  [0x4d, tiff],
  [0x52, webp],
  [0x69, icns],
  [0x89, png],
  [0xff, jpg],
]);

function detect(input: Uint8Array, final: boolean): Format {
  let truncated = false;
  const matches = (format: Format) => {
    try {
      return format.validate(input, final);
    } catch (error) {
      if (!final || !(error instanceof NeedMore)) {
        throw error;
      }
      truncated = true;
      return false;
    }
  };
  const likely = byFirstByte.get(input[0] ?? -1);
  const format = likely && matches(likely) ? likely : formats.find(matches);
  if (format) {
    return format;
  }
  throw truncated ? new TruncatedError() : new UnsupportedError();
}

function measure(input: Uint8Array, final: boolean): Size {
  const size = detect(input, final).calculate(input, final);
  if (!size.images || size.images.length < 2) {
    return size;
  }
  let largest = size.images[0]!;
  for (const image of size.images) {
    if (image.width * image.height > largest.width * largest.height) {
      largest = image;
    }
  }
  return { ...size, width: largest.width, height: largest.height };
}

/**
 * Returns the type and dimensions of the image in `bytes`. The bytes need only cover the header:
 * a few dozen bytes for most formats, up to the first frame header for JPEG.
 *
 * @throws {UnsupportedError} The bytes don't match a supported format.
 * @throws {TruncatedError} The bytes end before the dimensions.
 * @throws {InvalidInputError} The header is malformed.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * const bytes = new Uint8Array(await (await fetch('https://example.com/photo.jpg')).arrayBuffer());
 * ImageSize.parse(bytes); // { width: 1600, height: 1200, type: 'jpg' }
 * ```
 */
export function parse(bytes: Uint8Array): Size {
  try {
    return measure(assertUint8Array(bytes), true);
  } catch (error) {
    throw error instanceof NeedMore ? new TruncatedError() : error;
  }
}

export declare namespace parseStream {
  type Options = {
    /**
     * Most bytes to buffer. If the dimensions aren't in the first `maxBytes` bytes, `parseStream`
     * cancels the stream and rejects with `MaxBytesError`.
     * @default 524288
     */
    maxBytes?: number | undefined;
    /** Rejects with `signal.reason` when aborted, and cancels the stream. */
    signal?: AbortSignal | undefined;
  };
}

/**
 * Reads `stream` only until the image's dimensions are known, then cancels it.
 *
 * @throws {UnsupportedError} The bytes don't match a supported format.
 * @throws {TruncatedError} The stream ends before the dimensions.
 * @throws {MaxBytesError} `maxBytes` is reached before the dimensions.
 * @throws `signal.reason` when `signal` is aborted.
 * @throws {InvalidInputError} The header is malformed.
 *
 * @example
 * ```ts
 * import * as ImageSize from '@portable/image-size';
 *
 * const response = await fetch('https://example.com/photo.jpg');
 * const { width, height } = await ImageSize.parseStream(response.body!);
 * ```
 */
export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  options: parseStream.Options = {},
): Promise<Size> {
  const { maxBytes = 512 * 1024, signal } = options;
  if (!(maxBytes >= 0)) {
    throw new RangeError('`maxBytes` must be a number >= 0.');
  }
  const reader = stream.getReader();
  const abort = () => reader.cancel(signal!.reason).catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  let buffer = new Uint8Array(0);
  let length = 0;
  let needed = 1;
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        return parse(buffer.subarray(0, length));
      }
      assertUint8Array(value);
      if (length + value.length > buffer.length) {
        const grown = new Uint8Array(Math.max(length + value.length, buffer.length * 2));
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(value, length);
      length += value.length;
      if (length >= maxBytes) {
        try {
          return parse(buffer.subarray(0, maxBytes));
        } catch (error) {
          throw error instanceof TruncatedError ? new MaxBytesError({ maxBytes }) : error;
        }
      }
      if (length < needed) {
        continue;
      }
      try {
        return measure(buffer.subarray(0, length), false);
      } catch (error) {
        if (!(error instanceof NeedMore)) {
          throw error;
        }
        needed = Math.max(error.end, length + 1);
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.cancel(signal?.reason).catch(() => {});
  }
}
