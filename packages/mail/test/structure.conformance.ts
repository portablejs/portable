import * as Mail from '@portable/mail'
import * as Streams from '@portable/streams'
import { describe, expect, test } from 'vite-plus/test'
import { bodyOf, boundary, compose, encode, head, partsOf } from './utils.js'

const contentType = (raw: string) => /^Content-Type: (.*(?:\r\n .*)*)$/m.exec(head(raw))?.[1]

describe('message structure', () => {
  test('text and one attachment make multipart/mixed', async () => {
    const raw = await compose({ text: 'abc', attachments: [{ content: 'abc' }] })
    expect(contentType(raw)).toBe(`multipart/mixed; boundary="${boundary}1"`)
    const parts = partsOf(raw, 1)
    expect(parts.map(contentType)).toEqual([
      'text/plain; charset=utf-8',
      'application/octet-stream',
    ])
  })

  test('several attachments make multipart/mixed', async () => {
    const raw = await compose({ attachments: [{ content: 'abc' }, { content: 'def' }] })
    expect(contentType(raw)).toBe(`multipart/mixed; boundary="${boundary}1"`)
    expect(partsOf(raw, 1).map(bodyOf)).toEqual(['YWJj', 'ZGVm'])
  })

  test('text and html make multipart/alternative, text first', async () => {
    const raw = await compose({ text: 'abc', html: 'def' })
    expect(contentType(raw)).toBe(`multipart/alternative; boundary="${boundary}1"`)
    expect(partsOf(raw, 1).map(contentType)).toEqual([
      'text/plain; charset=utf-8',
      'text/html; charset=utf-8',
    ])
  })

  test('amp goes between text and html', async () => {
    const raw = await compose({ text: 'abc', html: 'def', amp: 'ghi' })
    expect(partsOf(raw, 1).map(contentType)).toEqual([
      'text/plain; charset=utf-8',
      'text/x-amp-html; charset=utf-8',
      'text/html; charset=utf-8',
    ])
  })

  test('alternatives go after html', async () => {
    const raw = await compose({
      text: 'abc',
      html: 'def',
      alternatives: [
        { contentType: 'text/calendar; charset=utf-8; method=PUBLISH', content: 'ghi' },
      ],
    })
    expect(partsOf(raw, 1).map(contentType)).toEqual([
      'text/plain; charset=utf-8',
      'text/html; charset=utf-8',
      'text/calendar; charset=utf-8; method=PUBLISH',
    ])
  })

  test('a calendar invitation is an alternative and an attachment', async () => {
    const ics = 'tere '.repeat(22).trim()
    const raw = await compose({
      text: 'abc',
      html: 'def',
      alternatives: [{ contentType: 'text/calendar; charset=utf-8; method=REQUEST', content: ics }],
      attachments: [{ content: ics, filename: 'invite.ics', contentType: 'application/ics' }],
    })
    expect(raw).toContain(
      '\r\ntere tere tere tere tere tere tere tere tere tere tere tere tere tere tere =\r\ntere tere tere tere tere tere tere\r\n',
    )
    expect(raw).toContain(
      '\r\ndGVyZSB0ZXJlIHRlcmUgdGVyZSB0ZXJlIHRlcmUgdGVyZSB0ZXJlIHRlcmUgdGVyZSB0ZXJlIHRl\r\ncmUgdGVyZSB0ZXJlIHRlcmUgdGVyZSB0ZXJlIHRlcmUgdGVyZSB0ZXJlIHRlcmUgdGVyZQ==\r\n',
    )
  })

  test('text, html and cid attachments nest multipart/related in multipart/alternative', async () => {
    const raw = await compose({
      text: 'abc',
      html: 'def',
      attachments: [
        { content: 'abc', cid: 'aaa' },
        { content: 'def', cid: 'bbb' },
      ],
    })
    expect(contentType(raw)).toBe(`multipart/alternative; boundary="${boundary}1"`)
    const [text, related] = partsOf(raw, 1)
    expect(contentType(text!)).toBe('text/plain; charset=utf-8')
    expect(contentType(related!)).toBe(
      `multipart/related; type="text/html";\r\n boundary="${boundary}3"`,
    )
    expect(partsOf(raw, 3).map((part) => /Content-ID: (.*)/.exec(part)?.[1])).toEqual([
      undefined,
      '<aaa>',
      '<bbb>',
    ])
  })

  test('html and cid attachments make multipart/related', async () => {
    const raw = await compose({
      html: 'def',
      attachments: [
        { content: 'abc', cid: 'aaa' },
        { content: 'def', cid: 'bbb' },
      ],
    })
    expect(contentType(raw)).toBe(
      `multipart/related; type="text/html";\r\n boundary="${boundary}1"`,
    )
    expect(partsOf(raw, 1).map(contentType)).toEqual([
      'text/html; charset=utf-8',
      'application/octet-stream',
      'application/octet-stream',
    ])
  })

  test('cid attachments without html are plain attachments', async () => {
    const raw = await compose({
      text: 'abc',
      attachments: [{ content: 'abc', cid: 'aaa', contentType: 'image/png' }],
    })
    expect(contentType(raw)).toBe(`multipart/mixed; boundary="${boundary}1"`)
    expect(partsOf(raw, 1)[1]).toContain('Content-Disposition: inline')
  })

  test('a cid makes an image inline and leaves other types as attachments', async () => {
    const raw = await compose({
      html: '<img src="cid:a">',
      attachments: [
        { content: 'a', cid: 'a', contentType: 'image/gif' },
        { content: 'b', cid: 'b', contentType: 'text/css' },
      ],
    })
    expect(partsOf(raw, 1).map((part) => /Content-Disposition: (.*)/.exec(part)?.[1])).toEqual([
      undefined,
      'inline',
      'attachment',
    ])
  })

  test('only text is a single part', async () => {
    const raw = await compose({ text: 'def' })
    expect(contentType(raw)).toBe('text/plain; charset=utf-8')
    expect(bodyOf(raw)).toBe('def\r\n')
  })

  test('only an attachment is a single part', async () => {
    const raw = await compose({ attachments: [{ content: 'abc', cid: 'aaa' }] })
    expect(contentType(raw)).toBe('application/octet-stream')
    expect(head(raw)).toContain('Content-ID: <aaa>')
    expect(bodyOf(raw)).toBe('YWJj\r\n')
  })

  test('html and cid images with other attachments nest multipart/related in multipart/mixed', async () => {
    const raw = await compose({
      html: '<img src="cid:img1">',
      attachments: [
        { content: 'PNGDATA', cid: 'img1', contentType: 'image/png', filename: 'a.png' },
        { content: 'doc', filename: 'b.txt', contentType: 'text/plain' },
      ],
    })
    expect(raw).toBe(
      'Message-ID: <zzzzzz>\r\n' +
        'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: multipart/mixed; boundary="--_NmP-test-Part_1"\r\n' +
        '\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: multipart/related; type="text/html";\r\n' +
        ' boundary="--_NmP-test-Part_2"\r\n' +
        '\r\n' +
        '----_NmP-test-Part_2\r\n' +
        'Content-Type: text/html; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        '\r\n' +
        '<img src="cid:img1">\r\n' +
        '----_NmP-test-Part_2\r\n' +
        'Content-Type: image/png; name=a.png\r\n' +
        'Content-ID: <img1>\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Disposition: inline; filename=a.png\r\n' +
        '\r\n' +
        'UE5HREFUQQ==\r\n' +
        '----_NmP-test-Part_2--\r\n' +
        '\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: text/plain; name=b.txt\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Disposition: attachment; filename=b.txt\r\n' +
        '\r\n' +
        'ZG9j\r\n' +
        '----_NmP-test-Part_1--\r\n',
    )
  })

  test('a message without a body has an empty text part', async () => {
    expect(await compose({})).toBe(
      'Message-ID: <zzzzzz>\r\n' +
        'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n',
    )
  })

  test('an empty text or html string counts as no body', async () => {
    expect(await compose({ text: '', html: '' })).toBe(await compose({}))
  })

  test('alternatives and attachments are written with headers in a fixed order', async () => {
    expect(
      await compose({
        text: 'abc',
        html: 'def',
        headers: {
          'X-Processed': 'a really long header or value with non-ascii characters 👮',
        },
      }),
    ).toBe(
      'X-Processed: =?UTF-8?Q?a_really_long_header_or_value_with_non-a?=\r\n' +
        ' =?UTF-8?Q?scii_characters_=F0=9F=91=AE?=\r\n' +
        'Message-ID: <zzzzzz>\r\n' +
        'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: multipart/alternative; boundary="--_NmP-test-Part_1"\r\n' +
        '\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        '\r\n' +
        'abc\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: text/html; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        '\r\n' +
        'def\r\n' +
        '----_NmP-test-Part_1--\r\n',
    )
  })

  test('a part given as an alternative can force its transfer encoding', async () => {
    const raw = await compose({
      alternatives: [
        { contentType: 'text/plain; charset=utf-8', content: 'abc', transferEncoding: 'base64' },
        { contentType: 'text/html; charset=utf-8', content: 'def', transferEncoding: 'base64' },
      ],
    })
    expect(partsOf(raw, 1)).toEqual([
      'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nYWJj',
      'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nZGVm',
    ])
  })

  test('an html alternative takes the place of html for cid attachments', async () => {
    const raw = await compose({
      text: 'abc',
      alternatives: [{ contentType: 'text/html; charset=utf-8', content: '<img src="cid:a">' }],
      attachments: [{ content: 'x', cid: 'a' }],
    })
    expect(contentType(partsOf(raw, 1)[1]!)).toBe(
      `multipart/related; type="text/html";\r\n boundary="${boundary}3"`,
    )
  })

  test('a nested multipart is followed by an empty line before the next delimiter', async () => {
    const raw = await compose({
      text: 'a',
      html: 'b',
      attachments: [{ content: 'c' }],
    })
    expect(raw).toContain(`--${boundary}2--\r\n\r\n--${boundary}1\r\n`)
  })

  test('a message is the same whichever way its body is given', async () => {
    const text = 'Tere, Jõgeva!\r\n'.repeat(50)
    const expected = await compose({ text })
    expect(await compose({ text: encode(text) })).toBe(
      expected.replace('quoted-printable', 'quoted-printable'),
    )
    const streamed = await compose({
      text: Streams.fromIterable([encode(text.slice(0, 10)), encode(text.slice(10))]),
    })
    expect(bodyOf(streamed)).toBe(bodyOf(expected))
    const blob = await compose({ text: new Blob([text]) })
    expect(bodyOf(blob)).toBe(bodyOf(expected))
  })

  test.each(['X\r\nX-Evil: injected', 'a\tb', 'a"b', 'x'.repeat(61)])(
    'the boundary %j throws a RangeError because RFC 2046 does not allow it',
    (prefix) => {
      expect(() => Mail.encode({ text: 'a', html: 'b' }, { boundary: prefix })).toThrow(RangeError)
    },
  )

  test('the default boundary is random and holds "=_", which base64 and quoted-printable never write', async () => {
    const first = await Streams.toText(Mail.encode({ text: 'a', html: 'b' }))
    const second = await Streams.toText(Mail.encode({ text: 'a', html: 'b' }))
    const boundaryOf = (raw: string) => /boundary="([^"]+)"/.exec(raw)![1]!
    expect(boundaryOf(first)).toMatch(/^=_[0-9a-f]{16}_1$/)
    expect(boundaryOf(first)).not.toBe(boundaryOf(second))
  })
})
