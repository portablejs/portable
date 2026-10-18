import { pbkdf2 as nodePbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import pbkdf2 from 'pbkdf2'
import { expect, test } from 'vite-plus/test'
import * as Password from '@portable/password'

const pbkdf2Async = promisify(nodePbkdf2)
const password = 'correct horse battery staple'
const iterations = 600_000
const run = { time: 0, iterations: 10, warmupIterations: 1 }

test('hashes a password at 600,000 iterations within 25% of node:crypto pbkdf2', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/password', async () => {
      await Password.hash(password)
    }),
    bench('node:crypto pbkdf2', async () => {
      await pbkdf2Async(password, randomBytes(16), iterations, 32, 'sha256')
    }),
    bench('pbkdf2', async () => {
      await new Promise((resolve, reject) =>
        pbkdf2.pbkdf2(password, randomBytes(16), iterations, 32, 'sha256', (error, key) =>
          error ? reject(error) : resolve(key),
        ),
      )
    }),
    bench('crypto.subtle.deriveBits', async () => {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
      )
      const salt = crypto.getRandomValues(new Uint8Array(16))
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        key,
        256,
      )
    }),
    run,
  )
  expect(result.get('node:crypto pbkdf2')).not.toBeFasterThan(result.get('@portable/password'), {
    delta: 0.25,
  })
})

test('verifies a password at 600,000 iterations within 25% of node:crypto pbkdf2', async ({
  bench,
}) => {
  const stored = await Password.hash(password)
  const salt = randomBytes(16)
  const expected = await pbkdf2Async(password, salt, iterations, 32, 'sha256')
  const result = await bench.compare(
    bench('@portable/password', async () => {
      await Password.verify(password, stored)
    }),
    bench('node:crypto pbkdf2 and timingSafeEqual', async () => {
      timingSafeEqual(await pbkdf2Async(password, salt, iterations, 32, 'sha256'), expected)
    }),
    run,
  )
  expect(result.get('node:crypto pbkdf2 and timingSafeEqual')).not.toBeFasterThan(
    result.get('@portable/password'),
    { delta: 0.25 },
  )
})
