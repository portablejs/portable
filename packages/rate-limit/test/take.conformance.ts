import { describe, expect, test } from 'vite-plus/test';
import * as RateLimit from '@portable/rate-limit';
import { advance, start, takeMany, useClock } from './utils.js';

useClock();

describe('take', () => {
  test('allows limit requests, then denies', async () => {
    const limiter = RateLimit.create({ limit: 3, period: 1000 });
    expect(await takeMany(limiter, 'a', 4)).toEqual([true, true, true, false]);
  });

  test('counts remaining down to 0', async () => {
    const limiter = RateLimit.create({ limit: 3, period: 1000 });
    const remaining = [];
    for (let i = 0; i < 4; i++) {
      remaining.push((await limiter.take('a')).remaining);
    }
    expect(remaining).toEqual([2, 1, 0, 0]);
  });

  test('returns the full result for an allowed request', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    expect(await limiter.take('a')).toEqual({
      allowed: true,
      limit: 10,
      period: 1000,
      remaining: 9,
      resetAt: new Date(start + 100),
      retryAfter: 0,
    });
  });

  test('returns the time until the next request fits for a denied request', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 1000 });
    await takeMany(limiter, 'a', 2);
    advance(200);
    expect(await limiter.take('a')).toEqual({
      allowed: false,
      limit: 2,
      period: 1000,
      remaining: 0,
      resetAt: new Date(start + 1000),
      retryAfter: 300,
    });
  });

  test('allows the request once retryAfter has passed, and not a millisecond sooner', async () => {
    const limiter = RateLimit.create({ limit: 5, period: 1000 });
    await takeMany(limiter, 'a', 5);
    const { retryAfter } = await limiter.take('a');
    advance(retryAfter - 1);
    expect((await limiter.take('a')).allowed).toBe(false);
    advance(1);
    expect((await limiter.take('a')).allowed).toBe(true);
  });

  test('a denied request consumes nothing', async () => {
    const limiter = RateLimit.create({ limit: 1, period: 1000 });
    await limiter.take('a');
    await takeMany(limiter, 'a', 50);
    advance(1000);
    expect((await limiter.take('a')).allowed).toBe(true);
  });

  test('gives allowance back continuously, one request per period / limit', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    await takeMany(limiter, 'a', 10);
    advance(99);
    expect((await limiter.take('a')).allowed).toBe(false);
    advance(1);
    expect(await takeMany(limiter, 'a', 2)).toEqual([true, false]);
    advance(300);
    expect(await takeMany(limiter, 'a', 4)).toEqual([true, true, true, false]);
  });

  test('never holds more than burst after a long idle time', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    advance(5000);
    await takeMany(limiter, 'a', 10);
    advance(2000);
    expect(await takeMany(limiter, 'a', 11)).toEqual([...Array(10).fill(true), false]);
  });

  test('allows no second burst across what would be a fixed-window boundary', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    advance(999);
    await takeMany(limiter, 'a', 10);
    advance(1);
    expect((await limiter.take('a')).allowed).toBe(false);
  });

  test('starts each key with a full allowance', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 60_000 });
    expect((await limiter.take('new')).remaining).toBe(1);
  });

  test('keeps keys apart', async () => {
    const limiter = RateLimit.create({ limit: 1, period: 1000 });
    expect((await limiter.take('a')).allowed).toBe(true);
    expect((await limiter.take('b')).allowed).toBe(true);
    expect((await limiter.take('a')).allowed).toBe(false);
  });

  test('counts from the now option instead of the clock', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 1000 });
    const now = new Date(Date.UTC(2030, 0, 1));
    await takeMany(limiter, 'a', 2);
    expect((await limiter.take('b', { now })).resetAt).toEqual(new Date(now.getTime() + 500));
    expect((await limiter.take('a', { now })).allowed).toBe(true);
    await expect(limiter.take('a', { now: new Date(Number.NaN) })).rejects.toThrow(RangeError);
  });

  test('takes now as an object with epochMilliseconds, such as a Temporal.Instant', async () => {
    const run = async (now: RateLimit.Limiter.TakeOptions['now']) => {
      const limiter = RateLimit.create({ limit: 2, period: 1000 });
      return [
        await limiter.take('a', { now }),
        await limiter.take('a', { now }),
        await limiter.take('a', { now }),
      ];
    };
    const epochMilliseconds = Date.UTC(2030, 0, 1);
    expect(await run({ epochMilliseconds })).toEqual(await run(new Date(epochMilliseconds)));
    await expect(run({ epochMilliseconds: Number.NaN })).rejects.toThrow(RangeError);
  });

  test('resetAt is when the allowance is full again', async () => {
    const limiter = RateLimit.create({ limit: 4, period: 1000 });
    await takeMany(limiter, 'a', 3);
    const { resetAt } = await limiter.take('a', { cost: 0 });
    expect(resetAt).toEqual(new Date(start + 750));
    advance(749);
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(3);
    advance(1);
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(4);
  });

  test('allows exactly limit requests in one millisecond when period / limit is not a whole number', async () => {
    for (const period of [100, 1000, 60_000]) {
      for (let limit = 1; limit <= 64; limit++) {
        const limiter = RateLimit.create({ limit, period });
        const allowed = await takeMany(limiter, `${limit}/${period}`, limit + 1);
        expect(allowed.filter(Boolean)).toHaveLength(limit);
        expect(allowed.at(-1)).toBe(false);
      }
    }
  });

  test('allows limit requests in every period over many periods', async () => {
    const limiter = RateLimit.create({ limit: 3, period: 1000 });
    for (let period = 0; period < 100; period++) {
      expect(await takeMany(limiter, 'a', 4)).toEqual([true, true, true, false]);
      advance(1000);
    }
  });
});

