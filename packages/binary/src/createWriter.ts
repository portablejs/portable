import { assertUint8Array } from '@portable/bytes/internal';
import { assertByteLength, assertEndian, type Endian } from './createReader.js';
import { utf8Length, writeUtf8 } from './utf8.js';
import {
  assertBigVarintValue,
  assertEncoding,
  assertVarintValue,
  encodeBigVarint,
  varintLength,
  writeVarint,
  type VarintEncoding,
} from './varint.js';

/**
 * Writes values one after another into a buffer that grows as needed, starting at `offset`. Each
 * write moves `offset` past the value it wrote. A write that throws writes nothing.
 */
export type Writer = {
  /**
   * Where the next write starts. Set it back to fill in a value written earlier, such as a length,
   * and then set it to `length` to continue at the end.
   */
  offset: number;
  /** Byte order of the multi-byte writes. */
  endian: Endian;
  /** The number of bytes written, counted to the furthest byte any write reached. */
  readonly length: number;
  uint8(value: number): void;
  int8(value: number): void;
  uint16(value: number): void;
  int16(value: number): void;
  uint32(value: number): void;
  int32(value: number): void;
  bigUint64(value: bigint): void;
  bigInt64(value: bigint): void;
  float32(value: number): void;
  float64(value: number): void;
  /** Writes an unsigned integer of 1 to 6 bytes. */
  uint(byteLength: number, value: number): void;
  /** Writes a two's complement integer of 1 to 6 bytes. */
  int(byteLength: number, value: number): void;
  /** Writes a varint from a safe integer. */
  varint(value: number, options?: Writer.VarintOptions): void;
  /** Writes a varint of up to 64 bits. */
  bigVarint(value: bigint, options?: Writer.VarintOptions): void;
  /** Copies `value` into the buffer. */
  bytes(value: Uint8Array): void;
  /** Writes `text` as UTF-8, without a length or terminator. `Binary.utf8Length` gives its length. */
  string(text: string): void;
  /** Writes `text` as UTF-8 followed by a zero byte. Throws a `RangeError` if `text` contains U+0000. */
  cstring(text: string): void;
  /** Returns a copy of the bytes written so far. */
  toBytes(): Uint8Array<ArrayBuffer>;
};

export declare namespace Writer {
  type VarintOptions = {
    /** How the varint stores its sign. @default 'unsigned' */
    encoding?: VarintEncoding | undefined;
  };
}

export declare namespace createWriter {
  type Options = {
    /** Byte order of the multi-byte writes. You can change it later with `writer.endian`. @default 'big' */
    endian?: Endian | undefined;
  };
}

type State = {
  bytes: Uint8Array<ArrayBuffer>;
  pos: number;
  end: number;
  little: boolean;
  view: DataView | undefined;
};

const key = Symbol.for('portable.binary.writer');

type Internal = Writer & { readonly [key]: State };

/** Makes room for `n` bytes at `pos` and returns `pos`. */
function reserve(s: State, n: number): number {
  const at = s.pos;
  const needed = at + n;
  if (needed > s.bytes.length) {
    let size = s.bytes.length * 2;
    while (size < needed) {
      size *= 2;
    }
    const bytes = new Uint8Array(size);
    bytes.set(s.bytes.subarray(0, s.end));
    s.bytes = bytes;
    s.view = undefined;
  }
  s.pos = needed;
  if (needed > s.end) {
    s.end = needed;
  }
  return at;
}

function view(s: State): DataView {
  return (s.view ??= new DataView(s.bytes.buffer));
}

function assertNumber(value: unknown): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected a number, got ${typeof value}.`);
  }
  return value;
}

function assertInteger(value: unknown, min: number, max: number): number {
  const n = assertNumber(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new RangeError(`Expected an integer from ${min} to ${max}, got ${n}.`);
  }
  return n;
}

function assertBigInt(value: unknown, signed: boolean): bigint {
  if (typeof value !== 'bigint') {
    throw new TypeError(`Expected a bigint, got ${typeof value}.`);
  }
  if (value !== (signed ? BigInt.asIntN(64, value) : BigInt.asUintN(64, value))) {
    throw new RangeError(
      `Expected a bigint that fits in 64 ${signed ? 'signed' : 'unsigned'} bits, got ${value}.`,
    );
  }
  return value;
}

function assertIntByteLength(byteLength: unknown): number {
  const n = assertByteLength(byteLength, 6);
  if (n === 0) {
    throw new RangeError('The byte length must be an integer from 1 to 6, got 0.');
  }
  return n;
}

function assertString(text: unknown): string {
  if (typeof text !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof text}.`);
  }
  return text;
}

/** Writes `value`, which fits in `n` bytes, as an unsigned integer. */
function writeUint(s: State, n: number, value: number): void {
  const at = reserve(s, n);
  if (s.little) {
    for (let i = 0; i < n; i++) {
      s.bytes[at + i] = value % 256;
      value = Math.floor(value / 256);
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      s.bytes[at + i] = value % 256;
      value = Math.floor(value / 256);
    }
  }
}

function write16(s: State, value: number): void {
  const at = reserve(s, 2);
  const b = s.bytes;
  if (s.little) {
    b[at] = value;
    b[at + 1] = value >>> 8;
  } else {
    b[at] = value >>> 8;
    b[at + 1] = value;
  }
}

