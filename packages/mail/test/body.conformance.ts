import * as Base64 from '@portable/base64';
import * as Mail from '@portable/mail';
import * as QuotedPrintable from '@portable/quoted-printable';
import { describe, expect, test } from 'vite-plus/test';
import { bodyOf, compose, composeBytes, encode, head, partsOf } from './utils.js';

const field = (raw: string, name: string) =>
  new RegExp(`^${name}: (.*(?:\\r\\n[ \\t].*)*)$`, 'm').exec(head(raw))?.[1];

describe('text bodies', () => {
  test('short ASCII lines are 7bit', async () => {
    const raw = await compose({ text: 'tere tere' });
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('7bit');
    expect(bodyOf(raw)).toBe('tere tere\r\n');
  });

  test('mostly non-Latin text is base64', async () => {
    const raw = await compose({ subject: 'õõõõ', text: 'õõõõõõõõ' });
    expect(field(raw, 'Content-Type')).toBe('text/plain; charset=utf-8');
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('base64');
    expect(field(raw, 'Subject')).toBe('=?UTF-8?B?w7XDtcO1w7U=?=');
    expect(bodyOf(raw)).toBe('w7XDtcO1w7XDtcO1w7XDtQ==\r\n');
  });

  test('mostly Latin text is quoted-printable', async () => {
    const raw = await compose({ text: 'ooooooooõ' });
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('quoted-printable');
    expect(bodyOf(raw)).toBe('oooooooo=C3=B5\r\n');
  });

  test('a line longer than 76 characters is quoted-printable with soft breaks', async () => {
    const line =
      'a b c d e f g h i j k l m o p q r s t u w x y z 1 2 3 4 5 6 7 8 9 0 a b c d e f g h i j k l m o p q r s t u w x y z 1 2 3 4 5 6 7 8 9 0';
    const expected =
      'a b c d e f g h i j k l m o p q r s t u w x y z 1 2 3 4 5 6 7 8 9 0 a b c d=\r\n e f g h i j k l m o p q r s t u w x y z 1 2 3 4 5 6 7 8 9 0\r\n';
    for (const raw of [await compose({ text: line }), await compose({ html: line })]) {
      expect(field(raw, 'Content-Transfer-Encoding')).toBe('quoted-printable');
      expect(bodyOf(raw)).toBe(expected);
    }
  });

  test('html with short lines is 7bit', async () => {
    const html =
      'a b c d e f g h i j k l m o p\r\nq r s t u w x y z 1 2 3 4 5 6\r\n7 8 9 0 a b c d e f g h i j k\r\nl m o p q r s t u w x y z\r\n1 2 3 4 5 6 7 8 9 0';
    const raw = await compose({ html });
    expect(field(raw, 'Content-Type')).toBe('text/html; charset=utf-8');
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('7bit');
    expect(bodyOf(raw)).toBe(html + '\r\n');
  });

  test('line breaks in text become CRLF', async () => {
    expect(bodyOf(await compose({ text: 'a\nb\rc\r\nd\n' }))).toBe('a\r\nb\r\nc\r\nd\r\n');
    expect(bodyOf(await compose({ text: 'õ\nb\rc\r\nd' }))).toBe('=C3=B5\r\nb\r\nc\r\nd\r\n');
    expect(bodyOf(await compose({ text: encode('a\nb') }))).toBe('a\r\nb\r\n');
  });

  test('a CR and LF split across stream chunks make one line break', async () => {
    const raw = await compose({
      text: new Blob(['a\r', '\nb\r', 'c\n', 'd']),
      attachments: [],
    });
    expect(bodyOf(raw)).toBe('a\r\nb\r\nc\r\nd\r\n');
  });

  test('text from a stream is quoted-printable', async () => {
    const raw = await compose({ text: new Blob(['tere tere']) });
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('quoted-printable');
    expect(bodyOf(raw)).toBe('tere tere\r\n');
  });

  test('bytes are read as UTF-8 text', async () => {
    const raw = await compose({ text: encode('tere jõgeva') });
    expect(field(raw, 'Content-Transfer-Encoding')).toBe('quoted-printable');
    expect(bodyOf(raw)).toBe('tere j=C3=B5geva\r\n');
    expect(field(await compose({ text: encode('tere') }), 'Content-Transfer-Encoding')).toBe(
      '7bit',
    );
  });

  test('a single part body that ends in a line break gets no second one', async () => {
    expect(bodyOf(await compose({ text: 'abc\n' }))).toBe('abc\r\n');
    expect(bodyOf(await compose({ attachments: [{ content: 'abc' }] }))).toBe('YWJj\r\n');
  });
});

