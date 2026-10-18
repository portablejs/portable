import { expect, test } from 'vite-plus/test'
import * as Password from '@portable/password'
import { fromHex, phc } from './utils.js'

test('RFC 6070 "password", "salt", c=16777216', { timeout: 120_000 }, async () => {
  const stored = phc(
    'sha1',
    16_777_216,
    'salt',
    fromHex('eefe3d61cd4da4e4e9945b3d6ba2158c2634e984'),
  )
  expect(await Password.verify('password', stored)).toBe(true)
})
