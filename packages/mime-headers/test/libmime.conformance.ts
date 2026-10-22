import { describe, expect, test } from 'vite-plus/test'
import {
  decodeWords,
  encodeWord,
  encodeWords,
  fold,
  formatValue,
  parseHeaders,
  parseValue,
} from '@portable/mime-headers'
import { latin1 } from './utils.js'

// Ported from libmime 5.5.1 test/libmime-test.ts. libmime's encodeWord(text, 'Q', n) is
// encodeWord(text, { maxLength: n }) here, foldLines(text, n) is fold(text, { lineLength: n }),
// parseHeaderValue is parseValue, buildHeaderValue is formatValue, and decodeHeaders is
// parseHeaders. libmime's maxLength 0 means no limit, which is `maxLength: false` here.

describe('encodeWord()', () => {
  test('encodes quoted-printable', () => {
    expect(encodeWord('See on õhin test')).toBe('=?UTF-8?Q?See_on_=C3=B5hin_test?=')
  })

  test('encodes base64', () => {
    expect(encodeWord('See on õhin test', { wordEncoding: 'B' })).toBe(
      '=?UTF-8?B?U2VlIG9uIMO1aGluIHRlc3Q=?=',
    )
  })

  test('splits quoted-printable at maxLength', () => {
    expect(encodeWord('See on õhin test natin natin natin', { maxLength: 30 })).toBe(
      '=?UTF-8?Q?See_on_=C3=B5hin_t?= =?UTF-8?Q?est_natin_natin_na?= =?UTF-8?Q?tin?=',
    )
  })

  test('keeps surrogate pairs together when splitting base64', () => {
    const input = 'Hello 😊😊😊😊😊😊 world'
    const encoded = encodeWord(input, { wordEncoding: 'B', maxLength: 25 })
    expect(encoded).toContain('?= =?')
    expect(decodeWords(encoded)).toBe(input)
  })

  test('encodes bytes as the UTF-8 text they hold, the same as the string', () => {
    const input = 'ÕÄÖÜ'.repeat(10)
    const bytes = new TextEncoder().encode(input)
    const encoded = encodeWord(bytes, { wordEncoding: 'B', maxLength: 30 })
    expect(encoded.split(' ').length).toBeGreaterThan(1)
    expect(decodeWords(encoded)).toBe(input)
    expect(encoded).toBe(encodeWord(input, { wordEncoding: 'B', maxLength: 30 }))
  })

  test('keeps astral characters outside the emoji block whole', () => {
    const input = '\u{20000}'.repeat(10) + ' \u{1F600}'
    for (const maxLength of [13, 16, 19, 32]) {
      const encoded = encodeWord(input, { wordEncoding: 'B', maxLength })
      expect(decodeWords(encoded)).toBe(input)
    }
  })

  test('replaces an unpaired surrogate without swallowing the next character', () => {
    const encoded = encodeWord('a\ud800\u{1F600}b', { wordEncoding: 'B', maxLength: 16 })
    expect(decodeWords(encoded)).toBe('a�\u{1F600}b')
  })

  test('writes a single word with maxLength false', () => {
    expect(encodeWord('õ'.repeat(40), { maxLength: false }).split(' ')).toHaveLength(1)
  })
})

