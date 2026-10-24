import { toUint8Array } from '@portable/bytes/internal'
import * as Bytes from '@portable/bytes'
import { MaxHeaderBytesError } from './errors.js'

export declare namespace splitHeaders {
  type Options = {
    /**
     * Longest header block, counted with the empty line that ends it. Set it, for example to
     * 1 MiB, when the input is untrusted.
     * @default Infinity
     */
    maxHeaderBytes?: number | undefined
    /**
     * Rejects with `signal.reason` while the header block is read, and later errors `body` with
     * it. Either way the input is cancelled.
     */
    signal?: AbortSignal | undefined
  }
  type ReturnType = {
    /** The header block as received, with the empty line that ends it. */
    headers: Uint8Array<ArrayBuffer>
    /** Every byte after the header block, unchanged. */
    body: ReadableStream<Uint8Array>
  }
}

/**
 * Reads a message's header block from a stream and returns it with a stream of the rest. Nothing
 * is decoded and the body isn't searched for parts, so `splitHeaders` is the cheap way to get the
 * bytes that DKIM signs. If the input ends before an empty line, all of it is the header block.
 *
 * @example
 * ```ts
 * import * as MimeStream from '@portable/mime-stream'
 *
 * const { headers, body } = await MimeStream.splitHeaders(response.body!)
 * const bodyHash = await crypto.subtle.digest('SHA-256', await new Response(body).arrayBuffer())
 * ```
 */
export async function splitHeaders(
  stream: ReadableStream<Bytes.Input>,
  options: splitHeaders.Options = {},
): Promise<splitHeaders.ReturnType> {
  const { maxHeaderBytes = Infinity, signal } = options
  signal?.throwIfAborted()
  const reader = stream.getReader()
  let output: ReadableStreamDefaultController<Uint8Array> | undefined
  const onAbort = () => {
    output?.error(signal!.reason)
    reader.cancel(signal!.reason).catch(() => {})
  }
  const stop = () => signal?.removeEventListener('abort', onAbort)
  signal?.addEventListener('abort', onAbort, { once: true })
  const pieces: Uint8Array[] = []
  let length = 0
  let lineLength = 0
  let lineStartsWithCr = false
  let rest: Uint8Array | undefined

  try {
    read: for (;;) {
      const { done, value: chunk } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      const value = toUint8Array(chunk)
      for (let i = 0; i < value.length; i++) {
        const byte = value[i]
        if (byte === 0x0a) {
          if (lineLength === 0 || (lineLength === 1 && lineStartsWithCr)) {
            pieces.push(value.subarray(0, i + 1))
            length += i + 1
            rest = value.subarray(i + 1)
            break read
          }
          lineLength = 0
        } else {
          if (lineLength === 0) lineStartsWithCr = byte === 0x0d
          lineLength++
        }
        if (length + i + 1 > maxHeaderBytes) throw new MaxHeaderBytesError({ maxHeaderBytes })
      }
      pieces.push(value)
      length += value.length
    }
    if (length > maxHeaderBytes) throw new MaxHeaderBytesError({ maxHeaderBytes })
  } catch (error) {
    stop()
    await reader.cancel(error).catch(() => {})
    throw error
  }

  const headers = Bytes.concat(pieces)

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller
    },
    async pull(controller) {
      if (rest) {
        const chunk = rest
        rest = undefined
        if (chunk.length > 0) {
          controller.enqueue(chunk)
          return
        }
      }
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) {
        stop()
        controller.close()
      } else controller.enqueue(toUint8Array(value))
    },
    cancel(reason) {
      stop()
      return reader.cancel(reason)
    },
  })
  return { headers, body }
}
