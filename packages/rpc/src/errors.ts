import type { ErrorObject } from './types.js'

export declare namespace RemoteError {
  type Options = ErrorObject
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
 *   if (error instanceof Rpc.RemoteError && error.code === 404) return null
 *   throw error
 * }
 * ```
 */
export class RemoteError extends Error {
  override name = 'Rpc.RemoteError'
  /** The JSON-RPC error code, such as `-32601` for an unknown method. */
  readonly code: number
  /** The error's `data` member, if it had one. */
  readonly data: unknown
  constructor(error: RemoteError.Options) {
    super(error.message)
    this.code = error.code
    this.data = error.data
  }
}

/**
 * Rejects calls that were waiting when the transport closed or failed, or when an HTTP request
 * failed. `cause` holds the underlying error or the failed `Response`.
 *
 * @example
 * ```ts
 * import * as Rpc from '@portable/rpc'
 *
 * try {
 *   await remote.save(doc)
 * } catch (error) {
 *   if (error instanceof Rpc.TransportError) return retryLater(doc)
 *   throw error
 * }
 * ```
 */
export class TransportError extends Error {
  override name = 'Rpc.TransportError'
}
