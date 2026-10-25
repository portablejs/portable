import { fc, fuzz } from '@portable/fuzz'
import * as Queue from '@portable/queue'
import { expect, test } from 'vite-plus/test'

/** A task that resolves to `value` after `ticks` microtask turns, recording how many run at once. */
function tasks(delays: readonly number[]) {
  let running = 0
  let most = 0
  const order: number[] = []
  const make = (i: number) => async () => {
    running++
    most = Math.max(most, running)
    for (let tick = 0; tick < delays[i]!; tick++) {
      await Promise.resolve()
    }
    running--
    order.push(i)
    return i
  }
  return { make, most: () => most, order }
}

const delays = fc.array(fc.nat(6), { maxLength: 20 })
const concurrency = fc.integer({ min: 1, max: 5 })

test('runs at most concurrency tasks at once, and resolves each with its own result', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, concurrency) => {
      const queue = Queue.create({ concurrency })
      const { make, most } = tasks(delays)
      const results = await Promise.all(delays.map((_, i) => queue.add(make(i))))
      expect(results).toEqual(delays.map((_, i) => i))
      expect(most()).toBeLessThanOrEqual(concurrency)
      await queue.idle()
    }),
  )
})

test('map keeps the input order and respects concurrency', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, concurrency) => {
      const { make, most } = tasks(delays)
      const results = await Queue.map(
        delays.map((_, i) => i),
        (i) => make(i)(),
        { concurrency },
      )
      expect(results).toEqual(delays.map((_, i) => i))
      expect(most()).toBeLessThanOrEqual(concurrency)
    }),
  )
})

test('limit runs at most n tasks at once', async () => {
  await fuzz(
    fc.asyncProperty(delays, concurrency, async (delays, n) => {
      const limited = Queue.limit(n)
      const { make, most } = tasks(delays)
      await Promise.all(delays.map((_, i) => limited(make(i))))
      expect(most()).toBeLessThanOrEqual(n)
    }),
  )
})

test('starts queued tasks by priority, first added first among equal priorities', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.array(fc.integer({ min: -3, max: 3 }), { maxLength: 15 }),
      async (priorities) => {
        const queue = Queue.create({ concurrency: 1 })
        queue.pause()
        const started: number[] = []
        const done = priorities.map((priority, i) =>
          queue.add(async () => started.push(i), { priority }),
        )
        queue.resume()
        await Promise.all(done)
        const expected = priorities
          .map((priority, i) => ({ priority, i }))
          .sort((a, b) => b.priority - a.priority || a.i - b.i)
          .map(({ i }) => i)
        expect(started).toEqual(expected)
      },
    ),
  )
})

type Entry = { id: number; priority: number }

/**
 * What the queue should hold: the tasks waiting and running, the tasks it has started, and how
 * each `add` should settle.
 */
type Model = {
  concurrency: number
  paused: boolean
  waiting: Entry[]
  running: number[]
  started: Set<number>
  outcomes: Map<number, string>
  nextId: number
}

/** The queue, and for each task its controls and how its `add` promise has settled so far. */
type Real = {
  queue: Queue.Queue
  started: Set<number>
  finish: Map<number, (ok: boolean) => void>
  abort: Map<number, AbortController>
  outcomes: Map<number, string>
}

type Command = fc.AsyncCommand<Model, Real>

function drain(model: Model) {
  while (!model.paused && model.running.length < model.concurrency && model.waiting.length > 0) {
    let next = 0
    for (let i = 1; i < model.waiting.length; i++) {
      if (model.waiting[i]!.priority > model.waiting[next]!.priority) {
        next = i
      }
    }
    const { id } = model.waiting.splice(next, 1)[0]!
    model.running.push(id)
    model.started.add(id)
  }
}

async function compare(model: Model, real: Real) {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
  expect(real.queue.size).toBe(model.waiting.length)
  expect(real.queue.pending).toBe(model.running.length)
  expect(real.queue.paused).toBe(model.paused)
  expect(real.queue.concurrency).toBe(model.concurrency)
  expect(real.started).toEqual(model.started)
  expect(real.outcomes).toEqual(model.outcomes)
}

