export declare namespace encodeStream {
  type Replacer = (this: unknown, key: string, value: unknown) => unknown

  type Options = {
    /**
     * As in `JSON.stringify`: a function called with each key and resolved value, whose return
     * value is written instead, or a list of the object keys to write.
     */
    replacer?: Replacer | readonly (string | number)[] | undefined
    /** Indentation, as in `JSON.stringify`: a number of spaces (at most 10) or a string. */
    space?: string | number | undefined
  }
}

type Frame = {
  kind: number
  value: object
  keys: readonly string[]
  index: number
  count: number
  indent: string
  next: (() => Promise<{ done?: boolean | undefined; value?: unknown }>) | undefined
  stop: ((reason: unknown) => Promise<unknown>) | undefined
}

const OBJECT = 0
const ARRAY = 1
const ITERATOR = 2

const chunkSize = 16384
const maxQuotedKeys = 1024

/**
 * Writes `value` as JSON text to a `ReadableStream`, resolving async values as it reaches
 * them. The output is the text `JSON.stringify` would produce for the resolved tree, so any
 * JSON parser can read it.
 *
 * - A promise or other thenable is replaced by what it resolves to.
 * - A function is called with no arguments and replaced by its return value, so work such as
 *   a database query starts only when the writer reaches it.
 * - A `ReadableStream` or async iterable is written as a JSON array of its values.
 *
 * Text is written as far as the next unresolved value, then the stream pauses until that value
 * is ready, so a reader receives the start of the document before the slow parts finish.
 * Output is pulled: nothing is read from a nested stream until the reader asks for more.
 * Cancelling the output cancels nested streams and calls `return()` on nested iterators.
 * The output fails with the original error if a promise rejects or a nested stream errors,
 * and with a `TypeError` on a circular structure or a `BigInt`, as `JSON.stringify` does.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream'
 *
 * const body = JsonStream.encodeStream({
 *   user: getUser(id), // a promise
 *   posts: db.posts.cursor(), // an async iterable
 * })
 * return new Response(body.pipeThrough(new TextEncoderStream()), {
 *   headers: { 'content-type': 'application/json' },
 * })
 * ```
 */
