import { fc, fuzz, outcomeAsync } from '@portable/fuzz'
import * as WebPush from '@portable/web-push'
import { beforeAll, expect, test } from 'vite-plus/test'
import { decrypt, type UserAgent, userAgent } from './utils.js'

let agent: UserAgent

beforeAll(async () => {
  agent = await userAgent()
})

test('the user agent decrypts what encrypt writes', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.oneof(
        fc.uint8Array({ maxLength: WebPush.maxPayloadBytes }),
        fc.string({ maxLength: 200 }),
      ),
      async (payload) => {
        const body = await WebPush.encrypt({ subscription: agent.subscription, payload })
        const expected = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload
        expect(await decrypt(body, agent)).toEqual(expected)
      },
    ),
    { scale: 0.3 },
  )
})

test('a payload over maxPayloadBytes throws InvalidInputError', async () => {
  await fuzz(
    fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (extra) => {
      const payload = new Uint8Array(WebPush.maxPayloadBytes + extra)
      expect(
        await outcomeAsync([WebPush.InvalidInputError], () =>
          WebPush.encrypt({ subscription: agent.subscription, payload }),
        ),
      ).toEqual({ error: WebPush.InvalidInputError })
    }),
    { scale: 0.2 },
  )
})

test('changed subscription keys throw only InvalidInputError', async () => {
  const keyText = fc.string({
    unit: fc.constantFrom('A', 'z', '0', '-', '_', '=', '+', '/', ' '),
    maxLength: 100,
  })
  await fuzz(
    fc.asyncProperty(
      fc.oneof(keyText, fc.constant(agent.subscription.keys.p256dh)),
      fc.oneof(keyText, fc.constant(agent.subscription.keys.auth)),
      async (p256dh, auth) => {
        const subscription = { ...agent.subscription, keys: { p256dh, auth } }
        await outcomeAsync([WebPush.InvalidInputError], () =>
          WebPush.encrypt({ subscription, payload: 'tere' }),
        )
      },
    ),
    { scale: 0.5 },
  )
})
