/** A message to write to an event stream. Every field is optional, and an `Sse.Event` fits. */
export type Message = {
  /** Event type. Must not contain CR or LF. */
  event?: string | undefined
  /** Event data. Line breaks become separate `data` lines. Without `data`, no event is dispatched. */
  data?: string | undefined
  /** Event ID, which the client sends back as `Last-Event-ID`. Must not contain CR, LF or NUL. */
  id?: string | undefined
  /** Reconnection time for the client, in milliseconds. Must be a non-negative integer. */
  retry?: number | undefined
  /** A comment, which clients ignore. Servers send one to keep an idle connection open. */
  comment?: string | undefined
}

const lineBreak = /\r\n|\r|\n/

/**
 * Writes one message in `text/event-stream` format, ending with the blank line that dispatches it.
 * A message with only a `comment` has no blank line.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * Sse.encode({ event: 'update', data: 'line 1\nline 2', id: '7' })
 * // 'event: update\ndata: line 1\ndata: line 2\nid: 7\n\n'
 * ```
 */
export function encode(message: Message): string {
  const { comment, event, data, id, retry } = message
  let text = ''
  if (comment !== undefined)
    for (const line of comment.split(lineBreak)) text += line === '' ? ':\n' : `: ${line}\n`
  if (event === undefined && data === undefined && id === undefined && retry === undefined)
    return text
  if (event !== undefined) {
    if (/[\r\n]/.test(event)) throw new InvalidInputError('`event` must not contain CR or LF.')
    text += `event: ${event}\n`
  }
  if (data !== undefined) {
    if (data.indexOf('\n') === -1 && data.indexOf('\r') === -1) text += `data: ${data}\n`
    else for (const line of data.split(lineBreak)) text += `data: ${line}\n`
  }
  if (id !== undefined) {
    if (/[\r\n\0]/.test(id)) throw new InvalidInputError('`id` must not contain CR, LF or NUL.')
    text += `id: ${id}\n`
  }
  if (retry !== undefined) {
    if (!Number.isSafeInteger(retry) || retry < 0)
      throw new InvalidInputError('`retry` must be a non-negative integer.')
    text += `retry: ${retry}\n`
  }
  return text + '\n'
}

/**
 * A `TransformStream` that writes messages as `text/event-stream` bytes, for the body of a
 * `Response`.
 *
 * @example
 * ```ts
 * import * as Sse from '@portable/sse'
 *
 * const body = messages.pipeThrough(new Sse.EncoderStream())
 * return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
 * ```
 */
export class EncoderStream extends TransformStream<Message, Uint8Array<ArrayBuffer>> {
  constructor() {
    const encoder = new TextEncoder()
    super({
      transform(message, controller) {
        const text = encode(message)
        if (text !== '') controller.enqueue(encoder.encode(text))
      },
    })
  }
}

/** Thrown by `encode` and `EncoderStream` for a field that can't be written. */
export class InvalidInputError extends Error {
  override name = 'Sse.InvalidInputError'
}
