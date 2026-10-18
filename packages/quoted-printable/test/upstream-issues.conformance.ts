import { describe, expect, test } from 'vite-plus/test'
import { decode, encode } from '@portable/quoted-printable'
import { decodeStream, decodeText, latin1, utf8 } from './utils.js'

// Bugs reported against quoted-printable and libqp, and fixed in libqp's changelog. PARITY.md
// lists each with its source.

describe('quoted-printable issues', () => {
  test('#8: removes the whole whitespace run at the end of a line, not one character', () => {
    expect(decodeText('=2C  \t \r\n ')).toBe(',\r\n')
    expect(decodeText(' =2C ')).toBe(' ,')
    expect(decodeText(' =2C=20')).toBe(' , ')
  })

  test('#2: keeps hard line breaks and removes a trailing soft line break', () => {
    expect(decodeText('top\nbottom')).toBe('top\nbottom')
    expect(decodeText('hello=E2=A4=B5\r\nworld=')).toBe('hello⤵\r\nworld')
  })

  test('#5 and #6: returns bytes, so text in any charset decodes with TextDecoder', () => {
    const bytes = decode('=CA=EE=EB=EB=E5=E3=E8, =EF=F0=E8=E2=E5=F2!')
    expect(new TextDecoder('windows-1251').decode(bytes)).toBe('Коллеги, привет!')
  })

  test('#4: encodes a Uint8Array', () => {
    expect(encode(Uint8Array.of(0x66, 0x6f, 0x6f, 0x3d, 0xff))).toBe('foo=3D=FF')
  })

  test('encode() takes text with characters above U+00FF instead of throwing', () => {
    expect(encode('☃')).toBe('=E2=98=83')
  })

  test('a soft line break never splits a UTF-8 sequence', () => {
    const encoded = encode(utf8('fooIñtërnâtiônàlizætiøn☃💩bar'))
    for (const line of encoded.split('=\r\n'))
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(decode(line))).not.toThrow()
  })
})

describe('libqp issues fixed in 2.1.x and 3.0.x', () => {
  test('2.1.2: keeps raw 8-bit bytes when decoding', () => {
    expect(decode(latin1('caf\xe9 =E9'))).toEqual(latin1('caf\xe9 \xe9'))
  })

  test('2.1.3: never starts a line with a hyphen, which could read as a MIME boundary', () => {
    expect(encode('--boundary')).toBe('=2D-boundary')
    expect(encode('a'.repeat(75) + '--boundary')).toBe('a'.repeat(75) + '=\r\n=2D-boundary')
  })

  test('3.0.0: rejects a line length below 4, which made wrap() loop forever', () => {
    expect(() => encode('aaaaaa', { lineLength: 3 })).toThrow(RangeError)
  })

  test('3.0.1: escapes a hyphen after a lone CR, which a relay may turn into CRLF', () => {
    expect(encode('a\r--b')).toBe('a\r=2D-b')
  })

  test('3.0.1: does not add a soft line break when the rest of the line fits', () => {
    expect(encode('aaaaaaa\r\nbb', { lineLength: 7 })).toBe('aaaaaaa\r\nbb')
  })
})

describe('edge cases upstream tests miss', () => {
  test('the decoder stream joins a surrogate pair split across string chunks', async () => {
    expect(await decodeStream(['=41\ud83d', '\ude00'])).toEqual(utf8('A😀'))
  })

  test('decodes an escape split by a soft line break the same way in one piece or in chunks', async () => {
    expect(decodeText('=4=\r\n1')).toBe('A')
    expect(await decodeStream(['=4=', '\r', '\n1'])).toEqual(utf8('A'))
  })
})
