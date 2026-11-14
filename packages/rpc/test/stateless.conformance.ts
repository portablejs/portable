import * as Rpc from '@portable/rpc';
import { describe, expect, test } from 'vite-plus/test';

const methods = {
  add: (a: number, b: number) => a + b,
  math: { double: (n: number) => n * 2 },
  fail() {
    throw new Rpc.RemoteError({ code: 1, message: 'nope' });
  },
  log: (text: string) => void text,
};

const answer = async (message: string) => {
  const reply = await Rpc.answer({ methods, message });
  return reply === undefined ? undefined : (JSON.parse(reply) as unknown);
};

const identity = { encode: (message: Rpc.Message) => message, decode: (data: unknown) => data };

describe('answer', () => {
  test('answers a request', async () => {
    expect(await answer('{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}')).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: 3,
    });
  });

  test('calls methods of nested objects by dotted name', async () => {
    expect(await answer('{"jsonrpc":"2.0","id":1,"method":"math.double","params":[4]}')).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: 8,
    });
  });

  test('answers a batch with one batch of responses', async () => {
    expect(
      await answer(
        '[{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]},{"jsonrpc":"2.0","method":"log","params":["x"]},{"jsonrpc":"2.0","id":2,"method":"fail"}]',
      ),
    ).toEqual([
      { jsonrpc: '2.0', id: 1, result: 3 },
      { jsonrpc: '2.0', id: 2, error: { code: 1, message: 'nope' } },
    ]);
  });

  test('resolves with undefined for a notification', async () => {
    const calls: string[] = [];
    const reply = await Rpc.answer({
      methods: { log: (text: string) => void calls.push(text) },
      message: '{"jsonrpc":"2.0","method":"log","params":["hi"]}',
    });
    expect(reply).toBeUndefined();
    expect(calls).toEqual(['hi']);
  });

  test('resolves with undefined for a batch of notifications', async () => {
    expect(await answer('[{"jsonrpc":"2.0","method":"log","params":["x"]}]')).toBeUndefined();
  });

  test('answers an unknown method with -32601', async () => {
    expect(await answer('{"jsonrpc":"2.0","id":1,"method":"missing"}')).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    });
  });

  test('answers a message that does not decode with a parse error', async () => {
    expect(await answer('{')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });

  test('decodes UTF-8 bytes with the default codec', async () => {
    const reply = await Rpc.answer({
      methods,
      message: new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"add","params":[1,2]}'),
    });
    expect(JSON.parse(reply as string)).toEqual({ jsonrpc: '2.0', id: 1, result: 3 });
  });

  test('decodes and encodes with the codec', async () => {
    const reply = await Rpc.answer({
      methods,
      message: { jsonrpc: '2.0', id: 1, method: 'add', params: [1, 2] },
      codec: identity,
    });
    expect(reply).toEqual({ jsonrpc: '2.0', id: 1, result: 3 });
  });

  test('answers a method that returns a stream with -32603', async () => {
    const reply = await Rpc.answer({
      methods: {
        async *count() {
          yield 1;
        },
      },
      message: '{"jsonrpc":"2.0","id":1,"method":"count"}',
    });
    expect(JSON.parse(reply as string)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32603,
        message: 'The method returned a stream, which this server cannot send.',
      },
    });
  });

  test('cancels a ReadableStream that a method returns', async () => {
    let cancelled = false;
    await Rpc.answer({
      methods: { feed: () => new ReadableStream({ cancel: () => void (cancelled = true) }) },
      message: '{"jsonrpc":"2.0","method":"feed"}',
    });
    expect(cancelled).toBe(true);
  });

  test('aborts the signal of methods wrapped with withContext and rejects with signal.reason', async () => {
    const controller = new AbortController();
    let aborted: unknown;
    const pending = Rpc.answer({
      methods: {
        wait: Rpc.withContext(
          ({ signal }) =>
            new Promise((_, reject) =>
              signal.addEventListener('abort', () => {
                aborted = signal.reason;
                reject(signal.reason);
              }),
            ),
        ),
      },
      message: '{"jsonrpc":"2.0","id":1,"method":"wait"}',
      signal: controller.signal,
    });
    const reason = new Error('stop');
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(aborted).toBe(reason);
  });

  test('rejects at once when the signal is already aborted', async () => {
    let called = false;
    await expect(
      Rpc.answer({
        methods: { add: () => void (called = true) },
        message: '{"jsonrpc":"2.0","id":1,"method":"add"}',
        signal: AbortSignal.abort(new Error('stop')),
      }),
    ).rejects.toThrow('stop');
    expect(called).toBe(false);
  });

  test('ignores $/cancel and $/stream/credit', async () => {
    expect(await answer('{"jsonrpc":"2.0","method":"$/cancel","params":{"id":1}}')).toBeUndefined();
    expect(
      await answer('{"jsonrpc":"2.0","method":"$/stream/credit","params":{"id":1,"credit":1}}'),
    ).toBeUndefined();
  });

  test('answers a result the codec cannot encode with an error', async () => {
    const reply = await Rpc.answer({
      methods: { big: () => 1n },
      message: '{"jsonrpc":"2.0","id":1,"method":"big"}',
    });
    expect(JSON.parse(reply as string)).toMatchObject({ id: 1, error: { code: -32603 } });
  });

  test('answers only the results the codec cannot encode with errors in a batch', async () => {
    const reply = await Rpc.answer({
      methods: { big: () => 1n, add: (a: number, b: number) => a + b },
      message:
        '[{"jsonrpc":"2.0","id":1,"method":"big"},{"jsonrpc":"2.0","id":2,"method":"add","params":[1,2]}]',
    });
    expect(JSON.parse(reply as string)).toMatchObject([
      { id: 1, error: { code: -32603 } },
      { id: 2, result: 3 },
    ]);
  });

  test('answers requests from a connect client', async () => {
    let input!: ReadableStreamDefaultController<unknown>;
    const remote = Rpc.connect<typeof methods>({
      readable: new ReadableStream({ start: (c) => void (input = c) }),
      writable: new WritableStream({
        async write(message) {
          const reply = await Rpc.answer({ methods, message: message as string });
          if (reply !== undefined) {
            input.enqueue(reply);
          }
        },
      }),
    });
    expect(await remote.add(1, 2)).toBe(3);
    await expect(remote.fail()).rejects.toMatchObject({ code: 1, message: 'nope' });
  });
});