describe('encodeWords()', () => {
  test('treats U+0080 as a character that needs encoding', () => {
    expect(encodeWords('abc \u0080def')).toBe('abc =?UTF-8?Q?=C2=80def?=')
  })

  test('encodes the ASCII range between non-ASCII words', () => {
    expect(encodeWords('метель" вьюга', { maxLength: 52 })).toBe(
      '=?UTF-8?Q?=D0=BC=D0=B5=D1=82=D0=B5=D0=BB=D1=8C=22_?= =?UTF-8?Q?=D0=B2=D1=8C=D1=8E=D0=B3=D0=B0?=',
    )
    expect(encodeWords("метель'вьюга", { maxLength: 52 })).toBe(
      '=?UTF-8?Q?=D0=BC=D0=B5=D1=82=D0=B5=D0=BB=D1=8C=27?= =?UTF-8?Q?=D0=B2=D1=8C=D1=8E=D0=B3=D0=B0?=',
    )
    expect(encodeWords('Verão você vai adorar!', { maxLength: 52 })).toBe(
      '=?UTF-8?Q?Ver=C3=A3o_voc=C3=AA?= vai adorar!',
    )
  })

  test('encodes using base64', () => {
    expect(encodeWords('Tere õhin', { wordEncoding: 'B' })).toBe('Tere =?UTF-8?B?w7VoaW4=?=')
  })

  test('takes bytes as UTF-8', () => {
    expect(encodeWords(new TextEncoder().encode('Jõgeva'))).toBe('=?UTF-8?Q?J=C3=B5geva?=')
  })

  test('leaves pure ASCII input unchanged', () => {
    expect(encodeWords('plain ascii string')).toBe('plain ascii string')
  })

  test('ends the encoded part with the last word that has non-ASCII characters', () => {
    expect(encodeWords('õ ascii õ end')).toBe('=?UTF-8?Q?=C3=B5_ascii_=C3=B5?= end')
    expect(encodeWords('a b õc d')).toBe('a b =?UTF-8?Q?=C3=B5c?= d')
    expect(encodeWords('x\u00a0õ y')).toBe('=?UTF-8?Q?x=C2=A0=C3=B5?= y')
    expect(encodeWords('õ\u00a0b')).toBe('=?UTF-8?Q?=C3=B5=C2=A0b?=')
  })

  test('splits QP at maxLength', () => {
    const input = 'Jõgeva Jõgeva Jõgeva mugeva Jõgeva Jõgeva Jõgeva Jõgeva Jõgeva'
    const encoded = encodeWords(input, { maxLength: 16 })
    expect(encoded).toBe(
      '=?UTF-8?Q?J=C3=B5geva_?= =?UTF-8?Q?J=C3=B5geva_?= =?UTF-8?Q?J=C3=B5geva_?= =?UTF-8?Q?mugeva_J?= =?UTF-8?Q?=C3=B5geva_J?= =?UTF-8?Q?=C3=B5geva_J?= =?UTF-8?Q?=C3=B5geva_J?= =?UTF-8?Q?=C3=B5geva_J?= =?UTF-8?Q?=C3=B5geva?=',
    )
    expect(decodeWords(encoded)).toBe(input)
  })

  test('splits base64 at maxLength', () => {
    const input = 'õõõõõ õõõõõ õõõõõ mugeva õõõõõ õõõõõ õõõõõ õõõõõ Jõgeva'
    const encoded = encodeWords(input, { wordEncoding: 'B', maxLength: 30 })
    expect(encoded).toBe(
      '=?UTF-8?B?w7XDtcO1w7XDtSA=?= =?UTF-8?B?w7XDtcO1w7XDtSA=?= =?UTF-8?B?w7XDtcO1w7XDtSBt?= =?UTF-8?B?dWdldmEgw7XDtcO1?= =?UTF-8?B?w7XDtSDDtcO1w7U=?= =?UTF-8?B?w7XDtSDDtcO1w7U=?= =?UTF-8?B?w7XDtSDDtcO1w7U=?= =?UTF-8?B?w7XDtSBKw7VnZXZh?=',
    )
    expect(decodeWords(encoded)).toBe(input)
  })

  test('encodes a long non-ASCII word', () => {
    const input = 'é'.repeat(100000) + ' é'
    const encoded = encodeWords(input)
    expect(encoded).toMatch(/^=\?UTF-8\?Q\?/)
    expect(decodeWords(encoded)).toBe(input)
  })
})