export function encodeStream(
  value: unknown,
  options: encodeStream.Options = {},
): ReadableStream<string> {
  const { replacer, space } = options
  const replace = typeof replacer === 'function' ? replacer : undefined
  const allowed = Array.isArray(replacer) ? [...new Set(replacer.map(String))] : undefined
  const gap =
    typeof space === 'number'
      ? ' '.repeat(Math.min(10, Math.max(0, Math.floor(space))))
      : typeof space === 'string'
        ? space.slice(0, 10)
        : ''
  const colon = gap ? ': ' : ':'

  const stack: Frame[] = []
  const quoted = new Map<string, string>()
  const quote = (key: string): string => {
    let json = quoted.get(key)
    if (json === undefined) {
      json = JSON.stringify(key)
      if (quoted.size < maxQuotedKeys) quoted.set(key, json)
    }
    return json
  }
  let out = ''
  let started = false
  let done = false
  let cancelled = false
  let controller!: ReadableStreamDefaultController<string>

  const flush = () => {
    if (out === '' || cancelled) return
    controller.enqueue(out)
    out = ''
  }

  let replaced = false
  const prepare = (
    holder: unknown,
    key: string | number,
    raw: unknown,
    skipReplacer: boolean,
  ): unknown => {
    replaced = false
    if (isAsync(raw)) return raw
    let v = raw
    if (
      v !== null &&
      (typeof v === 'object' || typeof v === 'bigint') &&
      typeof (v as { toJSON?: unknown }).toJSON === 'function'
    )
      v = (v as { toJSON(key: string): unknown }).toJSON(String(key))
    if (replace && !skipReplacer) {
      v = replace.call(holder, String(key), v)
      replaced = true
    }
    return v
  }

  const resolve = async (
    holder: unknown,
    key: string | number,
    pending: unknown,
    alreadyReplaced: boolean,
  ): Promise<unknown> => {
    let v = pending
    let skipReplacer = alreadyReplaced
    while (isAsync(v)) {
      if (typeof v === 'function') v = (v as () => unknown)()
      else {
        flush()
        v = await v
      }
      v = prepare(holder, key, v, skipReplacer)
      skipReplacer ||= replaced
    }
    return v
  }

  const write = (v: unknown, indent: string): void => {
    switch (typeof v) {
      case 'string':
        out += JSON.stringify(v)
        return
      case 'number':
        out += Number.isFinite(v) ? String(v) : 'null'
        return
      case 'boolean':
        out += v ? 'true' : 'false'
        return
      case 'bigint':
        throw new TypeError('Do not know how to serialize a BigInt')
      default:
        if (v === null) {
          out += 'null'
          return
        }
    }
    const object = v as object
    if (object instanceof Number || object instanceof String || object instanceof Boolean) {
      write(object.valueOf(), indent)
      return
    }
    for (const frame of stack)
      if (frame.value === object) throw new TypeError('Converting circular structure to JSON')
    const frame: Frame = {
      kind: OBJECT,
      value: object,
      keys: [],
      index: 0,
      count: 0,
      indent,
      next: undefined,
      stop: undefined,
    }
    if (Array.isArray(object)) {
      frame.kind = ARRAY
      out += '['
    } else if (typeof (object as ReadableStream).getReader === 'function') {
      const reader = (object as ReadableStream<unknown>).getReader()
      frame.kind = ITERATOR
      frame.next = () => reader.read()
      frame.stop = (reason) => reader.cancel(reason)
      out += '['
    } else if (Symbol.asyncIterator in object) {
      const iterator = (object as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      frame.kind = ITERATOR
      frame.next = () => iterator.next()
      frame.stop = async () => iterator.return?.()
      out += '['
    } else {
      frame.keys = allowed ?? Object.keys(object)
      out += '{'
    }
    stack.push(frame)
  }

  const close = (frame: Frame) => {
    stack.pop()
    if (gap && frame.count > 0) out += '\n' + frame.indent
    out += frame.kind === OBJECT ? '}' : ']'
    if (stack.length === 0) done = true
  }

  const element = (frame: Frame, item: unknown): void | Promise<void> => {
    const key = frame.index++
    if (frame.count++ > 0) out += ','
    if (gap) out += '\n' + frame.indent + gap
    const writeElement = (resolved: unknown) => {
      if (isOmitted(resolved)) out += 'null'
      else write(resolved, frame.indent + gap)
    }
    const v = prepare(frame.value, key, item, false)
    if (isAsync(v)) return resolve(frame.value, key, v, replaced).then(writeElement)
    writeElement(v)
  }

  const property = (frame: Frame): void | Promise<void> => {
    const key = frame.keys[frame.index++]!
    const holder = frame.value as Record<string, unknown>
    if (allowed && !Object.hasOwn(holder, key)) return
    const writeProperty = (resolved: unknown) => {
      if (isOmitted(resolved)) return
      if (frame.count++ > 0) out += ','
      if (gap) out += '\n' + frame.indent + gap
      out += quote(key) + colon
      write(resolved, frame.indent + gap)
    }
    const v = prepare(holder, key, holder[key], false)
    if (isAsync(v)) return resolve(holder, key, v, replaced).then(writeProperty)
    writeProperty(v)
  }

  const step = (): void | Promise<void> => {
    if (!started) {
      started = true
      const holder = { '': value }
      const writeRoot = (resolved: unknown) => {
        if (!isOmitted(resolved)) write(resolved, '')
        if (stack.length === 0) done = true
      }
      const v = prepare(holder, '', value, false)
      if (isAsync(v)) return resolve(holder, '', v, replaced).then(writeRoot)
      return writeRoot(v)
    }

    const frame = stack[stack.length - 1]!
    if (frame.kind === OBJECT) {
      if (frame.index >= frame.keys.length) return close(frame)
      return property(frame)
    }
    if (frame.kind === ARRAY) {
      const array = frame.value as readonly unknown[]
      if (frame.index >= array.length) return close(frame)
      return element(frame, array[frame.index])
    }
    flush()
    return frame.next!().then((result) => {
      if (cancelled) return
      if (result.done) return close(frame)
      return element(frame, result.value)
    })
  }

  const stopAll = async (reason: unknown) => {
    const frames = stack.splice(0)
    await Promise.all(
      frames.flatMap((frame) => (frame.stop ? [frame.stop(reason).catch(() => {})] : [])),
    )
  }

  return new ReadableStream<string>({
    start(c) {
      controller = c
    },
    async pull() {
      try {
        while (!done && !cancelled && out.length < chunkSize) {
          const pending = step()
          if (pending) await pending
        }
      } catch (error) {
        await stopAll(error)
        throw error
      }
      if (cancelled) return
      flush()
      if (done) controller.close()
    },
    async cancel(reason) {
      cancelled = true
      await stopAll(reason)
    },
  })
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function isAsync(value: unknown): boolean {
  return typeof value === 'function' || isThenable(value)
}

function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === 'symbol' || typeof value === 'function'
}
