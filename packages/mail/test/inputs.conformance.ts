import { byteForms, streamOf, toByteForm } from '@portable/fuzz'
import { describe, expect, test } from 'vite-plus/test'
import { compose } from './utils.js'

const text = new TextEncoder().encode('Tere, wörld!\nSecond line\n')
const pdf = Uint8Array.from({ length: 200 }, (_, i) => i)

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`writes content given as a ${form} or a stream of them`, async () => {
      const expected = await compose({
        text,
        attachments: [{ content: pdf, filename: 'a.pdf' }],
      })
      expect(
        await compose({
          text: toByteForm(text, form),
          attachments: [{ content: toByteForm(pdf, form), filename: 'a.pdf' }],
        }),
      ).toBe(expected)
      expect(
        await compose({
          text: streamOf([
            toByteForm(text.subarray(0, 5), form),
            toByteForm(text.subarray(5), form),
          ]),
          attachments: [
            {
              content: streamOf([
                toByteForm(pdf.subarray(0, 90), form),
                toByteForm(pdf.subarray(90), form),
              ]),
              filename: 'a.pdf',
            },
          ],
        }),
      ).toBe(
        await compose({
          text: streamOf([text]),
          attachments: [{ content: streamOf([pdf]), filename: 'a.pdf' }],
        }),
      )
    })
  }
})
