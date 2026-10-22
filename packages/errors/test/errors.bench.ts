import * as Errors from '@portable/errors'
import { test } from 'vite-plus/test'

class CompressMaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Compress.MaxBytesError'
}

class PlainError extends Error {
  override name = 'PlainError'
}

const branded = new CompressMaxBytesError({ maxBytes: 1 })
const plain = new PlainError('x')

test('constructs an error, compared with a plain Error subclass', async ({ bench }) => {
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