type ClientApi = {
  notice(text: string): void;
  room: { joined(name: string, count: number): void };
};

describe('notifier', () => {
  test('encodes a notification and passes it to send', async () => {
    const sent: unknown[] = [];
    const clients = Rpc.notifier<ClientApi>((data) => void sent.push(data));
    await clients.notice('hi');
    await clients.room.joined('a', 2);
    expect(sent).toEqual([
      '{"jsonrpc":"2.0","method":"notice","params":["hi"]}',
      '{"jsonrpc":"2.0","method":"room.joined","params":["a",2]}',
    ]);
  });

  test('leaves out empty params', async () => {
    const sent: unknown[] = [];
    await Rpc.notifier<{ ping(): void }>((data) => void sent.push(data)).ping();
    expect(sent).toEqual(['{"jsonrpc":"2.0","method":"ping"}']);
  });

  test('encodes with the codec', async () => {
    const sent: unknown[] = [];
    await Rpc.notifier<ClientApi>((data) => void sent.push(data), { codec: identity }).notice('hi');
    expect(sent).toEqual([{ jsonrpc: '2.0', method: 'notice', params: ['hi'] }]);
  });

  test('sends params by name through Rpc.notify', async () => {
    const sent: unknown[] = [];
    const clients = Rpc.notifier<any>((data) => void sent.push(data));
    await Rpc.notify(clients['notifications/message'], { level: 'info' });
    expect(sent).toEqual([
      '{"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info"}}',
    ]);
  });

  test('resolves after send resolves and rejects when send rejects', async () => {
    let finished = false;
    await Rpc.notifier<ClientApi>(async () => {
      await Promise.resolve();
      finished = true;
    }).notice('hi');
    expect(finished).toBe(true);
    const error = new Error('closed');
    await expect(Rpc.notifier<ClientApi>(() => Promise.reject(error)).notice('hi')).rejects.toBe(
      error,
    );
  });

  test('rejects when the codec cannot encode the params', async () => {
    const send = () => {
      throw new Error('not sent');
    };
    await expect(Rpc.notifier<{ n(value: bigint): void }>(() => {}).n(1n)).rejects.toThrow(
      TypeError,
    );
    await expect(Rpc.notifier<ClientApi>(send).notice('hi')).rejects.toThrow('not sent');
  });

  test('reaches the methods passed to connect on the other side', async () => {
    const received: string[] = [];
    let input!: ReadableStreamDefaultController<unknown>;
    const controller = new AbortController();
    Rpc.connect(
      {
        readable: new ReadableStream({ start: (c) => void (input = c) }),
        writable: new WritableStream(),
      },
      {
        methods: { notice: (text: string) => void received.push(text) } satisfies Pick<
          ClientApi,
          'notice'
        >,
        signal: controller.signal,
      },
    );
    await Rpc.notifier<ClientApi>((data) => input.enqueue(data)).notice('hi');
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(received).toEqual(['hi']);
  });
});
