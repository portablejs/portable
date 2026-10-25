import type { Endian } from './createReader.js';
import { position, readVarint, varintLength, writeVarint } from './varint.js';

/**
 * How a frame stores its length before its bytes: an unsigned integer of 1, 2 or 4 bytes, or an
 * unsigned varint. The length counts only the frame's bytes, not the prefix.
 */
export type Prefix = 'uint8' | 'uint16' | 'uint32' | 'varint';

export function assertPrefix(prefix: unknown): Prefix {
  if (prefix === 'uint8' || prefix === 'uint16' || prefix === 'uint32' || prefix === 'varint') {
    return prefix;
  }
  throw new RangeError(
    `\`prefix\` must be 'uint8', 'uint16', 'uint32' or 'varint', got ${String(prefix)}.`,
  );
}

/** The largest frame length each prefix can store. */
export const maxFrameBytes: Readonly<Record<Prefix, number>> = {
  uint8: 0xff,
  uint16: 0xffff,
  uint32: 0xffffffff,
  varint: Number.MAX_SAFE_INTEGER,
};

const fixedBytes = { uint8: 1, uint16: 2, uint32: 4 } as const;

/**
 * Reads a length prefix from `bytes[start..end)`. Returns `undefined` if the prefix is incomplete,
 * and sets `position.next` past the prefix otherwise.
 */
export function readPrefix(
  bytes: Uint8Array,
  start: number,
  end: number,
  prefix: Prefix,
  little: boolean,
): number | undefined {
  if (prefix === 'varint') {
    return readVarint(bytes, start, end, 'unsigned');
  }
  const n = fixedBytes[prefix];
  if (end - start < n) {
    return undefined;
  }
  let value = 0;
  for (let i = 0; i < n; i++) {
    value = value * 256 + bytes[little ? start + n - 1 - i : start + i]!;
  }
  position.next = start + n;
  return value;
}

export function prefixLength(length: number, prefix: Prefix): number {
  return prefix === 'varint' ? varintLength(length, 'unsigned') : fixedBytes[prefix];
}

/** Writes `length` at `bytes[0]` and returns the position after it. */
export function writePrefix(
  bytes: Uint8Array,
  length: number,
  prefix: Prefix,
  endian: Endian,
): number {
  if (prefix === 'varint') {
    return writeVarint(bytes, 0, length, 'unsigned');
  }
  const n = fixedBytes[prefix];
  for (let i = 0; i < n; i++) {
    const at = endian === 'little' ? i : n - 1 - i;
    bytes[at] = length % 256;
    length = Math.floor(length / 256);
  }
  return n;
}
