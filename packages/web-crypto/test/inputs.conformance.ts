import { describe, expect, test } from 'vite-plus/test'
import { attempt, byteForms, rejectedByteForms, toByteForm } from '@portable/fuzz'
import * as WebCrypto from '@portable/web-crypto'

const data = new TextEncoder().encode('hello')
const key = new TextEncoder().encode('key')
const seed = Uint8Array.from({ length: 32 }, (_, i) => i)

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      expect(await WebCrypto.digest('SHA-256', toByteForm(data, form))).toEqual(
        await WebCrypto.digest('SHA-256', data),
      )
      expect(
        await WebCrypto.hmac('SHA-256', toByteForm(key, form), toByteForm(data, form)),
      ).toEqual(await WebCrypto.hmac('SHA-256', key, data))
      expect(
        await WebCrypto.hkdf('SHA-256', toByteForm(key, form), {
          info: toByteForm(data, form),
          salt: toByteForm(data, form),
        }),
      ).toEqual(await WebCrypto.hkdf('SHA-256', key, { info: data, salt: data }))
      const { publicKey } = await WebCrypto.importSeed('X25519', toByteForm(seed, form))
      const expected = await WebCrypto.importSeed('X25519', seed)
      expect(await crypto.subtle.exportKey('raw', publicKey)).toEqual(
        await crypto.subtle.exportKey('raw', expected.publicKey),
      )
      const raw = Uint8Array.from({ length: 64 }, (_, i) => i + 1)
      const der = WebCrypto.rawToDerEcdsa(toByteForm(raw, form))
      expect(der).toEqual(WebCrypto.rawToDerEcdsa(raw))
      expect(WebCrypto.derToRawEcdsa(toByteForm(der, form))).toEqual(raw)
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      await expect(attempt(() => WebCrypto.digest('SHA-256', v))).rejects.toThrow(TypeError)
      await expect(attempt(() => WebCrypto.hmac('SHA-256', v, data))).rejects.toThrow(TypeError)
      await expect(attempt(() => WebCrypto.hmac('SHA-256', key, v))).rejects.toThrow(TypeError)
      await expect(attempt(() => WebCrypto.importSeed('X25519', v))).rejects.toThrow(TypeError)
      await expect(attempt(() => WebCrypto.rawToDerEcdsa(v))).rejects.toThrow(TypeError)
      await expect(attempt(() => WebCrypto.derToRawEcdsa(v))).rejects.toThrow(TypeError)
    })
  }
})
