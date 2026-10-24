import * as Dkim from '@portable/dkim'
import * as Mail from '@portable/mail'
import * as Streams from '@portable/streams'
import { expect, test } from 'vite-plus/test'
import { fakeServer, plain } from './utils.js'

// Follows the mail README: builds a message with Mail.encode, signs it with Dkim.sign and sends
// it with Smtp, then checks that Dkim.verify accepts the signature on the received message.

test('a message encoded, signed and sent arrives with a valid DKIM signature', async () => {
  const keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const record = `v=DKIM1; k=ed25519; p=${btoa(String.fromCharCode(...publicKey))}`
  const resolver = {
    async resolveTxt(name) {
      if (name !== 'mail._domainkey.example.com') throw new Error(`unexpected lookup ${name}`)
      return [[record]]
    },
  } satisfies Dkim.Resolver

  const message = await Streams.toBytes(
    Mail.encode({
      from: 'Mari <mari@example.com>',
      to: 'jaan@example.org',
      subject: 'Tere õhtust',
      text: 'Tere, Jaan!\n.A line that starts with a dot.\n',
      html: '<p>Tere, Jaan!</p>',
      attachments: [{ content: new Uint8Array(3000).fill(0x2e), filename: 'dots.bin' }],
    }),
  )
  const field = await Dkim.sign(message, {
    domain: 'example.com',
    selector: 'mail',
    privateKey: keys.privateKey,
  })
  const signed = new Uint8Array([...new TextEncoder().encode(field), ...message])

  const server = fakeServer()
  const client = await plain(server)
  const result = await client.send({
    from: 'mari@example.com',
    to: 'jaan@example.org',
    message: signed,
  })
  expect(result.accepted).toEqual(['jaan@example.org'])
  await client.close()

  const [received] = server.messages
  expect(received).toBeDefined()
  const results = await Dkim.verify(`${received}\r\n`, { resolver })
  expect(results.map((each) => [each.result, each.domain])).toEqual([['pass', 'example.com']])
})