const add = fc
  .record({ priority: fc.integer({ min: -2, max: 2 }), cancellable: fc.boolean() })
  .map(({ priority, cancellable }): Command => ({
    check: () => true,
    async run(model, real) {
      const id = model.nextId++
      model.waiting.push({ id, priority })
      drain(model)
      const controller = cancellable ? new AbortController() : undefined
      if (controller) {
        real.abort.set(id, controller)
      }
      real.queue
        .add(
          () =>
            new Promise((resolve, reject) => {
              real.started.add(id)
              real.finish.set(id, (ok) => (ok ? resolve(id) : reject(new Error(`task ${id}`))))
            }),
          { priority, signal: controller?.signal },
        )
        .then(
          (value) => real.outcomes.set(id, `resolved ${String(value)}`),
          (error: Error) => real.outcomes.set(id, `rejected ${error.message}`),
        )
      await compare(model, real)
    },
    toString: () => `add(priority ${priority}${cancellable ? ', signal' : ''})`,
  }))

const finish = fc.record({ pick: fc.nat(), ok: fc.boolean() }).map(({ pick, ok }): Command => ({
  check: (model) => model.running.length > 0,
  async run(model, real) {
    const [id] = model.running.splice(pick % model.running.length, 1) as [number]
    if (!model.outcomes.has(id)) {
      model.outcomes.set(id, ok ? `resolved ${id}` : `rejected task ${id}`)
    }
    drain(model)
    real.finish.get(id)!(ok)
    await compare(model, real)
  },
  toString: () => `finish(running task ${pick}, ${ok ? 'resolve' : 'reject'})`,
}))

const abort = fc.nat().map((pick): Command => ({
  check: () => true,
  async run(model, real) {
    const live = [...real.abort.keys()]
    if (live.length === 0) {
      return
    }
    const id = live[pick % live.length]!
    const controller = real.abort.get(id)!
    real.abort.delete(id)
    const index = model.waiting.findIndex((entry) => entry.id === id)
    if (index !== -1) {
      model.waiting.splice(index, 1)
      model.outcomes.set(id, `rejected aborted ${id}`)
    } else if (model.running.includes(id) && !model.outcomes.has(id)) {
      model.outcomes.set(id, `rejected aborted ${id}`)
    }
    drain(model)
    controller.abort(new Error(`aborted ${id}`))
    await compare(model, real)
  },
  toString: () => `abort(task with a signal ${pick})`,
}))

const control = fc.oneof(
  fc.constant<Command>({
    check: () => true,
    async run(model, real) {
      model.paused = true
      real.queue.pause()
      await compare(model, real)
    },
    toString: () => 'pause()',
  }),
  fc.constant<Command>({
    check: () => true,
    async run(model, real) {
      model.paused = false
      drain(model)
      real.queue.resume()
      await compare(model, real)
    },
    toString: () => 'resume()',
  }),
  fc.constant<Command>({
    check: () => true,
    async run(model, real) {
      for (const { id } of model.waiting) {
        model.outcomes.set(id, 'rejected The task was removed by clear().')
      }
      model.waiting = []
      real.queue.clear()
      await compare(model, real)
    },
    toString: () => 'clear()',
  }),
  fc.integer({ min: 1, max: 4 }).map((concurrency): Command => ({
    check: () => true,
    async run(model, real) {
      model.concurrency = concurrency
      drain(model)
      real.queue.concurrency = concurrency
      await compare(model, real)
    },
    toString: () => `concurrency = ${concurrency}`,
  })),
)

test('a queue matches a model of its waiting and running tasks after any sequence of calls', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 3 }),
      fc.commands([add, add, finish, finish, abort, control], { maxCommands: 40 }),
      async (concurrency, commands) => {
        await fc.asyncModelRun(
          () => ({
            model: {
              concurrency,
              paused: false,
              waiting: [],
              running: [],
              started: new Set<number>(),
              outcomes: new Map(),
              nextId: 0,
            },
            real: {
              queue: Queue.create({ concurrency }),
              started: new Set<number>(),
              finish: new Map(),
              abort: new Map(),
              outcomes: new Map(),
            },
          }),
          commands,
        )
      },
    ),
  )
})
