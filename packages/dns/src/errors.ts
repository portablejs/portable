import * as Errors from '@portable/errors';
export declare namespace QueryError {
  /**
   * The error codes of `node:dns`, so a check of `error.code` works with either resolver.
   * When every endpoint fails, the code describes the last endpoint's failure.
   *
   * - `ENOTFOUND`: the name doesn't exist (NXDOMAIN).
   * - `ENODATA`: the name exists but has no records of the requested type.
   * - `ESERVFAIL`, `EREFUSED`, `ENOTIMP`, `EFORMERR`: the endpoint answered with that response code.
   * - `EBADRESP`: the response was malformed, truncated, for another question, not HTTP 2xx, or had
   *   another response code.
   * - `ETIMEOUT`: the endpoint didn't answer within `timeout`.
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
    | 'EINVAL';

  type Options = ErrorOptions & {
    code: Code;
    /** The `node:dns` name of the operation. */
    syscall: string;
    /** The name or address the caller passed. */
    hostname: string;
  };
}

/**
 * Thrown when a lookup fails. `code`, `syscall`, `hostname`, and `message` have the values
 * `node:dns/promises` gives them, such as `queryTxt ENOTFOUND example.com`. When the failure came
 * from `fetch` or the response, `cause` holds the original error.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns';
 *
 * const resolver = Dns.create();
 * try {
 *   await resolver.resolveTxt('_dmarc.example.com');
 * } catch (error) {
 *   if (error instanceof Dns.QueryError && error.code === 'ENODATA') {
 *     console.log('no DMARC record');
 *   }
 * }
 * ```
 */
export class QueryError extends Errors.BaseError {
  static override readonly kind: string = 'Dns.QueryError';
  readonly code: QueryError.Code;
  /** The `node:dns` name of the operation, such as `queryTxt` or `getHostByAddr`. */
  readonly syscall: string;
  /** The name or address the caller passed. */
  readonly hostname: string;

  constructor(options: QueryError.Options) {
    const { code, syscall, hostname, ...rest } = options;
    super(`${syscall} ${code} ${hostname}`, rest);
    this.code = code;
    this.syscall = syscall;
    this.hostname = hostname;
  }
}

const notFoundCodes = new Set(['ENOTFOUND', 'ENODATA', 'EBADNAME']);

/**
 * Whether a lookup failed because there are no records to return: the name doesn't exist
 * (`ENOTFOUND`), has no records of the type (`ENODATA`), or can't be a DNS name (`EBADNAME`). It
 * reads `code`, so it works for a `QueryError` from any copy of this package and for errors from
 * `node:dns/promises`. Any other failure is temporary and can be retried.
 *
 * @example
 * ```ts
 * import * as Dns from '@portable/dns';
 *
 * const resolver = Dns.create();
 * const records = await resolver.resolveTxt('_dmarc.example.com').catch((error) => {
 *   if (Dns.isNotFound(error)) {
 *     return [];
 *   }
 *   throw error;
 * });
 * ```
 */
export function isNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && notFoundCodes.has(code);
}
