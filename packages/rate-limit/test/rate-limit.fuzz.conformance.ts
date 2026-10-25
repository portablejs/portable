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

/**
 * A token bucket for each key, counted in milliseconds of allowance so the arithmetic is exact.
 * When `period` is a whole multiple of `limit`, one request costs `step` whole milliseconds.
 */
type Model = {
  step: number;
  capacity: number;
  time: number;
  keys: Map<string, { credit: number; at: number }>;
};

type Real = { limiters: readonly RateLimit.Limiter[] };

function expectResult(result: RateLimit.Result, expected: Record<string, unknown>) {
  expect({ ...result, resetAt: result.resetAt.getTime() }).toMatchObject(expected);
}

const take = fc
  .record({
    limiter: fc.nat(1),
    key: fc.constantFrom('a', 'b', 'c'),
    cost: fc.integer({ min: -2, max: 4 }),
    wait: fc.oneof(fc.constant(0), fc.nat(300)),
  })
  .map(({ limiter, key, cost, wait }): fc.AsyncCommand<Model, Real> => ({
    check: () => true,
    async run(model, real) {
      model.time += wait;
      const state = model.keys.get(key) ?? { credit: model.capacity, at: model.time };
      const credit = Math.min(model.capacity, state.credit + model.time - state.at);
      const need = cost * model.step;
      const allowed = need <= credit;
      const left = allowed ? Math.min(model.capacity, credit - need) : credit;
      model.keys.set(key, { credit: left, at: model.time });

      const result = await real.limiters[limiter]!.take(key, { cost, now: new Date(model.time) });
      expectResult(result, {
        allowed,
        remaining: Math.floor(left / model.step),
        retryAfter: allowed ? 0 : need > model.capacity ? Infinity : need - credit,
        resetAt: model.time + model.capacity - left,
      });
    },
    toString: () => `take(${key}, cost ${cost}) on limiter ${limiter} after ${wait} ms`,
  }));

test('two limiters sharing a store match a token bucket for each key', async () => {
  await fuzz(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: 1, max: 5 }),
      fc.commands([take], { maxCommands: 40 }),
      async (limit, step, burst, commands) => {
        const store = RateLimit.memoryStore();
        const options = { limit, period: limit * step, burst, store };
        await fc.asyncModelRun(
          () => ({
            model: { step, capacity: burst * step, time: 1_700_000_000_000, keys: new Map() },
            real: { limiters: [RateLimit.create(options), RateLimit.create(options)] },
          }),
          commands,
        );
      },
    ),
  );
});
