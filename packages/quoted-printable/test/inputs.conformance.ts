import { describe, expect, test } from 'vite-plus/test'
import { byteForms, readBytes, streamOf, toByteForm } from '@portable/fuzz'
import * as QuotedPrintable from '@portable/quoted-printable'

const bytes = new TextEncoder().encode('héllo = wörld')
const encoded = QuotedPrintable.encode(bytes)
const encodedBytes = new TextEncoder().encode(encoded)

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form}`, async () => {
      expect(QuotedPrintable.encode(toByteForm(bytes, form))).toBe(encoded)
      expect(QuotedPrintable.decode(toByteForm(encodedBytes, form))).toEqual(bytes)
      const chunks = [toByteForm(bytes.subarray(0, 2), form), toByteForm(bytes.subarray(2), form)]
      expect(
        await readBytes(streamOf(chunks).pipeThrough(new QuotedPrintable.EncoderStream())),
      ).toEqual(encodedBytes)
      const encodedChunks = [
        toByteForm(encodedBytes.subarray(0, 2), form),
        toByteForm(encodedBytes.subarray(2), form),
      ]
      expect(
        await readBytes(streamOf(encodedChunks).pipeThrough(new QuotedPrintable.DecoderStream())),
      ).toEqual(bytes)
    })
  }
})
