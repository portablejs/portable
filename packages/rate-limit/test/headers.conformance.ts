import { describe, expect, test } from 'vite-plus/test';
import * as RateLimit from '@portable/rate-limit';
import { advance, takeMany, useClock } from './utils.js';

useClock();

describe('headers', () => {
  test('describes the policy and what remains for an allowed request', async () => {
    const limiter = RateLimit.create({ limit: 100, period: 60_000 });
    expect(RateLimit.headers(await limiter.take('a'))).toEqual({
      'RateLimit-Policy': '"default";q=100;w=60',
      RateLimit: '"default";r=99;t=1',
    });
  });

  test('sets t to the seconds until the allowance is full', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 60_000 });
    const result = await limiter.take('a', { cost: 5 });
    expect(RateLimit.headers(result).RateLimit).toBe('"default";r=5;t=30');
  });

  test('counts t from the now option', async () => {
    const limiter = RateLimit.create({ limit: 10, period: 60_000 });
    const now = new Date(Date.UTC(2030, 0, 1));
    const result = await limiter.take('a', { cost: 5, now });
    expect(RateLimit.headers(result, { now }).RateLimit).toBe('"default";r=5;t=30');
    expect(RateLimit.headers(result, { now: { epochMilliseconds: now.getTime() } })).toEqual(
      RateLimit.headers(result, { now }),
    );
  });

  test('adds Retry-After to a denied request, and sets t to the same delay', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 10_000 });
    await takeMany(limiter, 'a', 2);
    advance(1500);
    expect(RateLimit.headers(await limiter.take('a'))).toEqual({
      'RateLimit-Policy': '"default";q=2;w=10',
      RateLimit: '"default";r=0;t=4',
      'Retry-After': '4',
    });
  });

  test('leaves out Retry-After when the cost can never fit', async () => {
    const limiter = RateLimit.create({ limit: 2, period: 10_000 });
    const fields = RateLimit.headers(await limiter.take('a', { cost: 3 }));
    expect(fields).not.toHaveProperty('Retry-After');
    expect(fields.RateLimit).toBe('"default";r=2;t=0');
  });

  test('rounds a period under a second up to w=1', async () => {
    const limiter = RateLimit.create({ limit: 5, period: 200 });
    expect(RateLimit.headers(await limiter.take('a'))['RateLimit-Policy']).toBe(
      '"default";q=5;w=1',
    );
  });

  test('uses the name option as the policy name, escaped as a structured field string', async () => {
    const result = await RateLimit.create({ limit: 1, period: 1000 }).take('a');
    expect(RateLimit.headers(result, { name: 'per "user" \\ ip' })['RateLimit-Policy']).toBe(
      '"per \\"user\\" \\\\ ip";q=1;w=1',
    );
  });

  test('throws a RangeError for a name that is not printable ASCII', async () => {
    const result = await RateLimit.create({ limit: 1, period: 1000 }).take('a');
    expect(() => RateLimit.headers(result, { name: 'café' })).toThrow(RangeError);
    expect(() => RateLimit.headers(result, { name: 'a\nb' })).toThrow(RangeError);
  });

  test('can be passed to a Response', async () => {
    const result = await RateLimit.create({ limit: 1, period: 1000 }).take('a');
    const response = new Response(null, { status: 429, headers: RateLimit.headers(result) });
    expect(response.headers.get('ratelimit')).toBe('"default";r=0;t=1');
  });
});
