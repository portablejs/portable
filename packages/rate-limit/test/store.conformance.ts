import { describe, expect, test } from 'vite-plus/test';
import * as RateLimit from '@portable/rate-limit';
import { advance, slowStore, useClock } from './utils.js';

useClock();

describe('concurrent takes', () => {
  test.each([1, 2, 3, 4])('allow exactly limit of 100 racing takes (seed %i)', async (seed) => {
    const limiter = RateLimit.create({ limit: 10, period: 60_000, store: slowStore(seed) });
    const results = await Promise.all(Array.from({ length: 100 }, () => limiter.take('a')));
    const allowed = results.filter((result) => result.allowed);
    expect(allowed).toHaveLength(10);
    expect(allowed.map((result) => result.remaining).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(0);
  });

  test('two limiters on one store share the allowance', async () => {
    const store = slowStore(5);
    const a = RateLimit.create({ limit: 5, period: 1000, store });
    const b = RateLimit.create({ limit: 5, period: 1000, store });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).take('shared')),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  test('retry a take whose compare-and-set lost, and decide again on the new value', async () => {
    const memory = RateLimit.memoryStore();
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    const store = {
      async get(key, options) {
        const value = memory.get(key, options);
        if (++reads === 2) {
          release();
        }
        if (reads <= 2) {
          await bothRead;
        }
        return value;
      },
      set: (key, value, options) => memory.set(key, value, options),
    } satisfies RateLimit.Store;
    const limiter = RateLimit.create({ limit: 1, period: 1000, store });
    const [first, second] = await Promise.all([limiter.take('a'), limiter.take('a')]);
    expect([first.allowed, second.allowed]).toContain(true);
    expect([first.allowed, second.allowed]).toContain(false);
    expect(reads).toBe(3);
  });

  test('a store without compare-and-set allows more than limit under races', async () => {
    const memory = RateLimit.memoryStore();
    const store = {
      get: async (key, options) => memory.get(key, options),
      set: async (key, value, options) => {
        await Promise.resolve();
        return memory.set(key, value, { ...options, expected: memory.get(key, options) });
      },
    } satisfies RateLimit.Store;
    const limiter = RateLimit.create({ limit: 2, period: 1000, store });
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.take('a')));
    expect(results.filter((result) => result.allowed).length).toBeGreaterThan(2);
  });
});

describe('store errors', () => {
  test('reject take with the error from get', async () => {
    const error = new Error('down');
    const store = {
      get: () => Promise.reject(error),
      set: () => true,
    } satisfies RateLimit.Store;
    await expect(RateLimit.create({ limit: 1, period: 1000, store }).take('a')).rejects.toBe(error);
  });

  test('reject take with the error from set', async () => {
    const error = new Error('down');
    const store = {
      get: () => undefined,
      set: () => Promise.reject(error),
    } satisfies RateLimit.Store;
    await expect(RateLimit.create({ limit: 1, period: 1000, store }).take('a')).rejects.toBe(error);
  });
});

describe('what take writes', () => {
  test('a ttl after which the key holds a full allowance', async () => {
    const writes: RateLimit.Store.SetOptions[] = [];
    const memory = RateLimit.memoryStore();
    const store = {
      get: (key, options) => memory.get(key, options),
      set: (key, value, options) => (writes.push(options), memory.set(key, value, options)),
    } satisfies RateLimit.Store;
    const limiter = RateLimit.create({ limit: 3, period: 1000, store });
    await limiter.take('a');
    await limiter.take('a');
    expect(writes.map((write) => write.ttl)).toEqual([334, 667]);
    advance(667);
    expect(store.get('a', {})).toBeUndefined();
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(3);
  });

  test('nothing for a denied take or a cost of 0', async () => {
    let writes = 0;
    const memory = RateLimit.memoryStore();
    const store = {
      get: (key, options) => memory.get(key, options),
      set: (key, value, options) => (writes++, memory.set(key, value, options)),
    } satisfies RateLimit.Store;
    const limiter = RateLimit.create({ limit: 1, period: 1000, store });
    await limiter.take('a');
    await limiter.take('a');
    await limiter.take('a', { cost: 0 });
    await limiter.take('b', { cost: 0 });
    expect(writes).toBe(1);
  });
});

describe('memoryStore', () => {
  test('returns undefined for a missing key', () => {
    expect(RateLimit.memoryStore().get('a', {})).toBeUndefined();
  });

  test('writes only when the key holds the expected value', () => {
    const store = RateLimit.memoryStore();
    expect(store.set('a', 1, { expected: undefined, ttl: 1000 })).toBe(true);
    expect(store.set('a', 2, { expected: undefined, ttl: 1000 })).toBe(false);
    expect(store.set('a', 2, { expected: 3, ttl: 1000 })).toBe(false);
    expect(store.set('a', 2, { expected: 1, ttl: 1000 })).toBe(true);
    expect(store.get('a', {})).toBe(2);
  });

  test('treats an expired key as missing', () => {
    const store = RateLimit.memoryStore();
    store.set('a', 1, { expected: undefined, ttl: 100 });
    advance(99);
    expect(store.get('a', {})).toBe(1);
    advance(1);
    expect(store.get('a', {})).toBeUndefined();
    expect(store.set('a', 5, { expected: undefined, ttl: 100 })).toBe(true);
  });

  test('expires keys by the now option instead of the clock', () => {
    const store = RateLimit.memoryStore();
    const start = new Date('2030-01-01T00:00:00Z');
    store.set('a', 1, { expected: undefined, ttl: 100, now: start });
    expect(store.get('a', { now: new Date(start.getTime() + 99) })).toBe(1);
    expect(store.get('a', { now: new Date(start.getTime() + 100) })).toBeUndefined();
  });

  test('follows the now that take passes to it', async () => {
    const limiter = RateLimit.create({ limit: 1, period: 1000, store: RateLimit.memoryStore() });
    const start = new Date('2030-01-01T00:00:00Z');
    expect((await limiter.take('a', { now: start })).allowed).toBe(true);
    expect((await limiter.take('a', { now: start })).allowed).toBe(false);
    expect((await limiter.take('a', { now: new Date(start.getTime() + 1000) })).allowed).toBe(true);
  });

  test('keeps live keys while sweeping expired ones', () => {
    const store = RateLimit.memoryStore();
    for (let i = 0; i < 1000; i++) {
      store.set(`old${i}`, i, { expected: undefined, ttl: 10 });
    }
    store.set('live', 1, { expected: undefined, ttl: 1_000_000 });
    advance(10);
    for (let i = 0; i < 5000; i++) {
      store.set(`new${i}`, i, { expected: undefined, ttl: 1000 });
    }
    expect(store.get('live', {})).toBe(1);
    expect(store.get('new4999', {})).toBe(4999);
    expect(store.get('old0', {})).toBeUndefined();
  });
});
