import * as Timers from '@portable/timers';
import { describe, expect, test } from 'vite-plus/test';

type Listener = EventListenerOrEventListenerObject | null;

function tracked(): { signal: AbortSignal; count: () => number } {
  const { signal } = new AbortController();
  const listeners = new Set<Listener>();
  const add = signal.addEventListener.bind(signal) as EventTarget['addEventListener'];
  const remove = signal.removeEventListener.bind(signal) as EventTarget['removeEventListener'];
  Object.assign(signal, {
    addEventListener(type: string, listener: Listener, options?: AddEventListenerOptions) {
      if (type === 'abort') {
        listeners.add(listener);
      }
      add(type, listener, options);
    },
    removeEventListener(type: string, listener: Listener, options?: EventListenerOptions) {
      if (type === 'abort') {
        listeners.delete(listener);
      }
      remove(type, listener, options);
    },
  });
  return { signal, count: () => listeners.size };
}

describe('abort listeners on the caller signal are removed', () => {
  test('after sleep resolves', async () => {
    const { signal, count } = tracked();
    const sleeping = Timers.sleep(1, { signal });
    expect(count()).toBe(1);
    await sleeping;
    expect(count()).toBe(0);
  });

  test('after retry succeeds, with and without a timeout', async () => {
    const { signal, count } = tracked();
    const fn = ({ attempt }: Timers.Context) =>
      attempt < 3 ? Promise.reject(new Error('fail')) : 1;
    await Timers.retry(fn, { delay: 1, signal });
    await Timers.retry(fn, { delay: 1, timeout: 1000, signal });
    expect(count()).toBe(0);
  });

  test('after retry runs out of attempts', async () => {
    const { signal, count } = tracked();
    await expect(
      Timers.retry(() => Promise.reject(new Error('fail')), { delay: 1, timeout: 1000, signal }),
    ).rejects.toThrow('fail');
    expect(count()).toBe(0);
  });

  test('after 200 polls that succeed', async () => {
    const { signal, count } = tracked();
    let checks = 0;
    await Timers.poll(() => (++checks >= 200 ? true : undefined), { delay: 0, signal });
    await Timers.poll(() => true, { signal });
    expect(count()).toBe(0);
  });

  test('after a poll check throws', async () => {
    const { signal, count } = tracked();
    await expect(
      Timers.poll(
        () => {
          throw new Error('test');
        },
        { signal },
      ),
    ).rejects.toThrow('test');
    expect(count()).toBe(0);
  });
});
