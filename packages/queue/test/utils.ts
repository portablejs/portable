export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const flush = (): Promise<void> => delay(0)

export function concurrencyProbe() {
  let running = 0
  const probe = {
    max: 0,
    get running() {
      return running
    },
    async run<T>(ms: number, value?: T): Promise<T | undefined> {
      running++
      probe.max = Math.max(probe.max, running)
      await delay(ms)
      running--
      return value
    },
  }
  return probe
}

export function countingSignal(controller = new AbortController()) {
  const { signal } = controller
  let listeners = 0
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  signal.addEventListener = ((...args: Parameters<typeof add>) => {
    listeners++
    add(...args)
  }) as typeof add
  signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
    listeners--
    remove(...args)
  }) as typeof remove
  return {
    controller,
    signal,
    get listeners() {
      return listeners
    },
  }
}

export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}
