import { assertUint8Array, crc32 as crc } from '@portable/bytes/internal'

const encoder = new TextEncoder()

/**
 * Computes the CRC-32 checksum used by gzip, zip and PNG. Strings are encoded as UTF-8. Pass the
 * previous result as `previous` to continue a checksum over data that arrives in pieces.
 *
 * @example
 * ```ts
 * import * as Compress from '@portable/compress'
 *
 * Compress.crc32('hello') // 0x3610a686
 * Compress.crc32(' world', Compress.crc32('hello')) === Compress.crc32('hello world') // true
 * ```
 */
export function crc32(data: Uint8Array | string, previous: number = 0): number {
  const bytes = typeof data === 'string' ? encoder.encode(data) : assertUint8Array(data)
  return crc(bytes, previous)
}
