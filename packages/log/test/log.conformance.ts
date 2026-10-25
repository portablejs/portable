import * as Log from '@portable/log';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

let records: Log.Record[] = [];
let controller: AbortController;

beforeEach(() => {
  records = [];
  controller = new AbortController();
  Log.enable('', { console: false });
  Log.subscribe((record) => records.push(record), { signal: controller.signal });
});

afterEach(() => controller.abort());

function levels(log: Log.Logger): Log.Level[] {
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  const result = records.map((record) => record.level);
  records = [];
  return result;
}

describe('patterns', () => {
  test('with no patterns, warn and error log', () => {
    expect(levels(Log.create('app'))).toEqual(['warn', 'error']);
  });

  test('a matching pattern enables every level', () => {
    Log.enable('app:*');
    expect(levels(Log.create('app:db'))).toEqual(['debug', 'info', 'warn', 'error']);
    expect(levels(Log.create('lib'))).toEqual(['warn', 'error']);
  });

  test('a pattern can set a minimum level', () => {
    Log.enable('app:*=info');
    expect(levels(Log.create('app:db'))).toEqual(['info', 'warn', 'error']);
  });

  test('when several patterns match, the lowest minimum is used', () => {
    Log.enable('app:*=error,app:db=debug');
    expect(levels(Log.create('app:db'))).toEqual(['debug', 'info', 'warn', 'error']);
    expect(levels(Log.create('app:http'))).toEqual(['error']);
  });

  test('an exclusion turns off every level, even when another pattern matches', () => {
    Log.enable('*,-app:noisy');
    expect(levels(Log.create('app:noisy'))).toEqual([]);
    expect(levels(Log.create('app:db'))).toHaveLength(4);
  });

  test('spaces and commas separate patterns, and regex characters match literally', () => {
    Log.enable('a.b  c+d,');
    expect(Log.create('a.b').isEnabled()).toBe(true);
    expect(Log.create('axb').isEnabled()).toBe(false);
    expect(Log.create('c+d').isEnabled()).toBe(true);
  });

  test('an unknown level throws a RangeError and keeps the previous patterns', () => {
    Log.enable('app');
    expect(() => Log.enable('app=verbose')).toThrow(RangeError);
    expect(() => Log.enable('app=')).toThrow(RangeError);
    expect(Log.create('app').isEnabled()).toBe(true);
  });
});

describe('disable', () => {
  test('turns off warnings and errors too', () => {
    Log.disable();
    expect(levels(Log.create('app'))).toEqual([]);
  });

  test('returns the previous patterns, which enable restores', () => {
    Log.enable('test,abc*,-abc');
    const previous = Log.disable();
    expect(previous).toBe('test,abc*,-abc');
    expect(Log.create('abcd').isEnabled()).toBe(false);
    Log.enable(previous);
    expect(Log.create('abcd').isEnabled()).toBe(true);
    expect(Log.create('abc').isEnabled()).toBe(false);
  });
});

