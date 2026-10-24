import * as Errors from '@portable/errors'

/**
 * Thrown when a line grows past `maxLength` and `overflow` is `'error'`.
 *
 * @example
 * ```ts
 * import * as Lines from '@portable/lines'
 *
 * const reader = response.body!.pipeThrough(new Lines.DecoderStream({ maxLength: 10_000 })).getReader()
 * try {
 *   for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value)
 * } catch (error) {
 *   if (error instanceof Lines.MaxLengthError) console.log(`a line exceeded ${error.maxLength}`)
 * }
 * ```
 */
export class MaxLengthError extends Errors.MaxLengthError {
  static override readonly kind: string = 'Lines.MaxLengthError'
  constructor(options: Errors.MaxLengthError.Options) {
    super({ message: `Line exceeded maxLength of ${options.maxLength}.`, ...options })
  }
}
