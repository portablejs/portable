import { expect, test } from 'vite-plus/test'
import { fc, fuzz } from './index.js'

const busy = (ms: number) => {
  const end = performance.now() + ms
  while (performance.now() < end) {}
}

test('fails a property when a sync run takes longer than the timeout', () => {
  expect(() =>
    fuzz(
      fc.property(fc.nat(), (n) => busy(n % 3 === 0 ? 30 : 0)),
      { timeout: 10 },
    ),
  ).toThrow(
    expect.objectContaining({
      cause: expect.objectContaining({ message: expect.stringMatching(/over the 10 ms limit/) }),
    }),
  )
})

test('fails a property when an async run never settles', async () => {
  await expect(
    fuzz(
      fc.asyncProperty(fc.nat(), (n) =>
        n % 3 === 0 ? new Promise<void>(() => {}) : Promise.resolve(),
      ),
      { timeout: 50 },
    ),
  ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/timeout/) } })
})

test('passes a property whose runs finish within the timeout', async () => {
  fuzz(
    fc.property(fc.nat(), () => busy(1)),
    { timeout: 1000 },
  )
  await fuzz(
    fc.asyncProperty(fc.nat(), async () => {}),
    { timeout: 1000 },
  )
})
