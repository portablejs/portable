const files = import.meta.glob<string>('./fixtures/*/*.png', {
  query: '?url&inline',
  import: 'default',
})

/** Fixture bytes by path relative to `fixtures/`, such as `pngsuite/basn0g01.png`. */
export const fixtures: ReadonlyMap<string, Uint8Array> = new Map(
  await Promise.all(
    Object.entries(files).map(
      async ([path, load]) =>
        [
          path.slice('./fixtures/'.length),
          new Uint8Array(await (await fetch(await load())).arrayBuffer()),
        ] as const,
    ),
  ),
)

export function fixture(path: string): Uint8Array {
  const bytes = fixtures.get(path)
  if (!bytes) {
    throw new Error(`No fixture ${path}`)
  }
  return bytes
}

/** The pixel at (x, y) as 0xRRGGBBAA, the form pngjs's tests compare. */
export function pixel(image: { width: number; data: Uint8Array }, x: number, y: number): number {
  const i = (y * image.width + x) * 4
  const { data } = image
  return ((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!) >>> 0
}

export function hex(text: string): Uint8Array {
  return new Uint8Array(text.match(/../g)!.map((byte) => parseInt(byte, 16)))
}

/** Deterministic pseudo-random bytes, so a failing case can be reproduced. */
export function randomBytes(length: number, seed: number): Uint8Array {
  let state = seed
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    bytes[i] = state >>> 16
  }
  return bytes
}

/** Builds a PNG file from an IHDR and an already compressed IDAT payload. */
export function buildPng(
  header: {
    width: number
    height: number
    depth: number
    colorType: number
    interlace?: number | undefined
  },
  compressed: Uint8Array,
): Uint8Array {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, header.width)
  view.setUint32(4, header.height)
  ihdr.set([header.depth, header.colorType, 0, 0, header.interlace ?? 0], 8)
  const parts = [
    hex('89504e470d0a1a0a'),
    encodeChunk('IHDR', ihdr),
    encodeChunk('IDAT', compressed),
    encodeChunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Unfiltered Adam7 scanlines of an 8-bit RGBA image, as the IDAT of an interlaced PNG holds them. */
export function adam7Scanlines(image: {
  width: number
  height: number
  data: Uint8Array
}): Uint8Array {
  const passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ]
  const bytes: number[] = []
  for (const [x0, y0, dx, dy] of passes as [number, number, number, number][]) {
    if (x0 >= image.width || y0 >= image.height) {
      continue
    }
    for (let y = y0; y < image.height; y += dy) {
      bytes.push(0)
      for (let x = x0; x < image.width; x += dx) {
        const i = (y * image.width + x) * 4
        bytes.push(...image.data.subarray(i, i + 4))
      }
    }
  }
  return new Uint8Array(bytes)
}

export function idat(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  for (let offset = 8; offset < png.length;) {
    const length = view.getUint32(offset)
    if (view.getUint32(offset + 4) === 0x49444154) {
      return png.subarray(offset + 8, offset + 8 + length)
    }
    offset += length + 12
  }
  throw new Error('No IDAT')
}

export function encodeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  let crc = -1
  for (const byte of out.subarray(4, 8 + data.length)) {
    crc ^= byte
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }
  view.setUint32(8 + data.length, ~crc >>> 0)
  return out
}
