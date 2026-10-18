export declare namespace QueryError {
  /**
   * The error codes of `node:dns`, so code that checks `error.code` works with either resolver.
   *
   * - `ENOTFOUND`: the name doesn't exist (NXDOMAIN).
   * - `ENODATA`: the name exists but has no records of the requested type.
   * - `ESERVFAIL`, `EREFUSED`, `ENOTIMP`, `EFORMERR`: every endpoint answered with that response code.
   * - `EBADRESP`: the response was malformed, truncated, for another question, or not HTTP 2xx.
   * - `ETIMEOUT`: no endpoint answered within `timeout`.
   * - `ECONNREFUSED`: `fetch` rejected, as it does when the network or the endpoint is down.
   * - `EBADNAME`: the name can't be written as a DNS name.
   * - `EINVAL`: `reverse` was given something that isn't an IP address.
   */
  type Code =
    | 'ENOTFOUND'
    | 'ENODATA'
    | 'ESERVFAIL'
    | 'EREFUSED'
    | 'ENOTIMP'
    | 'EFORMERR'
    | 'EBADRESP'
    | 'ETIMEOUT'
    | 'ECONNREFUSED'
    | 'EBADNAME'
    | 'EINVAL'
}

/**
 * Thrown when a lookup fails. `code`, `syscall`, `hostname` and `message` have the values
 * `node:dns/promises` gives them, such as `queryTxt ENOTFOUND example.com`. When the failure came
 * from `fetch` or the response, `cause` holds the original error.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns'
 *
 * const resolver = Dns.createResolver()
 * try {
 *   await resolver.resolveTxt('_dmarc.example.com')
 * } catch (error) {
 *   if (error instanceof Dns.QueryError && error.code === 'ENODATA') console.log('no DMARC record')
 * }
 * ```
 */
export class QueryError extends Error {
  override name = 'Dns.QueryError'
  readonly code: QueryError.Code
  /** The `node:dns` name of the operation, such as `queryTxt` or `getHostByAddr`. */
  readonly syscall: string
  /** The name or address the caller passed. */
  readonly hostname: string

  constructor(code: QueryError.Code, syscall: string, hostname: string, options?: ErrorOptions) {
    super(`${syscall} ${code} ${hostname}`, options)
    this.code = code
    this.syscall = syscall
    this.hostname = hostname
  }
}
