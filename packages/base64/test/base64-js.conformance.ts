import { describe, expect, test } from 'vite-plus/test'
import { decode, InvalidInputError, encode } from '@portable/base64'
import { latin1 } from './utils.js'

describe('base64-js', () => {
  test('converts big data to base64 and back', () => {
    const big = new Uint8Array(64 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) {
      big[i] = i % 256
    }
    const decoded = decode(encode(big))
    expect(decoded.length).toBe(big.length)
    expect(decoded.every((byte, i) => byte === big[i])).toBe(true)
  })

  test('converts to base64 and back', () => {
    for (const check of ['a', 'aa', 'aaa', 'hi', 'hi!', 'hi!!', 'sup', 'sup?', 'sup?!']) {
      const decoded = decode(encode(latin1(check)))
      expect(String.fromCharCode(...decoded)).toBe(check)
    }
  })

  const data = [
    [[0, 0, 0], 'AAAA'],
    [[0, 0, 1], 'AAAB'],
    [[0, 1, -1], 'AAH/'],
    [[1, 1, 1], 'AQEB'],
    [[0, -73, 23], 'ALcX'],
  ] as const

  test('converts known data to a string', () => {
    for (const [bytes, expected] of data) {
      expect(encode(new Uint8Array(bytes))).toBe(expected)
    }
  })

  test('converts known data from a string', () => {
    for (const [bytes, string] of data) {
      expect(decode(string)).toEqual(new Uint8Array(bytes))
    }
  })

  test('rejects data after padding, or decodes it in mime mode', () => {
    expect(() => decode('SQ==QU0=')).toThrow(InvalidInputError)
    expect(String.fromCharCode(...decode('SQ==QU0=', { mode: 'mime' }))).toBe('IAM')
  })

  test('decodes url-safe strings', () => {
    const expected = new Uint8Array([0xff, 0xff, 0xbe, 0xff, 0xef, 0xbf, 0xfb, 0xef, 0xff])
    expect(decode('//++/++/++//')).toEqual(expected)
    expect(decode('__--_--_--__', { alphabet: 'base64url' })).toEqual(expected)
    expect(decode('__--_--_--__', { mode: 'mime' })).toEqual(expected)
    expect(() => decode('__--_--_--__')).toThrow(InvalidInputError)
  })
})
