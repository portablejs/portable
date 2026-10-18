const table = new Int32Array(256 * 8)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c
}
for (let n = 0; n < 256; n++) {
  let c = table[n]!
  for (let t = 1; t < 8; t++) {
    c = table[c & 0xff]! ^ (c >>> 8)
    table[t * 256 + n] = c
  }
}

export function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = -1
  let i = start
  for (const last = end - 7; i < last; i += 8) {
    const a =
      crc ^ (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24))
    crc =
      table[1792 + (a & 0xff)]! ^
      table[1536 + ((a >>> 8) & 0xff)]! ^
      table[1280 + ((a >>> 16) & 0xff)]! ^
      table[1024 + (a >>> 24)]! ^
      table[768 + bytes[i + 4]!]! ^
      table[512 + bytes[i + 5]!]! ^
      table[256 + bytes[i + 6]!]! ^
      table[bytes[i + 7]!]!
  }
  for (; i < end; i++) crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  return ~crc >>> 0
}
