import * as DnsPacket from '@portable/dns-packet'
import dgram from 'node:dgram'
import dnsPromises from 'node:dns/promises'
import TangerineModule from 'tangerine'
import { afterAll, beforeAll, expect, test } from 'vite-plus/test'
import { createResolver } from '@portable/dns'
import { recorded } from './utils.js'

const cases = [
  ['gmail.com', 'TXT', 'resolveTxt'],
  ['gmail.com', 'MX', 'resolveMx'],
  ['www.microsoft.com', 'A', 'resolve4'],
] as const

const answers = new Map(
  cases.map(([name, type]) => [`${name} ${type}`, recorded.get(`${name} ${type} dns.google`)!]),
)

function answer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const query = DnsPacket.decode(bytes)
  const reply = new Uint8Array(
    answers.get(`${query.questions[0]!.name} ${query.questions[0]!.type}`)!,
  )
  reply[0] = bytes[0]!
  reply[1] = bytes[1]!
  return reply
}

const queryOf = (url: string) =>
  Uint8Array.from(
    atob(new URL(url).searchParams.get('dns')!.replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0),
  )

const ours = createResolver({
  fetch: async (url) => new Response(answer(queryOf(url))),
})

// tangerine's index.d.ts declares a default export, but index.js sets module.exports.
const Tangerine = TangerineModule as unknown as typeof TangerineModule.default

const tangerine = new Tangerine({ cache: false, tries: 1 }, async (url: string) => ({
  statusCode: 200,
  headers: {},
  body: { arrayBuffer: async () => answer(queryOf(url)).buffer },
}))

const server = dgram.createSocket('udp4')
const node = new dnsPromises.Resolver({ timeout: 1000, tries: 1 })

beforeAll(async () => {
  server.on('message', (message, remote) =>
    server.send(answer(message), remote.port, remote.address),
  )
  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve))
  node.setServers([`127.0.0.1:${server.address().port}`])
})

afterAll(() => server.close())

for (const [name, type, method] of cases)
  test(`${method}('${name}') from a recorded ${type} response within 25% of tangerine`, async ({
    bench,
  }) => {
    expect(await tangerine[method](name)).toMatchObject(await ours[method](name))
    const result = await bench.compare(
      bench('@portable/dns', async () => {
        await ours[method](name)
      }),
      bench('tangerine', async () => {
        await tangerine[method](name)
      }),
      bench('node:dns/promises over local UDP', async () => {
        await node[method](name)
      }),
    )
    expect(result.get('tangerine')).not.toBeFasterThan(result.get('@portable/dns'), {
      delta: 0.25,
    })
  })
