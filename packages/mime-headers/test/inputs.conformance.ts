import { describe, expect, test } from 'vite-plus/test'
import { byteForms, toByteForm } from '@portable/fuzz'
import * as MimeHeaders from '@portable/mime-headers'

const utf8 = (text: string) => new TextEncoder().encode(text)

describe('byte inputs', () => {
  for (const form of byteForms) {
    test(`reads a ${form} as UTF-8`, () => {
      const as = (text: string) => toByteForm(utf8(text), form)
      expect(MimeHeaders.parseAddresses(as('Jõgi <a@example.com>'))).toEqual(
        MimeHeaders.parseAddresses('Jõgi <a@example.com>'),
      )
      expect(MimeHeaders.parseMailboxes(as('a@example.com'))).toEqual(
        MimeHeaders.parseMailboxes('a@example.com'),
      )
      expect(MimeHeaders.parseHeaders(as('Subject: tere\r\n\tmaailm\r\n'))).toEqual(
        MimeHeaders.parseHeaders('Subject: tere\r\n\tmaailm\r\n'),
      )
      expect(MimeHeaders.unfold(as('a\r\n b'))).toBe('a b')
      expect(MimeHeaders.fold(as('Subject: tere'))).toBe(MimeHeaders.fold('Subject: tere'))
      expect(MimeHeaders.parseValue(as('text/plain; charset=utf-8'))).toEqual(
        MimeHeaders.parseValue('text/plain; charset=utf-8'),
      )
      expect(MimeHeaders.encodeWord(as('õhin'))).toBe(MimeHeaders.encodeWord('õhin'))
      expect(MimeHeaders.encodeWords(as('tere õhin'))).toBe(MimeHeaders.encodeWords('tere õhin'))
      expect(MimeHeaders.decodeWords(as('=?UTF-8?B?w7U=?='))).toBe('õ')
    })
  }

  test('throws a TypeError for an array of numbers', () => {
    expect(() => MimeHeaders.unfold([0x61] as never)).toThrow(TypeError)
  })
})