describe('decodeWords()', () => {
  test('decodes a quoted-printable word', () => {
    expect(decodeWords('=?UTF-8?Q?See_on_=C3=B5hin_test?=')).toBe('See on õhin test')
  })

  test('decodes a base64 word', () => {
    expect(decodeWords('=?UTF-8?B?U2VlIG9uIMO1aGluIHRlc3Q=?=')).toBe('See on õhin test')
  })

  test('ignores an RFC 2231 language in the charset', () => {
    expect(decodeWords('=?ISO-8859-13*EN?Q?J=F5geva?=')).toBe('Jõgeva')
    expect(decodeWords('Hello: =?UTF-8*EN?q?See_on_=C3=B5hin_test?=')).toBe(
      'Hello: See on õhin test',
    )
  })

  test('recovers from whitespace between "=" and the hex digits', () => {
    expect(decodeWords('=?UTF-8?Q?= C3=B5?=')).toBe('õ')
    expect(decodeWords('=?UTF-8?Q?=C3=\n B5?=')).toBe('õ')
  })

  test('decodes lowercase hex escapes in Q encoding', () => {
    expect(decodeWords('=?utf-8?Q?=c3=a1?=')).toBe('á')
  })

  test('keeps an escape that is not two hex digits in Q encoding', () => {
    expect(decodeWords('=?utf-8?Q?a=zz?=')).toBe('a=zz')
    expect(decodeWords('=?utf-8?Q?a=4z?=')).toBe('a=4z')
    expect(decodeWords('=?utf-8?Q?a=4?=')).toBe('a=4')
  })

  test('decodes words in text and across a fold', () => {
    expect(decodeWords('Hello: =?UTF-8?q?See_on_=C3=B5hin_test?=')).toBe('Hello: See on õhin test')
    expect(decodeWords('=?UTF-8?q?See_on_=C3=B5hin_test?=')).toBe('See on õhin test')
    expect(
      decodeWords(
        '=?gb2312?B?z/u30czh0NHIq8Pmyf28ti3Dv8jV0MXTw7ncvNK5qcT6x+HLybbU1csswNbP?=\r\n\t =?gb2312?B?7dDFz6Ih?=',
      ),
    ).toBe('消费提醒全面升级-每日信用管家供您轻松对账,乐享信息!')
  })

  test('decodes words in another charset and keeps the text between them', () => {
    expect(
      decodeWords(
        '=?ISO-8859-13?Q?J=F5ge-va=DE?= zz =?ISO-8859-13?Q?J=F5ge-va=DE?= =?ISO-8859-13?Q?J=F5ge-va=DE?= =?ISO-8859-13?Q?J=F5ge-va=DE?=',
      ),
    ).toBe('Jõge-vaŽ zz Jõge-vaŽJõge-vaŽJõge-vaŽ')
    expect(decodeWords('=?UTF-8?B?U3NzxZsgTGHFgmFsYQ==?= =?UTF-8?B?bGFsYQ==?=')).toBe(
      'Sssś Lałalalala',
    )
  })

  test('decodes the ASCII range', () => {
    expect(
      decodeWords(
        '=?UTF-8?Q?=D0=BC=D0=B5=D1=82=D0=B5=D0=BB=D1=8C=22_?= =?UTF-8?Q?=D0=B2=D1=8C=D1=8E=D0=B3=D0=B0?=',
      ),
    ).toBe('метель" вьюга')
    expect(
      decodeWords(
        "=?UTF-8?Q?=D0=BC=D0=B5=D1=82=D0=B5=D0=BB=D1=8C'?= =?UTF-8?Q?=D0=B2=D1=8C=D1=8E=D0=B3=D0=B0?=",
      ),
    ).toBe("метель'вьюга")
  })

  test('joins a character split across two base64 words', () => {
    expect(
      decodeWords(
        '=?utf-8?B?R0xHOiBSZWd1bGF0aW9uIG9mIFRheGkgaW4gQ2hpbmEgLSDl?= =?utf-8?B?vKDkuIDlhbU=?=',
      ),
    ).toBe('GLG: Regulation of Taxi in China - 张一兵')
  })

  test('joins base64 words that end with padding', () => {
    expect(
      decodeWords(
        '=?UTF-8?B?MjAxOSDovrLmm4bmlrDlubTpm7vlrZDos4DljaHlj4rnsL3lkI3mqg==?= =?UTF-8?B?lA==?=',
      ),
    ).toBe('2019 農曆新年電子賀卡及簽名檔')
  })

  test('decodes words split in the wrong places and folded inside a word', () => {
    expect(
      decodeWords(
        '=?utf-8?Q?=D0=B3=D0=BE=D1=81_?==?utf-8?Q?(=D0=BF=D0=B5=D1=80=D0=B5=\r\n D0=B4=D0=B0=D0=B9_=D0=BA=D0=BE=D0?=\r\n =?utf-8?Q?=BC=D1=83_=D0=BD=D0=B0=D0=B4=D0=BE_=D1=82=D0=BE=D0=B6=D0=B5?=',
      ),
    ).toBe('гос (передай кому надо тоже')
  })

  test('decodes ISO-2022-JP', () => {
    expect(decodeWords('=?ISO-2022-JP?B?GyRCM1g5OzU7PVEwdzgmPSQ4IUYkMnFKczlwGyhC?=')).toBe(
      '学校技術員研修検討会報告',
    )
  })

  test('decodes an empty word', () => {
    expect(decodeWords('=?UTF-8?Q??= =?UTF-8?Q?=E4=BD=A0=E5=A5=BD?=')).toBe('你好')
  })

  test('does not join adjacent words in different charsets', () => {
    expect(decodeWords('=?UTF-8?B?w7U=?= =?ISO-8859-13?B?9Q==?=')).toBe('õõ')
    expect(decodeWords('=?UTF-8?Q?=C3=B5?= =?ISO-8859-13?Q?=F5?=')).toBe('õõ')
  })

  test('reads the utf-7, base64 and hex codecs as UTF-8', () => {
    expect(decodeWords('=?utf-7?Q?+ADw-script+AD4-?=')).toBe('+ADw-script+AD4-')
    expect(decodeWords('=?UTF7?B?K0FEdy1zY3JpcHQrQUQ0LQ==?=')).toBe('+ADw-script+AD4-')
    expect(decodeWords('=?utf-7-imap?Q?&ADw-script&AD4-?=')).toBe('&ADw-script&AD4-')
    expect(decodeWords('=?unicode-1-1-utf-7?Q?+ADw-script+AD4-?=')).toBe('+ADw-script+AD4-')
    expect(decodeWords('=?hex?Q?3c7363726970743e?=')).toBe('3c7363726970743e')
    expect(decodeWords('=?base64?Q?PHNjcmlwdD4=3D?=')).toBe('PHNjcmlwdD4=')
  })

  test('decodes a word in a charset whose name iconv-lite and TextDecoder spell differently', () => {
    expect(decodeWords('=?ks_c_5601-1987?B?vcU=?=')).toBe('신')
    expect(decodeWords('=?EUC-JP?B?xvzL3A==?=')).toBe('日本')
    expect(decodeWords('=?x-unknown-charset?Q?t=C3=B5?=')).toBe('tõ')
  })
})

