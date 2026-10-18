import { describe, expect, test } from 'vite-plus/test'
import * as MimeHeaders from '@portable/mime-headers'

// The examples in the JSDoc and the README, so the documented results stay true.

describe('JSDoc examples', () => {
  test('encodeWord', () => {
    expect(MimeHeaders.encodeWord('See on õhin test')).toBe('=?UTF-8?Q?See_on_=C3=B5hin_test?=')
    expect(MimeHeaders.encodeWord('See on õhin test', { encoding: 'B' })).toBe(
      '=?UTF-8?B?U2VlIG9uIMO1aGluIHRlc3Q=?=',
    )
  })

  test('encodeWords', () => {
    expect(MimeHeaders.encodeWords('Tere õhtust, Mari')).toBe(
      'Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari',
    )
    expect(MimeHeaders.encodeWords('plain ascii')).toBe('plain ascii')
  })

  test('decodeWords', () => {
    expect(MimeHeaders.decodeWords('Hello =?UTF-8?Q?J=C3=B5geva?=')).toBe('Hello Jõgeva')
    expect(MimeHeaders.decodeWords('=?UTF-8?B?w7U=?= =?UTF-8?B?w7U=?=')).toBe('õõ')
  })

  test('fold, unfold and parseHeaders', () => {
    expect(MimeHeaders.fold('To: a@example.com, b@example.com', { lineLength: 20 })).toBe(
      'To: a@example.com,\r\n b@example.com',
    )
    expect(MimeHeaders.unfold('Subject: line one\r\n line two')).toBe('Subject: line one line two')
    expect(
      MimeHeaders.parseHeaders('Subject: Hello\r\n world\r\nTo: a@example.com\r\n\r\nBody'),
    ).toEqual([
      { name: 'Subject', value: 'Hello world' },
      { name: 'To', value: 'a@example.com' },
    ])
  })

  test('parseValue and formatValue', () => {
    expect(MimeHeaders.parseValue('text/plain; CHARSET="utf-8"; format=flowed')).toEqual({
      value: 'text/plain',
      params: { charset: 'utf-8', format: 'flowed' },
    })
    expect(MimeHeaders.parseValue("attachment; filename*=UTF-8''J%C3%B5geva.txt")).toEqual({
      value: 'attachment',
      params: { filename: 'Jõgeva.txt' },
    })
    expect(
      MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'report 2024.pdf' } }),
    ).toBe('attachment; filename="report 2024.pdf"')
    expect(
      MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'Jõgeva.txt' } }),
    ).toBe("attachment; filename*0*=utf-8''J%C3%B5geva.txt")
  })

  test('parseAddresses and formatAddresses', () => {
    expect(
      MimeHeaders.parseAddresses('"Reinman, Andris" <andris@example.com>, team: a@example.com;'),
    ).toEqual([
      { name: 'Reinman, Andris', address: 'andris@example.com' },
      { name: 'team', group: [{ name: '', address: 'a@example.com' }] },
    ])
    expect(
      MimeHeaders.formatAddresses([
        { name: 'Reinman, Andris', address: 'andris@example.com' },
        { name: 'Jõgeva', address: 'j@example.com' },
      ]),
    ).toBe('"Reinman, Andris" <andris@example.com>, =?UTF-8?Q?J=C3=B5geva?= <j@example.com>')
  })

  test('InvalidInputError', () => {
    expect(() => MimeHeaders.parseAddresses('not an address', { strict: true })).toThrow(
      MimeHeaders.InvalidInputError,
    )
  })
})

describe('README examples', () => {
  test('the overview', () => {
    expect(MimeHeaders.fold('Subject: ' + MimeHeaders.encodeWords('Tere õhtust, Mari'))).toBe(
      'Subject: Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari',
    )
    expect(MimeHeaders.decodeWords('Tere =?UTF-8?Q?=C3=B5htust=2C?= Mari')).toBe(
      'Tere õhtust, Mari',
    )
    expect(MimeHeaders.parseValue("attachment; filename*=UTF-8''%C3%B5.pdf")).toEqual({
      value: 'attachment',
      params: { filename: 'õ.pdf' },
    })
    expect(MimeHeaders.formatValue({ value: 'attachment', params: { filename: 'õ.pdf' } })).toBe(
      "attachment; filename*0*=utf-8''%C3%B5.pdf",
    )
    expect(
      MimeHeaders.parseAddresses('Mari Maasikas <mari@example.com>, Team: a@example.com;'),
    ).toEqual([
      { name: 'Mari Maasikas', address: 'mari@example.com' },
      { name: 'Team', group: [{ name: '', address: 'a@example.com' }] },
    ])
    expect(
      MimeHeaders.formatAddresses([{ name: 'Maasikas, Mari', address: 'mari@example.com' }]),
    ).toBe('"Maasikas, Mari" <mari@example.com>')
    expect(
      MimeHeaders.parseHeaders('Subject: Tere\r\n õhtust\r\nTo: mari@example.com\r\n\r\nbody'),
    ).toEqual([
      { name: 'Subject', value: 'Tere õhtust' },
      { name: 'To', value: 'mari@example.com' },
    ])
  })

  test('the differences', () => {
    expect(MimeHeaders.parseAddresses('<"user"@example.com>')).toEqual([
      { name: '', address: 'user@example.com' },
    ])
    expect(MimeHeaders.parseAddresses('<x@evil.com @good.com>')).toEqual([
      { name: '@good.com', address: 'x@evil.com' },
    ])
    expect(MimeHeaders.parseAddresses('H.P. Lovecraft <a@b.c>', { strict: true })).toEqual([
      { name: 'H.P. Lovecraft', address: 'a@b.c' },
    ])
    expect(MimeHeaders.parseAddresses('user@münchen.de')).toEqual([
      { name: '', address: 'user@münchen.de' },
    ])
  })
})
