import { fc, fuzz } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'
import { pair, raw } from './utils.js'

/** JSON values in the form `JSON.parse` returns, which never includes -0. */
const json = fc
  .jsonValue({ maxDepth: 3 })
  .map((value) => JSON.parse(JSON.stringify(value)) as unknown)

test('a remote call returns the value the method returns', async () => {
  const remote = pair({ echo: (value: unknown) => value })
  await fuzz(
    fc.asyncProperty(json, async (value) => {
      expect(await remote.echo(value)).toEqual(value)
    }),
  )
})

const message = fc.oneof(
  fc.record(
    {
      jsonrpc: fc.oneof(fc.constant('2.0'), json),
      id: fc.oneof(fc.integer(), fc.string({ maxLength: 4 }), fc.constant(null), json),
      method: fc.oneof(
        fc.constantFrom('echo', 'missing', 'constructor', '__proto__', 'rpc.x'),
        json,
      ),
      params: fc.oneof(fc.array(json, { maxLength: 3 }), json),
    },
    { requiredKeys: [] },
  ),
  json,
)

test('the server answers any message or batch with JSON-RPC responses or nothing', async () => {
  const server = raw({ echo: (value: unknown) => value })
  await fuzz(
    fc.asyncProperty(
      fc.oneof(
        message.map((value) => JSON.stringify(value)),
        fc.string({ maxLength: 20 }),
      ),
      async (text) => {
        const replies = await server.send(text)
        for (const reply of replies.flat() as Record<string, unknown>[]) {
          expect(reply.jsonrpc).toBe('2.0')
          expect('result' in reply !== 'error' in reply).toBe(true)
        }
      },
    ),
    { scale: 0.3 },
  )
})
