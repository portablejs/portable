import { describe, expect, test } from 'vite-plus/test'
import {
  decodeWords,
  encodeWord,
  encodeWords,
  formatAddresses,
  formatValue,
  InvalidInputError,
  parseAddresses,
  parseMailboxes,
  parseHeaders,
  parseValue,
} from '@portable/mime-headers'

// Bugs and advisories from the libmime, nodemailer and email-addresses changelogs and issue
// trackers. Each test's name cites the upstream fix or report it covers, and PARITY.md lists
// them under "Known upstream issues".

describe('addresses', () => {
  test('a quoted local part holding an address is not read as that address (GHSA-mm7p-fcc7-pg87)', () => {
    expect(parseAddresses('"xclow3n@gmail.com x"@internal.domain')).toEqual([
      { name: '', address: '"xclow3n@gmail.com x"@internal.domain' },
    ])
  })

  test('deeply nested groups do not overflow the stack (nodemailer b61b9c0)', () => {
    const input = 'g:'.repeat(5000) + 'a@b.com' + ';'.repeat(5000)
    expect(parseMailboxes(input)).toEqual([{ name: '', address: 'a@b.com' }])
  })

  test('operators inside a domain literal are part of it (nodemailer #1829)', () => {
    expect(parseAddresses('user@[IPv6:2001:db8::1], b@c')).toEqual([
      { name: '', address: 'user@[IPv6:2001:db8::1]' },
      { name: '', address: 'b@c' },
    ])
  })

  test('a comment never holds the address (nodemailer a1538ea)', () => {
    expect(parseAddresses('(evil@evil.com) Name <good@good.com>')).toEqual([
      { name: 'Name', address: 'good@good.com' },
    ])
  })

  test('an escaped ")" does not end a comment (nodemailer c4ae20d)', () => {
    expect(parseAddresses('(x\\) <b@evil.example>) <a@victim.example>')).toEqual([
      { name: 'x) <b@evil.example>', address: 'a@victim.example' },
    ])
  })

  test('a quoted display name without "@" is not moved into the address (nodemailer 3570d26)', () => {
    expect(parseAddresses('"Name" <>')).toEqual([{ name: 'Name', address: '' }])
  })

  test('formatAddresses encodes a CRLF in a name instead of writing a new header', () => {
    expect(formatAddresses([{ name: 'a\r\nBcc: x@y', address: 'a@b.c' }])).toBe(
      '=?UTF-8?Q?a=0D=0ABcc=3A_x=40y?= <a@b.c>',
    )
  })

  test('formatAddresses refuses an address that would change the list', () => {
    for (const address of ['a@b.c, evil@evil.com', 'a@b.c>', '', 'Name <a@b.c>'])
      expect(() => formatAddresses([{ name: 'x', address }])).toThrow(InvalidInputError)
  })

  test('whitespace inside a domain is dropped (email-addresses)', () => {
    expect(parseAddresses('":sysmail"@ Some-Group. Some-Org')).toEqual([
      { name: '', address: '":sysmail"@Some-Group.Some-Org' },
    ])
  })
})

describe('encoded words', () => {
  test('utf-7, base64 and hex are not read as charsets (libmime 5.4.9)', () => {
    expect(decodeWords('=?utf-7?Q?+AGEAYgBj-?=')).toBe('+AGEAYgBj-')
    expect(decodeWords('=?base64?Q?YWJj?=')).toBe('YWJj')
    expect(decodeWords('=?hex?Q?616263?=')).toBe('616263')
  })

  test('B words keep every astral character whole (libmime 5.5.0)', () => {
    const input = '\u{20000}\u{1F600}\u{10000}'.repeat(10)
    const words = encodeWord(input, { encoding: 'B', maxLength: 20 }).split(' ')
    expect(words.every((word) => !decodeWords(word).includes('�'))).toBe(true)
    expect(decodeWords(words.join(' '))).toBe(input)
  })

  test('long non-ASCII text is split into words that each fit (libmime 5.4.9)', () => {
    const encoded = encodeWord('õ'.repeat(10000))
    expect(encoded.split(' ').every((word) => word.length <= 75)).toBe(true)
    expect(decodeWords(encoded)).toBe('õ'.repeat(10000))
  })

  test('text that looks like an encoded word is encoded', () => {
    expect(decodeWords(encodeWords('=?utf-8?q?a?='))).toBe('=?utf-8?q?a?=')
  })

  test('a word split across two encoded words joins its bytes', () => {
    expect(decodeWords('=?utf-8?b?w6k?==?utf-8?b?w6k=?=')).toBe('éé')
    expect(decodeWords('=?utf-8?q?=C3?= =?utf-8?q?=A9?=')).toBe('é')
  })
})

describe('header values', () => {
  test('"__proto__" is an ordinary parameter (libmime 5.4.2)', () => {
    const { params } = parseValue('x; __proto__=y; constructor=z')
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype)
    expect(Object.entries(params)).toEqual([
      ['__proto__', 'y'],
      ['constructor', 'z'],
    ])
  })

  test('a parameter value that looks like an encoded word is kept as it is (libmime 5.5.1)', () => {
    for (const value of ['=?utf-8?q?a?=', 'a =?utf-8?b?YQ==?= b'])
      expect(parseValue(formatValue({ value: 'x', params: { f: value } })).params['f']).toBe(value)
  })

  test('control characters and DEL in a parameter value are percent-encoded (libmime 5.5.0)', () => {
    const built = formatValue({ value: 'attachment', params: { filename: 'a\r\nb\x7f.txt' } })
    expect(built).toBe("attachment; filename*0*=utf-8''a%0D%0Ab%7F.txt")
  })

  test('an unpaired surrogate in a parameter becomes U+FFFD and nothing is left unencoded (libmime 5.5.0)', () => {
    expect(formatValue({ value: 'x', params: { f: 'a\ud800;b' } })).toBe(
      "x; f*0*=utf-8''a%EF%BF%BD%3Bb",
    )
  })

  test('an empty parameter value is quoted (libmime 5.5.0)', () => {
    expect(formatValue({ value: 'x', params: { f: '' } })).toBe('x; f=""')
  })

  test('a control character in the value or a parameter name is refused (libmime 5.5.0)', () => {
    expect(() => formatValue({ value: 'text/plain\r\nBcc: x', params: {} })).toThrow(
      InvalidInputError,
    )
    expect(() => formatValue({ value: 'x', params: { 'a\nb': 'c' } })).toThrow(InvalidInputError)
  })
})

describe('headers', () => {
  test('a bare line break that is not followed by whitespace starts a new header (libmime 5.4.2)', () => {
    expect(parseHeaders('Subject: a\nBcc: x@y\r\n\r\nbody')).toEqual([
      { name: 'Subject', value: 'a' },
      { name: 'Bcc', value: 'x@y' },
    ])
  })
})
