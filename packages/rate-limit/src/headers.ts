import type { Instant } from '@portable/timers';
import { toDate } from '@portable/timers/internal';
import type { Result } from './create.js';

export declare namespace headers {
  type Options = {
    /** The quota policy name in both fields. Must be printable ASCII, or `headers` throws a `RangeError`. @default 'default' */
    name?: string | undefined;
    /**
     * The time `resetAt` is counted from, as a `Date` or a `Temporal.Instant`.
     * @default new Date()
     */
    now?: Instant | undefined;
  };
}

/**
 * Returns the `RateLimit` and `RateLimit-Policy` fields of draft-ietf-httpapi-ratelimit-headers-11
 * for a result, and `Retry-After` when the request was denied. Times are whole seconds, rounded up.
 *
 * @example
 * ```ts
 * import * as RateLimit from '@portable/rate-limit';
 *
 * const result = await limiter.take(ip);
 * if (!result.allowed) {
 *   return new Response(null, { status: 429, headers: RateLimit.headers(result) });
 * }
 * // RateLimit-Policy: "default";q=100;w=60
 * // RateLimit: "default";r=0;t=1
 * // Retry-After: 1
 * ```
 */
export function headers(result: Result, options: headers.Options = {}): Record<string, string> {
  const { name = 'default' } = options;
  const now = toDate(options.now);
  if (!/^[\x20-\x7e]*$/.test(name)) {
    throw new RangeError(`\`name\` must be printable ASCII, got ${JSON.stringify(name)}.`);
  }
  const item = `"${name.replaceAll(/["\\]/g, '\\$&')}"`;
  const retry = !result.allowed && Number.isFinite(result.retryAfter);
  const window = retry ? result.retryAfter : result.resetAt.getTime() - now.getTime();
  const fields: Record<string, string> = {
    'RateLimit-Policy': `${item};q=${result.limit};w=${seconds(result.period)}`,
    RateLimit: `${item};r=${result.remaining};t=${seconds(window)}`,
  };
  if (retry) {
    fields['Retry-After'] = String(seconds(result.retryAfter));
  }
  return fields;
}

const seconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));
