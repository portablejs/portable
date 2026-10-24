import { expect, test } from 'vite-plus/test'
import * as Compress from '@portable/compress'
import { encode, randomBytes } from './utils.js'

function bitwise(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }
  return ~crc >>> 0
}

test('check values', () => {
  expect(Compress.crc32(new Uint8Array(0))).toBe(0)
  expect(Compress.crc32('123456789')).toBe(0xcbf43926)
  expect(Compress.crc32('hello')).toBe(0x3610a686)
  expect(Compress.crc32('The quick brown fox jumps over the lazy dog')).toBe(0x414fa339)
})

test('strings are hashed as UTF-8', () => {
  expect(Compress.crc32('héllo 🎵')).toBe(Compress.crc32(encode('héllo 🎵')))
})

test('every length up to 64 matches the bitwise definition', () => {
  const bytes = randomBytes(64, 1)
  for (let length = 0; length <= 64; length++) {
    const data = bytes.subarray(0, length)
    expect(Compress.crc32(data)).toBe(bitwise(data))
  }
})

test('previous continues a checksum', () => {
  const data = randomBytes(10_000, 2)
  const whole = Compress.crc32(data)
  for (const split of [0, 1, 7, 8, 9, 4999, 10_000]) {
    expect(Compress.crc32(data.subarray(split), Compress.crc32(data.subarray(0, split)))).toBe(
      whole,
    )
  }
})

test('matches the CRC-32 in a gzip trailer', async () => {
  const data = randomBytes(100_000, 3)
  const gzip = await Compress.encode(data)
  const trailer = new DataView(gzip.buffer, gzip.byteOffset + gzip.length - 8, 4)
  expect(Compress.crc32(data)).toBe(trailer.getUint32(0, true))
})

test('reads a view with a byte offset', () => {
  const data = randomBytes(100, 4)
  expect(Compress.crc32(data.subarray(3, 50))).toBe(bitwise(data.slice(3, 50)))
})
