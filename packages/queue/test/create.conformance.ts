import { describe, expect, test } from 'vite-plus/test';
import * as Queue from '@portable/queue';
import { concurrencyProbe, countingSignal, deferred, delay, flush } from './utils.js';

describe('add', () => {
  test('resolves with the result of the task', async () => {
    const queue = Queue.create();
    expect(await queue.add(async () => '🦄')).toBe('🦄');
  });

  test('runs every task at once by default', async () => {
    const queue = Queue.create();
    const probe = concurrencyProbe();
    await Promise.all(Array.from({ length: 20 }, () => queue.add(() => probe.run(10))));
    expect(probe.max).toBe(20);
  });

  test('runs at most `concurrency` tasks at once', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const probe = concurrencyProbe();
    const tasks = Array.from({ length: 6 }, () => queue.add(() => probe.run(10)));
    expect([queue.pending, queue.size]).toEqual([2, 4]);
    await Promise.all(tasks);
    expect(probe.max).toBe(2);
  });

  test('starts tasks in the order they were added with concurrency 1', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const started: number[] = [];
    await Promise.all(
      [30, 10, 20, 0].map((ms, i) =>
        queue.add(async () => {
          started.push(i);
          await delay(ms);
        }),
      ),
    );
    expect(started).toEqual([0, 1, 2, 3]);
  });

  test('starts tasks with a higher priority first', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const order: number[] = [];
    const run = (n: number) => () => void order.push(n);
    await Promise.all([
      queue.add(run(1), { priority: 1 }),
      queue.add(run(0), { priority: 0 }),
      queue.add(run(1), { priority: 1 }),
      queue.add(run(2), { priority: 1 }),
      queue.add(run(3), { priority: 2 }),
      queue.add(run(0), { priority: -1 }),
      queue.add(run(4), { priority: 3 }),
    ]);
    expect(order).toEqual([1, 4, 3, 1, 2, 0, 0]);
  });

  test('keeps the order of equal priorities, including Infinity and -Infinity', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const order: string[] = [];
    const run = (name: string) => () => void order.push(name);
    const blocker = queue.add(() => delay(5));
    const tasks = [
      queue.add(run('low 1'), { priority: -Infinity }),
      queue.add(run('first 1'), { priority: Infinity }),
      queue.add(run('default'), { priority: undefined }),
      queue.add(run('first 2'), { priority: Infinity }),
      queue.add(run('low 2'), { priority: -Infinity }),
    ];
    await Promise.all([blocker, ...tasks]);
    expect(order).toEqual(['first 1', 'first 2', 'default', 'low 1', 'low 2']);
  });

  test('keeps priority order after many tasks have started', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const order: number[] = [];
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < 3000; i++) {
      tasks.push(queue.add(() => void order.push(i % 3), { priority: 0 }));
    }
    await delay(0);
    for (let i = 0; i < 3; i++) {
      tasks.push(queue.add(() => void order.push(9), { priority: 1 }));
    }
    await Promise.all(tasks);
    const firstNine = order.indexOf(9);
    expect(order.slice(firstNine, firstNine + 3)).toEqual([9, 9, 9]);
    expect(order.filter((n) => n === 9)).toHaveLength(3);
    expect(order).toHaveLength(3003);
  });

  test('throws on a priority that is not a number', () => {
    const queue = Queue.create();
    expect(() => queue.add(() => 1, { priority: Number.NaN })).toThrow(RangeError);
    expect(() => queue.add(() => 1, { priority: '1' as unknown as number })).toThrow(TypeError);
    expect(queue.size).toBe(0);
  });

  test('a rejected priority does not change the order of the other tasks', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const order: string[] = [];
    const blocker = queue.add(() => delay(5));
    const a = queue.add(() => void order.push('a'), { priority: 1 });
    expect(() => queue.add(() => void order.push('nan'), { priority: Number.NaN })).toThrow(
      RangeError,
    );
    const b = queue.add(() => void order.push('b'), { priority: 2 });
    await Promise.all([blocker, a, b]);
    expect(order).toEqual(['b', 'a']);
  });

  test('accepts sync and async tasks together', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const results = await Promise.all([
      queue.add(async () => 'async 1'),
      queue.add(() => 'sync 1'),
      queue.add(async () => 'async 2'),
      queue.add(() => 'sync 2'),
    ]);
    expect(results).toEqual(['async 1', 'sync 1', 'async 2', 'sync 2']);
  });

  test('rejects with the error of a task that throws or rejects, and keeps running', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const error = new Error('broken');
    await expect(
      queue.add(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(queue.add(() => Promise.reject(error))).rejects.toBe(error);
    expect(await queue.add(() => 'still running')).toBe('still running');
  });

  test('rejects with a reason that is not an Error as it is', async () => {
    const queue = Queue.create();
    await expect(queue.add(() => Promise.reject('plain'))).rejects.toBe('plain');
    await expect(queue.add(() => Promise.reject(undefined))).rejects.toBe(undefined);
  });

  test('the next waiting task has started when a task settles', async () => {
    const queue = Queue.create({ concurrency: 1 });
    let secondStarted = false;
    const first = queue.add(() => delay(5));
    const second = queue.add(() => {
      secondStarted = true;
    });
    await first;
    await flush();
    expect(secondStarted).toBe(true);
    await second;
  });

  test('a task added from inside a running task waits for a free slot', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const probe = concurrencyProbe();
    const inner: Promise<unknown>[] = [];
    await Promise.all(
      Array.from({ length: 4 }, () =>
        queue.add(async () => {
          inner.push(queue.add(() => probe.run(5)));
          await probe.run(5);
        }),
      ),
    );
    await Promise.all(inner);
    expect(probe.max).toBe(2);
  });
});

