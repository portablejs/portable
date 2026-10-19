import { concat, toBufferSource } from './bytes.js'
import type { Format } from './codec.js'
import { MaxBytesError, classify } from './errors.js'

const maxQueued = 64 * 1024

export declare namespace DecoderStream {
  type Options = {
    /** @default 'gzip' */
    format?: Format | undefined
    /** Fail with `MaxBytesError` and cancel the input once the output grows past this many bytes. @default Infinity */
    maxBytes?: number | undefined
    /**
     * Errors the stream with `signal.reason` when the signal aborts, which makes `pipeThrough`
     * cancel the source.
     */
    signal?: AbortSignal | undefined
  }
}

/**
 * A `TransformStream` that decompresses with `DecompressionStream`, adding a `maxBytes` limit and
 * the package's error classes. Input chunks that arrive while the decompressor is busy are joined
 * into one write, so small network chunks don't each pay the decompressor's per-chunk cost.
 *
 * @example
 * ```ts
 * import * as Compress from '@portable/compress'
 *
 * const response = await fetch('https://example.com/export.ndjson.gz')
 * const body = response.body!.pipeThrough(new Compress.DecoderStream({ maxBytes: 1_000_000_000 }))
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  override readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>
  override readonly writable: WritableStream<Uint8Array>

  constructor(options: DecoderStream.Options = {}) {
    super()
    const { format = 'gzip', maxBytes = Infinity, signal } = options
    const native = new DecompressionStream(format)
    const writer = native.writable.getWriter()
    const reader = native.readable.getReader()
    let failure: { error: unknown } | undefined
    let closing = false
    let queue: Uint8Array[] = []
    let queued = 0
    let writing: Promise<void> | undefined
    let length = 0

    let writable: WritableStreamDefaultController | undefined
    let readable: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined

    const onAbort = () => {
      const error = fail(signal!.reason)
      readable?.error(error)
      reader.cancel(error).catch(() => {})
      writer.abort(error).catch(() => {})
    }

    const fail = (error: unknown): unknown => {
      if (failure) return failure.error
      failure = { error }
      signal?.removeEventListener('abort', onAbort)
      writable?.error(error)
      return error
    }
    const throwIfFailed = () => {
      if (failure) throw failure.error
    }

    const writeQueue = async () => {
      try {
        while (queue.length > 0) {
          const chunk = queue.length === 1 ? toBufferSource(queue[0]!) : concat(queue, queued)
          queue = []
          queued = 0
          await writer.write(chunk)
        }
      } catch (error) {
        fail(classify(error, closing))
      }
      writing = undefined
    }

    this.writable = new WritableStream<Uint8Array>({
      start(controller) {
        writable = controller
      },
      async write(chunk) {
        throwIfFailed()
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array chunk.')
        queue.push(chunk)
        queued += chunk.byteLength
        writing ??= writeQueue()
        if (queued >= maxQueued) await writing
        throwIfFailed()
      },
      async close() {
        await writing
        throwIfFailed()
        closing = true
        await writer.close().catch((error: unknown) => {
          throw fail(classify(error, true))
        })
      },
      async abort(reason) {
        fail(reason)
        await writer.abort(reason).catch(() => {})
      },
    })

    this.readable = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        start(controller) {
          readable = controller
        },
        async pull(controller) {
          let result: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>
          try {
            result = await reader.read()
          } catch (error) {
            throw fail(classify(error, closing))
          }
          if (result.done) {
            signal?.removeEventListener('abort', onAbort)
            return controller.close()
          }
          length += result.value.byteLength
          if (length > maxBytes) {
            const error = fail(new MaxBytesError(maxBytes))
            await reader.cancel(error).catch(() => {})
            throw error
          }
          controller.enqueue(result.value)
        },
        async cancel(reason) {
          fail(reason)
          await reader.cancel(reason).catch(() => {})
        },
      },
      { highWaterMark: 0 },
    )

    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  }
}
