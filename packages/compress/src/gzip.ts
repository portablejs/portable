import * as Bytes from '@portable/bytes';
import { crc32, toBufferSource } from '@portable/bytes/internal';
import { InvalidInputError, TruncatedError } from './errors.js';

const badTrailer = new Uint8Array([
  0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0x01,
]);
let atClose: Promise<boolean> | undefined;

/**
 * Resolves to true if the runtime's `DecompressionStream('gzip')` waits until the input closes to
 * report a bad CRC-32 or length, and then throws the same error as for input that ends early.
 * Deno 2.9's decoder does this. `decode` and `DecoderStream` then check the trailer themselves.
 */
export function checksTrailerAtClose(): Promise<boolean> {
  atClose ??= (async () => {
    const stream = new DecompressionStream('gzip');
    stream.readable.pipeTo(new WritableStream()).catch(() => {});
    const writer = stream.writable.getWriter();
    if (
      !(await writer.write(badTrailer).then(
        () => true,
        () => false,
      ))
    ) {
      return false;
    }
    return writer.close().then(
      () => false,
      (error: unknown) => !hasCode(error),
    );
  })();
  return atClose;
}

const hasCode = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Throws `InvalidInputError` if `bytes`, which start at `position` in a gzip stream, can't be part
 * of a gzip header. Only the first 4 bytes are checked. Deno 2.9's decoder checks none of them
 * until all 10 header bytes have arrived, so without this check a bad header in shorter input would
 * throw `TruncatedError` instead of `InvalidInputError`.
 */
export function assertHeader(bytes: Uint8Array, position: number): void {
  for (let i = 0; position + i < 4 && i < bytes.length; i++) {
    const byte = bytes[i]!;
    const valid =
      position + i === 3 ? (byte & 0xe0) === 0 : byte === [0x1f, 0x8b, 0x08][position + i];
    if (!valid) {
      throw new InvalidInputError('Compressed input is invalid.');
    }
  }
}

/** Returns the length field of the gzip trailer in the last 4 bytes of `tail`. */
export function storedLength(tail: Uint8Array): number {
  return readUint32(tail, tail.length - 4);
}

/**
 * Finds where the deflate stream inside a gzip member ends, and checks the trailer after it as
 * zlib does, for runtimes where `checksTrailerAtClose` is true. `isInvalid` resolves to true if 4 or
 * more bytes follow the deflate stream and they don't start with the CRC-32 of the output, if 8
 * bytes follow and the length after the CRC-32 is wrong, or if more than 8 bytes follow. Otherwise
 * the input ended early. Deno's `DecompressionStream('deflate-raw')` fails a write that holds a
 * byte after the end of the stream, so `trailerCheck` writes the member's deflate data to a second
 * decoder, holds back the last 8 bytes, and writes those one at a time. The first write that fails
 * marks the end of the deflate stream.
 */
export function trailerCheck(): { write(chunk: Uint8Array): void; isInvalid(): Promise<boolean> } {
  const raw = new DecompressionStream('deflate-raw');
  let crc = 0;
  let length = 0;
  const drained = raw.readable
    .pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          crc = crc32(chunk, crc);
          length += chunk.byteLength;
        },
      }),
    )
    .catch(() => {});
  const writer = raw.writable.getWriter();
  const send = async (bytes: Uint8Array) =>
    writer.write(toBufferSource(bytes)).then(
      () => true,
      () => false,
    );
  let header: Uint8Array | undefined = new Uint8Array(0);
  let held = new Uint8Array(0);
  let written = Promise.resolve(true);
  let result: Promise<boolean> | undefined;

  const findEnd = async (): Promise<number> => {
    if (!(await written)) {
      return Infinity;
    }
    for (let i = 0; i < held.length; i++) {
      if (!(await send(held.subarray(i, i + 1)))) {
        await drained;
        return held.length - i;
      }
    }
    writer.abort().catch(() => {});
    return 0;
  };

  return {
    write(chunk) {
      if (header) {
        header = Bytes.concat([header, chunk]);
        const end = headerLength(header);
        if (end === -1) {
          return;
        }
        chunk = header.subarray(end);
        header = undefined;
      }
      const bytes = Bytes.concat([held, chunk]);
      if (bytes.length > 8) {
        const body = bytes.subarray(0, bytes.length - 8);
        written = written.then((ok) => ok && send(body));
      }
      held = bytes.slice(-8);
    },
    isInvalid() {
      result ??= findEnd().then(
        (after) =>
          after > 8 ||
          (after >= 4 && (after === 8 || readUint32(held, held.length - after) !== crc)),
      );
      return result;
    },
  };
}

/** Returns the length of the gzip header at the start of `bytes`, or -1 if it continues past them. */
function headerLength(bytes: Uint8Array): number {
  if (bytes.length < 10) {
    return -1;
  }
  const flags = bytes[3]!;
  let end = 10;
  if (flags & 0x04) {
    if (bytes.length < 12) {
      return -1;
    }
    end += 2 + (bytes[10]! | (bytes[11]! << 8));
  }
  for (const flag of [0x08, 0x10]) {
    if (flags & flag) {
      end = end < bytes.length ? bytes.indexOf(0, end) + 1 : 0;
      if (end === 0) {
        return -1;
      }
    }
  }
  if (flags & 0x02) {
    end += 2;
  }
  return end <= bytes.length ? end : -1;
}

/** The header of the gzip member that `rawEndCheck` and `assertRawEnd` wrap raw deflate data in. */
export const rawHeader: Uint8Array<ArrayBuffer> = new Uint8Array([
  0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff,
]);

/**
 * Checks that a raw deflate stream ends, for runtimes where `DecompressionStream('deflate-raw')`
 * returns partial output for a cut-short stream instead of failing, as Deno 2.9's does. Deno's gzip
 * decoder does notice a cut-short deflate stream, so `rawEndCheck` decodes the data again inside a
 * gzip member, and `assertEnd` adds a trailer that holds the output's CRC-32 and length.
 */
export function rawEndCheck(): {
  write(chunk: Uint8Array): void;
  assertEnd(crc: number, length: number): Promise<void>;
  abort(): void;
} {
  const stream = new DecompressionStream('gzip');
  stream.readable.pipeTo(new WritableStream()).catch(() => {});
  const writer = stream.writable.getWriter();
  const write = (bytes: Uint8Array) => {
    writer.write(toBufferSource(bytes)).catch(() => {});
  };
  write(rawHeader);
  return {
    write,
    async assertEnd(crc, length) {
      try {
        await writer.write(trailer(crc, length));
        await writer.close();
      } catch (error) {
        throw new TruncatedError('Compressed input ended early.', { cause: error });
      }
    },
    abort() {
      writer.abort().catch(() => {});
    },
  };
}

/** Returns the gzip trailer for output whose CRC-32 is `crc` and whose length is `length` bytes. */
export function trailer(crc: number, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, crc, true);
  view.setUint32(4, length % 2 ** 32, true);
  return bytes;
}

const readUint32 = (bytes: Uint8Array, at: number) =>
  (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
