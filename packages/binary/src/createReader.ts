import { assertUint8Array } from '@portable/bytes/internal';
import { TruncatedError } from './errors.js';
import { readUtf8 } from './utf8.js';
import {
  assertEncoding,
  position,
  readBigVarint,
  readVarint,
  type VarintEncoding,
} from './varint.js';

/** Byte order of multi-byte integers and floats. `'big'` is network byte order. */
export type Endian = 'big' | 'little';

/**
 * Reads values from a `Uint8Array` one after another, starting at `offset`. Each read moves
 * `offset` past the value it read. A read that fails leaves `offset` where it was.
 */
export type Reader = {
  /** Where the next read starts, in bytes from the start of the reader's bytes. */
  offset: number;
  /** Byte order of the multi-byte reads. */
  endian: Endian;
  /** The number of bytes the reader was created with. */
  readonly length: number;
  /** The number of bytes after `offset`. */
  readonly remaining: number;
  uint8(): number;
  int8(): number;
  uint16(): number;
  int16(): number;
  uint32(): number;
  int32(): number;
  bigUint64(): bigint;
  bigInt64(): bigint;
  float32(): number;
  float64(): number;
  /** Reads an unsigned integer of 1 to 6 bytes, such as the 24-bit lengths in TLS. */
  uint(byteLength: number): number;
  /** Reads a two's complement integer of 1 to 6 bytes. */
  int(byteLength: number): number;
  /** Reads a varint that fits in a safe integer. */
  varint(options?: Reader.VarintOptions): number;
  /** Reads a varint of up to 64 bits. */
  bigVarint(options?: Reader.VarintOptions): bigint;
  /** Returns the next `byteLength` bytes as a view of the reader's bytes, not a copy. */
  bytes(byteLength: number): Uint8Array;
  /** Decodes the next `byteLength` bytes as UTF-8. */
  string(byteLength: number, options?: Reader.StringOptions): string;
  /** Decodes UTF-8 up to the next zero byte and moves `offset` past the zero byte. */
  cstring(options?: Reader.StringOptions): string;
  /** Moves `offset` forward by `byteLength` bytes. */
  skip(byteLength: number): void;
};

export declare namespace Reader {
  type VarintOptions = {
    /** How the varint stores its sign. @default 'unsigned' */
    encoding?: VarintEncoding | undefined;
  };
  type StringOptions = {
    /**
     * Throw `Binary.InvalidInputError` for malformed UTF-8 instead of decoding it to U+FFFD.
     * @default false
     */
    fatal?: boolean | undefined;
  };
}

export declare namespace createReader {
  type Options = {
    /** Byte order of the multi-byte reads. You can change it later with `reader.endian`. @default 'big' */
    endian?: Endian | undefined;
  };
}

type State = {
  readonly bytes: Uint8Array;
  readonly end: number;
  pos: number;
  little: boolean;
  view: DataView | undefined;
};

const key = Symbol.for('portable.binary.reader');

type Internal = Reader & { readonly [key]: State };

export function assertEndian(endian: unknown): Endian {
  if (endian === 'big' || endian === 'little') {
    return endian;
  }
  throw new RangeError(`\`endian\` must be 'big' or 'little', got ${String(endian)}.`);
}

export function assertByteLength(byteLength: unknown, max: number): number {
  if (typeof byteLength !== 'number') {
    throw new TypeError(`Expected a number of bytes, got ${typeof byteLength}.`);
  }
  if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > max) {
    throw new RangeError(`The byte length must be an integer from 0 to ${max}, got ${byteLength}.`);
  }
  return byteLength;
}

function assertIntByteLength(byteLength: unknown): number {
  const n = assertByteLength(byteLength, 6);
  if (n === 0) {
    throw new RangeError('The byte length must be an integer from 1 to 6, got 0.');
  }
  return n;
}

/** Checks that `n` bytes remain and returns where they start. */
function take(s: State, n: number): number {
  const at = s.pos;
  if (n > s.end - at) {
    throw new TruncatedError(`Needed ${n} bytes at offset ${at}, but only ${s.end - at} remain.`, {
      offset: at,
    });
  }
  s.pos = at + n;
  return at;
}

function readUint(s: State, n: number): number {
  const b = s.bytes;
  const at = take(s, n);
  let value = 0;
  if (s.little) {
    for (let i = n - 1; i >= 0; i--) {
      value = value * 256 + b[at + i]!;
    }
  } else {
    for (let i = 0; i < n; i++) {
      value = value * 256 + b[at + i]!;
    }
  }
  return value;
}

function view(s: State): DataView {
  return (s.view ??= new DataView(s.bytes.buffer, s.bytes.byteOffset, s.bytes.byteLength));
}

function readVarintOf<value>(
  s: State,
  options: Reader.VarintOptions,
  read: (
    bytes: Uint8Array,
    start: number,
    end: number,
    encoding: VarintEncoding,
  ) => value | undefined,
): value {
  const value = read(s.bytes, s.pos, s.end, assertEncoding(options.encoding ?? 'unsigned'));
  if (value === undefined) {
    throw new TruncatedError(`Varint at offset ${s.pos} is cut off.`, { offset: s.pos });
  }
  s.pos = position.next;
  return value;
}

