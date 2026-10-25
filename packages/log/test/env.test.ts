import { afterAll, expect, test } from 'vite-plus/test';

const { env } = globalThis.process;
const previous = env.DEBUG;

afterAll(() => {
  if (previous === undefined) {
    delete env.DEBUG;
  } else {
    env.DEBUG = previous;
  }
});

test('reads process.env.DEBUG when the first logger is created', async () => {
  env.DEBUG = 'app:*,-app:noisy';
  const Log = await import('@portable/log');
  expect(Log.create('app:db').isEnabled('debug')).toBe(true);
  expect(Log.create('app:noisy').isEnabled('error')).toBe(false);
  expect(Log.disable()).toBe('app:*,-app:noisy');
});
