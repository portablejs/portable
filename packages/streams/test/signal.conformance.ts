import { describe, expect, test } from 'vite-plus/test'
import * as Streams from '@portable/streams'

function endless<chunk>(chunk: chunk) {
  const source = { cancelled: undefined as unknown }
  const stream = new ReadableStream<chunk>({
    pull: (controller) => controller.enqueue(chunk),
    cancel: (reason) => {
      source.cancelled = reason
    },
  })
  return { stream, source }
}

function stalled<chunk>(chunk: chunk) {
  const source = { cancelled: undefined as unknown, pulls: 0 }
  const stream = new ReadableStream<chunk>(
    {
      pull(controller) {
        source.pulls++
        if (source.pulls === 1) controller.enqueue(chunk)
        else return new Promise<void>(() => {})
        return undefined
      },
      cancel(reason) {
        source.cancelled = reason
      },
    },
    { highWaterMark: 0 },
  )
  return { stream, source }
}

async function abortMidway<value>(
  chunk: value,
  transform: (signal: AbortSignal) => ReadableWritablePair<unknown, value>,
): Promise<boolean> {
  const controller = new AbortController()
  const { stream, source } = endless(chunk)
  const reader = stream.pipeThrough(transform(controller.signal)).getReader()
  await reader.read()
  const reason = new Error('stop')
  controller.abort(reason)
  await expect(reader.read()).rejects.toBe(reason)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return source.cancelled === reason
}

const bytes = new Uint8Array([1, 2, 3])

describe('collectors', () => {
  const collectors = {
    toBytes: (stream: ReadableStream<Uint8Array>, signal: AbortSignal) =>
      Streams.toBytes(stream, { signal }),
    toText: (stream: ReadableStream<Uint8Array>, signal: AbortSignal) =>
      Streams.toText(stream, { signal }),
    toJson: (stream: ReadableStream<Uint8Array>, signal: AbortSignal) =>
      Streams.toJson(stream, { signal }),
    toArray: (stream: ReadableStream<Uint8Array>, signal: AbortSignal) =>
      Streams.toArray(stream, { signal }),
  }

  for (const [name, collect] of Object.entries(collectors)) {
    test(`aborting ${name} mid-way rejects with the reason and cancels the source`, async () => {
      const { stream, source } = stalled(bytes)
      const controller = new AbortController()
      const reason = new Error('stop')
      const collecting = collect(stream, controller.signal)
      await new Promise((resolve) => setTimeout(resolve, 0))
      controller.abort(reason)
      await expect(collecting).rejects.toBe(reason)
      expect(source.cancelled).toBe(reason)
    })

    test(`an aborted signal rejects ${name} at once and cancels the source`, async () => {
      const { stream, source } = stalled(bytes)
      const reason = new Error('stop')
      await expect(collect(stream, AbortSignal.abort(reason))).rejects.toBe(reason)
      expect(source.cancelled).toBe(reason)
    })
  }

  test('aborting while an async iterable is pending rejects with the reason', async () => {
    async function* slow() {
      yield bytes
      await new Promise(() => {})
    }
    const controller = new AbortController()
    const reason = new Error('stop')
    const collecting = Streams.toBytes(slow(), { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort(reason)
    await expect(collecting).rejects.toBe(reason)
  })

  test('aborting between chunks of an async iterable runs its finally block', async () => {
    let finished = false
    const controller = new AbortController()
    async function* numbers() {
      try {
        yield 1
        controller.abort(new Error('stop'))
        yield 2
        yield 3
      } finally {
        finished = true
      }
    }
    await expect(Streams.toArray(numbers(), { signal: controller.signal })).rejects.toThrow('stop')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(finished).toBe(true)
  })

  test('an aborted signal rejects an iterable source at once', async () => {
    const reason = new Error('stop')
    await expect(Streams.toArray([1, 2], { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    )
  })

  test('a signal that never aborts reads to the end', async () => {
    const signal = new AbortController().signal
    expect(await Streams.toArray([1, 2, 3], { signal })).toEqual([1, 2, 3])
    expect(await Streams.toText(['a', 'b'], { signal })).toBe('ab')
  })
})

describe('transforms', () => {
  const transforms = {
    map: (signal: AbortSignal) => Streams.map((chunk: Uint8Array) => chunk, { signal }),
    filter: (signal: AbortSignal) => Streams.filter(() => true, { signal }),
    tap: (signal: AbortSignal) => Streams.tap(() => {}, { signal }),
    batch: (signal: AbortSignal) => Streams.batch<Uint8Array>(1, { signal }),
    limitBytes: (signal: AbortSignal) => Streams.limitBytes<Uint8Array>(Infinity, { signal }),
    transform: (signal: AbortSignal) =>
      Streams.transform(
        async function* (source: AsyncIterable<Uint8Array>) {
          yield* source
        },
        { signal },
      ),
  }

  for (const [name, create] of Object.entries(transforms)) {
    test(`aborting ${name} mid-way errors it and cancels its source`, async () => {
      expect(await abortMidway(bytes, create)).toBe(true)
    })

    test(`an aborted signal errors ${name} at once`, async () => {
      const reason = new Error('stop')
      const { readable } = create(AbortSignal.abort(reason))
      await expect(readable.getReader().read()).rejects.toBe(reason)
    })
  }

  test('aborting transform runs the generator finally block', async () => {
    let finished = false
    const controller = new AbortController()
    const pair = Streams.transform(
      async function* (source: AsyncIterable<Uint8Array>) {
        try {
          yield* source
        } finally {
          finished = true
        }
      },
      { signal: controller.signal },
    )
    const reader = endless(bytes).stream.pipeThrough(pair).getReader()
    await reader.read()
    controller.abort(new Error('stop'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(finished).toBe(true)
  })
})