describe('parseValue()', () => {
  test('reads a value without parameters', () => {
    expect(parseValue('text/plain')).toEqual({ value: 'text/plain', params: {} })
  })

  test('reads unquoted parameters and lowercases their names', () => {
    expect(parseValue('text/plain; CHARSET= UTF-8; format=flowed;')).toEqual({
      value: 'text/plain',
      params: { charset: 'UTF-8', format: 'flowed' },
    })
  })

  test('reads quoted parameters', () => {
    expect(parseValue('text/plain; filename= ";;;\\""; format=flowed;')).toEqual({
      value: 'text/plain',
      params: { filename: ';;;"', format: 'flowed' },
    })
  })

  test('joins and decodes RFC 2231 sections over several lines', () => {
    expect(
      parseValue(
        "text/plain; single_encoded*=\"UTF-8''%C3%95%C3%84%C3%96%C3%9C\";\n multi_encoded*0*=UTF-8''%C3%96%C3%9C;\n multi_encoded*1*=%C3%95%C3%84;\n no_charset*0=OA;\n no_charset*1=OU;",
      ),
    ).toEqual({
      value: 'text/plain',
      params: { single_encoded: 'ÕÄÖÜ', multi_encoded: 'ÖÜÕÄ', no_charset: 'OAOU' },
    })
  })

  test('joins ASCII sections over several lines', () => {
    expect(
      parseValue(
        'text/plain;\n\tname*0=emailengine_uuendamise_kasud_ja_muud_asjad_ja_veelgi_pikem_pealk;\n\tname*1=iri.txt;\n\tx-apple-part-url=99AFDE83-8953-43B4-BE59-F59D6160AFAB',
      ),
    ).toEqual({
      value: 'text/plain',
      params: {
        name: 'emailengine_uuendamise_kasud_ja_muud_asjad_ja_veelgi_pikem_pealkiri.txt',
        'x-apple-part-url': '99AFDE83-8953-43B4-BE59-F59D6160AFAB',
      },
    })
  })

  test('reads an ARC-Authentication-Results value from Microsoft', () => {
    expect(
      parseValue(
        'i=1; mx.microsoft.com 1; spf=fail (sender ip is 52.138.216.130) smtp.rcpttodomain=recipient.com smtp.mailfrom=sender.com; dmarc=fail (p=reject sp=reject pct=100) action=oreject header.from=sender.com; dkim=none (message not signed); arc=none (0)',
      ),
    ).toEqual({
      value: 'i=1',
      params: {
        'mx.microsoft.com 1': '',
        spf: 'fail (sender ip is 52.138.216.130) smtp.rcpttodomain=recipient.com smtp.mailfrom=sender.com',
        dmarc: 'fail (p=reject sp=reject pct=100) action=oreject header.from=sender.com',
        dkim: 'none (message not signed)',
        arc: 'none (0)',
      },
    })
  })

  test('reads parameters without a value', () => {
    expect(parseValue('; CHARSET= UTF-8; format=flowed;')).toEqual({
      value: '',
      params: { charset: 'UTF-8', format: 'flowed' },
    })
  })

  test('reads a trailing parameter without a value', () => {
    expect(parseValue('text/plain; charset=utf-8; flag')).toEqual({
      value: 'text/plain',
      params: { charset: 'utf-8', flag: '' },
    })
  })

  test('reads an escaped backslash in a quoted value', () => {
    expect(parseValue('text/plain; name="a\\\\b"').params).toEqual({ name: 'a\\b' })
  })

  test('reads a parameter without a value in the middle of the list', () => {
    expect(parseValue('attachment; inline; filename=a.txt')).toEqual({
      value: 'attachment',
      params: { inline: '', filename: 'a.txt' },
    })
  })

  test('keeps whitespace inside quotes and drops it outside', () => {
    expect(parseValue('attachment; filename=" a.txt "').params).toEqual({ filename: ' a.txt ' })
    expect(parseValue('attachment ;  filename = "a.txt"  ')).toEqual({
      value: 'attachment',
      params: { filename: 'a.txt' },
    })
    expect(parseValue('attachment; filename= a b ').params).toEqual({ filename: 'a b' })
  })

  test('prefers the RFC 2231 form of a parameter in either order', () => {
    const expected = { value: 'attachment', params: { filename: 'Jõgeva.txt' } }
    expect(
      parseValue('attachment; filename="Jogeva.txt"; filename*=UTF-8\'\'J%C3%B5geva.txt'),
    ).toEqual(expected)
    expect(
      parseValue('attachment; filename*=UTF-8\'\'J%C3%B5geva.txt; filename="Jogeva.txt"'),
    ).toEqual(expected)
    expect(parseValue("attachment; filename=; filename*=UTF-8''invoice.exe").params).toEqual({
      filename: 'invoice.exe',
    })
    expect(parseValue("attachment; filename; filename*=UTF-8''invoice.exe").params).toEqual({
      filename: 'invoice.exe',
    })
    expect(
      parseValue('inline; filename="image.png"; filename*0*=UTF-8\'\'image; filename*1*=.svg')
        .params,
    ).toEqual({ filename: 'image.svg' })
  })

  test('assembles each section group on its own', () => {
    expect(parseValue('attachment; a**=x; a*=y').params).toEqual({ 'a*': 'x', a: 'y' })
    expect(parseValue('text/plain; foo*1**0*=a; foo*1*=b').params).toEqual({
      'foo*1*': 'a',
      foo: 'b',
    })
  })

  test('does not let a charset inject an encoded word', () => {
    expect(parseValue("attachment; filename*0*=utf-8?B?QUJD?=''zzz").params).toEqual({
      filename: 'zzz',
    })
    expect(parseValue("attachment; filename*0*=ut?f8''abc").params).toEqual({ filename: 'abc' })
  })

  test('decodes an RFC 2231 value once', () => {
    expect(
      parseValue("attachment; filename*=utf-8''invoice%3D%3Futf-8%3FQ%3F%3D2Eexe%3F%3D").params,
    ).toEqual({ filename: 'invoice=?utf-8?Q?=2Eexe?=' })
    expect(
      parseValue(
        'attachment; filename*0="=?utf-8?Q?=3D=3Futf-8=3FQ=3F=3D2Eexe=3F=3D?="; filename*1=".txt"; x=y',
      ).params,
    ).toEqual({ filename: '=?utf-8?Q?=2Eexe?=.txt', x: 'y' })
  })

  test('decodes encoded words in a plain value', () => {
    expect(parseValue('attachment; filename="=?utf-8?Q?=2Eexe?="').params).toEqual({
      filename: '.exe',
    })
  })

  test('returns only value and params', () => {
    const parsed = parseValue("attachment; filename*=utf-8''a.txt")
    expect(Object.keys(parsed)).toEqual(['value', 'params'])
    expect(JSON.parse(JSON.stringify(parsed))).toEqual({
      value: 'attachment',
      params: { filename: 'a.txt' },
    })
  })

  test('stores a __proto__ parameter as an own property', () => {
    const cases: [string, string][] = [
      ['text/plain; __proto__; x=1', ''],
      ['text/plain; __proto__=plain; x=1', 'plain'],
      ['text/plain; __proto__=plain', 'plain'],
      ['text/plain; x=1; __proto__', ''],
      ["text/plain; __proto__*0*=utf-8''polluted", 'polluted'],
      ['text/plain; __proto__*0=abc', 'abc'],
    ]
    for (const [input, value] of cases) {
      const { params } = parseValue(input)
      expect(Object.getPrototypeOf(params)).toBe(Object.prototype)
      expect(Object.getOwnPropertyDescriptor(params, '__proto__')?.value).toBe(value)
      expect(({} as Record<string, unknown>)['x']).toBeUndefined()
    }
  })
})

