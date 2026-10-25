import { Writable } from 'node:stream';
import { format as utilFormat } from 'node:util';
import { configureSync, defaultTextFormatter, getLogger } from '@logtape/logtape';
import * as Log from '@portable/log';
import { createConsola } from 'consola';
import createDebug from 'debug';
import loglevel from 'loglevel';
import pino from 'pino';
import { expect, test } from 'vite-plus/test';

// Every logger writes its finished text to `sink`, so the benchmarks measure the logger and not a
// terminal.
let written = 0;
const sink = (text: string) => {
  written += text.length;
};

function setup(on: boolean) {
  Log.enable(on ? 'app' : '', { console: false });
  if (on) {
    createDebug.enable('app');
  } else {
    createDebug.disable();
  }
  const debug = createDebug('app');
  debug.log = (...args: unknown[]) => sink(utilFormat(...args));
  const level = loglevel.getLogger(`app-${on}`);
  level.methodFactory =
    () =>
    (...args: unknown[]) =>
      sink(utilFormat(...args));
  level.setLevel(on ? 'debug' : 'warn');
  const consola = createConsola({
    level: on ? 4 : 1,
    reporters: [{ log: (entry) => sink(utilFormat(...entry.args)) }],
  }).withTag('app');
  configureSync({
    reset: true,
    sinks: { text: (record) => sink(defaultTextFormatter(record)) },
    loggers: [
      { category: 'app', sinks: ['text'], lowestLevel: on ? 'debug' : 'warning' },
      { category: ['logtape', 'meta'], sinks: [] },
    ],
  });
  return {
    ours: Log.create('app'),
    debug,
    level,
    consola,
    logtape: getLogger(['app']),
    pino: pino(
      { level: on ? 'debug' : 'warn', base: null },
      new Writable({
        write(chunk, _encoding, callback) {
          sink(String(chunk));
          callback();
        },
      }),
    ),
  };
}

const unsubscribe = new AbortController();
Log.subscribe((record) => sink(Log.format(record)), { signal: unsubscribe.signal });
const request = { id: 42, user: 'kevin' };

test('a disabled debug call is within 25% of debug', { timeout: 300_000 }, async ({ bench }) => {
  const { ours, debug, level, consola, logtape, pino } = setup(false);
  const result = await bench.compare(
    bench('@portable/log', () => ours.debug('user %s logged in', 'kevin')),
    bench('debug', () => debug('user %s logged in', 'kevin')),
    bench('loglevel', () => level.debug('user %s logged in', 'kevin')),
    bench('consola', () => consola.debug('user %s logged in', 'kevin')),
    bench('@logtape/logtape', () => logtape.debug('user {name} logged in', { name: 'kevin' })),
    bench('pino', () => pino.debug('user %s logged in', 'kevin')),
  );
  expect(result.get('debug')).not.toBeFasterThan(result.get('@portable/log'), { delta: 0.25 });
});

test('an enabled debug call with a format string, written as text, is within 25% of debug', async ({
  bench,
}) => {
  const { ours, debug, level, consola, logtape, pino } = setup(true);
  const result = await bench.compare(
    bench('@portable/log', () => ours.debug('user %s logged in', 'kevin')),
    bench('debug', () => debug('user %s logged in', 'kevin')),
    bench('loglevel', () => level.debug('user %s logged in', 'kevin')),
    bench('consola', () => consola.debug('user %s logged in', 'kevin')),
    bench('@logtape/logtape', () => logtape.debug('user {name} logged in', { name: 'kevin' })),
    bench('pino', () => pino.debug('user %s logged in', 'kevin')),
  );
  expect(result.get('debug')).not.toBeFasterThan(result.get('@portable/log'), { delta: 0.25 });
});

test('an enabled debug call with an object, written as text, is within 25% of debug', async ({
  bench,
}) => {
  const { ours, debug, level, consola, logtape, pino } = setup(true);
  const result = await bench.compare(
    bench('@portable/log', () => ours.debug('request', request)),
    bench('debug', () => debug('request %o', request)),
    bench('loglevel', () => level.debug('request', request)),
    bench('consola', () => consola.debug('request', request)),
    bench('@logtape/logtape', () => logtape.debug('request', request)),
    bench('pino', () => pino.debug(request, 'request')),
  );
  expect(result.get('debug')).not.toBeFasterThan(result.get('@portable/log'), { delta: 0.25 });
  expect(written).toBeGreaterThan(0);
});

test('creating and extending a logger is within 25% of debug', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/log', () => Log.create('app').extend('db')),
    bench('debug', () => createDebug('app').extend('db')),
  );
  expect(result.get('debug')).not.toBeFasterThan(result.get('@portable/log'), { delta: 0.25 });
});
