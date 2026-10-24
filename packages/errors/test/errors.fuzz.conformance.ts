import * as Errors from '@portable/errors'
import { fc, fuzz } from '@portable/fuzz'
import { test } from 'vite-plus/test'

const kinds = [
  'InvalidInput',
  'Truncated',
  'Unsupported',
  'MaxBytes',
  'MaxLength',
  'Response',
] as const

test('is and instanceof return false without throwing for any value', () => {
  fuzz(
    fc.property(fc.anything(), fc.constantFrom(...kinds), (value, kind) => {
      if (Errors.is(value, kind)) {
        throw new Error('matched a value without the brand')
      }
      if (value instanceof Errors.BaseError) {
        throw new Error('instanceof matched')
      }
    }),
  )
})

test('every kind of error an error carries is matched by is', () => {
  fuzz(
    fc.property(fc.array(fc.string()), fc.constantFrom(...kinds), (extra, kind) => {
      const error = Object.defineProperty(new Error(), Symbol.for('portable.error'), {
        value: [...extra, kind],
      })
      if (!Errors.is(error, kind)) {
        throw new Error('missed the kind')
      }
    }),
  )
})
