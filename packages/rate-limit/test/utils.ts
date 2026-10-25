import { afterEach, beforeEach, vi } from 'vite-plus/test';
import * as RateLimit from '@portable/rate-limit';

export const start = Date.UTC(2026, 0, 1);

export function useClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

export function advance(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

export async function takeMany(
  limiter: RateLimit.Limiter,
  key: string,
  count: number,
  options?: RateLimit.Limiter.TakeOptions,
): Promise<boolean[]> {
  const allowed: boolean[] = [];
  for (let i = 0; i < count; i++) {
    allowed.push((await limiter.take(key, options)).allowed);
  }
  return allowed;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A memory store whose every call resolves after a random delay of up to `maxDelay` milliseconds. */
export function slowStore(seed: number, maxDelay = 3): RateLimit.Store {
  const store = RateLimit.memoryStore();
  let state = seed;
  const delay = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return sleep(Math.floor((state / 2 ** 31) * (maxDelay + 1)));
  };
  return {
    async get(key, options) {
      await delay();
      return store.get(key, options);
    },
    async set(key, value, options) {
      await delay();
      return store.set(key, value, options);
    },
  };
}
