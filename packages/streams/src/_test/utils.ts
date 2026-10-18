// Not every browser has ReadableStream.from or async iteration of streams yet, so the
// tests build and drain streams by hand.
export function fromChunks<T>(chunks: readonly T[]): ReadableStream<T> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!)
      else controller.close()
    },
  })
}

export async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const chunks: T[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

/** A stream whose chunks the test pushes by hand, like a Node `Readable` with an empty `_read`. */
export function pushable<T>(): {
  stream: ReadableStream<T>
  push: (chunk: T) => void
  end: () => void
  error: (reason: unknown) => void
} {
  let controller!: ReadableStreamDefaultController<T>
  const stream = new ReadableStream<T>({
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
  const chunks: Uint8Array<ArrayBuffer>[] = []
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}
