/// <reference types="node" />
import { Buffer } from 'node:buffer';
import { isUint8Array } from '@portable/bytes/internal';

/**
 * Returns the bytes as a plain `Uint8Array`. A `Buffer` becomes a `Uint8Array` over the same
 * memory, and bytes over a `SharedArrayBuffer` are copied.
 */
export function toPlain(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer, byteOffset, byteLength } = bytes;
  if (!(buffer instanceof ArrayBuffer)) {
    return new Uint8Array(bytes);
  }
  if (!Buffer.isBuffer(bytes)) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  return new Uint8Array(buffer, byteOffset, byteLength);
}

/**
 * Converts a chunk read from a byte-mode Node stream to a plain `Uint8Array`. A string is
 * encoded back to bytes with `encoding`, the encoding that `setEncoding` gave the stream.
 */
export function toBytes(chunk: unknown, encoding: BufferEncoding | null): Uint8Array<ArrayBuffer> {
  if (typeof chunk === 'string') {
    return toPlain(Buffer.from(chunk, encoding ?? 'utf8'));
  }
  if (isUint8Array(chunk)) {
    return toPlain(chunk);
  }
  throw new TypeError(`Expected a Uint8Array or a string chunk, got ${describe(chunk)}.`);
}

/** Converts a chunk read from an object-mode Node stream: bytes become a plain `Uint8Array`. */
export function toValue(chunk: unknown): unknown {
  return isUint8Array(chunk) ? toPlain(chunk) : chunk;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return typeof value;
  }
  return Object.prototype.toString.call(value).slice(8, -1);
}
