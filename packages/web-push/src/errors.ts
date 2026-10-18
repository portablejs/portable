/**
 * Thrown when a subscription can't be used: its endpoint isn't an `https:` URL, `p256dh` isn't a P-256
 * public key, or `auth` isn't 16 bytes. Subscriptions come from browsers, so delete one that
 * fails this way.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push'
 *
 * try {
 *   await WebPush.send(subscription, 'hello', { vapid })
 * } catch (error) {
 *   if (error instanceof WebPush.InvalidInputError) await deleteSubscription(subscription)
 *   else throw error
 * }
 * ```
 */
export class InvalidInputError extends Error {
  override name = 'WebPush.InvalidInputError'
}

/**
 * Thrown by `send` when the push service answers with a status other than 2xx, 404 or 410, such
 * as 400 for a bad VAPID token, 413 for a payload that is too large, or 429 when rate limited.
 *
 * @example
 * ```ts
 * import * as WebPush from '@portable/web-push'
 *
 * try {
 *   await WebPush.send(subscription, 'hello', { vapid })
 * } catch (error) {
 *   if (error instanceof WebPush.ResponseError && error.status === 429)
 *     retryAfter(error.headers.get('retry-after'))
 *   else throw error
 * }
 * ```
 */
export class ResponseError extends Error {
  override name = 'WebPush.ResponseError'
  /** The HTTP status code. */
  readonly status: number
  /** The response headers. */
  readonly headers: Headers
  /** The response body as text. Push services usually explain the error in it. */
  readonly body: string

  constructor(status: number, headers: Headers, body: string) {
    super(`Push service responded with ${status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    this.status = status
    this.headers = headers
    this.body = body
  }
}