describe('cost', () => {
  test('takes cost from the allowance', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    expect((await limiter.take('a', { cost: 4 })).remaining).toBe(6);
    expect((await limiter.take('a', { cost: 6 })).remaining).toBe(0);
    expect((await limiter.take('a', { cost: 1 })).allowed).toBe(false);
  });

  test('denies a cost larger than what remains, and reports what remains', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000 });
    await limiter.take('a', { cost: 7 });
    const result = await limiter.take('a', { cost: 5 });
    expect(result).toMatchObject({ allowed: false, remaining: 3, retryAfter: 200 });
    expect((await limiter.take('a', { cost: 3 })).allowed).toBe(true);
  });

  test('denies a cost larger than burst forever', async () => {
    const limiter = RateLimit.create({ limit: 5, period: 1000 });
    const result = await limiter.take('a', { cost: 6 });
    expect(result).toMatchObject({ allowed: false, remaining: 5, retryAfter: Infinity });
    expect((await limiter.take('a', { cost: 5 })).allowed).toBe(true);
  });

  test('accepts fractional costs', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 1000 });
    expect(await takeMany(limiter, 'a', 5, { cost: 0.5 })).toEqual([true, true, true, true, false]);
  });

  test('a cost of 0 reads the state without changing it', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 1000 });
    await limiter.take('a');
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(1);
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(1);
    expect(await takeMany(limiter, 'a', 2)).toEqual([true, false]);
  });

  test('a negative cost gives allowance back, up to burst', async () => {
    const limiter = RateLimit.create({ limit: 3, period: 1000 });
    await takeMany(limiter, 'a', 3);
    expect((await limiter.take('a', { cost: -1 })).remaining).toBe(1);
    expect((await limiter.take('a', { cost: -100 })).remaining).toBe(3);
    expect(await takeMany(limiter, 'a', 4)).toEqual([true, true, true, false]);
  });

  test.each([NaN, Infinity, -Infinity])('throws a RangeError for cost %s', async (cost) => {
    const limiter = RateLimit.create({ limit: 3, period: 1000 });
    await expect(limiter.take('a', { cost })).rejects.toThrow(RangeError);
    expect((await limiter.take('a', { cost: 0 })).remaining).toBe(3);
  });
});

describe('burst', () => {
  test('allows burst requests at once, then limit per period', async () => {
    const limiter = RateLimit.create({ limit: 1, period: 1000, burst: 5 });
    expect(await takeMany(limiter, 'a', 6)).toEqual([true, true, true, true, true, false]);
    advance(1000);
    expect(await takeMany(limiter, 'a', 2)).toEqual([true, false]);
  });

  test('burst 1 spaces requests period / limit apart', async () => {
    const limiter = RateLimit.create({ limit: 4, period: 1000, burst: 1 });
    expect(await takeMany(limiter, 'a', 2)).toEqual([true, false]);
    advance(249);
    expect((await limiter.take('a')).allowed).toBe(false);
    advance(1);
    expect((await limiter.take('a')).allowed).toBe(true);
  });

  test('remaining counts from burst', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 1000, burst: 20 });
    expect((await limiter.take('a')).remaining).toBe(19);
  });
});

describe('options', () => {
  test.each([0, -1, 1.5, NaN, Infinity, '10' as unknown as number])(
    'throws a RangeError for limit %s',
    (limit) => {
      expect(() => RateLimit.create({ limit, period: 1000 })).toThrow(RangeError);
    },
  );

  test.each([0, -1, NaN, Infinity, '1000' as unknown as number])(
    'throws a RangeError for period %s',
    (period) => {
      expect(() => RateLimit.create({ limit: 1, period })).toThrow(RangeError);
    },
  );

  test.each([0, -1, 2.5, NaN])('throws a RangeError for burst %s', (burst) => {
    expect(() => RateLimit.create({ limit: 1, period: 1000, burst })).toThrow(RangeError);
  });

  test('accepts a fractional period', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 2.5 });
    expect(await takeMany(limiter, 'a', 3)).toEqual([true, true, false]);
    advance(2);
    expect(await takeMany(limiter, 'a', 2)).toEqual([true, false]);
  });
});

describe('signal', () => {
  test('rejects with the reason of an aborted signal and consumes nothing', async () => {
    const limiter = RateLimit.create({ limit: 1, period: 1000 });
    const reason = new Error('stop');
    await expect(limiter.take('a', { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    expect((await limiter.take('a')).allowed).toBe(true);
  });

  test('passes the signal to the store', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const memory = RateLimit.memoryStore();
    const store = {
      get: (key, options) => (signals.push(options.signal), memory.get(key, options)),
      set: (key, value, options) => (signals.push(options.signal), memory.set(key, value, options)),
    } satisfies RateLimit.Store;
    const { signal } = new AbortController();
    await RateLimit.create({ limit: 1, period: 1000, store }).take('a', { signal });
    expect(signals).toEqual([signal, signal]);
  });

  test('rejects when the signal aborts during a store read, before writing', async () => {
    const controller = new AbortController();
    let writes = 0;
    const store = {
      get: () => (controller.abort(new Error('gone')), undefined),
      set: () => (writes++, true),
    } satisfies RateLimit.Store;
    const limiter = RateLimit.create({ limit: 1, period: 1000, store });
    await expect(limiter.take('a', { signal: controller.signal })).rejects.toThrow('gone');
    expect(writes).toBe(0);
  });
});
