import { expect, test } from 'vite-plus/test';

// Runs the conformance suites again in Node without ReadableStream.from and stream async
// iteration, as in Chromium 141, so the fallback paths are tested in both runtimes.
const native = ReadableStream as { from?: unknown };
delete native.from;
const prototype = ReadableStream.prototype as {
  values?: unknown;
  [Symbol.asyncIterator]?: unknown;
};
delete prototype.values;
delete prototype[Symbol.asyncIterator];

await import('./bridge.conformance.js');
await import('./collect.conformance.js');
await import('./combine.conformance.js');
await import('./tee.conformance.js');

test('runs without the native stream iteration APIs', () => {
  expect('from' in ReadableStream).toBe(false);
  expect(Symbol.asyncIterator in ReadableStream.prototype).toBe(false);
  expect('values' in ReadableStream.prototype).toBe(false);
});