describe('signal', () => {
  test('passes an AbortSignal to every task', async () => {
    const queue = Queue.create();
    const signal = await queue.add(({ signal }) => signal);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test('aborting while the task waits removes it and rejects with the reason', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    let ran = false;
    const running = queue.add(() => delay(10));
    const waiting = queue.add(
      () => {
        ran = true;
      },
      { signal: controller.signal },
    );
    expect(queue.size).toBe(1);
    controller.abort(new Error('stop'));
    expect(queue.size).toBe(0);
    await expect(waiting).rejects.toThrow('stop');
    await running;
    await flush();
    expect(ran).toBe(false);
  });

  test('aborting while the task waits uses the default AbortError reason', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    const running = queue.add(() => delay(10));
    const waiting = queue.add(() => 1, { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await running;
  });

  test('aborting works on a paused queue without resuming it', async () => {
    const queue = Queue.create();
    queue.pause();
    const controller = new AbortController();
    const task = queue.add(() => 1, { signal: controller.signal });
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(queue.paused).toBe(true);
    expect(queue.size).toBe(0);
  });

  test('aborting several waiting tasks with one controller removes only them', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    const running = queue.add(() => delay(10));
    const aborted = [1, 2, 3].map((n) => queue.add(() => n, { signal: controller.signal }));
    const kept = queue.add(() => 'kept');
    controller.abort();
    for (const task of aborted) {
      await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    }
    expect(await kept).toBe('kept');
    await running;
  });

  test('an already aborted signal rejects without adding the task', async () => {
    const queue = Queue.create();
    let ran = false;
    const task = queue.add(
      () => {
        ran = true;
      },
      { signal: AbortSignal.abort('gone') },
    );
    expect(queue.size + queue.pending).toBe(0);
    await expect(task).rejects.toBe('gone');
    expect(ran).toBe(false);
  });

  test('aborting a running task aborts its signal and rejects at once', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    const finish = deferred();
    let taskSignal: AbortSignal | undefined;
    const task = queue.add(
      async ({ signal }) => {
        taskSignal = signal;
        await finish.promise;
        return 'late';
      },
      { signal: controller.signal },
    );
    await flush();
    controller.abort('reason');
    await expect(task).rejects.toBe('reason');
    expect(taskSignal?.aborted).toBe(true);
    finish.resolve();
  });

  test('an aborted running task keeps its slot until it settles', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    const finish = deferred();
    let nextStarted = false;
    const task = queue.add(() => finish.promise, { signal: controller.signal });
    const next = queue.add(() => {
      nextStarted = true;
    });
    await flush();
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(queue.pending).toBe(1);
    expect(nextStarted).toBe(false);
    finish.resolve();
    await next;
    expect(nextStarted).toBe(true);
  });

  test('aborting several running tasks at the same time', async () => {
    const queue = Queue.create();
    const controller = new AbortController();
    const tasks = [1, 2].map(() =>
      queue.add(
        ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', reject)),
        {
          signal: controller.signal,
        },
      ),
    );
    await flush();
    controller.abort();
    for (const task of tasks) {
      await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    }
  });

  test('removes its abort listeners when tasks finish', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const counted = countingSignal();
    await Promise.all(
      Array.from({ length: 10 }, () => queue.add(() => delay(1), { signal: counted.signal })),
    );
    expect(counted.listeners).toBe(0);
  });

  test('tasks that share a signal add one listener to it', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const counted = countingSignal();
    const tasks = Array.from({ length: 100 }, () =>
      queue.add(() => delay(1), { signal: counted.signal }),
    );
    expect(counted.listeners).toBe(1);
    await Promise.all(tasks);
    expect(counted.listeners).toBe(0);
  });

  test('clear removes the abort listeners of the waiting tasks', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const counted = countingSignal();
    const finish = deferred();
    const running = queue.add(() => finish.promise, { signal: counted.signal });
    const waiting = Array.from({ length: 5 }, () =>
      queue.add(() => 1, { signal: counted.signal }).catch(() => {}),
    );
    queue.clear();
    await Promise.all(waiting);
    expect(counted.listeners).toBe(1);
    finish.resolve();
    await running;
    expect(counted.listeners).toBe(0);
  });

  test('the queue signal rejects waiting, running, and later tasks', async () => {
    const controller = new AbortController();
    const queue = Queue.create({ concurrency: 1, signal: controller.signal });
    let taskSignal: AbortSignal | undefined;
    const running = queue.add(({ signal }) => {
      taskSignal = signal;
      return new Promise(() => {});
    });
    const waiting = queue.add(() => 1);
    await flush();
    controller.abort('shutdown');
    await expect(running).rejects.toBe('shutdown');
    await expect(waiting).rejects.toBe('shutdown');
    await expect(queue.add(() => 1)).rejects.toBe('shutdown');
    expect(taskSignal?.aborted).toBe(true);
  });

  test('a task signal and the queue signal both abort the task', async () => {
    const queueController = new AbortController();
    const queue = Queue.create({ signal: queueController.signal });
    const taskController = new AbortController();
    const signals: AbortSignal[] = [];
    const first = queue.add(
      ({ signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      },
      { signal: taskController.signal },
    );
    await flush();
    taskController.abort('task');
    await expect(first).rejects.toBe('task');
    expect(signals[0]?.aborted).toBe(true);
    const second = queue.add(() => new Promise(() => {}), { signal: new AbortController().signal });
    queueController.abort('queue');
    await expect(second).rejects.toBe('queue');
  });
});

