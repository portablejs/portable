import { domainToASCII, domainToUnicode } from 'node:url'
import punycode from 'punycode/punycode.js'
import tr46 from 'tr46'
import { expect, test } from 'vite-plus/test'
import * as Idna from '@portable/idna'

const unicode = [
  'bücher.example',
  'www.日本語.jp',
  'пример.испытание',
  'faß.de',
  '☕.example',
  'مثال.إختبار',
  'xn--fiqs8s.example',
  'MAÑANA.com',
  'www.example.com',
  'cdn.example.org',
]
const ascii = unicode.map((domain) => Idna.toAscii(domain))
const hostnames: string[] = []
const tr46Flags = { checkBidi: true, checkJoiners: true }

test('toUnicode on 10 hostnames within 25% of tr46', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/idna', () => {
      for (const domain of ascii) {
        Idna.toUnicode(domain)
      }
    }),
    bench('tr46', () => {
      for (const domain of ascii) {
        tr46.toUnicode(domain, tr46Flags)
      }
    }),
    bench('punycode', () => {
      for (const domain of ascii) {
        punycode.toUnicode(domain)
      }
    }),
    bench('node:url domainToUnicode', () => {
      for (const domain of ascii) {
        domainToUnicode(domain)
      }
    }),
  )
  expect(result.get('tr46')).not.toBeFasterThan(result.get('@portable/idna'), { delta: 0.25 })
  expect(result.get('punycode')).not.toBeFasterThan(result.get('@portable/idna'), { delta: 0.25 })
})

test('toAscii on 10 domains within 25% of tr46', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/idna', () => {
      for (const domain of unicode) {
        Idna.toAscii(domain)
      }
    }),
    bench('tr46', () => {
      for (const domain of unicode) {
        tr46.toASCII(domain, tr46Flags)
      }
    }),
    bench('punycode', () => {
      for (const domain of unicode) {
        punycode.toASCII(domain)
      }
    }),
    bench('node:url domainToASCII', () => {
      for (const domain of unicode) {
        domainToASCII(domain)
      }
    }),
    bench('new URL().hostname', () => {
      for (const domain of unicode) {
        hostnames.push(new URL(`http://${domain}/`).hostname)
      }
      hostnames.length = 0
    }),
  )
  expect(result.get('tr46')).not.toBeFasterThan(result.get('@portable/idna'), { delta: 0.25 })
  expect(result.get('punycode')).not.toBeFasterThan(result.get('@portable/idna'), { delta: 0.25 })
})