describe('formatValue()', () => {
  test('encodes a value that looks like an encoded word', () => {
    const built = formatValue({ value: 'attachment', params: { filename: '=?utf-8?Q?evil?=.txt' } })
    expect(built).toBe("attachment; filename*0*=utf-8''%3D%3Futf-8%3FQ%3Fevil%3F%3D.txt")
    expect(parseValue(built).params).toEqual({ filename: '=?utf-8?Q?evil?=.txt' })
  })

  test('formats values and quotes the ones that need it', () => {
    expect(formatValue({ value: 'test', params: {} })).toBe('test')
    expect(formatValue({ value: 'test', params: { a: 'b' } })).toBe('test; a=b')
    expect(formatValue({ value: 'test', params: { a: ';' } })).toBe('test; a=";"')
    expect(formatValue({ value: 'test', params: { a: ';"' } })).toBe('test; a=";\\""')
    expect(formatValue({ value: 'test', params: { a: 'b', c: 'd' } })).toBe('test; a=b; c=d')
  })

  test('encodes and splits a Unicode file name', () => {
    expect(
      formatValue({
        value: 'test',
        params: { a: 'b', filename: '😁😂 *\'%()<>@,;:\\"[]?=😃😄zzz😊õäöü😓.pdf' },
      }),
    ).toBe(
      "test; a=b; filename*0*=utf-8''%F0%9F%98%81%F0%9F%98%82%20%2A%27%25%28%29; filename*1*=%3C%3E%40%2C%3B%3A%5C%22%5B%5D%3F%3D%F0%9F%98%83; filename*2*=%F0%9F%98%84zzz%F0%9F%98%8A%C3%B5%C3%A4%C3%B6; filename*3*=%C3%BC%F0%9F%98%93.pdf",
    )
  })

  test('encodes and splits a file name with dashes', () => {
    expect(
      formatValue({
        value: 'test',
        params: { filename: 'Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------.pdf' },
      }),
    ).toBe(
      "test; filename*0*=utf-8''%C6%94------%C6%94------%C6%94------%C6%94; filename*1*=------%C6%94------%C6%94------%C6%94------.pdf",
    )
  })

  test('splits a file name between characters', () => {
    expect(
      formatValue({ value: 'test', params: { a: 'b', filename: 'Jõge-vaŽJõge-vaŽJõge-vaŽ.pdf' } }),
    ).toBe(
      "test; a=b; filename*0*=utf-8''J%C3%B5ge-va%C5%BDJ%C3%B5ge-va%C5%BDJ; filename*1*=%C3%B5ge-va%C5%BD.pdf",
    )
  })

  test('encodes a short Unicode value in one section', () => {
    expect(formatValue({ value: 'x', params: { title: 'Unicode title 😊' } })).toBe(
      "x; title*0*=utf-8''Unicode%20title%20%F0%9F%98%8A",
    )
    expect(formatValue({ value: 'x', params: { filename: 'Jõgeva.txt' } })).toBe(
      "x; filename*0*=utf-8''J%C3%B5geva.txt",
    )
  })

  test('quotes a file name with spaces', () => {
    expect(formatValue({ value: 'test', params: { filename: 'document a.pdf' } })).toBe(
      'test; filename="document a.pdf"',
    )
  })

  test('quotes a file name with special characters', () => {
    expect(formatValue({ value: 'test', params: { filename: 'receipt(3).pdf' } })).toBe(
      'test; filename="receipt(3).pdf"',
    )
    expect(formatValue({ value: 'test', params: { filename: 'jack,jill.pdf' } })).toBe(
      'test; filename="jack,jill.pdf"',
    )
    expect(
      formatValue({
        value: 'test',
        params: {
          space: 'x y',
          small_bracket_open: 'x(y',
          small_bracket_close: 'x)y',
          angle_bracket_open: 'x<y',
          angle_bracket_close: 'x>y',
          at_the_rate: 'x@y',
          semicolon: 'x;y',
          colon: 'x:y',
          back_slash: 'x\\y',
          single_quote: "x'y",
          double_quotes: 'x"y',
          forward_slash: 'x/y',
          big_bracket_open: 'x[y',
          big_bracket_close: 'x]y',
          question_mark: 'x?y',
          comma: 'x,y',
          equals: 'x=y',
          negative_in_mid: 'x-y',
          negative_in_start: '-x',
        },
      }),
    ).toBe(
      'test; ' +
        [
          'space="x y"',
          'small_bracket_open="x(y"',
          'small_bracket_close="x)y"',
          'angle_bracket_open="x<y"',
          'angle_bracket_close="x>y"',
          'at_the_rate="x@y"',
          'semicolon="x;y"',
          'colon="x:y"',
          'back_slash="x\\\\y"',
          'single_quote="x\'y"',
          'double_quotes="x\\"y"',
          'forward_slash="x/y"',
          'big_bracket_open="x[y"',
          'big_bracket_close="x]y"',
          'question_mark="x?y"',
          'comma="x,y"',
          'equals="x=y"',
          'negative_in_mid=x-y',
          'negative_in_start="-x"',
        ].join('; '),
    )
  })

  test('splits a long ASCII value into sections', () => {
    expect(formatValue({ value: 'attachment', params: { filename: 'a'.repeat(75) } })).toBe(
      'attachment; filename*0=' + 'a'.repeat(50) + '; filename*1=' + 'a'.repeat(25),
    )
  })

  test('does not split a plain value shorter than 75', () => {
    expect(formatValue({ value: 'x', params: { title: 'a'.repeat(74) } })).toBe(
      'x; title=' + 'a'.repeat(74),
    )
    expect(formatValue({ value: 'x', params: { title: 'this is just a title' } })).toBe(
      'x; title="this is just a title"',
    )
  })

  test('formats a long text that parseValue reads back', () => {
    const input =
      'Lorěm ipsum doloř siť amet, háš peřpetua compřéhenšam at, ei nám modó soleát éxpétěndá! Boňorum vocibůs dignisšim pro ad, ea sensibus efficiendi intellegam ius. Ad nam aperiam delicata voluptaria, vix nobis luptatum ea, ců úsú graeco viďiššě ňusqúam. '
    const header = formatValue({ value: 'attachment', params: { filename: input } })
    expect(parseValue(header).params['filename']).toBe(input)
  })

  test('keeps an unpaired surrogate from splitting a parameter', () => {
    const built = formatValue({
      value: 'attachment',
      params: { filename: 'ä\ud800;\ud800 name\ud800=evil.exe' },
    })
    expect(built).not.toMatch(/[\ud800-\udfff]/)
    const parsed = parseValue(built)
    expect(Object.keys(parsed.params)).toEqual(['filename'])
    expect(parsed.params['filename']).toBe('ä�;� name�=evil.exe')
  })

  test('marks every section that holds an escape as encoded', () => {
    const value = 'ä' + 'a'.repeat(80) + 'ä'
    const built = formatValue({ value: 'x', params: { f: value } })
    const escaped = built
      .split('; ')
      .slice(1)
      .map((part) => part.split('=') as [string, string])
      .filter(([, text]) => text.includes('%'))
    expect(escaped.length).toBeGreaterThan(0)
    expect(escaped.filter(([key]) => !key.endsWith('*'))).toEqual([])
    expect(parseValue(built).params['f']).toBe(value)
  })

  test('encodes control characters and DEL', () => {
    for (const value of [
      'a\tb.txt',
      'a\nb.txt',
      'a\r\nb.txt',
      'a\x7fb.txt',
      'A'.repeat(60) + '\n' + 'B'.repeat(60),
    ]) {
      const built = formatValue({ value: 'attachment', params: { filename: value } })
      expect(built).toMatch(/^[ -~]*$/)
      expect(parseValue(built).params['filename']).toBe(value)
    }
  })

  test('quotes an empty value', () => {
    expect(formatValue({ value: 'multipart/mixed', params: { flag: '', boundary: 'b' } })).toBe(
      'multipart/mixed; flag=""; boundary=b',
    )
  })

  test('keeps quoting a value with a quote mark', () => {
    expect(formatValue({ value: 'attachment', params: { filename: 'a "b".txt' } })).toBe(
      'attachment; filename="a \\"b\\".txt"',
    )
  })
})

