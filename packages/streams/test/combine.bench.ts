import type { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import merge2 from 'merge2'
import mergeStream from 'merge-stream'
import through2 from 'through2'
import { expect, test } from 'vite-plus/test'
import * as Streams from '@portable/streams'
import { collect, fromChunks } from './utils.js'

const values = Array.from({ length: 30_000 }, (_, i) => ({ id: i, name: `row ${i}` }))
const thirds = [values.slice(0, 10_000), values.slice(10_000, 20_000), values.slice(20_000)]

function drain(stream: EventEmitter): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('data', () => {})
    stream.on('end', resolve)
    stream.on('error', reject)
  })
}

function handMerge<chunk>(sources: readonly ReadableStream<chunk>[]): ReadableStream<chunk> {
  const { readable, writable } = new TransformStream<chunk, chunk>()
  const writer = writable.getWriter()
  void Promise.all(
    sources.map(async (source) => {
      const reader = source.getReader()
      for (let r = await reader.read(); !r.done; r = await reader.read())
        await writer.write(r.value)
    }),
  ).then(() => writer.close())
  return readable
}

// Node's web streams cost about 1 µs per chunk, against 0.2 µs for a Node object stream, so merge2,
// merge-stream and through2 are about 3x faster in Node and are measured for reference. The 25% limit
// applies to the same work done with platform streams alone.
test('merges 3 streams of 10,000 objects within 25% of a hand-written merge', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await collect(Streams.merge(thirds.map((third) => fromChunks(third))))
    }),
    bench('merge2', async () => {
      await drain(
        merge2(
          thirds.map((third) => Readable.from(third)),
          { end: true },
        ),
      )
    }),
    bench('merge-stream', async () => {
      await drain(mergeStream(...thirds.map((third) => Readable.from(third))))
    }),
    bench('hand-written merge', async () => {
      await collect(handMerge(thirds.map((third) => fromChunks(third))))
    }),
  )
  expect(result.get('hand-written merge')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})

test('maps 30,000 objects within 25% of a TransformStream', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await collect(fromChunks(values).pipeThrough(Streams.map((value) => value.id)))
    }),
    bench('through2', async () => {
      await drain(
        Readable.from(values).pipe(
          through2.obj(
            (
              value: { id: number },
              _encoding: string,
              callback: (error: null, id: number) => void,
            ) => callback(null, value.id),
          ),
        ),
      )
    }),
    bench('TransformStream', async () => {
      await collect(
        fromChunks(values).pipeThrough(
          new TransformStream<{ id: number }, number>({
            transform: (value, controller) => controller.enqueue(value.id),
          }),
        ),
      )
    }),
  )
  expect(result.get('TransformStream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})

test('abortable adds less than 25% to a TransformStream of 30,000 objects', async ({ bench }) => {
  const transformer = (): Transformer<{ id: number }, number> => ({
    transform: (value, controller) => controller.enqueue(value.id),
  })
  const signal = new AbortController().signal
  const result = await bench.compare(
    bench('@portable/streams', async () => {
      await collect(
        fromChunks(values).pipeThrough(
          new TransformStream(Streams.abortable(transformer(), { signal })),
        ),
      )
    }),
    bench('TransformStream', async () => {
      await collect(fromChunks(values).pipeThrough(new TransformStream(transformer())))
    }),
  )
  expect(result.get('TransformStream')).not.toBeFasterThan(result.get('@portable/streams'), {
    delta: 0.25,
  })
})
