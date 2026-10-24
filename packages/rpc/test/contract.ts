import * as Rpc from '@portable/rpc'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import type { Methods, ParentApi } from './fixtures/methods.js'

export declare namespace communicationContract {
  type Options = {
    codec?: 'json' | 'identity' | undefined
    /** The API the test page serves back to the remote. */
    methods: ParentApi
    signal: AbortSignal
  }
  /** Starts the remote side, serving `fixtures/methods.ts`, and connects to it. */
  type Setup = (options: Options) => Promise<Rpc.Remote<Methods>>
}

const parentApi = { add: (a, b) => a + b, getChannel: () => '' } satisfies ParentApi

const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100 && !(await check()); i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  return check()
}

/** The penpal communication and method call lifecycle contracts, for one kind of remote. */
export function communicationContract(name: string, setup: communicationContract.Setup): void {
  async function connect(options: { codec?: 'json' | 'identity' } = {}) {
    const controller = new AbortController()
    onTestFinished(() => controller.abort())
    const remote = await setup({ ...options, methods: parentApi, signal: controller.signal })
    return { remote, controller }
  }

  describe(`communication with ${name}`, () => {
    test('calls a method', async () => {
      const { remote } = await connect()
      await expect(remote.multiply(2, 5)).resolves.toBe(10)
    })

    test('calls methods of nested objects', async () => {
      const { remote } = await connect()
      await expect(remote.nested.oneLevel('pen')).resolves.toBe('pen')
      await expect(remote.nested.by.twoLevels('pal')).resolves.toBe('pal')
    })

    test('awaits a method that returns a promise', async () => {
      const { remote } = await connect()
      await expect(remote.multiplyAsync(2, 5)).resolves.toBe(10)
    })

    test('calls apply, call and bind of a method as remote methods', async () => {
      const { remote } = await connect()
      await expect(remote.nested.apply()).resolves.toBe('nested apply result')
      await expect(remote.multiply.call(undefined, 2, 5)).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32601,
      })
      await expect(Rpc.call(remote.multiply, [2, 5])).resolves.toBe(10)
    })

    test('calls top-level methods named apply, call and bind', async () => {
      const { remote } = await connect()
      await expect(remote.apply()).resolves.toBe('apply result')
      await expect(remote.call()).resolves.toBe('call result')
      await expect(remote.bind()).resolves.toBe('bind result')
    })

    test('copies Uint8Array arguments and results with the identity codec', async () => {
      const { remote } = await connect({ codec: 'identity' })
      const numbers = new Uint8Array([4, 5])
      const doubled = await remote.double(numbers)
      expect(doubled).toBeInstanceOf(Uint8Array)
      expect([...doubled]).toEqual([8, 10])
      expect([...numbers]).toEqual([4, 5])
    })

    test('lets the remote call a method served by this side', async () => {
      const { remote } = await connect()
      await remote.addUsingParent()
      await expect(remote.getParentReturnValue()).resolves.toBe(9)
    })

    test('rejects with Rpc.RemoteError when a method rejects with a string', async () => {
      const { remote } = await connect()
      await expect(remote.getPromiseRejectedWithString()).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32603,
        message: 'test error string',
      })
    })

    test('rejects with Rpc.RemoteError when a method rejects with an object', async () => {
      const { remote } = await connect()
      await expect(remote.getPromiseRejectedWithObject()).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32603,
        message: '[object Object]',
      })
    })

    test('rejects with Rpc.RemoteError when a method rejects with undefined', async () => {
      const { remote } = await connect()
      await expect(remote.getPromiseRejectedWithUndefined()).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32603,
        message: 'undefined',
      })
    })

    test("rejects with an error's message but not its name or stack", async () => {
      const { remote } = await connect()
      const error = await remote.getPromiseRejectedWithError().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Rpc.RemoteError)
      expect(error).toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32603,
        message: 'test error object',
      })
      expect((error as Error).stack).not.toContain('getPromiseRejectedWithError')
    })

    test('rejects with the code and data of an Rpc.RemoteError the method throws', async () => {
      const { remote } = await connect()
      await expect(remote.throwRemoteError()).rejects.toMatchObject({
        code: 404,
        message: 'No such user',
        data: { id: 'x' },
      })
    })

    test('rejects when a method throws synchronously', async () => {
      const { remote } = await connect()
      await expect(remote.throwError()).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        message: 'Oh nos!',
      })
    })

    test('rejects a call whose result the codec cannot encode, and keeps working', async () => {
      const { remote } = await connect()
      await expect(
        Rpc.call(remote.getUnclonableValue, [], { signal: AbortSignal.timeout(2000) }),
      ).rejects.toMatchObject({ name: 'Rpc.RemoteError', code: -32603 })
      await expect(remote.multiply(2, 5)).resolves.toBe(10)
    })

    test('rejects a call whose result cannot be cloned, and keeps working', async () => {
      const { remote } = await connect({ codec: 'identity' })
      await expect(
        Rpc.call(remote.getUnclonableValue, [], { signal: AbortSignal.timeout(2000) }),
      ).rejects.toMatchObject({ name: 'Rpc.RemoteError', code: -32603 })
      await expect(remote.multiply(2, 5)).resolves.toBe(10)
    })

    test('calls a method whose name contains a period', async () => {
      const { remote } = await connect()
      await expect(remote['with.period']()).resolves.toBe('success')
    })

    test('rejects a missing method with code -32601', async () => {
      const { remote } = await connect()
      await expect((remote as Rpc.Remote<any>).missing()).rejects.toMatchObject({
        name: 'Rpc.RemoteError',
        code: -32601,
        message: 'Method not found',
      })
    })

    test("streams an async generator's values", async () => {
      const { remote } = await connect()
      const values = new Array<number>()
      for await (const value of remote.count(3)) values.push(value)
      expect(values).toEqual([0, 1, 2])
    })

    test('streams a ReadableStream result', async () => {
      const { remote } = await connect()
      const reader = (await remote.numbers(3)).getReader()
      const values = new Array<number>()
      for (let r = await reader.read(); !r.done; r = await reader.read()) values.push(r.value)
      expect(values).toEqual([0, 1, 2])
    })

    test("runs the remote generator's finally block when the loop breaks", async () => {
      const { remote } = await connect()
      const values = new Array<number>()
      for await (const value of remote.forever()) {
        values.push(value)
        if (values.length === 2) break
      }
      expect(values).toEqual([0, 1])
      expect(await waitFor(() => remote.wasCancelled())).toBe(true)
    })
  })

  describe(`method call lifecycle with ${name}`, () => {
    test('rejects a call with signal.reason when its signal times out', async () => {
      const { remote } = await connect()
      const signal = AbortSignal.timeout(0)
      await expect(Rpc.call(remote.neverResolve, [], { signal })).rejects.toMatchObject({
        name: 'TimeoutError',
      })
    })

    test('rejects a pending call with signal.reason when the connection closes', async () => {
      const { remote, controller } = await connect()
      const pending = remote.neverResolve()
      await remote.multiply(1, 1)
      const reason = new Error('closed')
      controller.abort(reason)
      await expect(pending).rejects.toBe(reason)
    })

    test('rejects calls made after the connection closed with signal.reason', async () => {
      const { remote, controller } = await connect()
      await remote.multiply(1, 1)
      const reason = new Error('closed')
      controller.abort(reason)
      await expect(remote.multiply(2, 3)).rejects.toBe(reason)
    })
  })
}