describe('idle, pause, and clear', () => {
  test('idle resolves when every task has settled', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const done: number[] = [];
    for (const ms of [5, 10, 15]) {
      void queue.add(() => delay(ms).then(() => void done.push(ms)));
    }
    await queue.idle();
    expect(done).toEqual([5, 10, 15]);
    expect([queue.size, queue.pending]).toEqual([0, 0]);
  });

  test('idle resolves at once for a queue that never had a task', async () => {
    await expect(Queue.create().idle()).resolves.toBeUndefined();
  });

  test('idle resolves after failed tasks too', async () => {
    const queue = Queue.create();
    void queue.add(() => Promise.reject(new Error('x'))).catch(() => {});
    await queue.idle();
    expect(queue.pending).toBe(0);
  });

  test('several idle calls all resolve', async () => {
    const queue = Queue.create({ concurrency: 1 });
    void queue.add(() => delay(5));
    void queue.add(() => delay(5));
    expect(await Promise.all([queue.idle(), queue.idle(), queue.idle()])).toHaveLength(3);
    expect(queue.pending).toBe(0);
  });

  test('idle waits for tasks added while waiting', async () => {
    const queue = Queue.create({ concurrency: 1 });
    let last = false;
    void queue.add(() => delay(5));
    const idle = queue.idle();
    void queue.add(async () => {
      await delay(5);
      last = true;
    });
    await idle;
    expect(last).toBe(true);
  });

  test('idle resolves after clear once the running task settles', async () => {
    const queue = Queue.create({ concurrency: 1 });
    let finished = false;
    void queue.add(async () => {
      await delay(10);
      finished = true;
    });
    void queue.add(() => 1).catch(() => {});
    const idle = queue.idle();
    queue.clear();
    await idle;
    expect(finished).toBe(true);
  });

  test('idle resolves when the last waiting task is aborted', async () => {
    const queue = Queue.create();
    queue.pause();
    const controller = new AbortController();
    void queue.add(() => 1, { signal: controller.signal }).catch(() => {});
    const idle = queue.idle();
    controller.abort();
    await expect(idle).resolves.toBeUndefined();
    expect(queue.size).toBe(0);
  });

  test('pause stops starting tasks and resume starts them again', async () => {
    const queue = Queue.create({ concurrency: 2 });
    queue.pause();
    expect(queue.paused).toBe(true);
    const tasks = Array.from({ length: 4 }, (_, i) => queue.add(() => i));
    await flush();
    expect([queue.size, queue.pending]).toEqual([4, 0]);
    queue.resume();
    expect(queue.paused).toBe(false);
    expect(queue.pending).toBe(2);
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3]);
  });

  test('pausing lets running tasks finish', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const tasks = Array.from({ length: 4 }, () => queue.add(() => delay(10)));
    queue.pause();
    await Promise.all(tasks.slice(0, 2));
    await flush();
    expect([queue.size, queue.pending]).toEqual([2, 0]);
    queue.resume();
    await Promise.all(tasks);
  });

  test('a paused queue with waiting tasks is not idle', async () => {
    const queue = Queue.create();
    queue.pause();
    void queue.add(() => 1);
    let idle = false;
    void queue.idle().then(() => (idle = true));
    await delay(5);
    expect(idle).toBe(false);
    queue.resume();
    await queue.idle();
  });

  test('clear lets the running tasks finish', async () => {
    const queue = Queue.create({ concurrency: 2 });
    const running = [queue.add(() => delay(10).then(() => 'a')), queue.add(() => 'b')];
    const waiting = queue.add(() => 'c');
    queue.clear();
    expect(await Promise.all(running)).toEqual(['a', 'b']);
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(queue.size).toBe(0);
  });

  test('an ignored promise of a removed task is not an unhandled rejection', async () => {
    const controller = new AbortController();
    const queue = Queue.create({ signal: controller.signal });
    queue.pause();
    void queue.add(() => 1);
    queue.clear();
    const taskController = new AbortController();
    void queue.add(() => 1, { signal: taskController.signal });
    taskController.abort();
    const ignored = [queue.add(() => 1)];
    controller.abort();
    await delay(10);
    await expect(ignored[0]).rejects.toBe(controller.signal.reason);
  });

  test('a cleared queue keeps accepting tasks', async () => {
    const queue = Queue.create({ concurrency: 1 });
    void queue.add(() => delay(5));
    void queue.add(() => 1).catch(() => {});
    queue.clear();
    expect(await queue.add(() => 'after')).toBe('after');
  });
});

