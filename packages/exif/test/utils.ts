// `?url&inline` turns each fixture into a data URL, which `fetch` reads in Node and in browsers.
const files = import.meta.glob<string>('./fixtures/*', { query: '?url&inline', import: 'default' })

export async function fixture(name: string): Promise<Uint8Array> {
  const load = files[`./fixtures/${name}`]
  if (!load) throw new Error(`No fixture ${name}`)
  return new Uint8Array(await (await fetch(await load())).arrayBuffer())
}

/** Fixture file names, such as `starfish.jpg`. */
export const fixtures: readonly string[] = Object.keys(files)
  .map((path) => path.slice('./fixtures/'.length))
  .sort()

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

/** Splits `bytes` into chunks of 1 to `max` bytes, sized by a generator seeded with `seed`. */
export function randomChunks(bytes: Uint8Array, seed: number, max = 4096): Uint8Array[] {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const chunks = new Array<Uint8Array>()
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * max)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

/** A stream of `chunks` that records how many bytes were pulled and whether it was cancelled. */
export function tracked(chunks: readonly Uint8Array[]): {
  stream: ReadableStream<Uint8Array>
  read: () => number
  cancelled: () => boolean
} {
  let i = 0
  let read = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[i++]
        if (!chunk) return controller.close()
        read += chunk.length
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { stream, read: () => read, cancelled: () => cancelled }
}

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text)

export function concat(...parts: readonly (Uint8Array | readonly number[])[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

type Entry = { tag: number; type: number; values: readonly number[] | Uint8Array }

const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4]

/**
 * Builds a TIFF structure. IFD0 links to IFD1 and points to the Exif and GPS IFDs when they are
 * given.
 */
export function buildTiff(options: {
  le?: boolean | undefined
  ifd0: readonly Entry[]
  ifd1?: readonly Entry[] | undefined
  exif?: readonly Entry[] | undefined
  gps?: readonly Entry[] | undefined
}): Uint8Array {
  const le = options.le ?? false
  const ifd0 = [...options.ifd0]
  const blocks = new Array<{ entries: Entry[] }>()
  const exifEntry = options.exif && { tag: 0x8769, type: 4, values: [0] }
  const gpsEntry = options.gps && { tag: 0x8825, type: 4, values: [0] }
  if (exifEntry) ifd0.push(exifEntry)
  if (gpsEntry) ifd0.push(gpsEntry)
  blocks.push({ entries: ifd0 })
  if (options.ifd1) blocks.push({ entries: [...options.ifd1] })
  if (options.exif) blocks.push({ entries: [...options.exif] })
  if (options.gps) blocks.push({ entries: [...options.gps] })

  const ifdSize = (entries: readonly Entry[]) => {
    let data = 0
    for (const e of entries) {
      const n = e.values.length * sizes[e.type]!
      if (n > 4) data += n + (n & 1)
    }
    return 2 + entries.length * 12 + 4 + data
  }
  const offsets = new Array<number>()
  let at = 8
  for (const block of blocks) {
    offsets.push(at)
    at += ifdSize(block.entries)
  }
  const ifdIndex = (name: 'exif' | 'gps') => {
    let i = options.ifd1 ? 2 : 1
    if (name === 'gps' && options.exif) i++
    return i
  }
  if (exifEntry) exifEntry.values = [offsets[ifdIndex('exif')]!]
  if (gpsEntry) gpsEntry.values = [offsets[ifdIndex('gps')]!]

  const out = new Uint8Array(at)
  const view = new DataView(out.buffer)
  out.set(le ? [0x49, 0x49] : [0x4d, 0x4d])
  view.setUint16(2, 42, le)
  view.setUint32(4, 8, le)
  blocks.forEach((block, b) => {
    const start = offsets[b]!
    view.setUint16(start, block.entries.length, le)
    let data = start + 2 + block.entries.length * 12 + 4
    block.entries.forEach((e, i) => {
      const entry = start + 2 + i * 12
      view.setUint16(entry, e.tag, le)
      view.setUint16(entry + 2, e.type, le)
      view.setUint32(
        entry + 4,
        e.type === 5 || e.type === 10 ? e.values.length / 2 : e.values.length,
        le,
      )
      const size = sizes[e.type]!
      const n = e.values.length * size
      let valueAt = entry + 8
      if (n > 4) {
        view.setUint32(entry + 8, data, le)
        valueAt = data
        data += n + (n & 1)
      }
      const write = (v: number, p: number) => {
        if (size === 1) view.setUint8(p, v)
        else if (size === 2) view.setUint16(p, v, le)
        else if (e.type === 11) view.setFloat32(p, v, le)
        else if (e.type === 12) view.setFloat64(p, v, le)
        else if (e.type === 9 || e.type === 10) view.setInt32(p, v, le)
        else view.setUint32(p, v, le)
      }
      const step = e.type === 5 || e.type === 10 ? 4 : size
      Array.from(e.values).forEach((v, k) => write(v, valueAt + k * step))
    })
    const next = b === 0 && options.ifd1 ? offsets[1]! : 0
    view.setUint32(start + 2 + block.entries.length * 12, next, le)
  })
  return out
}

export const exifPrefix: Uint8Array = ascii('Exif\0\0')

export function jpeg(tiff: Uint8Array, size = { width: 3, height: 2 }): Uint8Array {
  const app1 = concat(exifPrefix, tiff)
  const sof = [
    8,
    size.height >> 8,
    size.height & 255,
    size.width >> 8,
    size.width & 255,
    1,
    1,
    0x11,
    0,
  ]
  return concat(
    [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255],
    app1,
    [0xff, 0xc0, 0, sof.length + 2],
    sof,
    [0xff, 0xda, 0, 2, 0xff, 0xd9],
  )
}

export const entry = (
  tag: number,
  type: number,
  values: readonly number[] | Uint8Array | string,
): Entry => ({
  tag,
  type,
  values: typeof values === 'string' ? ascii(`${values}\0`) : values,
})
