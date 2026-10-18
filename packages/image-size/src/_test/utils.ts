// `?url&inline` turns each fixture into a data URL, which `fetch` reads in Node and in browsers.
// Plain `?inline` only works for extensions Vite knows as assets, and `.pfm` or `.ktx2` aren't.
const files = import.meta.glob<string>('./fixtures/**/*.*', {
  query: '?url&inline',
  import: 'default',
})

/** Fixture paths relative to `fixtures/`, such as `valid/png/sample.png`. */
export const fixtures: readonly string[] = Object.keys(files)
  .map((path) => path.slice('./fixtures/'.length))
  .filter((path) => !path.endsWith('.md'))
  .sort()

export async function fixture(path: string): Promise<Uint8Array> {
  const load = files[`./fixtures/${path}`]
  if (!load) throw new Error(`No fixture ${path}`)
  return new Uint8Array(await (await fetch(await load())).arrayBuffer())
}

export function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

export function randomChunks(bytes: Uint8Array, seed: number): Uint8Array[] {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(random() * 256)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

/** A stream of `bytes` in chunks that records how many bytes were pulled and whether it was cancelled. */
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

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
