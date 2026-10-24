import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as Ip from '@portable/ip'

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`fromBytes reads a ${form} and copies it`, () => {
      const input = toByteForm(new Uint8Array([127, 0, 0, 1]), form)
      const address = Ip.fromBytes(input)
      expect(Ip.format(address)).toBe('127.0.0.1')
      expect(address.bytes).toBeInstanceOf(Uint8Array)
      input.fill(9)
      expect(Ip.format(address)).toBe('127.0.0.1')
    })
  }
})
