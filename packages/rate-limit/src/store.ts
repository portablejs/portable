/**
 * Where a limiter keeps one number per key. `get` returns the stored number, or `undefined` for a
 * missing or expired key. `set` writes `value` only if the key still holds `expected`, and returns
 * whether it wrote. Either method may return a promise.
 */
export type Store = {
  get(key: string, options: Store.GetOptions): Store.MaybePromise<number | undefined>
  set(key: string, value: number, options: Store.SetOptions): Store.MaybePromise<boolean>
}

export declare namespace Store {
  type MaybePromise<T> = T | Promise<T>
  type GetOptions = {
    signal?: AbortSignal | undefined
  }
  type SetOptions = {
    /** The value `get` returned. `undefined` means the key must be missing or expired. */
    expected: number | undefined
    /** Milliseconds after which the key may be deleted. A whole number of at least 1. */
    ttl: number
    signal?: AbortSignal | undefined
  }
}

/**
 * Creates a store that keeps keys in a `Map` in this isolate or process. Expired keys are deleted
 * when read, and all of them whenever the map has doubled in size since the last sweep.
 *
 * @example
 * ```ts
 * import * as RateLimit from '@portable/rate-limit'
 *
 * const store = RateLimit.memoryStore()
 * const perMinute = RateLimit.create({ limit: 100, period: 60_000, store })
 * ```
 */
export function memoryStore(): {
  get(key: string, options?: Store.GetOptions): number | undefined
  set(key: string, value: number, options: Store.SetOptions): boolean
} {
  const entries = new Map<string, { value: number; expiresAt: number }>()
  let sweepAt = 1024

  const get = (key: string): number | undefined => {
    const entry = entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt > Date.now()) return entry.value
    entries.delete(key)
    return undefined
  }

  return {
    get,
    set(key: string, value: number, { expected, ttl }: Store.SetOptions) {
      if (get(key) !== expected) return false
      const now = Date.now()
      entries.set(key, { value, expiresAt: now + ttl })
      if (entries.size >= sweepAt) {
        for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key)
        sweepAt = Math.max(1024, entries.size * 2)
      }
      return true
    },
  }
}
