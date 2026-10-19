/**
 * Thrown when the domain name, IP address or AS number can't be looked up as given, such as
 * `example..com`, `999.1.1.1` or `-1`. No request is sent.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * await Rdap.ip('not an address').catch((error) => error instanceof Rdap.InvalidInputError) // true
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'Rdap.InvalidInputError'
}

/**
 * Thrown when IANA's bootstrap files list no RDAP server for the query, as for `.de` domains, the
 * private range `10.0.0.0/8`, or a reserved AS number. The input is valid, and only the bootstrap
 * file was fetched.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * await Rdap.ip('10.0.0.1').catch((error) => error instanceof Rdap.UnsupportedError) // true
 * ```
 */
export class UnsupportedError extends Error {
  override name = 'Rdap.UnsupportedError'
}

/**
 * Thrown when the RDAP server answers 404 Not Found: the domain isn't registered, or no network
 * or AS number record covers the query.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * async function isRegistered(name: string) {
 *   try {
 *     await Rdap.domain(name, { follow: false })
 *     return true
 *   } catch (error) {
 *     if (error instanceof Rdap.NotFoundError) return false
 *     throw error
 *   }
 * }
 * ```
 */
export class NotFoundError extends Error {
  override name = 'Rdap.NotFoundError'
  /** The URL that answered 404. */
  readonly url: string

  constructor(url: string, options?: ErrorOptions) {
    super(`${url} answered 404 Not Found`, options)
    this.url = url
  }
}

/**
 * Thrown when an RDAP server or IANA answers with an HTTP error other than 404, or with a body that
 * isn't a JSON object of the expected class. When `fetch` rejects, the lookup rejects with the
 * same error.
 *
 * @example
 * ```ts
 * import * as Rdap from '@portable/rdap'
 *
 * try {
 *   await Rdap.domain('example.com')
 * } catch (error) {
 *   if (error instanceof Rdap.ResponseError && error.status === 429) console.log('rate limited')
 * }
 * ```
 */
export class ResponseError extends Error {
  override name = 'Rdap.ResponseError'
  /** The HTTP status. It is 200 when the body was the problem. */
  readonly status: number
  /** The URL that sent the response. */
  readonly url: string
  /** The parsed JSON body, such as an RDAP error object with `errorCode` and `title`, when there was one. */
  readonly body: unknown

  constructor(
    message: string,
    status: number,
    url: string,
    body?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.status = status
    this.url = url
    this.body = body
  }
}
