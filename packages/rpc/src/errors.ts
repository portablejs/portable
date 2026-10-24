import * as Errors from '@portable/errors'
import type { ErrorObject } from './types.js'

export declare namespace RemoteError {
  type Options = ErrorObject & ErrorOptions
}

/**
 * A JSON-RPC error. A client rejects with it when the remote answers with an error, and a method
 * throws it to send a chosen `code` and `data`. Any other error a method throws is sent with code
 * `-32603` and its `message`.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * const api = {
 *   user(id: string) {
 *     throw new Rpc.RemoteError({ code: 404, message: 'No such user', data: { id } })
 *   },
 * }
 *
 * try {
 *   await remote.user('x')
 * } catch (error) {
 *   if (error instanceof Rpc.RemoteError && error.code === 404) {
 *     return null
 *   }
 *   throw error
 * }
 * ```
 */
export class RemoteError extends Errors.BaseError {
  static override readonly kind: string = 'Rpc.RemoteError'
  /** The JSON-RPC error code, such as `-32601` for an unknown method. */
  readonly code: number
  /** The error's `data` member, if it had one. */
  readonly data: unknown
  constructor(options: RemoteError.Options) {
    const { code, message, data, ...rest } = options
    super(message, rest)
    this.code = code
    this.data = data
  }
}

/**
 * The error that waiting calls reject with when the transport closes or fails, or when an HTTP
 * request fails. `cause` holds the underlying error, which is an `Errors.ResponseError` for a failed HTTP response.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * try {
 *   await remote.save(doc)
 * } catch (error) {
 *   if (error instanceof Rpc.TransportError) {
 *     return retryLater(doc)
 *   }
 *   throw error
 * }
 * ```
 */
export class TransportError extends Errors.BaseError {
  static override readonly kind: string = 'Rpc.TransportError'
}