describe('loggers', () => {
  test('isEnabled follows later enable calls', () => {
    const log = Log.create('app');
    expect(log.isEnabled()).toBe(false);
    expect(log.isEnabled('warn')).toBe(true);
    Log.enable('app=info');
    expect(log.isEnabled()).toBe(false);
    expect(log.isEnabled('info')).toBe(true);
    Log.enable('');
    expect(log.isEnabled('info')).toBe(false);
  });

  test('methods work when detached from the logger', () => {
    Log.enable('app');
    const { debug } = Log.create('app');
    debug('x');
    expect(records).toHaveLength(1);
  });

  test('extend appends to the namespace with a colon', () => {
    Log.enable('app:db:*');
    const log = Log.create('app:db').extend('query');
    expect(log.namespace).toBe('app:db:query');
    log.debug('x');
    expect(records[0]?.namespace).toBe('app:db:query');
  });

  test('with adds properties to every record, and extend keeps them', () => {
    Log.enable('*');
    const log = Log.create('app').with({ requestId: 1 }).with({ user: 'a' });
    log.debug('x');
    log.extend('db').debug('y');
    expect(records.map((record) => record.properties)).toEqual([
      { requestId: 1, user: 'a' },
      { requestId: 1, user: 'a' },
    ]);
  });

  test('records keep the arguments as passed', () => {
    Log.enable('*');
    const error = new Error('boom');
    const before = Date.now();
    Log.create('app').error(error, { id: 2 });
    expect(records[0]).toMatchObject({ level: 'error', args: [error, { id: 2 }], properties: {} });
    expect(records[0]!.time.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('subscribe', () => {
  test('an aborted signal removes the subscriber', () => {
    Log.enable('*');
    controller.abort();
    Log.create('app').debug('x');
    expect(records).toEqual([]);
  });

  test('an already aborted signal never adds it', () => {
    Log.enable('*');
    const seen: Log.Record[] = [];
    Log.subscribe((record) => seen.push(record), { signal: AbortSignal.abort() });
    Log.create('app').debug('x');
    expect(seen).toEqual([]);
  });
});

describe('withContext', () => {
  test('adds properties during the call when a storage is configured', () => {
    let store: Log.Properties | undefined;
    const storage = {
      run: <result>(value: Log.Properties, fn: () => result): result => {
        const previous = store;
        store = value;
        try {
          return fn();
        } finally {
          store = previous;
        }
      },
      getStore: () => store,
    } satisfies Log.ContextStorage;
    Log.enable('*', { context: storage });
    const log = Log.create('app').with({ a: 1 });
    const result = Log.withContext({ requestId: 7 }, () => {
      Log.withContext({ step: 'b' }, () => log.debug('inside'));
      return 'done';
    });
    log.debug('outside');
    expect(result).toBe('done');
    expect(records.map((record) => record.properties)).toEqual([
      { requestId: 7, step: 'b', a: 1 },
      { a: 1 },
    ]);
  });
});

describe('format', () => {
  const record = (...args: unknown[]): Log.Record => ({
    time: new Date(0),
    level: 'debug',
    namespace: 'app',
    args,
    properties: {},
  });

  test.each([
    [['%s and %s', 'a', 'b'], 'a and b'],
    [['%d%%', '42'], '42%'],
    [['%i', 4.7], '4'],
    [['%f', '1.5'], '1.5'],
    [['%j %o %O', { a: 1 }, [1], null], '{"a":1} [1] null'],
    [['%c styled', 'color:red'], ' styled'],
    [['extra', 1, { b: 2 }], 'extra 1 {"b":2}'],
    [['missing %s'], 'missing %s'],
    [['%x stays', 1], '%x stays 1'],
    [['ends with %'], 'ends with %'],
    [[{ a: 1 }, 'x'], '{"a":1} x'],
    [[undefined], 'undefined'],
    [[], ''],
  ])('%j', (args, expected) => {
    expect(Log.format(record(...args))).toBe(expected);
  });

  test('errors print their stack, and values JSON rejects print with String', () => {
    const error = new Error('boom');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(Log.format(record('failed', error))).toBe(`failed ${error.stack}`);
    expect(Log.format(record(circular, 1n))).toBe('[object Object] 1');
  });
});

describe('console', () => {
  test('uses the method for the level and colors the namespace with %c', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      Log.enable('*', { console: true });
      Log.create('app:db').debug('connected to %s', 'db');
      Log.create('app:db').with({ id: 1 }).warn({ slow: true });
      expect(log).toHaveBeenCalledWith(
        '%capp:db%c connected to %s',
        expect.stringContaining('color:hsl('),
        '',
        'db',
      );
      expect(warn).toHaveBeenCalledWith(
        '%capp:db%c',
        expect.any(String),
        '',
        { slow: true },
        { id: 1 },
      );
    } finally {
      Log.enable(undefined, { console: false });
      log.mockRestore();
      warn.mockRestore();
    }
  });

  test('time prefixes an ISO 8601 timestamp', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      Log.enable('*', { console: true, time: true });
      Log.create('app').info('x');
      expect(info.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z %capp%c x$/);
    } finally {
      Log.enable(undefined, { console: false, time: false });
      info.mockRestore();
    }
  });

  test('Log.console writes a changed record', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      Log.enable('*');
      Log.subscribe((record) => Log.console({ ...record, args: ['[redacted]'] }), {
        signal: controller.signal,
      });
      Log.create('app').error('token %s', 'secret');
      expect(error).toHaveBeenCalledWith('%capp%c [redacted]', expect.any(String), '');
    } finally {
      error.mockRestore();
    }
  });
});
