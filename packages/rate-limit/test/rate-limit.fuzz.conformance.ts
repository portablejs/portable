import { fc, fuzz } from '@portable/fuzz';
import * as RateLimit from '@portable/rate-limit';
import { expect, test } from 'vite-plus/test';

const config = fc.record({
  limit: fc.integer({ min: 1, max: 20 }),
  period: fc.integer({ min: 1, max: 100_000 }),
  burst: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
});

const requests = fc.array(
  fc.record({ wait: fc.nat(5_000), cost: fc.integer({ min: 0, max: 3 }) }),
  { maxLength: 40 },
);

test('allows at most burst plus what the elapsed time earns back', async () => {
  await fuzz(
    fc.asyncProperty(config, requests, async (config, requests) => {
      const limiter = RateLimit.create(config);
      const burst = config.burst ?? config.limit;
      const start = 1_700_000_000_000;
      let time = start;
      let used = 0;
      for (const { wait, cost } of requests) {
        time += wait;
        const result = await limiter.take('key', { cost, now: new Date(time) });
        if (result.allowed) {
          used += cost;
        }
        expect(result.remaining).toBeGreaterThanOrEqual(0);
        expect(result.remaining).toBeLessThanOrEqual(burst);
        expect(result.retryAfter === 0).toBe(result.allowed);
        expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(time - 1);
        expect(used).toBeLessThanOrEqual(
          burst + ((time - start) * config.limit) / config.period + 1e-6,
        );
      }
    }),
  );
});

test('a denied request is allowed once retryAfter has passed', async () => {
  await fuzz(
    fc.asyncProperty(config, requests, async (config, requests) => {
      const limiter = RateLimit.create(config);
      let time = 1_700_000_000_000;
      for (const { wait, cost } of requests) {
        time += wait;
        const result = await limiter.take('key', { cost, now: new Date(time) });
        if (result.allowed || !Number.isFinite(result.retryAfter)) {
          continue;
        }
        const later = await limiter.take('key', { cost, now: new Date(time + result.retryAfter) });
        expect(later.allowed).toBe(true);
        time += result.retryAfter;
      }
    }),
  );
});

test('headers write the remaining count and whole seconds, and quote any policy name', async () => {
  await fuzz(
    fc.asyncProperty(
      config,
      fc.integer({ min: 0, max: 30 }),
      fc.string({ unit: fc.constantFrom('a', ' ', '"', '\\', ';', '~'), maxLength: 8 }),
      async (config, count, name) => {
        const limiter = RateLimit.create(config);
        const now = new Date(1_700_000_000_000);
        let result = await limiter.take('key', { cost: 0, now });
        for (let i = 0; i < count; i++) {
          result = await limiter.take('key', { now });
        }
        const fields = RateLimit.headers(result, { name, now });
        const item = /^"((?:[^"\\]|\\.)*)";/;
        expect(item.exec(fields.RateLimit!)?.[1]?.replace(/\\(.)/g, '$1')).toBe(name);
        expect(fields.RateLimit).toMatch(new RegExp(`;r=${result.remaining};t=\\d+$`));
        expect(fields['RateLimit-Policy']).toMatch(new RegExp(`;q=${config.limit};w=\\d+$`));
        expect(fields['Retry-After'] ?? '0').toMatch(/^\d+$/);
      },
    ),
  );
});
