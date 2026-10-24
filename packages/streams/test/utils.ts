// Not every browser has ReadableStream.from or async iteration of streams yet, so the
// tests build and drain streams by hand.
export function fromChunks<chunk>(chunks: readonly chunk[]): ReadableStream<chunk> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!)
      else controller.close()
    },
  })
}

export async function collect<chunk>(stream: ReadableStream<chunk>): Promise<chunk[]> {
  const reader = stream.getReader()
  const chunks = new Array<chunk>()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

/** A stream whose chunks the test pushes by hand, like a Node `Readable` with an empty `_read`. */
export function pushable<chunk>(): {
  stream: ReadableStream<chunk>
  push: (chunk: chunk) => void
  end: () => void
  error: (reason: unknown) => void
} {
  let controller!: ReadableStreamDefaultController<chunk>
  const stream = new ReadableStream<chunk>({
    start(c) {
      controller = c
    },
  })
  return {
    stream,
    push: (chunk) => controller.enqueue(chunk),
    end: () => controller.close(),
    error: (reason) => controller.error(reason),
  }
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)
export const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

export function chunked(bytes: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer>[] {
  const chunks = new Array<Uint8Array<ArrayBuffer>>()
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}
