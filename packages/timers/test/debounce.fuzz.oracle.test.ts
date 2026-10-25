import { fc, fuzz } from '@portable/fuzz'
import * as Timers from '@portable/timers'
import lodashDebounce from 'lodash/debounce.js'
import lodashThrottle from 'lodash/throttle.js'
import { expect, test, vi } from 'vite-plus/test'
import { useFakeTimers } from './utils.js'

useFakeTimers()

type Wrapped = {
  (arg: number): unknown
  cancel(): void
  flush(): unknown
}

/** A debounced function and the time and argument of each call it made to `fn`. */
type Side = { wrapped: Wrapped; invocations: [number, number][] }

function side(make: (fn: (arg: number) => number) => Wrapped): Side {
  const start = Date.now()
  const invocations: [number, number][] = []
  const wrapped = make((arg) => {
    invocations.push([Date.now() - start, arg])
    return arg
  })
  return { wrapped, invocations }
}

type Command = fc.AsyncCommand<Side, Side>

function same(lodash: Side, ours: Side) {
  expect(ours.invocations).toEqual(lodash.invocations)
}

const step = (name: string, act: (wrapped: Wrapped) => void): Command => ({
  check: () => true,
  async run(lodash, ours) {
    for (const { wrapped } of [lodash, ours]) {
      try {
        Promise.resolve(act(wrapped)).catch(() => {})
      } catch {}
    }
    await vi.advanceTimersByTimeAsync(0)
    same(lodash, ours)
  },
  toString: () => name,
})

const call = fc.nat(1000).map((arg) => step(`call(${arg})`, (wrapped) => wrapped(arg)))
const flush = fc.constant(step('flush()', (wrapped) => wrapped.flush()))
const cancel = fc.constant(step('cancel()', (wrapped) => wrapped.cancel()))
const advance = fc.nat(250).map((ms): Command => ({
  check: () => true,
  async run(lodash, ours) {
    await vi.advanceTimersByTimeAsync(ms)
    same(lodash, ours)
  },
  toString: () => `advance ${ms} ms`,
}))

// lodash's `flush` doesn't clear its timer, so with `maxWait`, a call after a flush can invoke
// `fn` `maxWait` after the flush, while ours invokes it `ms` after the call. Those runs leave out
// `flush`.
const commands = (withFlush: boolean) =>
  fc.commands(withFlush ? [call, flush, cancel, advance] : [call, cancel, advance], {
    maxCommands: 40,
  })

// lodash reads `maxWait: undefined` as `maxWait: ms`, so a run without `maxWait` omits the key.
const settings = fc
  .record(
    { leading: fc.boolean(), trailing: fc.boolean(), maxWait: fc.nat(150) },
    { requiredKeys: ['leading', 'trailing'] },
  )
  .filter(({ leading, trailing }) => leading || trailing)

test('debounce invokes fn at the times and with the arguments lodash 4.18 does', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.nat(100),
      settings.chain((options) =>
        fc.tuple(fc.constant(options), commands(options.maxWait === undefined)),
      ),
      async (ms, [options, commands]) => {
        await fc.asyncModelRun(
          () => ({
            model: side((fn) => lodashDebounce(fn, ms, options)),
            real: side((fn) => Timers.debounce(fn, ms, options)),
          }),
          commands,
        )
        vi.clearAllTimers()
      },
    ),
  )
})

test('throttle invokes fn at the times and with the arguments lodash 4.18 does', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.nat(100),
      settings,
      commands(false),
      async (ms, { leading, trailing }, commands) => {
        await fc.asyncModelRun(
          () => ({
            model: side((fn) => lodashThrottle(fn, ms, { leading, trailing })),
            real: side((fn) => Timers.throttle(fn, ms, { leading, trailing })),
          }),
          commands,
        )
        vi.clearAllTimers()
      },
    ),
  )
})
