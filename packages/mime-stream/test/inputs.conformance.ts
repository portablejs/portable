import { describe, expect, test } from 'vite-plus/test'
import { byteForms, readAll, readBytes, streamOf, toByteForm } from '@portable/fuzz'
import * as MimeStream from '@portable/mime-stream'

const message = new TextEncoder().encode(
  'Content-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nhéllo\r\n--b--\r\n',
)

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads ${form} chunks`, async () => {
      const chunks = [
        toByteForm(message.subarray(0, 30), form),
        toByteForm(message.subarray(30), form),
      ]
      const decoded = await readAll(streamOf(chunks).pipeThrough(new MimeStream.DecoderStream()))
      expect(decoded).toEqual(
        await readAll(streamOf([message]).pipeThrough(new MimeStream.DecoderStream())),
      )
      const encoded = await readBytes(
        streamOf<MimeStream.EncoderStream.Input>(
          decoded.map((chunk) => ({ ...chunk, bytes: toByteForm(chunk.bytes, form) })),
        ).pipeThrough(new MimeStream.EncoderStream()),
      )
      expect(encoded).toEqual(message)
      expect(await readBytes(streamOf(chunks).pipeThrough(new MimeStream.EncoderStream()))).toEqual(
        message,
      )
    })

    test(`splitHeaders reads ${form} chunks`, async () => {
      const chunks = [
        toByteForm(message.subarray(0, 20), form),
        toByteForm(message.subarray(20), form),
      ]
      const { headers, body } = await MimeStream.splitHeaders(streamOf(chunks))
      expect(new TextDecoder().decode(headers)).toBe(
        'Content-Type: multipart/mixed; boundary=b\r\n\r\n',
      )
      expect(await readBytes(body)).toEqual(message.subarray(headers.length))
    })
  }
})
