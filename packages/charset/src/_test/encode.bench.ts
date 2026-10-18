import iconv from 'iconv-lite'
import { expect, test } from 'vite-plus/test'
import * as Charset from '../index.js'
import { shiftJis } from '../shift_jis.js'
import { windows1251 } from '../single-byte.js'

const russian =
  'Съешь же ещё этих мягких французских булок, да выпей чаю. Москва, 2026 год.\n'.repeat(5_000)
const japanese =
  '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。Tokyo 2026年。\n'.repeat(5_000)
const mixed = `${russian}${japanese}`

test('encodes 380 kB of Cyrillic text to windows-1251 within 25% of iconv-lite', async ({
  bench,
}) => {
  Charset.encode('', windows1251)
  const result = await bench.compare(
    bench('@portable/charset', () => {
      Charset.encode(russian, windows1251)
    }),
    bench('iconv-lite', () => {
      iconv.encode(russian, 'windows-1251')
    }),
  )
  expect(result.get('iconv-lite')).not.toBeFasterThan(result.get('@portable/charset'), {
    delta: 0.25,
  })
})

test('encodes 230 kB of Japanese text to Shift_JIS within 25% of iconv-lite', async ({ bench }) => {
  Charset.encode('', shiftJis)
  const result = await bench.compare(
    bench('@portable/charset', () => {
      Charset.encode(japanese, shiftJis)
    }),
    bench('iconv-lite', () => {
      iconv.encode(japanese, 'shift_jis')
    }),
  )
  expect(result.get('iconv-lite')).not.toBeFasterThan(result.get('@portable/charset'), {
    delta: 0.25,
  })
})

test('encodes UTF-8 within 25% of TextEncoder', async ({ bench }) => {
  const encoder = new TextEncoder()
  const result = await bench.compare(
    bench('@portable/charset', () => {
      Charset.encode(mixed, Charset.utf8)
    }),
    bench('TextEncoder', () => {
      encoder.encode(mixed)
    }),
    bench('iconv-lite', () => {
      iconv.encode(mixed, 'utf8')
    }),
  )
  expect(result.get('TextEncoder')).not.toBeFasterThan(result.get('@portable/charset'), {
    delta: 0.25,
  })
})
