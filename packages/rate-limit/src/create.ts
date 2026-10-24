import { memoryStore, type Store } from './store.js';

/** The outcome of `take`. Durations are milliseconds. */
export type Result = {
  /** Whether the request fits in the limit. A denied request consumes nothing. */
  allowed: boolean;
  /** The `limit` the limiter was created with. */
  limit: number;
  /** The `period` the limiter was created with. */
  period: number;
  /** How many more requests of cost 1 would be allowed right now. */
  remaining: number;
  /** When `remaining` is back to `burst`. */
  resetAt: Date;
  /** How long to wait before the same request would be allowed. `0` when allowed, `Infinity` when `cost` exceeds `burst`. */
  retryAfter: number;
};

/** The limiter that `create` returns. */
export type Limiter = {
  /** Takes `cost` from the key's allowance if it has that much left. */
  take(key: string, options?: Limiter.TakeOptions): Promise<Result>;
};

export declare namespace Limiter {
  type TakeOptions = {
    /** How much of the allowance this request uses. `0` reads the state without changing it, and a negative cost gives allowance back. @default 1 */
    cost?: number | undefined;
    /** The time of the request. @default new Date() */
    now?: Date | undefined;
    signal?: AbortSignal | undefined;
  };
}

export declare namespace create {
  type Options = {
    /** Requests allowed per `period`, on average. */
    limit: number;
    /** Length of the period in milliseconds. */
    period: number;
    /** Requests allowed at once after an idle period. @default limit */
    burst?: number | undefined;
    /** Where the limiter keeps one number per key. @default RateLimit.memoryStore() */
    store?: Store | undefined;
  };
}

/**
 * Creates a rate limiter that allows `limit` requests per `period` for each key, with the generic
 * cell rate algorithm (GCRA). Allowance comes back continuously, one request every
 * `period / limit` milliseconds, up to `burst`.
 *
 * @example
 * ```ts
 * import * as RateLimit from '@portable/rate-limit';
 *
 * const limiter = RateLimit.create({ limit: 100, period: 60_000 });
 *
 * export default {
 *   async fetch(request: Request) {
 *     const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
 *     const result = await limiter.take(ip, { signal: request.signal });
 *     if (!result.allowed) {
 *       return new Response(null, { status: 429, headers: RateLimit.headers(result) });
 *     }
 *     return new Response('ok', { headers: RateLimit.headers(result) });
 *   },
 * };
 * ```
 */
export function create(options: create.Options): Limiter {
  const { limit, period, burst = limit, store = memoryStore() } = options;
  assertPositiveInteger('limit', limit);
  assertPositiveInteger('burst', burst);
  if (!(period > 0 && Number.isFinite(period))) {
    throw new RangeError(`\`period\` must be a number of milliseconds above 0, got ${period}.`);
  }

  const interval = period / limit;
  // Allows for float rounding in sums of an inexact `interval` at Unix-time magnitudes, so that
  // `burst` requests in the same millisecond are all allowed.
  const tolerance = burst * interval + Math.min(0.01, interval / 2);

  return {
    async take(key, options = {}) {
      const { cost = 1, signal } = options;
      const time = options.now?.getTime() ?? Date.now();
      if (!Number.isFinite(time)) {
        throw new RangeError('`now` must be a valid Date.');
      }
      if (!Number.isFinite(cost)) {
        throw new RangeError(`\`cost\` must be a finite number, got ${cost}.`);
      }
      for (;;) {
        signal?.throwIfAborted();
        const read = store.get(key, { now: new Date(time), signal });
        const stored = typeof read === 'object' ? await read : read;
        const now = time;
        const base = stored === undefined ? now : Math.max(stored, now);
        const remaining = Math.max(0, Math.floor((now + tolerance - base) / interval));
        const arrival = Math.max(now, base + cost * interval);
        const wait = arrival - tolerance - now;
        if (wait > 0) {
          return {
            allowed: false,
            limit,
            period,
            remaining,
            resetAt: new Date(Math.ceil(base)),
            retryAfter: cost > burst ? Infinity : Math.ceil(wait),
          };
        }
        const result = {
          allowed: true,
          limit,
          period,
          remaining: Math.floor((now + tolerance - arrival) / interval),
          resetAt: new Date(Math.ceil(arrival)),
          retryAfter: 0,
        };
        if (arrival === base) {
          return result;
        }
        signal?.throwIfAborted();
        const ttl = Math.max(1, Math.ceil(arrival - now));
        const written = store.set(key, arrival, {
          expected: stored,
          ttl,
          now: new Date(time),
          signal,
        });
        if (typeof written === 'object' ? await written : written) {
          return result;
        }
      }
    },
  };
}

function assertPositiveInteger(name: string, value: number) {
  if (!(Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError(`\`${name}\` must be a positive integer, got ${value}.`);
  }
}
