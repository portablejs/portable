import { attempt, byteForms, rejectedByteForms, streamOf, toByteForm } from '@portable/fuzz'
import * as MailAuth from '@portable/mail-auth'
import { describe, expect, test } from 'vite-plus/test'
import { buildMessage, encode, key, signed, zoneResolver } from './utils.js'

const options = {
  authservId: 'mx.example.net',
  ip: '198.51.100.1',
  helo: 'mail.example.com',
  sender: 'user@mail.example.com',
}

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a message given as a ${form}`, async () => {
      const message = buildMessage({ from: 'user@mail.example.com', to: 'rcpt@example.net' })
      const bytes = encode(await signed(message, 'mail.example.com'))
      const resolver = zoneResolver({
        'test._domainkey.mail.example.com': { TXT: [(await key('rsa')).record] },
        '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=reject'] },
      })
      const expected = await MailAuth.authenticate(bytes, { ...options, resolver })
      expect(expected.dkim[0]?.result).toBe('pass')
      expect(
        await MailAuth.authenticate(toByteForm(bytes, form), { ...options, resolver }),
      ).toEqual(expected)
      const chunks = [toByteForm(bytes.subarray(0, 40), form), toByteForm(bytes.subarray(40), form)]
      expect(await MailAuth.authenticate(streamOf(chunks), { ...options, resolver })).toEqual(
        expected,
      )
    })
  }
})

describe('rejected byte inputs', () => {
  for (const [name, value] of Object.entries(rejectedByteForms)) {
    test(`throws a TypeError for ${name}`, async () => {
      const v = value as never
      const resolver = zoneResolver({})
      await expect(
        attempt(() => MailAuth.authenticate(v, { ...options, resolver })),
      ).rejects.toThrow(TypeError)
      await expect(
        attempt(() => MailAuth.authenticate(streamOf([v]), { ...options, resolver })),
      ).rejects.toThrow(TypeError)
    })
  }
})
