import * as Rpc from '@portable/rpc'

export type ParentApi = {
  add(a: number, b: number): number
  getChannel(): string
}

/** The API of a parent that forwards some of a Worker's methods. */
export type BridgeApi = ParentApi & { worker: WorkerBridge }

export type WorkerBridge = {
  multiply(a: number, b: number): Promise<number>
  count(n: number): AsyncIterable<number>
  forever(): AsyncIterable<number>
  wasCancelled(): Promise<boolean>
}

export type Config = {
  /** The origin the child passes to `Rpc.window`. */
  origin?: string | undefined
  /** One connection per channel, opened in this order. */
  channels?: string[] | undefined
  codec?: 'json' | 'identity' | undefined
  /**
   * `other` serves a different API, `version` speaks protocol version 2, `silent` never connects,
   * and `port` serves over a MessagePort that the parent transfers.
   */
  page?: 'general' | 'other' | 'version' | 'silent' | 'port' | undefined
  /** Milliseconds to wait before connecting. */
  delay?: number | undefined
  /** A URL to navigate to instead of connecting. */
  redirect?: string | undefined
}

export const identity: Rpc.Codec = { encode: (message) => message, decode: (data) => data }

export const codecOf = (config: Config): Rpc.Codec<any> =>
  config.codec === 'identity' ? identity : Rpc.json

export function createMethods(
  options: {
    parent?: () => Rpc.Remote<ParentApi>
    /** The parent connection on another channel of the same page. */
    parentOn?: (channel: string) => Rpc.Remote<ParentApi>
    channel?: string
    reload?: () => void
    navigate?: (to: string) => void
  } = {},
) {
  const parent = () => options.parent!()
  const worker = () => (parent() as Rpc.Remote<BridgeApi>).worker
  let parentReturnValue: number | undefined
  let cancelled = false
  return {
    multiply: (a: number, b: number) => a * b,
    multiplyAsync: async (a: number, b: number) => a * b,
    double: (numbers: Uint8Array) => numbers.map((n) => n * 2),
    async addUsingParent() {
      parentReturnValue = await parent().add(3, 6)
    },
    getParentReturnValue: () => parentReturnValue,
    async addUsingParentOn(channel: string, ms: number) {
      try {
        return await Rpc.call(options.parentOn!(channel).add, [3, 6], {
          signal: AbortSignal.timeout(ms),
        })
      } catch (error) {
        return (error as Error).name
      }
    },
    getPromiseRejectedWithString: () => Promise.reject('test error string'),
    getPromiseRejectedWithObject: () => Promise.reject({ a: 'b' }),
    getPromiseRejectedWithUndefined: () => Promise.reject(undefined),
    getPromiseRejectedWithError: () => Promise.reject(new TypeError('test error object')),
    throwError() {
      throw new Error('Oh nos!')
    },
    throwRemoteError() {
      throw new Rpc.RemoteError({ code: 404, message: 'No such user', data: { id: 'x' } })
    },
    getUnclonableValue: (): unknown => ({ big: 1n, fn() {} }),
    apply: () => 'apply result',
    call: () => 'call result',
    bind: () => 'bind result',
    nested: {
      oneLevel: (input: string) => input,
      by: { twoLevels: (input: string) => input },
      apply: () => 'nested apply result',
    },
    neverResolve: () => new Promise<never>(() => {}),
    'with.period': () => 'success',
    delay: (ms: number, value: string) =>
      new Promise<string>((resolve) => setTimeout(() => resolve(value), ms)),
    async *count(n: number) {
      for (let i = 0; i < n; i++) yield i
    },
    numbers: (n: number) =>
      new ReadableStream<number>({
        start(controller) {
          for (let i = 0; i < n; i++) controller.enqueue(i)
          controller.close()
        },
      }),
    async *forever() {
      try {
        for (let i = 0; ; i++) yield i
      } finally {
        cancelled = true
      }
    },
    wasCancelled: () => cancelled,
    origin: () => globalThis.location.origin,
    getChannel: () => options.channel ?? '',
    getChannelFromParent: () => parent().getChannel(),
    relayMultiply: (a: number, b: number) => worker().multiply(a, b),
    async relayCount(n: number) {
      const values: number[] = []
      for await (const value of worker().count(n)) values.push(value)
      return values
    },
    async relayUntilBreak(n: number) {
      const values: number[] = []
      for await (const value of worker().forever()) {
        values.push(value)
        if (values.length === n) break
      }
      return values
    },
    relayWasCancelled: () => worker().wasCancelled(),
    reload: () => void options.reload?.(),
    navigate: (to: string) => void options.navigate?.(to),
  }
}

export type Methods = ReturnType<typeof createMethods>

/** Serves the general methods on a port-like target and connects back to the parent's API. */
export function servePort(target: Rpc.port.Target, config: Config = {}, channel = ''): void {
  const parent: Rpc.Remote<ParentApi> = Rpc.connect<ParentApi>(Rpc.port(target), {
    codec: codecOf(config),
    serve: createMethods({ parent: () => parent, channel }),
  })
}
