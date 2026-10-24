import { describe, expect, test } from 'vite-plus/test'
import * as DnsPacket from '@portable/dns-packet'
import { byteForms, toByteForm } from '@portable/fuzz'

const bytes = DnsPacket.encode({
  id: 1,
  questions: [{ name: 'example.com', type: 'A' }],
})

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`decodes a ${form}`, () => {
      expect(DnsPacket.decode(toByteForm(bytes, form))).toEqual(DnsPacket.decode(bytes))
    })
  }
})
