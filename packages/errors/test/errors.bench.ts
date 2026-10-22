import * as Errors from '@portable/errors'
import { expect, test } from 'vite-plus/test'

class CompressMaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Compress.MaxBytesError'
}

class PlainError extends Error {
  override name = 'PlainError'
}

const branded = new CompressMaxBytesError({ maxBytes: 1 })
const plain = new PlainError('x')

test('constructs an error, compared with a plain Error subclass', async ({ bench }) => {
  expect(new CompressMaxBytesError({ maxBytes: 1 }).name).toBe('Compress.MaxBytesError')
  await bench.compare(
    bench('@portable/errors', () => {
      new CompressMaxBytesError({ maxBytes: 1 })
    }),
    bench('Error subclass', () => {
      new PlainError('Exceeded maxBytes of 1.')
    }),
  )
})

test('checks an error, compared with native instanceof', async ({ bench }) => {
  expect(Errors.is(branded, 'MaxBytes') && branded instanceof CompressMaxBytesError).toBe(true)
  await bench.compare(
    bench('Errors.is', () => {
      Errors.is(branded, 'MaxBytes')
    }),
    bench('instanceof a package class', () => {
      void (branded instanceof CompressMaxBytesError)
    }),
    bench('native instanceof', () => {
      void (plain instanceof PlainError)
    }),
  )
})