describe('base64', () => {
  test('a body that fills its last line exactly has no empty line before the boundary', async () => {
    const raw = await compose({
      attachments: [{ content: new Uint8Array(114).fill(0x61) }, { content: 'hello' }],
    });
    const [first, second] = partsOf(raw, 1);
    expect(bodyOf(first!)).toBe(Base64.encode(new Uint8Array(114).fill(0x61), { lineLength: 76 }));
    expect(bodyOf(second!)).toBe('aGVsbG8=');
    expect(raw).toContain('YWFh\r\n----_NmP-test-Part_1\r\n');
  });
});

describe('attachments', () => {
  test('headers, name and filename', async () => {
    expect(
      await compose({
        text: 'abc',
        attachments: [
          {
            headers: { 'X-Test-1': '12345', 'X-Test-2': 'ÕÄÖÜ', 'X-Test-3': ['foo', 'bar'] },
            content: 'test',
            filename: 'test.txt',
            contentType: 'text/plain',
          },
        ],
      }),
    ).toBe(
      'Message-ID: <zzzzzz>\r\n' +
        'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: multipart/mixed; boundary="--_NmP-test-Part_1"\r\n' +
        '\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        '\r\n' +
        'abc\r\n' +
        '----_NmP-test-Part_1\r\n' +
        'Content-Type: text/plain; name=test.txt\r\n' +
        'X-Test-1: 12345\r\n' +
        'X-Test-2: =?UTF-8?B?w5XDhMOWw5w=?=\r\n' +
        'X-Test-3: foo\r\n' +
        'X-Test-3: bar\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Disposition: attachment; filename=test.txt\r\n' +
        '\r\n' +
        'dGVzdA==\r\n' +
        '----_NmP-test-Part_1--\r\n',
    );
  });

  test('application/octet-stream and base64 by default', async () => {
    const [, part] = partsOf(
      await compose({ text: 'abc', attachments: [{ content: 'test', filename: 'test.bin' }] }),
      1,
    );
    expect(part).toBe(
      'Content-Type: application/octet-stream; name=test.bin\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Disposition: attachment; filename=test.bin\r\n' +
        '\r\n' +
        'dGVzdA==',
    );
  });

  test('a given transfer encoding is kept', async () => {
    const [, part] = partsOf(
      await compose({
        text: 'abc',
        attachments: [{ content: 'test', filename: 'test.bin', transferEncoding: '7bit' }],
      }),
      1,
    );
    expect(part).toBe(
      'Content-Type: application/octet-stream; name=test.bin\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        'Content-Disposition: attachment; filename=test.bin\r\n' +
        '\r\n' +
        'test',
    );
  });

  test('message/rfc822 is 8bit and keeps non-ASCII text', async () => {
    const forwarded =
      'From: sender@example.com\r\n' +
      'Subject: =?UTF-8?B?VGVzdCDDhMOWw5w=?=\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Content-Transfer-Encoding: 8bit\r\n' +
      '\r\n' +
      'Message with non-ASCII: äöü 你好 🎉\r\n';
    const [, part] = partsOf(
      await compose({
        text: 'Forwarding a message',
        attachments: [
          { content: forwarded, contentType: 'message/rfc822', filename: 'forwarded.eml' },
        ],
      }),
      1,
    );
    expect(part).toBe(
      'Content-Type: message/rfc822; name=forwarded.eml\r\n' +
        'Content-Transfer-Encoding: 8bit\r\n' +
        'Content-Disposition: attachment; filename=forwarded.eml\r\n' +
        '\r\n' +
        forwarded,
    );
  });

  test('an 8bit message with LF line endings is written with CRLF', async () => {
    const [, part] = partsOf(
      await compose({
        text: 'x',
        attachments: [{ content: 'Subject: a\n\nbody\n', contentType: 'message/rfc822' }],
      }),
      1,
    );
    expect(bodyOf(part!)).toBe('Subject: a\r\n\r\nbody\r\n');
  });

  test('without a filename there are no name parameters', async () => {
    const [, part] = partsOf(
      await compose({ text: 'abc', attachments: [{ content: 'test2' }] }),
      1,
    );
    expect(head(part!)).toBe(
      'Content-Type: application/octet-stream\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Disposition: attachment',
    );
  });

  test('a File gives the filename and content type', async () => {
    const file = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' });
    const raw = await compose({ attachments: [{ content: file }] });
    expect(field(raw, 'Content-Type')).toBe('application/pdf; name=report.pdf');
    expect(field(raw, 'Content-Disposition')).toBe('attachment; filename=report.pdf');
    expect(bodyOf(raw)).toBe('JVBERg==\r\n');
  });

  test('a Blob from a data URL gives the content type', async () => {
    const blob = await (await fetch('data:image/png,tere%20tere')).blob();
    const raw = await compose({ attachments: [{ content: blob, cid: 'img' }] });
    expect(field(raw, 'Content-Type')).toBe('image/png');
    expect(field(raw, 'Content-Disposition')).toBe('inline');
    expect(bodyOf(raw)).toBe(Base64.encode('tere tere') + '\r\n');
  });

  test('a response body can be an attachment', async () => {
    const response = await fetch('data:text/plain;base64,SGVsbG8gV29ybGQ=');
    const raw = await compose({
      attachments: [{ content: response.body!, filename: 'hello.txt', contentType: 'text/plain' }],
    });
    expect(bodyOf(raw)).toBe('SGVsbG8gV29ybGQ=\r\n');
  });

  test('the name parameter in the content type is replaced by the filename', async () => {
    const raw = await compose({
      attachments: [
        {
          content: 'pdf',
          contentType: "application/pdf; name=evil.exe; Name*0*=utf-8''j%C3%B5geva",
          filename: 'report.pdf',
        },
      ],
    });
    expect(field(raw, 'Content-Type')).toBe('application/pdf; name=report.pdf');
    expect(head(raw)).not.toMatch(/evil\.exe|j%C3%B5geva/i);
  });

  test('a name parameter in the content type is kept without a filename', async () => {
    const raw = await compose({
      attachments: [{ content: 'pdf', contentType: 'application/pdf; name=report.pdf' }],
    });
    expect(field(raw, 'Content-Type')).toBe('application/pdf; name=report.pdf');
  });

  test.each([
    ['jogeva.txt', 'name=jogeva.txt', 'filename=jogeva.txt'],
    ['test-file.txt', 'name=test-file.txt', 'filename=test-file.txt'],
    ['jõgeva.txt', 'name="=?UTF-8?Q?j=C3=B5geva=2Etxt?="', "filename*0*=utf-8''j%C3%B5geva.txt"],
    ['document a.test.pdf', 'name="document a.test.pdf"', 'filename="document a.test.pdf"'],
    ['foo\\', 'name="foo\\\\"', 'filename="foo\\\\"'],
    ['a\\b.dat', 'name="a\\\\b.dat"', 'filename="a\\\\b.dat"'],
    ['fo"o.dat', 'name="=?UTF-8?Q?fo=22o=2Edat?="', 'filename="fo\\"o.dat"'],
    [
      '"test" it is.txt',
      'name="=?UTF-8?Q?=22test=22_it_is=2Etxt?="',
      'filename="\\"test\\" it is.txt"',
    ],
    ['in\tvoice.pdf', 'name="=?UTF-8?Q?in=09voice=2Epdf?="', "filename*0*=utf-8''in%09voice.pdf"],
    ['in\x7fvoice.pdf', 'name="=?UTF-8?Q?in=7Fvoice=2Epdf?="', "filename*0*=utf-8''in%7Fvoice.pdf"],
    [
      'in\r\nvoice.pdf',
      'name="=?UTF-8?Q?in=0D=0Avoice=2Epdf?="',
      "filename*0*=utf-8''in%0D%0Avoice.pdf",
    ],
  ])('filename %j', async (filename, name, param) => {
    const raw = await compose({ attachments: [{ content: 'x', filename }] });
    expect(field(raw, 'Content-Type')?.replace(/\r\n /g, ' ')).toBe(
      'application/octet-stream; ' + name,
    );
    expect(field(raw, 'Content-Disposition')).toBe('attachment; ' + param);
    // oxlint-disable-next-line no-control-regex
    expect(head(raw)).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
  });

  test('a long non-ASCII filename is split into sections that each carry a star', async () => {
    const raw = await compose({
      attachments: [
        { content: 'x', filename: 'Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------Ɣ------.pdf' },
      ],
    });
    const sections = field(raw, 'Content-Disposition')!.match(/filename\*\d+\*?=[^;\r\n]*/g)!;
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => /^filename\*\d+\*=/.test(section))).toBe(true);
  });

  test('an unpaired surrogate in a filename stays inside the parameter', async () => {
    const raw = await compose({
      attachments: [{ content: 'x', filename: 'a\ud800;filename\ud800=evil.exe' }],
    });
    const disposition = field(raw, 'Content-Disposition')!.replace(/\r\n /g, ' ');
    expect(disposition).toMatch(/^attachment; filename\*0\*=utf-8''a%EF%BF%BD%3Bfilename/);
    expect(disposition.match(/filename\*0/g)).toHaveLength(1);
  });

  test('a content type that is not type/subtype throws', () => {
    for (const contentType of ['other', 'mult\x01ipart/mixed', 'text/plain\r\nX-Evil: 1']) {
      expect(() => Mail.encodeStream({ attachments: [{ content: 'x', contentType }] })).toThrow(
        Mail.InvalidInputError,
      );
    }
  });

  test('a multipart content type throws', () => {
    expect(() =>
      Mail.encodeStream({
        attachments: [{ content: 'x', contentType: 'multipart/mixed; boundary=a' }],
      }),
    ).toThrow(Mail.InvalidInputError);
    expect(() =>
      Mail.encodeStream({ alternatives: [{ content: 'x', contentType: 'multipart/alternative' }] }),
    ).toThrow(Mail.InvalidInputError);
  });

  test('a cid is written in angle brackets without control characters', async () => {
    const raw = await compose({ attachments: [{ content: 'x', cid: '<logo\r\n@x>' }] });
    expect(field(raw, 'Content-ID')).toBe('<logo@x>');
  });

  test('disposition can be set', async () => {
    const raw = await compose({ attachments: [{ content: 'x', disposition: 'inline' }] });
    expect(field(raw, 'Content-Disposition')).toBe('inline');
  });

  test('part headers the package writes are refused', () => {
    expect(() =>
      Mail.encodeStream({
        attachments: [{ content: 'x', headers: { 'Content-Disposition': 'inline' } }],
      }),
    ).toThrow(Mail.InvalidInputError);
  });

  test('content of another type throws a TypeError', () => {
    expect(() =>
      Mail.encodeStream({ attachments: [{ content: { foo: 'bar' } as unknown as Mail.Content }] }),
    ).toThrow(TypeError);
    expect(() => Mail.encodeStream({ text: 42 as unknown as Mail.Content })).toThrow(TypeError);
  });

  test('binary quoted-printable keeps every byte', async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (i * 7) & 0xff;
    }
    const raw = await composeBytes({
      attachments: [{ content: bytes, transferEncoding: 'quoted-printable' }],
    });
    const text = new TextDecoder().decode(raw);
    expect(text).not.toMatch(/\r(?!\n)|(?<!\r)\n/);
    const body = bodyOf(text).replace(/\r\n$/, '');
    const decoded = QuotedPrintable.decode(body);
    expect(decoded).toEqual(bytes);
  });
});
