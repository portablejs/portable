import { describe, expect, test } from 'vite-plus/test'
import { decode, DecodeError, encode } from '../index.js'
import { latin1, text } from './utils.js'

const binary = (bytes: Uint8Array) => String.fromCharCode(...bytes)
const urlSafe = { alphabet: 'base64url', omitPadding: true } as const

describe('js-base64', () => {
  describe('basic', () => {
    for (const [plain, encoded] of [
      ['d', 'ZA=='],
      ['da', 'ZGE='],
      ['dan', 'ZGFu'],
    ]) {
      test(`${plain} and ${encoded}`, () => {
        expect(encode(plain!)).toBe(encoded)
        expect(text(decode(encoded!))).toBe(plain)
      })
    }
  })

  describe('whitespace', () => {
    for (const [encoded, plain] of [
      ['Z A==', 'd'],
      ['ZA ==', 'd'],
      ['ZG E=', 'da'],
      ['ZGF u', 'dan'],
    ]) {
      test(`${JSON.stringify(encoded)}`, () => expect(text(decode(encoded!))).toBe(plain))
    }
  })

  describe('null', () => {
    for (const [plain, encoded] of [
      ['\0', 'AA=='],
      ['\0\0', 'AAA='],
      ['\0\0\0', 'AAAA'],
    ]) {
      test(`${encoded}`, () => {
        expect(encode(plain!)).toBe(encoded)
        expect(text(decode(encoded!))).toBe(plain)
      })
    }
  })

  test('binary', () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    const bytes =
      '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a\x00\x00\x00\x0d\x49\x48\x44\x52\x00\x00\x00\x01\x00\x00\x00\x01\x08\x04\x00\x00\x00\xb5\x1c\x0c\x02\x00\x00\x00\x0b\x49\x44\x41\x54\x78\xda\x63\x64\x60\x00\x00\x00\x06\x00\x02\x30\x81\xd0\x2f\x00\x00\x00\x00\x49\x45\x4e\x44\xae\x42\x60\x82'
    expect(encode(latin1(bytes))).toBe(png)
    expect(binary(decode(png))).toBe(bytes)
  })

  describe('BOM', () => {
    const bom = '﻿'
    const keepBom = new TextDecoder('utf-8', { ignoreBOM: true })

    test('decode keeps a leading BOM', () => {
      expect(keepBom.decode(decode('77u/aGVsbG8='))).toBe(bom + 'hello')
    })

    test('round-trips a leading BOM', () => {
      expect(keepBom.decode(decode(encode(bom + 'hello')))).toBe(bom + 'hello')
    })

    test('round-trips a lone BOM', () => {
      expect(keepBom.decode(decode(encode(bom)))).toBe(bom)
    })
  })

  describe('Base64', () => {
    test('encode', () => expect(encode('小飼弾')).toBe('5bCP6aO85by+'))
    test('encodeURI', () => expect(encode('小飼弾', urlSafe)).toBe('5bCP6aO85by-'))
    test('decode', () => expect(text(decode('5bCP6aO85by+'))).toBe('小飼弾'))
    test('decode url-safe', () => {
      expect(text(decode('5bCP6aO85by-', { alphabet: 'base64url' }))).toBe('小飼弾')
      expect(text(decode('5bCP6aO85by-', { mode: 'mime' }))).toBe('小飼弾')
      expect(() => decode('5bCP6aO85by-')).toThrow(DecodeError)
    })
  })

  describe('fromUint8Array', () => {
    for (const word of ['dankogai', 'dankoga', 'dankog', 'danko', 'dank', 'dan', 'da', 'd', '']) {
      test(`${JSON.stringify(word)}`, () => expect(encode(latin1(word))).toBe(encode(word)))
    }
  })

  describe('toUint8Array', () => {
    for (const [encoded, bytes] of [
      ['ZGFua29nYWk=', [100, 97, 110, 107, 111, 103, 97, 105]],
      ['ZGFua29nYQ==', [100, 97, 110, 107, 111, 103, 97]],
      ['ZGFua29n', [100, 97, 110, 107, 111, 103]],
      ['ZGFua28=', [100, 97, 110, 107, 111]],
      ['ZGFuaw==', [100, 97, 110, 107]],
      ['ZGFu', [100, 97, 110]],
      ['ZGE=', [100, 97]],
      ['ZA==', [100]],
      ['', []],
    ] as const) {
      test(`${JSON.stringify(encoded)}`, () =>
        expect(decode(encoded)).toEqual(new Uint8Array(bytes)))
    }
  })

  describe('large', () => {
    let seed = ''
    for (let i = 0; i < 256; i++) seed += String.fromCharCode(i)
    for (let i = 0, str = seed; i < 16; str += str, i++) {
      test(`${str.length} characters`, () => expect(text(decode(encode(str)))).toBe(str))
    }
  })

  test('replaces a lone surrogate with U+FFFD, as TextEncoder does', () => {
    expect(encode('\uD800F')).toBe(encode('�F'))
    expect(encode('\uDBFFF')).toBe(encode('�F'))
  })

  describe('Yoshinoya', () => {
    test('encode', () => expect(encode('𠮷野家')).toBe('8KCut+mHjuWutg=='))
    test('encodeURI', () => expect(encode('𠮷野家', urlSafe)).toBe('8KCut-mHjuWutg'))
    test('decode', () => expect(text(decode('8KCut+mHjuWutg=='))).toBe('𠮷野家'))
    test('decode url-safe', () => {
      expect(text(decode('8KCut-mHjuWutg', { alphabet: 'base64url' }))).toBe('𠮷野家')
    })
  })
})
