import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as WebPush from '@portable/web-push'
import { decrypt, userAgent } from './utils.js'

const payload = new TextEncoder().encode('hello')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads keys, payload and salt given as a ${form}`, async () => {
      const agent = await userAgent()
      // `PushSubscription.getKey` returns an `ArrayBuffer`.
      const keys = {
        p256dh: toByteForm(agent.publicKey, form),
        auth: toByteForm(agent.auth, form),
      }
      const salt = toByteForm(new Uint8Array(16).fill(7), form)
      const body = await WebPush.encrypt({
        subscription: { keys },
        payload: toByteForm(payload, form),
        salt,
      })
      expect(await decrypt(body, agent)).toEqual(payload)
    })
  }
})
