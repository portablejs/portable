import * as Timers from '@portable/timers';
import lodashDebounce from 'lodash.debounce';
import lodashThrottle from 'lodash.throttle';
import pDebounce from 'p-debounce';
import * as throttleDebounce from 'throttle-debounce';
import { expect, test } from 'vite-plus/test';

const calls = 1000;
let sink = 0;
const work = (value: number) => (sink += value);

test('a burst of 1000 debounced calls is within 25% of lodash.debounce', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/timers', () => {
      const debounced = Timers.debounce(work, 100);
      for (let i = 0; i < calls; i++) {
        void debounced(i);
      }
      void debounced.flush();
    }),
    bench('lodash.debounce', () => {
      const debounced = lodashDebounce(work, 100);
      for (let i = 0; i < calls; i++) {
        debounced(i);
      }
      debounced.flush();
    }),
    bench('throttle-debounce', () => {
      const debounced = throttleDebounce.debounce(100, work);
      for (let i = 0; i < calls; i++) {
        debounced(i);
      }
      debounced.cancel();
    }),
    bench('p-debounce', async () => {
      const controller = new AbortController();
      const debounced = pDebounce(work, 100, { signal: controller.signal });
      for (let i = 0; i < calls; i++) {
        debounced(i).catch(() => {});
      }
      controller.abort();
    }),
  );
  expect(result.get('lodash.debounce')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});

test('a burst of 1000 throttled calls is within 25% of lodash.throttle', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/timers', () => {
      const throttled = Timers.throttle(work, 100);
      for (let i = 0; i < calls; i++) {
        void throttled(i);
      }
      void throttled.flush();
    }),
    bench('lodash.throttle', () => {
      const throttled = lodashThrottle(work, 100);
      for (let i = 0; i < calls; i++) {
        throttled(i);
      }
      throttled.flush();
    }),
    bench('throttle-debounce', () => {
      const throttled = throttleDebounce.throttle(100, work);
      for (let i = 0; i < calls; i++) {
        throttled(i);
      }
      throttled.cancel();
    }),
  );
  expect(result.get('lodash.throttle')).not.toBeFasterThan(result.get('@portable/timers'), {
    delta: 0.25,
  });
});