describe('parseHeaders()', () => {
  test('splits a header line into name and value', () => {
    expect(parseHeaders('Subject: Hello world')).toEqual([
      { name: 'Subject', value: 'Hello world' },
    ])
  })

  test('splits only at the first colon', () => {
    expect(parseHeaders('URL: https://example.com:8080/path')).toEqual([
      { name: 'URL', value: 'https://example.com:8080/path' },
    ])
  })

  test('unfolds continuation lines', () => {
    expect(parseHeaders('Subject: line one\r\n\tcontinued')).toEqual([
      { name: 'Subject', value: 'line one\tcontinued' },
    ])
  })

  test('returns nothing for an empty line or a line without a colon', () => {
    expect(parseHeaders('')).toEqual([])
    expect(parseHeaders('no colon here')).toEqual([])
  })

  test('reads a block of headers, repeated ones included', () => {
    expect(
      parseHeaders(
        'Subject: Tere =?UTF-8?Q?J=C3=B5geva?=\r\n' +
          'X-APP: My =?UTF-8?Q?=C5=A1=C5=A1=C5=A1=C5=A1?= app line 1\r\n' +
          'X-APP: My =?UTF-8?Q?=C5=A1=C5=A1=C5=A1=C5=A1?= app line 2\r\n' +
          'Long-Line: tere =?UTF-8?Q?=C3=B5klva?= karu\r\n' +
          ' =?UTF-8?Q?m=C3=B5kva_=C5=A1apaka=C5=A1?= tutikas suur maja,\r\n' +
          ' =?UTF-8?Q?k=C3=B5rge?= hoone, segane jutt',
      ),
    ).toEqual([
      { name: 'Subject', value: 'Tere =?UTF-8?Q?J=C3=B5geva?=' },
      { name: 'X-APP', value: 'My =?UTF-8?Q?=C5=A1=C5=A1=C5=A1=C5=A1?= app line 1' },
      { name: 'X-APP', value: 'My =?UTF-8?Q?=C5=A1=C5=A1=C5=A1=C5=A1?= app line 2' },
      {
        name: 'Long-Line',
        value:
          'tere =?UTF-8?Q?=C3=B5klva?= karu =?UTF-8?Q?m=C3=B5kva_=C5=A1apaka=C5=A1?= tutikas suur maja, =?UTF-8?Q?k=C3=B5rge?= hoone, segane jutt',
      },
    ])
  })

  test('keeps names such as __proto__ as data', () => {
    const headers = parseHeaders('__proto__: value1\r\nConstructor: value2\r\nToString: value4')
    expect(headers).toEqual([
      { name: '__proto__', value: 'value1' },
      { name: 'Constructor', value: 'value2' },
      { name: 'ToString', value: 'value4' },
    ])
  })

  test('stops at the end of the header block', () => {
    expect(parseHeaders('A: 1\r\n\r\n B: 2')).toEqual([{ name: 'A', value: '1' }])
    expect(parseHeaders('A: 1\r\n\r\nB: 2')).toEqual([{ name: 'A', value: '1' }])
    expect(parseHeaders('A: 1\r\n')).toEqual([{ name: 'A', value: '1' }])
    expect(parseHeaders('\r\nA: 1\r\nB: 2')).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ])
  })

  test('folds only lines that start with a space or a tab', () => {
    expect(parseHeaders('A: 1\r\n B: 2')).toEqual([{ name: 'A', value: '1 B: 2' }])
    expect(parseHeaders('A: 1\r\n\tB: 2')).toEqual([{ name: 'A', value: '1\tB: 2' }])
    expect(parseHeaders('A: 1\r\n\u00a0B: 2')).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ])
    expect(parseHeaders('A: 1\r\n\fB: 2')).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ])
  })

  test('reads a continuation line in front of the first header as a header', () => {
    expect(parseHeaders(' A: 1\r\nB: 2\r\n 3\r\n\t4')).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2 3\t4' },
    ])
  })

  test('takes the block as bytes', () => {
    expect(parseHeaders(latin1('Subject: abc\r\n\r\n'))).toEqual([
      { name: 'Subject', value: 'abc' },
    ])
  })
})

