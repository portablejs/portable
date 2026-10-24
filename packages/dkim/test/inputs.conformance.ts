import * as Dkim from '@portable/dkim'
import { byteForms, streamOf, toByteForm } from '@portable/fuzz'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import { encode, privatePem, resolverFrom, rsaRecord } from './utils.js'

const message = encode(
  'From: a@example.com\r\nTo: b@example.net\r\nSubject: test\r\n\r\nHello world\r\n',
)

let options: Dkim.sign.Options
let resolver: Dkim.Resolver

beforeAll(async () => {
  options = {
    domain: 'example.com',
    selector: 's',
    privateKey: await privatePem('rsa'),
    now: new Date(1e12),
  }
  resolver = resolverFrom({ 's._domainkey.example.com': [await rsaRecord()] })
})

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`signs and verifies a message given as a ${form}`, async () => {
      const expected = await Dkim.sign(message, options)
      expect(await Dkim.sign(toByteForm(message, form), options)).toBe(expected)
      const chunks = [
        toByteForm(message.subarray(0, 30), form),
        toByteForm(message.subarray(30), form),
      ]
      expect(await Dkim.sign(streamOf(chunks), options)).toBe(expected)

      const signed = encode(expected + new TextDecoder().decode(message))
      const now = new Date(1e12)
      const [result] = await Dkim.verify(toByteForm(signed, form), { resolver, now })
      expect(result!.result).toBe('pass')
      const signedChunks = [
        toByteForm(signed.subarray(0, 50), form),
        toByteForm(signed.subarray(50), form),
      ]
      const [streamed] = await Dkim.verify(streamOf(signedChunks), { resolver, now })
      expect(streamed!.result).toBe('pass')
    })
  }
})
