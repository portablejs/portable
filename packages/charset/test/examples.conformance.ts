import { expect, test } from 'vite-plus/test';
import * as big5 from '@portable/charset/big5';
import * as eucJp from '@portable/charset/euc-jp';
import * as eucKr from '@portable/charset/euc-kr';
import * as gbk from '@portable/charset/gbk';
import * as root from '@portable/charset';
import * as iso2022Jp from '@portable/charset/iso-2022-jp';
import * as shiftJis from '@portable/charset/shift_jis';
import * as singleByte from '@portable/charset/single-byte';
import * as utf16 from '@portable/charset/utf-16';

const sources = import.meta.glob<string>('../src/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const scope = Object.assign(
  { Charset: root },
  singleByte,
  shiftJis,
  eucJp,
  iso2022Jp,
  gbk,
  big5,
  eucKr,
  utf16,
);
const examples = Object.entries(sources).flatMap(([file, source]) =>
  [...source.matchAll(/^ \* (Charset\.encode\(.*\)); \/\/ Uint8Array \[(.*)\]$/gm)].map(
    ([, call, bytes]) => [file, call!, bytes!] as const,
  ),
);

test('finds encode examples in every module that has one', () => {
  expect(new Set(examples.map(([file]) => file)).size).toBe(12);
});

test.each(examples)('%s: %s', async (_, call, bytes) => {
  const AsyncFunction = (async () => {}).constructor as FunctionConstructor;
  const run = new AsyncFunction(...Object.keys(scope), `return ${call}`) as (
    ...args: unknown[]
  ) => Promise<Uint8Array>;
  expect([...(await run(...Object.values(scope)))]).toEqual(bytes.split(', ').map(Number));
});
