import * as Exif from '@portable/exif'
import { cuts, fc, fuzz, mutated, outcome, outcomeAsync, split } from '@portable/fuzz'
import { fromIterable } from '@portable/streams'
import { beforeAll, describe, expect, test } from 'vite-plus/test'
import { fixture } from './utils.js'

const errors = [Exif.InvalidInputError, Exif.TruncatedError, Exif.UnsupportedError]
const names = ['tetons.exif', 'IMG_0774.exif', 'png-exif.exif', 'non-ascii.exif', 'starfish.jpg']
const inputs: Record<string, Uint8Array> = {}
beforeAll(async () => {
  for (const name of names) inputs[name] = await fixture(name)
}, 60_000)

describe('parse', () => {
  for (const name of names) {
    test(`returns or throws a documented error for a mutated ${name}`, () => {
      const original = inputs[name]!
      // Only the first 30 kB of the JPEG hold metadata. The rest is image data that parse skips.
      const within = name.endsWith('.jpg') ? 30_000 : original.length
      fuzz(
        fc.property(mutated(original, { within }), (bytes) => {
          outcome(errors, () => Exif.parse(bytes))
        }),
        { scale: 3 },
      )
    })

    test(`returns or throws a documented error for a truncated ${name}`, () => {
      const original = inputs[name]!
      fuzz(
        fc.property(fc.nat({ max: original.length }), (length) => {
          outcome(errors, () => Exif.parse(original.subarray(0, length)))
        }),
        { scale: 3 },
      )
    })
  }
})

describe('parseStream', () => {
  test('returns what parse returns for the whole file, however it is chunked', async () => {
    const file = fc.constantFrom(...names).chain((name) => {
      const original = inputs[name]!
      return mutated(original, { within: Math.min(original.length, 30_000) })
    })
    await fuzz(
      fc.asyncProperty(file, cuts, async (bytes, at) => {
        expect(
          await outcomeAsync(errors, () => Exif.parseStream(fromIterable(split(bytes, at)))),
        ).toEqual(outcome(errors, () => Exif.parse(bytes)))
      }),
    )
  })
})

describe('parseDate', () => {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')

  test('reads back the date in an EXIF date string', () => {
    fuzz(
      fc.property(
        fc.date({
          min: new Date('1900-01-01Z'),
          max: new Date('9999-12-31Z'),
          noInvalidDate: true,
        }),
        fc.constantFrom(':', '-'),
        (date, separator) => {
          const text =
            [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join(
              separator,
            ) +
            ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` +
            `.${pad(date.getUTCMilliseconds(), 3)}`
          expect(Exif.parseDate(text)).toEqual(date)
        },
      ),
    )
  })

  test('applies any UTC offset written in the value or given as the option', () => {
    fuzz(
      fc.property(
        fc.date({
          min: new Date('1970-01-02Z'),
          max: new Date('9999-12-30Z'),
          noInvalidDate: true,
        }),
        fc.integer({ min: -(23 * 60 + 59), max: 23 * 60 + 59 }),
        fc.boolean(),
        (date, minutes, inValue) => {
          const local = new Date(date.getTime() - (date.getTime() % 1000))
          const zone =
            (minutes < 0 ? '-' : '+') +
            pad(Math.floor(Math.abs(minutes) / 60)) +
            ':' +
            pad(Math.abs(minutes) % 60)
          const text = local.toISOString().slice(0, 19).replace('T', ' ')
          const parsed = inValue
            ? Exif.parseDate(text.replace(' ', 'T') + zone)
            : Exif.parseDate(text, { offset: zone })
          expect(parsed).toEqual(new Date(local.getTime() - minutes * 60_000))
        },
      ),
    )
  })

  test('returns a valid Date or undefined for any text', () => {
    const text = fc.string({
      unit: fc.constantFrom('0', '1', '9', ':', '-', ' ', 'T', 'Z', '+', '.', 'a'),
      maxLength: 32,
    })
    fuzz(
      fc.property(text, fc.option(text, { nil: undefined }), (value, offset) => {
        const date = Exif.parseDate(value, { offset })
        expect(date === undefined || !Number.isNaN(date.getTime())).toBe(true)
      }),
    )
  })
})
