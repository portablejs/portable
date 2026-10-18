import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import * as Core from './core.js'

export { VerificationError, type Hmac, type Reason, type Scheme, type Secret } from './core.js'

export declare namespace verify {
  type Input = Core.verify.Input
  type Options = Omit<Core.verify.Options, 'hmac'> & {
    /** HMAC-SHA256. @default `@noble/hashes` HMAC-SHA256 */
    hmac?: Core.Hmac | undefined
  }
  type Result = Core.verify.Result
}

/**
 * Checks a webhook's signature and timestamp, and returns its body. A `Request`'s body is read,
 * so it can't be read again.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * export default {
 *   async fetch(request: Request, env: { STRIPE_WEBHOOK_SECRET: string }) {
 *     const { body } = await Webhooks.verify(request, {
 *       scheme: 'stripe',
 *       secret: env.STRIPE_WEBHOOK_SECRET,
 *     })
 *     const event = JSON.parse(body)
 *     return new Response(null, { status: 204 })
 *   },
 * }
 * ```
 *
 * @throws {VerificationError} When a header is missing or malformed, no signature matches, or
 * the timestamp is outside `tolerance`.
 * @throws {TypeError} When a secret is empty or not valid base64, or the body isn't a string or
 * `Uint8Array`.
 */
export function verify(input: verify.Input, options: verify.Options): Promise<verify.Result> {
  return Core.verify(input, { ...options, hmac: options.hmac ?? hmacSha256 })
}

export declare namespace sign {
  type Options = Omit<Core.sign.Options, 'hmac'> & {
    /** HMAC-SHA256. @default `@noble/hashes` HMAC-SHA256 */
    hmac?: Core.Hmac | undefined
  }
}

/**
 * Signs a body the way the provider does and returns the headers to send with it. Use it to test
 * a webhook handler, or to send Standard Webhooks.
 *
 * @example
 * ```ts
 * import * as Webhooks from '@portable/webhooks'
 *
 * const body = JSON.stringify({ id: 'evt_1', object: 'event' })
 * const headers = await Webhooks.sign(body, { scheme: 'stripe', secret: 'whsec_test' })
 * const request = new Request('https://example.com/webhooks', { method: 'POST', body, headers })
 * ```
 *
 * @throws {TypeError} When the secret is empty or not valid base64.
 */
export function sign(
  body: string | Uint8Array,
  options: sign.Options,
): Promise<Record<string, string>> {
  return Core.sign(body, { ...options, hmac: options.hmac ?? hmacSha256 })
}

const hmacSha256: Core.Hmac = (key, data) => hmac(sha256, key, data)