describe('fold()', () => {
  test('folds a long header line', () => {
    const line = encodeWords(
      'Subject: Testin command line kirja õkva kakva mõni tõnis kõllas põllas tõllas rõllas jušla kušla tušla musla',
      { maxLength: 52 },
    )
    expect(fold(line)).toBe(
      'Subject: Testin command line kirja\r\n' +
        ' =?UTF-8?Q?=C3=B5kva_kakva_m=C3=B5ni_t=C3=B5nis_k?=\r\n' +
        ' =?UTF-8?Q?=C3=B5llas_p=C3=B5llas_t=C3=B5llas_r?=\r\n' +
        ' =?UTF-8?Q?=C3=B5llas_ju=C5=A1la_ku=C5=A1la_tu?= =?UTF-8?Q?=C5=A1la?= musla',
    )
  })

  test('folds in front of a word longer than a line', () => {
    const word =
      '=?UTF-8?Q?=CB=86=C2=B8=C3=81=C3=8C=C3=93=C4=B1=C3=8F=CB=87=C3=81=C3=9B^=C2=B8\\=C3=81=C4=B1=CB=86=C3=8C=C3=81=C3=9B=C3=98^\\=CB=9C=C3=9B=CB=9D=E2=84=A2=CB=87=C4=B1=C3=93=C2=B8^\\=CB=9C=EF=AC=81^\\=C2=B7\\=CB=9C=C3=98^=C2=A3=CB=9C#=EF=AC=81^\\=C2=A3=EF=AC=81^\\=C2=A3=EF=AC=81^\\?='
    expect(fold('Subject: ' + word)).toBe('Subject:\r\n ' + word)
  })

  test('keeps the line breaks already in the text', () => {
    const input = 'a'.repeat(10) + '\r\n' + 'b '.repeat(50)
    const folded = fold(input, { lineLength: 30 })
    expect(folded.startsWith('a'.repeat(10) + '\r\n')).toBe(true)
    for (const line of folded.split('\r\n')) expect(line.length).toBeLessThanOrEqual(30)
  })
})
