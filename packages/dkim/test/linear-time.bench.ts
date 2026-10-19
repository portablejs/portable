import * as Dkim from '@portable/dkim'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import { ed25519Record, privatePem, resolverFrom } from './utils.js'

// After mailauth's assert-linear helper: four times the input costs a linear implementation about
// 4x and a quadratic one about 16x, so 8x separates them without a fixed time limit. The fastest
// of five runs counts, which filters out GC pauses and other load. These run with the benchmarks,
// because timings on a shared machine are too noisy for the git hooks.

let edPem: string
let resolver: Dkim.Resolver

beforeAll(async () => {
  edPem = await privatePem('ed25519')
  resolver = resolverFrom({ 's._domainkey.example.com': [await ed25519Record()] })
})

const sign = (message: string) =>
  Dkim.sign(message, { domain: 'example.com', selector: 's', privateKey: edPem })

async function expectLinear(run: (size: number) => Promise<unknown>, small: number) {
  const time = async (size: number) => {
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const started = performance.now()
      await run(size)
      best = Math.min(best, performance.now() - started)
    }
    return best
  }
  await run(Math.ceil(small / 10))
  const smallMs = await time(small)
  const largeMs = await time(small * 4)
  expect(largeMs).toBeLessThan(smallMs * 8 + 100)
}

describe('linear time', () => {
  // nodemailer GHSA-39m8-27wv-hr27: unfolding was quadratic in the number of continuation lines.
  test('signs and verifies a header folded into many lines', { timeout: 60_000 }, async () => {
    const folded = (lines: number) =>
      `From: a@example.com\r\nTo: x@example.com,\r\n${' cont@example.com,\r\n'.repeat(lines)}Subject: x\r\n\r\nbody`
    await expectLinear(async (lines) => {
      const text = folded(lines)
      await Dkim.verify((await sign(text)) + text, { resolver })
    }, 10_000)
  })

  test('reads a field name with a long blank run', { timeout: 60_000 }, async () => {
    const blank = (size: number) =>
      `From: a@example.com\r\nA${' '.repeat(size)}B: value\r\n\r\nbody`
    await expectLinear(async (size) => {
      const text = blank(size)
      await Dkim.verify((await sign(text)) + text, { resolver })
    }, 256 * 1024)
  })
})
