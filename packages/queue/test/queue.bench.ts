import pLimit from 'p-limit'
import pMap from 'p-map'
import PQueue from 'p-queue'
import { expect, test } from 'vite-plus/test'
import * as Queue from '@portable/queue'

const count = 1000
const items = Array.from({ length: count }, (_, i) => i)
const task = async (i: number) => i

test(`adds and runs ${count} tasks with concurrency 10 within 25% of p-limit and p-queue`, async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/queue limit', async () => {
      const limit = Queue.limit(10)
      await Promise.all(items.map((i) => limit(() => task(i))))
    }),
    bench('@portable/queue create', async () => {
      const queue = Queue.create({ concurrency: 10 })
      await Promise.all(items.map((i) => queue.add(() => task(i))))
    }),
    bench('p-limit', async () => {
      const limit = pLimit(10)
      await Promise.all(items.map((i) => limit(() => task(i))))
    }),
    bench('p-queue', async () => {
      const queue = new PQueue({ concurrency: 10 })
      await Promise.all(items.map((i) => queue.add(() => task(i))))
    }),
    bench('Promise.all without a limit', async () => {
      await Promise.all(items.map((i) => task(i)))
    }),
  )
  expect(result.get('p-limit')).not.toBeFasterThan(result.get('@portable/queue limit'), {
    delta: 0.25,
  })
  expect(result.get('p-queue')).not.toBeFasterThan(result.get('@portable/queue create'), {
    delta: 0.25,
  })
})

test(`runs ${count} tasks with priorities and a signal within 25% of p-queue`, async ({
  bench,
}) => {
  const { signal } = new AbortController()
  const result = await bench.compare(
    bench('@portable/queue', async () => {
      const queue = Queue.create({ concurrency: 10 })
      await Promise.all(items.map((i) => queue.add(() => task(i), { priority: i % 5, signal })))
    }),
    bench('p-queue', async () => {
      const queue = new PQueue({ concurrency: 10 })
      await Promise.all(items.map((i) => queue.add(() => task(i), { priority: i % 5, signal })))
    }),
  )
  expect(result.get('p-queue')).not.toBeFasterThan(result.get('@portable/queue'), {
    delta: 0.25,
  })
})

test(`maps ${count} items with concurrency 10 within 25% of p-map`, async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/queue', async () => {
      await Queue.map(items, task, { concurrency: 10 })
    }),
    bench('p-map', async () => {
      await pMap(items, task, { concurrency: 10 })
    }),
    bench('p-limit map', async () => {
      await pLimit(10).map(items, task)
    }),
  )
  expect(result.get('p-map')).not.toBeFasterThan(result.get('@portable/queue'), { delta: 0.25 })
})
