import * as Rpc from '@portable/rpc'
import { describe, expect, test } from 'vite-plus/test'
import { pair, raw } from './utils.js'

const invalidRequest = {
  jsonrpc: '2.0',
  id: null,
  error: { code: -32600, message: 'Invalid Request' },
}
const echo = {
  echo: (p: { text?: string | undefined; message?: string | undefined }) => p.text ?? p.message,
}

describe('server', () => {
  test('passes by-name params to the method as one object', async () => {
    const server = raw(echo)
    expect(
      await server.send('{"jsonrpc":"2.0","id":0,"method":"echo","params":{"text":"foo"}}'),
    ).toEqual([{ jsonrpc: '2.0', id: 0, result: 'foo' }])
  })

  test('answers parse errors for empty or malformed text', async () => {
    const server = raw(echo)
    for (const text of ['', 'invalid JSON', '[object Object]']) {
      expect(await server.send(text)).toEqual([
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      ])
    }
  })

  test('answers Invalid Request for objects that are not requests', async () => {
    const server = raw(echo)
    for (const text of [
      '{}',
      '{"jsonrpc":"2.0"}',
      '{"jsonrpc":"2.0invalid","method":""}',
      '{"jsonrpc":"2.0","method":"echo","params":"text"}',
      '{"jsonrpc":"2.0","method":"echo","id":{}}',
      'null',
      '0',
      '"echo"',
    ]) {
      expect(await server.send(text)).toEqual([invalidRequest])
    }
  })

  test('answers a batch in request order', async () => {
    const server = raw(echo)
    const [responses] = await server.send(
      JSON.stringify(
        ['1', '2', '3'].map((message, id) => ({
          jsonrpc: '2.0',
          id,
          method: 'echo',
          params: { message },
        })),
      ),
    )
    expect(responses).toEqual([
      { jsonrpc: '2.0', id: 0, result: '1' },
      { jsonrpc: '2.0', id: 1, result: '2' },
      { jsonrpc: '2.0', id: 2, result: '3' },
    ])
  })

  test('answers a batch of one request with an array of one response', async () => {
    const server = raw(echo)
    expect(
      await server.send('[{"jsonrpc":"2.0","id":0,"method":"echo","params":{"message":"1"}}]'),
    ).toEqual([[{ jsonrpc: '2.0', id: 0, result: '1' }]])
  })

  test('answers a batch of a valid and an invalid request with both responses', async () => {
    const server = raw(echo)
    expect(
      await server.send(
        '[1,{"jsonrpc":"2.0","id":0,"method":"echo","params":{"message":"1"}},null]',
      ),
    ).toEqual([[invalidRequest, { jsonrpc: '2.0', id: 0, result: '1' }, invalidRequest]])
  })

  test('echoes string, fractional and null ids', async () => {
    const server = raw({ one: () => 1 })
    for (const id of ['abc', 1.5, null, -3]) {
      expect(await server.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'one' }))).toEqual([
        { jsonrpc: '2.0', id, result: 1 },
      ])
    }
  })

  test('does not slow down with many methods', async () => {
    const api: Record<string, () => number> = {}
    for (let i = 0; i < 20000; i++) api[`method${i}`] = () => i
    const remote = pair(api) as any
    expect(await remote.method19999()).toBe(19999)
  })

  test('calls an own method named __proto__, but not hasOwnProperty', async () => {
    const server = raw({ ['__proto__']: () => 'foo' })
    expect(await server.send('{"jsonrpc":"2.0","id":0,"method":"__proto__"}')).toEqual([
      { jsonrpc: '2.0', id: 0, result: 'foo' },
    ])
    expect(await server.send('{"jsonrpc":"2.0","id":1,"method":"hasOwnProperty"}')).toEqual([
      { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } },
    ])
  })
})

describe('client', () => {
  /** Answers every request with `respond(id)`, written raw. */
  function answering(respond: (id: number) => string) {
    let input!: ReadableStreamDefaultController<unknown>
    const readable = new ReadableStream({ start: (c) => void (input = c) })
    const writable = new WritableStream({
      write: (text) => input.enqueue(respond(JSON.parse(text as string).id)),
    })
    return Rpc.connect<any>({ readable, writable })
  }

  test('resolves a falsy result', async () => {
    const remote = answering((id) => `{"jsonrpc":"2.0","id":${id},"result":0}`)
    expect(await remote.foo()).toBe(0)
  })

  test('rejects a response that has both result and error', async () => {
    const remote = answering(
      (id) => `{"jsonrpc":"2.0","id":${id},"result":"foo","error":{"code":0,"message":"bar"}}`,
    )
    await expect(remote.foo()).rejects.toMatchObject({ code: 0, message: 'bar' })
  })

  test('rejects with the code, message and data of an error response', async () => {
    const remote = answering(
      (id) =>
        `{"jsonrpc":"2.0","id":${id},"error":{"code":0,"message":"This is a test. Do not panic.","data":{"optional":"data"}}}`,
    )
    const error = await remote.foo().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Rpc.RemoteError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      code: 0,
      message: 'This is a test. Do not panic.',
      data: { optional: 'data' },
    })
  })

  test('fills in a malformed error object', async () => {
    const remote = answering((id) => `{"jsonrpc":"2.0","id":${id},"error":"broken"}`)
    await expect(remote.foo()).rejects.toMatchObject({ name: 'Rpc.RemoteError', code: -32603 })
  })

  test('ignores a response for a call that already settled', async () => {
    const remote = answering(
      (id) => `[{"jsonrpc":"2.0","id":${id},"result":1},{"jsonrpc":"2.0","id":${id},"result":2}]`,
    )
    expect(await remote.foo()).toBe(1)
    expect(await remote.foo()).toBe(1)
  })
})
