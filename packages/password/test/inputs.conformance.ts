import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as Password from '@portable/password'

const password = new TextEncoder().encode('hunter2')

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`hashes and verifies a ${form}`, async () => {
      const stored = await Password.hash(toByteForm(password, form), { iterations: 1000 })
      expect(await Password.verify('hunter2', stored)).toBe(true)
      expect(await Password.verify(toByteForm(password, form), stored)).toBe(true)
    })
  }
})
