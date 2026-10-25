import { InvalidInputError } from './errors.js';

/**
 * How a varint stores its sign. `'unsigned'` is plain LEB128, as in protobuf's `uint64` and
 * Minecraft's VarInt. `'zigzag'` maps 0, -1, 1, -2 to 0, 1, 2, 3, as protobuf's `sint64` does.
 * `'signed'` is signed LEB128 (SLEB128), as in WebAssembly and DWARF.
 */
export type VarintEncoding = 'unsigned' | 'zigzag' | 'signed';

/** The longest varint this package reads: 10 bytes hold 64 bits. */
const maxVarintBytes = 10;

/** Where the last call to `readVarint` or `readBigVarint` stopped. */
export const position = { next: 0 };

export function assertEncoding(encoding: unknown): VarintEncoding {
  if (encoding === 'unsigned' || encoding === 'zigzag' || encoding === 'signed') {
    return encoding;
  }
  throw new RangeError(
    `\`encoding\` must be 'unsigned', 'zigzag' or 'signed', got ${String(encoding)}.`,
  );
}

/**
 * Reads a varint from `bytes[start..end)` as a number. Returns `undefined` if the bytes end before
 * the varint does, and sets `position.next` past the varint otherwise.
 */
export function readVarint(
  bytes: Uint8Array,
  start: number,
  end: number,
  encoding: VarintEncoding,
): number | undefined {
  let value = 0;
  let scale = 1;
  let i = start;
  // Up to 8 bytes hold 56 bits, and every sum below stays exact until the last byte is added. A
  // longer varint is read as a bigint, because its partial sums can pass 2 ** 53.
  for (;;) {
    if (i >= end) {
      return undefined;
    }
    const byte = bytes[i++]!;
    if (byte < 0x80) {
      // In SLEB128, bit 6 of the last byte is the sign, so that byte counts as a negative digit.
      value += ((byte & 0x40 && encoding === 'signed' ? -0x80 : 0) + (byte & 0x7f)) * scale;
      break;
    }
    if (i - start === 8) {
      const big = readBigVarint(bytes, start, end, encoding);
      if (big === undefined) {
        return undefined;
      }
      if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < -BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new InvalidInputError('Varint is outside the safe integer range; use bigVarint.', {
          offset: start,
        });
      }
      return Number(big);
    }
    value += (byte & 0x7f) * scale;
    scale *= 128;
  }
  position.next = i;
  if (value > Number.MAX_SAFE_INTEGER || value < -Number.MAX_SAFE_INTEGER) {
    throw new InvalidInputError('Varint is outside the safe integer range; use bigVarint.', {
      offset: start,
    });
  }
  if (encoding === 'zigzag') {
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
  }
  return value;
}

/** Reads a varint as a `bigint`, like `readVarint`. Unsigned values must fit in 64 bits. */
export function readBigVarint(
  bytes: Uint8Array,
  start: number,
  end: number,
  encoding: VarintEncoding,
): bigint | undefined {
  let value = 0n;
  let shift = 0n;
  let i = start;
  let byte: number;
  for (;;) {
    if (i >= end) {
      return undefined;
    }
    byte = bytes[i++]!;
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if (byte < 0x80) {
      break;
    }
    if (i - start === maxVarintBytes) {
      throw new InvalidInputError(`Varint is longer than ${maxVarintBytes} bytes.`, {
        offset: start,
      });
    }
  }
  position.next = i;
  if (encoding === 'signed') {
    if (byte & 0x40) {
      value -= 1n << shift;
    }
    if (value !== BigInt.asIntN(64, value)) {
      throw new InvalidInputError('Varint is outside the 64-bit signed range.', { offset: start });
    }
    return value;
  }
  if (value !== BigInt.asUintN(64, value)) {
    throw new InvalidInputError('Varint is outside the 64-bit unsigned range.', { offset: start });
  }
  return encoding === 'zigzag' ? (value >> 1n) ^ -(value & 1n) : value;
}

/** Number of bytes `writeVarint` writes for `value`, which the caller has already checked. */
export function varintLength(value: number, encoding: VarintEncoding): number {
  if (encoding === 'zigzag') {
    value = value < 0 ? -2 * value - 1 : 2 * value;
  } else if (encoding === 'signed') {
    let length = 1;
    for (;;) {
      const byte = ((value % 128) + 128) % 128;
      value = Math.floor(value / 128);
      if ((value === 0 && !(byte & 0x40)) || (value === -1 && byte & 0x40)) {
        return length;
      }
      length++;
    }
  }
  let length = 1;
  while (value >= 128) {
    value = Math.floor(value / 128);
    length++;
  }
  return length;
}

/**
 * The values each encoding writes from a number. Zigzag doubles the magnitude, so its range is
 * half as wide, and every value it writes reads back as a safe integer.
 */
const varintRange = {
  unsigned: [0, Number.MAX_SAFE_INTEGER],
  zigzag: [-(2 ** 52), 2 ** 52 - 1],
  signed: [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
} satisfies Record<VarintEncoding, readonly [number, number]>;

export function assertVarintValue(value: unknown, encoding: VarintEncoding): number {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected a number, got ${typeof value}.`);
  }
  const [min, max] = varintRange[encoding];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `A ${encoding} varint must be an integer from ${min} to ${max}, got ${value}.`,
    );
  }
  return value;
}

/** Writes `value` at `bytes[at]` and returns the position after it. `bytes` must have room. */
export function writeVarint(
  bytes: Uint8Array,
  at: number,
  value: number,
  encoding: VarintEncoding,
): number {
  if (encoding === 'signed') {
    for (;;) {
      const byte = ((value % 128) + 128) % 128;
      value = Math.floor(value / 128);
      if ((value === 0 && !(byte & 0x40)) || (value === -1 && byte & 0x40)) {
        bytes[at++] = byte;
        return at;
      }
      bytes[at++] = byte | 0x80;
    }
  }
  if (encoding === 'zigzag') {
    value = value < 0 ? -2 * value - 1 : 2 * value;
  }
  while (value >= 128) {
    bytes[at++] = (value % 128) | 0x80;
    value = Math.floor(value / 128);
  }
  bytes[at++] = value;
  return at;
}

export function assertBigVarintValue(value: unknown, encoding: VarintEncoding): bigint {
  if (typeof value !== 'bigint') {
    throw new TypeError(`Expected a bigint, got ${typeof value}.`);
  }
  const fits =
    encoding === 'unsigned'
      ? value === BigInt.asUintN(64, value)
      : value === BigInt.asIntN(64, value);
  if (!fits) {
    throw new RangeError(
      `A ${encoding} big varint must fit in 64 ${encoding === 'unsigned' ? 'unsigned' : 'signed'} bits, got ${value}.`,
    );
  }
  return value;
}

/** Encodes a `bigint` varint, which `assertBigVarintValue` has checked, into a new array. */
export function encodeBigVarint(value: bigint, encoding: VarintEncoding): number[] {
  const out: number[] = [];
  if (encoding === 'signed') {
    for (;;) {
      const byte = Number(value & 0x7fn);
      value >>= 7n;
      if ((value === 0n && !(byte & 0x40)) || (value === -1n && byte & 0x40)) {
        out.push(byte);
        return out;
      }
      out.push(byte | 0x80);
    }
  }
  if (encoding === 'zigzag') {
    value = BigInt.asUintN(64, (value << 1n) ^ (value >> 63n));
  }
  while (value >= 0x80n) {
    out.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  out.push(Number(value));
  return out;
}