function write32(s: State, value: number): void {
  const at = reserve(s, 4);
  const b = s.bytes;
  if (s.little) {
    b[at] = value;
    b[at + 1] = value >>> 8;
    b[at + 2] = value >>> 16;
    b[at + 3] = value >>> 24;
  } else {
    b[at] = value >>> 24;
    b[at + 1] = value >>> 16;
    b[at + 2] = value >>> 8;
    b[at + 3] = value;
  }
}

function write64(s: State, value: bigint): void {
  const high = Number(BigInt.asUintN(32, value >> 32n));
  const low = Number(BigInt.asUintN(32, value));
  const at = reserve(s, 8);
  s.pos = at;
  if (s.little) {
    write32(s, low);
    write32(s, high);
  } else {
    write32(s, high);
    write32(s, low);
  }
}

const writer = {
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
  uint8(this: Internal, value: number): void {
    assertInteger(value, 0, 0xff);
    const s = this[key];
    const at = reserve(s, 1);
    s.bytes[at] = value;
  },
  int8(this: Internal, value: number): void {
    assertInteger(value, -0x80, 0x7f);
    const s = this[key];
    const at = reserve(s, 1);
    s.bytes[at] = value;
  },
  uint16(this: Internal, value: number): void {
    write16(this[key], assertInteger(value, 0, 0xffff));
  },
  int16(this: Internal, value: number): void {
    write16(this[key], assertInteger(value, -0x8000, 0x7fff));
  },
  uint32(this: Internal, value: number): void {
    write32(this[key], assertInteger(value, 0, 0xffffffff));
  },
  int32(this: Internal, value: number): void {
    write32(this[key], assertInteger(value, -0x80000000, 0x7fffffff));
  },
  bigUint64(this: Internal, value: bigint): void {
    write64(this[key], assertBigInt(value, false));
  },
  bigInt64(this: Internal, value: bigint): void {
    write64(this[key], assertBigInt(value, true));
  },
  float32(this: Internal, value: number): void {
    assertNumber(value);
    const s = this[key];
    const at = reserve(s, 4);
    view(s).setFloat32(at, value, s.little);
  },
  float64(this: Internal, value: number): void {
    assertNumber(value);
    const s = this[key];
    const at = reserve(s, 8);
    view(s).setFloat64(at, value, s.little);
  },
  uint(this: Internal, byteLength: number, value: number): void {
    const n = assertIntByteLength(byteLength);
    writeUint(this[key], n, assertInteger(value, 0, 2 ** (8 * n) - 1));
  },
  int(this: Internal, byteLength: number, value: number): void {
    const n = assertIntByteLength(byteLength);
    const limit = 2 ** (8 * n);
    assertInteger(value, -limit / 2, limit / 2 - 1);
    writeUint(this[key], n, value < 0 ? value + limit : value);
  },
  varint(this: Internal, value: number, options?: Writer.VarintOptions): void {
    if (options?.encoding === undefined && value >>> 0 === value) {
      // A uint32 needs at most five bytes and can be written with bitwise operators.
      const s = this[key];
      const at = reserve(
        s,
        value < 0x80 ? 1 : value < 0x4000 ? 2 : value < 0x200000 ? 3 : value < 0x10000000 ? 4 : 5,
      );
      const b = s.bytes;
      let i = at;
      while (value >= 0x80) {
        b[i++] = (value & 0x7f) | 0x80;
        value >>>= 7;
      }
      b[i] = value;
      return;
    }
    options ??= {};
    const encoding = assertEncoding(options.encoding ?? 'unsigned');
    assertVarintValue(value, encoding);
    const s = this[key];
    const at = reserve(s, varintLength(value, encoding));
    writeVarint(s.bytes, at, value, encoding);
  },
  bigVarint(this: Internal, value: bigint, options: Writer.VarintOptions = {}): void {
    const encoding = assertEncoding(options.encoding ?? 'unsigned');
    const encoded = encodeBigVarint(assertBigVarintValue(value, encoding), encoding);
    const s = this[key];
    const at = reserve(s, encoded.length);
    s.bytes.set(encoded, at);
  },
  bytes(this: Internal, value: Uint8Array): void {
    assertUint8Array(value);
    const s = this[key];
    const at = reserve(s, value.length);
    s.bytes.set(value, at);
  },
  string(this: Internal, text: string): void {
    const s = this[key];
    const at = reserve(s, utf8Length(text));
    writeUtf8(s.bytes, at, text);
  },
  cstring(this: Internal, text: string): void {
    if (assertString(text).includes('\0')) {
      throw new RangeError('A cstring cannot contain U+0000.');
    }
    const s = this[key];
    const at = reserve(s, utf8Length(text) + 1);
    s.bytes[writeUtf8(s.bytes, at, text)] = 0;
  },
  toBytes(this: Internal): Uint8Array<ArrayBuffer> {
    const s = this[key];
    return s.bytes.slice(0, s.end);
  },
};

/**
 * Creates an empty `Writer`.
 *
 * @example
 * ```ts
 * import * as Binary from '@portable/binary';
 *
 * const writer = Binary.createWriter();
 * writer.uint16(Binary.utf8Length('hello'));
 * writer.string('hello');
 * writer.toBytes(); // Uint8Array [0, 5, 104, 101, 108, 108, 111]
 * ```
 */
export function createWriter(options: createWriter.Options = {}): Writer {
  const state = {
    bytes: new Uint8Array(256),
    pos: 0,
    end: 0,
    little: assertEndian(options.endian ?? 'big') === 'little',
    view: undefined,
  } satisfies State as State;
  const result = Object.create(writer) as Internal;
  Object.defineProperty(result, key, { value: state });
  return result;
}