const reader = {
  get offset(): number {
    return (this as unknown as Internal)[key].pos;
  },
  set offset(offset: number) {
    const s = (this as unknown as Internal)[key];
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > s.end) {
      throw new RangeError(`\`offset\` must be an integer from 0 to ${s.end}, got ${offset}.`);
    }
    s.pos = offset;
  },
  get endian(): Endian {
    return (this as unknown as Internal)[key].little ? 'little' : 'big';
  },
  set endian(endian: Endian) {
    (this as unknown as Internal)[key].little = assertEndian(endian) === 'little';
  },
  get length(): number {
    return (this as unknown as Internal)[key].end;
  },
  get remaining(): number {
    const s = (this as unknown as Internal)[key];
    return s.end - s.pos;
  },
  uint8(this: Internal): number {
    const s = this[key];
    return s.bytes[take(s, 1)]!;
  },
  int8(this: Internal): number {
    const s = this[key];
    return (s.bytes[take(s, 1)]! << 24) >> 24;
  },
  uint16(this: Internal): number {
    const s = this[key];
    const b = s.bytes;
    const at = take(s, 2);
    return s.little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!;
  },
  int16(this: Internal): number {
    return (this.uint16() << 16) >> 16;
  },
  uint32(this: Internal): number {
    return this.int32() >>> 0;
  },
  int32(this: Internal): number {
    const s = this[key];
    const b = s.bytes;
    const at = take(s, 4);
    return s.little
      ? b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)
      : (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!;
  },
  bigUint64(this: Internal): bigint {
    const s = this[key];
    const first = readUint(s, 4);
    let second: number;
    try {
      second = readUint(s, 4);
    } catch (error) {
      s.pos -= 4;
      throw error;
    }
    const [high, low] = s.little ? [second, first] : [first, second];
    return (BigInt(high) << 32n) | BigInt(low);
  },
  bigInt64(this: Internal): bigint {
    return BigInt.asIntN(64, this.bigUint64());
  },
  float32(this: Internal): number {
    const s = this[key];
    return view(s).getFloat32(take(s, 4), s.little);
  },
  float64(this: Internal): number {
    const s = this[key];
    return view(s).getFloat64(take(s, 8), s.little);
  },
  uint(this: Internal, byteLength: number): number {
    return readUint(this[key], assertIntByteLength(byteLength));
  },
  int(this: Internal, byteLength: number): number {
    const n = assertIntByteLength(byteLength);
    const value = readUint(this[key], n);
    const limit = 2 ** (8 * n);
    return value >= limit / 2 ? value - limit : value;
  },
  varint(this: Internal, options?: Reader.VarintOptions): number {
    const s = this[key];
    if (options?.encoding === undefined) {
      // Most varints are unsigned and fit in five bytes, so those are read inline.
      const b = s.bytes;
      const at = s.pos;
      if (s.end - at >= 5) {
        let byte = b[at]!;
        let value = byte & 0x7f;
        if (byte < 0x80) {
          s.pos = at + 1;
          return value;
        }
        byte = b[at + 1]!;
        value |= (byte & 0x7f) << 7;
        if (byte < 0x80) {
          s.pos = at + 2;
          return value;
        }
        byte = b[at + 2]!;
        value |= (byte & 0x7f) << 14;
        if (byte < 0x80) {
          s.pos = at + 3;
          return value;
        }
        byte = b[at + 3]!;
        value |= (byte & 0x7f) << 21;
        if (byte < 0x80) {
          s.pos = at + 4;
          return value;
        }
        byte = b[at + 4]!;
        if (byte < 0x80) {
          s.pos = at + 5;
          return value + byte * 0x10000000;
        }
      }
    }
    return readVarintOf(s, options ?? {}, readVarint);
  },
  bigVarint(this: Internal, options: Reader.VarintOptions = {}): bigint {
    return readVarintOf(this[key], options, readBigVarint);
  },
  bytes(this: Internal, byteLength: number): Uint8Array {
    const s = this[key];
    const at = take(s, assertByteLength(byteLength, Number.MAX_SAFE_INTEGER));
    return s.bytes.subarray(at, s.pos);
  },
  string(this: Internal, byteLength: number, options: Reader.StringOptions = {}): string {
    const s = this[key];
    const at = take(s, assertByteLength(byteLength, Number.MAX_SAFE_INTEGER));
    try {
      return readUtf8(s.bytes, at, s.pos, options.fatal ?? false);
    } catch (error) {
      s.pos = at;
      throw error;
    }
  },
  cstring(this: Internal, options: Reader.StringOptions = {}): string {
    const s = this[key];
    const at = s.pos;
    const zero = s.bytes.subarray(at, s.end).indexOf(0);
    if (zero === -1) {
      throw new TruncatedError(`String at offset ${at} has no terminating zero byte.`, {
        offset: at,
      });
    }
    const text = readUtf8(s.bytes, at, at + zero, options.fatal ?? false);
    s.pos = at + zero + 1;
    return text;
  },
  skip(this: Internal, byteLength: number): void {
    take(this[key], assertByteLength(byteLength, Number.MAX_SAFE_INTEGER));
  },
};

/**
 * Creates a `Reader` over `bytes`, starting at offset 0. The reader doesn't copy `bytes`, so later
 * changes to them show up in later reads.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * const reader = Binary.createReader(new Uint8Array([0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]));
 * const length = reader.uint16();
 * reader.string(length); // 'hello'
 * ```
 */
export function createReader(bytes: Uint8Array, options: createReader.Options = {}): Reader {
  assertUint8Array(bytes);
  const state = {
    bytes,
    end: bytes.length,
    pos: 0,
    little: assertEndian(options.endian ?? 'big') === 'little',
    view: undefined,
  } satisfies State as State;
  const result = Object.create(reader) as Internal;
  Object.defineProperty(result, key, { value: state });
  return result;
}
