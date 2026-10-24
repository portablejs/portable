import type { Input } from './input.js'
import { toUint8Array } from './internal/toUint8Array.js'

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
export function concat(chunks: readonly Input[]): Uint8Array<ArrayBuffer> {
  const views = chunks.map(toUint8Array)
  let length = 0
  for (const view of views) length += view.length
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const view of views) {
    bytes.set(view, offset)
    offset += view.length
  }
  return bytes
}
