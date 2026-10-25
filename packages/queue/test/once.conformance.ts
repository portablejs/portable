import { describe, expect, test } from 'vite-plus/test';
import * as Queue from '@portable/queue';
import { deferred } from './utils.js';

describe('once', () => {
  test('concurrent callers share one call', async () => {
    let calls = 0;
    const gate = deferred();
    const connect = Queue.once(async () => {
      calls++;
      await gate.promise;
      return { id: calls };
    });
    const [a, b] = [connect(), connect()];
    expect(a).toBe(b);
    gate.resolve();
    expect(await a).toEqual({ id: 1 });
    expect(calls).toBe(1);
  });

  test('keeps the fulfilled result for later callers', async () => {
    let calls = 0;
    const load = Queue.once(() => ++calls);
    expect(await load()).toBe(1);
    expect(await load()).toBe(1);
    expect(calls).toBe(1);
  });

  test('calls fn again after a rejection', async () => {
    let calls = 0;
    const load = Queue.once(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('first');
      }
      return 'second';
    });
    const [a, b] = [load(), load()];
    await expect(a).rejects.toThrow('first');
    await expect(b).rejects.toThrow('first');
    expect(await load()).toBe('second');
    expect(calls).toBe(2);
  });

  test('turns a synchronous throw into a rejection', async () => {
    const load = Queue.once(() => {
      throw new Error('sync');
    });
    await expect(load()).rejects.toThrow('sync');
  });

  test('with cache false, shares only a call that is still running', async () => {
    let calls = 0;
    const gate = deferred();
    const refresh = Queue.once(
      async () => {
        calls++;
        await gate.promise;
        return calls;
      },
      { cache: false },
    );
    const [a, b] = [refresh(), refresh()];
    expect(a).toBe(b);
    gate.resolve();
    expect(await a).toBe(1);
    expect(await refresh()).toBe(2);
    expect(calls).toBe(2);
  });
});
