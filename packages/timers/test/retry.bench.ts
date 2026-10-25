import * as Timers from '@portable/timers';
import asyncRetry from 'async-retry';
import pRetry from 'p-retry';
import { expect, test } from 'vite-plus/test';

const attempts = 10;
const error = new Error('fail');
const flaky = (attempt: number) => (attempt < attempts ? Promise.reject(error) : attempt);

async function loop(): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await flaky(attempt);
    } catch (error) {
      if (attempt >= attempts) {
        throw error;
      }
    }
  }
}

test('retry overhead per attempt without a signal is within 25% of p-retry and async-retry', async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/timers', async () => {
      await Timers.retry(({ attempt }) => flaky(attempt), { attempts, delay: 0 });
    }),
    bench('p-retry', async () => {
      await pRetry(flaky, { retries: attempts - 1, minTimeout: 0 });
    }),
    // async-retry waits for a setTimeout between attempts even when the timeout is 0.
    bench('async-retry', async () => {
      await asyncRetry((_bail, attempt) => flaky(attempt), {
        retries: attempts - 1,
        minTimeout: 0,
        maxTimeout: 0,
        randomize: false,
      });
    }),
    bench('try/catch loop', loop),
  );
  expect(result.get('p-retry')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
  expect(result.get('async-retry')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});

test('retry overhead per attempt with a signal is within 25% of p-retry', async ({ bench }) => {
  const { signal } = new AbortController();
  const result = await bench.compare(
    bench('@portable/timers', async () => {
      await Timers.retry(({ attempt }) => flaky(attempt), { attempts, delay: 0, signal });
    }),
    bench('p-retry', async () => {
      await pRetry(flaky, { retries: attempts - 1, minTimeout: 0, signal });
    }),
  );
  expect(result.get('p-retry')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});
