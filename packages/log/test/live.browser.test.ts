import { afterAll, beforeAll, expect, test, vi } from 'vite-plus/test';

const storage = globalThis.localStorage;

beforeAll(() => {
  storage.setItem('debug', 'app');
  vi.useFakeTimers({ toFake: ['setInterval'] });
});

afterAll(() => {
  storage.removeItem('debug');
  vi.useRealTimers();
});

test('reads localStorage.debug when the first logger is created', async () => {
  const Log = await import('@portable/log');
  expect(Log.create('app').isEnabled('debug')).toBe(true);
});

test('picks up a change made in the same tab within a second, without a reload', async () => {
  const Log = await import('@portable/log');
  const log = Log.create('app');
  storage.setItem('debug', 'other');
  expect(log.isEnabled('debug')).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(log.isEnabled('debug')).toBe(false);
});

test('picks up a change from another tab at once, through the storage event', async () => {
  const Log = await import('@portable/log');
  const log = Log.create('app');
  storage.setItem('debug', 'app');
  globalThis.dispatchEvent(new StorageEvent('storage', { key: 'debug' }));
  expect(log.isEnabled('debug')).toBe(true);
});

test('ignores an invalid value until it is fixed', async () => {
  const Log = await import('@portable/log');
  const log = Log.create('app');
  storage.setItem('debug', 'app=verbose');
  vi.advanceTimersByTime(1000);
  expect(log.isEnabled('debug')).toBe(true);
  storage.setItem('debug', '');
  vi.advanceTimersByTime(1000);
  expect(log.isEnabled('debug')).toBe(false);
});

test('persist writes the patterns to localStorage', async () => {
  const Log = await import('@portable/log');
  Log.enable('app:*', { persist: true });
  expect(storage.getItem('debug')).toBe('app:*');
});
