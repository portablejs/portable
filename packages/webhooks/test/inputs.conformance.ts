import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as Webhooks from '@portable/webhooks'

const body = new TextEncoder().encode('{"test": 2432232314}')
const secret = new TextEncoder().encode('whsec')
const now = new Date(1614265330 * 1000)
const id = 'msg_1'

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`signs and verifies a body and secret given as a ${form}`, async () => {
      const scheme = Webhooks.github
      const headers = await Webhooks.sign(toByteForm(body, form), {
        scheme,
        secret: toByteForm(secret, form),
        id,
        now,
      })
      expect(headers).toEqual(await Webhooks.sign(body, { scheme, secret, id, now }))
      await expect(
        Webhooks.verify(
          { headers, body: toByteForm(body, form) },
          { scheme, secret: [toByteForm(secret, form)], now },
        ),
      ).resolves.toBeDefined()
    })
  }

  test('throws a TypeError for a body that is neither bytes nor a string', async () => {
    const headers = await Webhooks.sign(body, { scheme: Webhooks.github, secret, now })
    await expect(
      Webhooks.verify({ headers, body: [1] as never }, { scheme: Webhooks.github, secret, now }),
    ).rejects.toThrow(TypeError)
  })
})
