import * as Errors from '@portable/errors'
import { describe, expect, test } from 'vite-plus/test'

class CompressMaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Compress.MaxBytesError'
}

class ExifMaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Exif.MaxBytesError'
}

class Base64InvalidInputError extends Errors.InvalidInputError {
  static override readonly kind: string = 'Base64.InvalidInputError'
}

/** Builds an error from a different class with the same brand, as another copy of the package would. */
function fromAnotherCopy(kinds: readonly string[], fields: object = {}): Error {
  const error = Object.assign(new Error('from another copy'), fields)
  Object.defineProperty(error, Symbol.for('portable.error'), { value: kinds })
  error.name = kinds[0]!
  return error
}

describe('name', () => {
  test("is the kind of the error's class", () => {
    expect(new CompressMaxBytesError({ maxBytes: 1 }).name).toBe('Compress.MaxBytesError')
    expect(new Base64InvalidInputError('bad').name).toBe('Base64.InvalidInputError')
    expect(new Errors.TruncatedError().name).toBe('Truncated')
  })

  test('is the nearest kind when a subclass sets none', () => {
    class LocalError extends Base64InvalidInputError {}
    const error = new LocalError('bad')
    expect(error.name).toBe('Base64.InvalidInputError')
    expect(error).toBeInstanceOf(Errors.InvalidInputError)
    expect(Errors.is(error, 'InvalidInput')).toBe(true)
  })

  test('shows in the stack and in String(error)', () => {
    const error = new Base64InvalidInputError('bad input')
    expect(String(error)).toBe('Base64.InvalidInputError: bad input')
  })
})

describe('instanceof', () => {
  test('a base class matches errors of every package', () => {
    expect(new CompressMaxBytesError({ maxBytes: 1 })).toBeInstanceOf(Errors.MaxBytesError)
    expect(new ExifMaxBytesError({ maxBytes: 1 })).toBeInstanceOf(Errors.MaxBytesError)
    expect(new ExifMaxBytesError({ maxBytes: 1 })).toBeInstanceOf(Errors.BaseError)
    expect(new ExifMaxBytesError({ maxBytes: 1 })).toBeInstanceOf(Error)
  })

  test("a package's class matches only its own errors", () => {
    expect(new CompressMaxBytesError({ maxBytes: 1 })).not.toBeInstanceOf(ExifMaxBytesError)
    expect(new Errors.MaxBytesError({ maxBytes: 1 })).not.toBeInstanceOf(CompressMaxBytesError)
    expect(new Base64InvalidInputError('x')).not.toBeInstanceOf(Errors.MaxBytesError)
  })

  test('matches an error from another copy of the package', () => {
    const error = fromAnotherCopy(['Compress.MaxBytesError', 'MaxBytes', 'BaseError'])
    expect(error).toBeInstanceOf(CompressMaxBytesError)
    expect(error).toBeInstanceOf(Errors.MaxBytesError)
    expect(error).not.toBeInstanceOf(ExifMaxBytesError)
  })

  test('does not match values without the brand', () => {
    expect(new Error('x')).not.toBeInstanceOf(Errors.BaseError)
    expect({ name: 'Compress.MaxBytesError' }).not.toBeInstanceOf(CompressMaxBytesError)
    expect(null).not.toBeInstanceOf(Errors.BaseError)
  })
})

describe('is', () => {
  test('checks the kind across packages and copies', () => {
    expect(Errors.is(new CompressMaxBytesError({ maxBytes: 1 }), 'MaxBytes')).toBe(true)
    expect(Errors.is(fromAnotherCopy(['Exif.MaxBytesError', 'MaxBytes']), 'MaxBytes')).toBe(true)
    expect(Errors.is(new Base64InvalidInputError('x'), 'MaxBytes')).toBe(false)
    expect(Errors.is(new Error('x'), 'InvalidInput')).toBe(false)
    expect(Errors.is('MaxBytes', 'MaxBytes')).toBe(false)
  })

  test("narrows the type to the kind's class", () => {
    const error: unknown = new ExifMaxBytesError({ maxBytes: 8 })
    if (!Errors.is(error, 'MaxBytes')) throw new Error('expected MaxBytes')
    expect(error.maxBytes).toBe(8)
  })
})

test('the brand is not enumerable, so JSON and Object.keys leave it out', () => {
  const error = new CompressMaxBytesError({ maxBytes: 4 })
  expect(Object.keys(error)).toEqual(['maxBytes'])
  expect(JSON.stringify(error)).toBe('{"maxBytes":4}')
})

describe('fields', () => {
  test('MaxBytesError and MaxLengthError store the limit and default the message', () => {
    expect(new Errors.MaxBytesError({ maxBytes: 5 })).toMatchObject({
      maxBytes: 5,
      message: 'Exceeded maxBytes of 5.',
    })
    expect(new Errors.MaxLengthError({ maxLength: 2, message: 'Line too long.' })).toMatchObject({
      maxLength: 2,
      message: 'Line too long.',
    })
  })

  test('InvalidInputError and TruncatedError store the offset and the cause', () => {
    const cause = new Error('cause')
    expect(new Errors.InvalidInputError('bad', { offset: 3, cause })).toMatchObject({
      offset: 3,
      cause,
    })
    expect(new Errors.TruncatedError('short').offset).toBeUndefined()
  })

  test('ResponseError keeps the whole response', () => {
    const response = new Response('slow down', { status: 429, headers: { 'retry-after': '5' } })
    const error = new Errors.ResponseError({ response, body: 'slow down' })
    expect(error.status).toBe(429)
    expect(error.response.headers.get('retry-after')).toBe('5')
    expect(error.body).toBe('slow down')
    expect(error.message).toBe(' answered 429.')
  })
})
