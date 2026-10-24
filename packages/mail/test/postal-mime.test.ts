import * as Charset from '@portable/charset'
import { iso2022Jp } from '@portable/charset/iso-2022-jp'
import * as Mail from '@portable/mail'
import * as Streams from '@portable/streams'
import PostalMime from 'postal-mime'
import { describe, expect, test } from 'vite-plus/test'
import { chunked, randomBytes } from './utils.js'

const text = (bytes: ArrayBuffer | Uint8Array | string) =>
  typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)

describe('postal-mime parses what Mail.encodeStream writes', () => {
  test('a message with every kind of part', async () => {
    const image = randomBytes(5000, 1)
    const report = randomBytes(70_000, 2)
    const parsed = await PostalMime.parse(
      Mail.encodeStream({
        from: { name: 'Jõgeva Ants', address: 'ants@jõgeva.ee' },
        to: ['Mari <mari@example.com>', { name: '山田 太郎', address: 'taro@example.jp' }],
        cc: 'Team: a@example.com, b@example.com;',
        replyTo: 'reply@example.com',
        subject: 'Tere, maailm! 👋 '.repeat(8).trim(),
        inReplyTo: 'parent@example.com',
        references: ['root@example.com', 'parent@example.com'],
        messageId: 'id-1@example.com',
        date: new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
        headers: { 'X-Campaign': 'Talv 2024 ❄️' },
        text: 'Tere!\n\nSee rida on pikk: ' + 'sõna '.repeat(40),
        html: '<p>Tere! <img src="cid:logo@example.com"></p>',
        attachments: [
          {
            content: image,
            cid: 'logo@example.com',
            contentType: 'image/png',
            filename: 'logo.png',
          },
          {
            content: Streams.fromIterable(chunked(report, 4097)),
            filename: 'aruanne 2024 – lõplik.pdf',
            contentType: 'application/pdf',
          },
          { content: 'a,b\n1,2\n', filename: 'data.csv', contentType: 'text/csv' },
        ],
      }),
    )

    expect(parsed.from).toEqual({ name: 'Jõgeva Ants', address: 'ants@xn--jgeva-dua.ee' })
    expect(parsed.to).toEqual([
      { name: 'Mari', address: 'mari@example.com' },
      { name: '山田 太郎', address: 'taro@example.jp' },
    ])
    expect(parsed.cc).toEqual([
      {
        name: 'Team',
        group: [
          { name: '', address: 'a@example.com' },
          { name: '', address: 'b@example.com' },
        ],
      },
    ])
    expect(parsed.subject).toBe('Tere, maailm! 👋 '.repeat(8).trim())
    expect(parsed.messageId).toBe('<id-1@example.com>')
    expect(parsed.inReplyTo).toBe('<parent@example.com>')
    expect(parsed.references).toBe('<root@example.com> <parent@example.com>')
    expect(parsed.date).toBe('2024-01-02T03:04:05.000Z')
    expect(parsed.headers.find((header) => header.key === 'x-campaign')?.value).toMatch(
      /^=\?UTF-8\?Q\?Talv_2024_/,
    )
    expect(parsed.text).toBe('Tere!\n\nSee rida on pikk: ' + 'sõna '.repeat(40))
    expect(parsed.html).toBe('<p>Tere! <img src="cid:logo@example.com"></p>')
    expect(
      parsed.attachments.map(({ filename, mimeType, disposition, contentId }) => ({
        filename,
        mimeType,
        disposition,
        contentId,
      })),
    ).toEqual([
      {
        filename: 'logo.png',
        mimeType: 'image/png',
        disposition: 'inline',
        contentId: '<logo@example.com>',
      },
      {
        filename: 'aruanne 2024 – lõplik.pdf',
        mimeType: 'application/pdf',
        disposition: 'attachment',
        contentId: undefined,
      },
      {
        filename: 'data.csv',
        mimeType: 'text/csv',
        disposition: 'attachment',
        contentId: undefined,
      },
    ])
    const [logo, pdf, csv] = parsed.attachments.map(
      (attachment) => new Uint8Array(attachment.content as ArrayBuffer),
    )
    expect(logo).toEqual(image)
    expect(pdf!.length).toBe(report.length)
    expect(pdf!.every((byte, i) => byte === report[i])).toBe(true)
    expect(text(csv!)).toBe('a,b\n1,2\n')
  })

  test('a non-UTF-8 charset decodes back to the same text', async () => {
    const charset = {
      name: 'ISO-2022-JP',
      encode: (value: string) => Charset.encode(value, iso2022Jp),
    }
    const parsed = await PostalMime.parse(
      Mail.encodeStream(
        { from: '差出人 <a@example.com>', subject: 'こんにちは', text: 'こんにちは、世界' },
        { charset },
      ),
    )
    expect(parsed.from).toEqual({ name: '差出人', address: 'a@example.com' })
    expect(parsed.subject).toBe('こんにちは')
    expect(parsed.text?.trim()).toBe('こんにちは、世界')
  })
})
