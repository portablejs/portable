import { expect, test } from 'vite-plus/test'
import * as big5 from '../big5.js'
import * as eucJp from '../euc-jp.js'
import * as eucKr from '../euc-kr.js'
import * as gbk from '../gbk.js'
import * as root from '../index.js'
import * as iso2022Jp from '../iso-2022-jp.js'
import * as shiftJis from '../shift_jis.js'
import * as singleByte from '../single-byte.js'
import * as utf16 from '../utf-16.js'

const sources = import.meta.glob<string>('../*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})
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
)
const examples = Object.entries(sources).flatMap(([file, source]) =>
  [...source.matchAll(/^ \* (Charset\.encode\(.*\)) \/\/ Uint8Array \[(.*)\]$/gm)].map(
    ([, call, bytes]) => [file, call!, bytes!] as const,
  ),
)

test('finds encode examples in every module that has one', () => {
  expect(new Set(examples.map(([file]) => file)).size).toBe(12)
})

test.each(examples)('%s: %s', async (_, call, bytes) => {
  const AsyncFunction = (async () => {}).constructor as FunctionConstructor
  const run = new AsyncFunction(...Object.keys(scope), `return ${call}`) as (
    ...args: unknown[]
  ) => Promise<Uint8Array>
  expect([...(await run(...Object.values(scope)))]).toEqual(bytes.split(', ').map(Number))
})