describe('known upstream issues', () => {
  test('aborting 10,000 waiting tasks with one signal neither overflows the stack nor hangs', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const controller = new AbortController();
    const tasks = Array.from({ length: 10_000 }, () =>
      queue.add(() => delay(1), { signal: controller.signal }).catch((error: unknown) => error),
    );
    await flush();
    controller.abort();
    const results = await Promise.all(tasks);
    expect(results.filter((r) => (r as Error | undefined)?.name === 'AbortError').length).toBe(
      10_000,
    );
    await queue.idle();
  });

  test('clearing 10,000 waiting tasks does not overflow the stack', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const tasks = Array.from({ length: 10_000 }, () => queue.add(() => 1).catch(() => 'cleared'));
    queue.clear();
    const results = await Promise.all(tasks);
    expect(results[0]).toBe(1);
    expect(results.filter((r) => r === 'cleared')).toHaveLength(9999);
  });

  test('100,000 sync tasks run without overflowing the stack', async () => {
    const queue = Queue.create({ concurrency: 1 });
    let count = 0;
    const tasks = Array.from({ length: 100_000 }, () => queue.add(() => count++));
    await Promise.all(tasks);
    expect(count).toBe(100_000);
  });
});

const { asyncDispose } = Symbol as { asyncDispose?: symbol | undefined };
const dispose = (queue: Queue.Queue) =>
  (queue as unknown as Record<symbol, () => Promise<void>>)[asyncDispose!]!();

describe.skipIf(asyncDispose === undefined)('Symbol.asyncDispose', () => {
  test('rejects waiting and running tasks, as aborting signal does, and resolves once they settle', async () => {
    const queue = Queue.create({ concurrency: 1 });
    const own = new AbortController();
    let settled = false;
    let taskSignal: AbortSignal | undefined;
    const running = queue.add(async ({ signal }) => {
      taskSignal = signal;
      await delay(20);
      settled = true;
    });
    const withSignal = queue.add(() => 'never', { signal: own.signal });
    const waiting = queue.add(() => 'never');
    await flush();
    const disposed = dispose(queue);
    expect(taskSignal!.aborted).toBe(true);
    expect(taskSignal!.reason).toMatchObject({ name: 'AbortError' });
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await expect(withSignal).rejects.toMatchObject({ name: 'AbortError' });
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(settled).toBe(false);
    expect(queue.pending).toBe(1);
    await disposed;
    expect(settled).toBe(true);
    expect(queue.pending).toBe(0);
    await expect(queue.add(() => 1)).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('aborts the signal of a task that has its own signal', async () => {
    const queue = Queue.create();
    const own = new AbortController();
    let taskSignal: AbortSignal | undefined;
    const running = queue.add(
      async ({ signal }) => {
        taskSignal = signal;
        await delay(5);
        signal.throwIfAborted();
      },
      { signal: own.signal },
    );
    await flush();
    const disposed = dispose(queue);
    expect(taskSignal!.aborted).toBe(true);
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await disposed;
    expect(own.signal.aborted).toBe(false);
  });

  test('resolves at once for an idle queue', async () => {
    await expect(dispose(Queue.create())).resolves.toBeUndefined();
  });
});
