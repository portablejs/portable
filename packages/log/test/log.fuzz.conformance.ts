import { fc, fuzz, outcome } from '@portable/fuzz';
import * as Log from '@portable/log';
import { expect, test } from 'vite-plus/test';

const segment = fc.constantFrom('app', 'db', 'a.b', 'x+y', '*', '');
const name = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join(':'));
const pattern = fc
  .tuple(fc.boolean(), name)
  .map(([exclude, text]) => (exclude ? `-${text}` : text));
const namespace = fc
  .array(fc.constantFrom('app', 'db', 'a.b', 'axb', 'x+y', 'q'), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(':'));

function reference(patterns: readonly string[], ns: string): boolean {
  const matches = (glob: string) =>
    new RegExp(
      `^${glob
        .split('')
        .map((c) => (c === '*' ? '.*' : c.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')))
        .join('')}$`,
    ).test(ns);
  const live = patterns.filter(Boolean);
  if (live.some((p) => p.startsWith('-') && matches(p.slice(1)))) {
    return false;
  }
  return live.some((p) => !p.startsWith('-') && matches(p));
}

test('enabled agrees with a regex reference for any patterns and namespace', () => {
  fuzz(
    fc.property(fc.array(pattern, { maxLength: 4 }), namespace, (patterns, ns) => {
      Log.enable(patterns.join(','), { console: false });
      expect(Log.create(ns).isEnabled()).toBe(reference(patterns, ns));
    }),
  );
});

test('enable either accepts a pattern string or throws a RangeError', () => {
  fuzz(
    fc.property(fc.string({ maxLength: 30 }), (text) => {
      outcome([RangeError], () => Log.enable(text, { console: false }));
    }),
  );
});

test('format returns a string for any arguments', () => {
  fuzz(
    fc.property(fc.array(fc.anything(), { maxLength: 5 }), fc.string(), (args, first) => {
      for (const list of [args, [first, ...args]]) {
        const text = Log.format({
          time: new Date(0),
          level: 'debug',
          namespace: 'x',
          args: list,
          properties: {},
        });
        expect(typeof text).toBe('string');
      }
    }),
  );
});
