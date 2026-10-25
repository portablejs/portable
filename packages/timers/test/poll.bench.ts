import * as Timers from '@portable/timers';
import delay from 'delay';
import pWaitFor from 'p-wait-for';
import { expect, test } from 'vite-plus/test';

const checks = 10;

test('polls until the 10th check succeeds within 25% of p-wait-for', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/timers', async () => {
      let count = 0;
      await Timers.poll(() => (++count >= checks ? count : undefined), { delay: 0 });
    }),
    bench('p-wait-for', async () => {
      let count = 0;
      await pWaitFor(() => ++count >= checks, { interval: 0 });
    }),
  );
  expect(result.get('p-wait-for')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});

test('sleeps for 1 ms within 25% of delay and setTimeout', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/timers', async () => {
      await Timers.sleep(1);
    }),
    bench('delay', async () => {
      await delay(1);
    }),
    bench('setTimeout', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }),
  );
  expect(result.get('delay')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});
