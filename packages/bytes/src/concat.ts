import { checkUint8Array } from './internal/uint8Array.js'

/**
 * Joins byte arrays into one new array. The result never shares memory with the input, even for a
 * single chunk.
 *
 * @example
 * ```ts
 * import * as Bytes from '@portable/bytes'
 *
 * Bytes.concat([new Uint8Array([1, 2]), new Uint8Array([3])]) // Uint8Array [1, 2, 3]
 * ```
 */
export function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0
  for (const chunk of chunks) length += checkUint8Array(chunk).length
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
