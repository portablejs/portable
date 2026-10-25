import { format as utilFormat } from 'node:util';
import * as Log from '@portable/log';
import createDebug from 'debug';
import { describe, expect, test } from 'vite-plus/test';

describe('patterns match as in debug', () => {
  const namespaces = [
    'app',
    'app:db',
    'app:db:query',
    'app:http',
    'lib',
    'lib:x',
    'abc',
    'abcd',
    'test',
  ];
  test.each([
    '*',
    '-*',
    '',
    'app',
    'app:*',
    'app*',
    'app:*,-app:db',
    'app:*,-app:db*',
    '*,-lib:*',
    'test,abc*,-abc',
    'app:* lib',
    '*:db',
    'a*:q*',
  ])('%j', (patterns) => {
    Log.enable(patterns, { console: false });
    createDebug.enable(patterns);
    const ours = namespaces.map((namespace) => [namespace, Log.create(namespace).isEnabled()]);
    const theirs = namespaces.map((namespace) => [namespace, createDebug.enabled(namespace)]);
    expect(ours).toEqual(theirs);
  });
});

describe('format matches util.format', () => {
  const record = (...args: unknown[]): Log.Record => ({
    time: new Date(0),
    level: 'debug',
    namespace: 'app',
    args,
    properties: {},
  });

  test.each([
    ['plain text'],
    ['%s logged in', 'kevin'],
    ['%s and %s', 'a', 'b'],
    ['%d items', 42],
    ['%d', '7'],
    ['%i', 4.9],
    ['%f', '1.5'],
    ['%j', { a: [1, 'b'] }],
    ['100%%'],
    ['missing %s'],
    ['%x is not a specifier', 1],
    ['extra', 'words', 'here'],
    ['%s', 'a', 'b', 'c'],
    [42],
  ])('%j', (...args) => {
    expect(Log.format(record(...args))).toBe(utilFormat(...args));
  });
});
