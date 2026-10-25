import { describe, expect, test } from 'vite-plus/test';
import * as MimeHeaders from '@portable/mime-headers';
import * as MimeStream from '@portable/mime-stream';
import { fromIterable, toArray, toBytes } from '@portable/streams';
import {
  binary,
  bodies,
  chunked,
  contentTypes,
  decode,
  encode,
  fixture,
  latin1,
  roundTrip,
  summary,
} from './utils.js';

const sizes = [1, 7, 64, 1024];

/** Checks the parts and the round trip at several chunk sizes, as mailsplit's `testStructure` does. */
async function structure(
  message: string,
  expected: readonly string[],
  options?: MimeStream.DecoderStream.Options,
): Promise<MimeStream.Chunk[]> {
  const whole = await decode(message, options);
  expect(contentTypes(whole)).toEqual(expected);
  expect(latin1(await roundTrip(message, options))).toBe(message);
  for (const size of sizes) {
    const chunks = chunked(binary(message), size);
    const parts = await decode(chunks, options);
    expect(contentTypes(parts)).toEqual(expected);
    expect(bodies(parts)).toEqual(bodies(whole));
    expect(latin1(await roundTrip(chunks, options))).toBe(message);
  }
  return whole;
}

const multipartHeader =
  'Content-type: multipart/mixed; boundary=ABC\r\n' +
  'X-Test: =?UTF-8?Q?=C3=95=C3=84?= =?UTF-8?Q?=C3=96=C3=9C?=\r\n' +
  'Subject: ABCDEF\r\n' +
  '\r\n';

const embeddedMessage = (disposition: string) =>
  multipartHeader +
  '--ABC\n' +
  'Content-Type: message/rfc822\r\n' +
  disposition +
  '\r\n' +
  'Content-Type: text/plain\r\n' +
  'Content-Transfer-Encoding: base64\r\n' +
  '\r\n' +
  'AAECAwQFBg==\r\n' +
  '--ABC--';

describe('message-splitter', () => {
  test('splits a simple message', async () => {
    expect(summary(await decode('Subject: test\nMime-Version: 1.0\n\nHello world!'))).toEqual([
      ['headers', 'Subject: test\nMime-Version: 1.0\n\n'],
      ['body', 'Hello world!'],
    ]);
  });

  test('keeps the line break at the end of the body', async () => {
    expect(summary(await decode('Subject: test\nMime-Version: 1.0\n\nHello world!\r\n'))).toEqual([
      ['headers', 'Subject: test\nMime-Version: 1.0\n\n'],
      ['body', 'Hello world!\r\n'],
    ]);
  });

  test('reads a message that ends inside the headers', async () => {
    expect(summary(await decode('Subject: test\nMime-Version: 1.0'))).toEqual([
      ['headers', 'Subject: test\nMime-Version: 1.0'],
    ]);
    expect(summary(await decode('Subject: test\nMime-Version: 1.0\n'))).toEqual([
      ['headers', 'Subject: test\nMime-Version: 1.0\n'],
    ]);
  });

  test('reads a message with an empty body', async () => {
    expect(summary(await decode('Subject: test\nMime-Version: 1.0\n\n'))).toEqual([
      ['headers', 'Subject: test\nMime-Version: 1.0\n\n'],
    ]);
  });

  test('reads a message with no headers', async () => {
    const chunks = await decode('\nHello world!');
    expect(summary(chunks)).toEqual([
      ['headers', '\n'],
      ['body', 'Hello world!'],
    ]);
    expect(chunks[0]!.part.contentType).toBe('text/plain');
  });

  test('splits a multipart message', async () => {
    const message =
      multipartHeader +
      '--ABC\n' +
      'Content-Type: application/octet-stream\r\n' +
      'Content-Transfer-Encoding: base64\r\n' +
      "Content-Disposition: attachment; filename='test.pdf'\r\n" +
      '\r\n' +
      'AAECAwQFBg==\r\n' +
      '--ABC--';
    const chunks = await decode(message);
    expect(summary(chunks)).toEqual([
      ['headers', multipartHeader],
      ['delimiter', '--ABC\n'],
      [
        'headers',
        'Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n' +
          "Content-Disposition: attachment; filename='test.pdf'\r\n\r\n",
      ],
      ['body', 'AAECAwQFBg=='],
      ['delimiter', '\r\n--ABC--'],
    ]);
    expect(chunks[2]!.part).toMatchObject({
      contentType: 'application/octet-stream',
      encoding: 'base64',
    });
    expect(chunks[2]!.part.parent).toBe(chunks[0]!.part);
  });

  test('splits a multipart message without a close delimiter', async () => {
    const message =
      multipartHeader +
      '--ABC\n' +
      'Content-Type: application/octet-stream\r\n' +
      '\r\n' +
      'AAECAwQFBg==';
    expect(summary(await decode(message))).toEqual([
      ['headers', multipartHeader],
      ['delimiter', '--ABC\n'],
      ['headers', 'Content-Type: application/octet-stream\r\n\r\n'],
      ['body', 'AAECAwQFBg=='],
    ]);
  });

  test('splits and joins mimetorture.eml', async () => {
    const message = await fixture('mimetorture.eml');
    expect(await roundTrip(message)).toEqual(message);
  });

  test('gets an attachment out of multipart/form-data', async () => {
    const file = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7) % 256);
    file.set(binary('\r\n--WebKitFormBoundary\r\n'), 100);
    const boundary = '----WebKitFormBoundarysMYui0KaCGeL3dBI';
    const message = new Uint8Array([
      ...binary(
        'POST / HTTP/1.1\r\nHost: localhost:1234\r\n' +
          `Content-Type: multipart/form-data; boundary=${boundary}\r\n\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nHello\r\n` +
          `--${boundary}\r\n` +
          'Content-Disposition: form-data; name="file"; filename="image.bin"\r\n' +
          'Content-Type: application/octet-stream\r\n\r\n',
      ),
      ...file,
      ...binary(`\r\n--${boundary}--\r\n`),
    ]);
    const chunks = await decode(chunked(message, 1000));
    const attachment = chunks.filter(
      (chunk) =>
        chunk.type === 'body' &&
        MimeHeaders.parseValue(
          chunk.part.headers.find((header) => header.name === 'Content-Disposition')!.value,
        ).params.filename === 'image.bin',
    );
    expect(await toBytes(fromIterable(attachment.map((chunk) => chunk.bytes)))).toEqual(file);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual(['Host', 'Content-Type']);
    expect(await roundTrip(chunked(message, 1000))).toEqual(message);
  });

  test('keeps a message/rfc822 part as one body by default', async () => {
    expect(summary(await decode(embeddedMessage('')))).toEqual([
      ['headers', multipartHeader],
      ['delimiter', '--ABC\n'],
      ['headers', 'Content-Type: message/rfc822\r\n\r\n'],
      ['body', 'Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\nAAECAwQFBg=='],
      ['delimiter', '\r\n--ABC--'],
    ]);
  });

  test('reads the message inside a message/rfc822 part with embedded', async () => {
    for (const disposition of ['', 'Content-Disposition: inline\r\n']) {
      const chunks = await decode(embeddedMessage(disposition), { embedded: true });
      expect(summary(chunks)).toEqual([
        ['headers', multipartHeader],
        ['delimiter', '--ABC\n'],
        ['headers', `Content-Type: message/rfc822\r\n${disposition}\r\n`],
        ['headers', 'Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n'],
        ['body', 'AAECAwQFBg=='],
        ['delimiter', '\r\n--ABC--'],
      ]);
      expect(chunks[3]!.part.parent).toBe(chunks[2]!.part);
    }
  });

  test('reads original.txt written two bytes at a time', async () => {
    const message = await fixture('original.txt');
    const whole = await decode(message, { embedded: false, maxHeaderBytes: 2 * 1024 * 1024 });
    const pairs = await decode(chunked(message, 2), { maxHeaderBytes: 2 * 1024 * 1024 });
    expect(summary(pairs)).toEqual(summary(whole));
    expect(contentTypes(whole)).toEqual(['multipart/alternative', 'text/plain', 'text/html']);
  });

  test('reads a message/rfc822 part with only headers', async () => {
    const message =
      'Content-Type: multipart/mixed; boundary="ABC"\r\n' +
      '\r\n' +
      '--ABC\r\n' +
      'Content-Type: message/rfc822\r\n' +
      '\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Subject: OK\r\n' +
      '--ABC--';
    expect(summary(await decode(message))).toEqual([
      ['headers', 'Content-Type: multipart/mixed; boundary="ABC"\r\n\r\n'],
      ['delimiter', '--ABC\r\n'],
      ['headers', 'Content-Type: message/rfc822\r\n\r\n'],
      ['body', 'Content-Type: text/plain; charset=utf-8\r\nSubject: OK'],
      ['delimiter', '\r\n--ABC--'],
    ]);
    const embedded = await decode(message, { embedded: true });
    expect(summary(embedded).slice(3)).toEqual([
      ['headers', 'Content-Type: text/plain; charset=utf-8\r\nSubject: OK'],
      ['delimiter', '\r\n--ABC--'],
    ]);
    expect(embedded[3]!.part.headers).toEqual([
      { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
      { name: 'Subject', value: 'OK' },
    ]);
  });

  test('reads a header block split in an odd place', async () => {
    const chunks = [
      'Content-Type: multipart/mixed;\r\n boundary="----sinikael-?=_1-14739302159560.25004998018597235"\r\nX-Laziness-Level: 1000\r\nFrom: Sender Name <test@zone.ee>\r\nTo: Andris Reinman <andris@127.0.0.1>\r\nSubject: Nodemailer is unicode friendly =?UTF-8?Q?=E2=9C=94?=\r\n (1473930215952)\r\nMessage-ID: <def930ed-3708-1dc3-d6b0-f993d9f11941@zone.ee>\r\nX-Mailer: nodemailer (2.6.0; +http://nodemailer.com/;\r\n SMTP/2.7.2[client:2.12.0])\r\nDate: Thu, 15 Sep 2016 09:03:35 +0000\r\nMIME-Version: 1.0',
      '\r\n\r\n------sinikael-?=_1-14739302159560.25004998018597235\r\nContent-Type: multipart/alternative;\r\n boundary="----sinikael-?=_2-14739302159560.25004998018597235"\r\n\r\n------sinikael-?=_2-14739302159560.25004998018597235\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: 7bit\r\n\r\nHello to myself!\r\n------sinikael-?=_2-14739302159560.25004998018597235\r\nContent-Type: text/watch-html\r\nContent-Transfer-Encoding: 7bit\r\n\r\n<b>Hello</b> to myself\r\n------sinikael-?=_2-14739302159560.25004998018597235\r\nContent-Type: multipart/related; type="text/html";\r\n boundary="----sinikael-?=_5-14739302159560.25004998018597235"',
    ].map(binary);
    const parts = await decode(chunks);
    expect(contentTypes(parts)).toEqual([
      'multipart/mixed',
      'multipart/alternative',
      'text/plain',
      'text/watch-html',
      'multipart/related',
    ]);
    expect(await roundTrip(chunks)).toEqual(new Uint8Array([...chunks[0]!, ...chunks[1]!]));
  });

  test('fails on a header block over maxHeaderBytes', async () => {
    await expect(
      decode('Subject: test\nMime-Version: 1.0\n\nHello world!', { maxHeaderBytes: 5 }),
    ).rejects.toThrow(MimeStream.MaxHeaderBytesError);
  });

  test('reads a header block of 100,000 lines', async () => {
    let header = '';
    for (let i = 0; i < 100000; i++) {
      header += `X-Header-${i}: some-random-value-${i}\r\n`;
    }
    header += 'From: sender@example.com\r\nSubject: message with large header\r\n\r\n';
    const chunks = await decode(header + 'Hello world!\r\n', { maxHeaderBytes: Infinity });
    expect(chunks[0]!.part.headers).toHaveLength(100002);
    expect(summary(chunks)[1]).toEqual(['body', 'Hello world!\r\n']);
  });

  test('does not read parts after the close delimiter', async () => {
    const chunks = await structure(
      'From: a@b.com\r\n' +
        'Content-Type: multipart/mixed; boundary=BOUND\r\n' +
        '\r\n' +
        '--BOUND\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'hello\r\n' +
        '--BOUND--\r\n' +
        '\r\n' +
        '--BOUND\r\n' +
        'Content-Type: text/html\r\n' +
        '\r\n' +
        '<b>smuggled?</b>\r\n' +
        '--BOUND--\r\n',
      ['multipart/mixed', 'text/plain'],
    );
    expect(bodies(chunks)).toEqual(['hello']);
  });

  test('does not read parts after the close delimiter of a nested multipart', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUTER\r\n' +
        '\r\n' +
        '--OUTER\r\n' +
        'Content-Type: multipart/alternative; boundary=INNER\r\n' +
        '\r\n' +
        '--INNER--\r\n' +
        '--OUTER--\r\n' +
        '--OUTER\r\n' +
        'Content-Type: text/html\r\n' +
        '\r\n' +
        '<b>smuggled?</b>\r\n' +
        '--OUTER--\r\n',
      ['multipart/mixed', 'multipart/alternative'],
    );
    expect(bodies(chunks)).toEqual([]);
  });

  test('does not read parts after the close delimiter of an unterminated multipart', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUTER\r\n' +
        '\r\n' +
        '--OUTER\r\n' +
        'Content-Type: multipart/alternative; boundary=INNER\r\n' +
        '\r\n' +
        '--OUTER--\r\n' +
        '--OUTER\r\n' +
        'Content-Type: text/html\r\n' +
        '\r\n' +
        '<b>smuggled?</b>\r\n' +
        '--OUTER--\r\n',
      ['multipart/mixed', 'multipart/alternative'],
    );
    expect(bodies(chunks)).toEqual([]);
  });

  test('does not read parts after the close delimiter of an embedded message', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUTER\r\n' +
        '\r\n' +
        '--OUTER\r\n' +
        'Content-Type: message/rfc822\r\n' +
        'Content-Disposition: inline\r\n' +
        '\r\n' +
        'Subject: inner\r\n' +
        'Content-Type: multipart/alternative; boundary=INNER\r\n' +
        '\r\n' +
        '--OUTER--\r\n' +
        '--OUTER\r\n' +
        'Content-Type: text/html\r\n' +
        '\r\n' +
        '<b>smuggled?</b>\r\n' +
        '--OUTER--\r\n',
      ['multipart/mixed', 'message/rfc822', 'multipart/alternative'],
      { embedded: true },
    );
    expect(bodies(chunks)).toEqual(['']);
  });

  test('keeps reading parts after a boundary parameter on a leaf part', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUTER\r\n' +
        '\r\n' +
        '--OUTER\r\n' +
        'Content-Type: text/plain; boundary=FAKE\r\n' +
        '\r\n' +
        'hello\r\n' +
        '--FAKE\r\n' +
        '--FAKE--\r\n' +
        '--OUTER\r\n' +
        'Content-Type: application/octet-stream\r\n' +
        'Content-Disposition: attachment; filename=payload.bin\r\n' +
        '\r\n' +
        'PAYLOAD\r\n' +
        '--OUTER--\r\n',
      ['multipart/mixed', 'text/plain', 'application/octet-stream'],
    );
    expect(bodies(chunks)).toEqual(['hello\r\n--FAKE\r\n--FAKE--', 'PAYLOAD']);
  });

  test('keeps reading parts after a close delimiter in the preamble', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=P\r\n' +
        '\r\n' +
        'preamble\r\n' +
        '--P--\r\n' +
        '--P\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'SECRET\r\n' +
        '--P--\r\n',
      ['multipart/mixed', 'text/plain'],
    );
    expect(summary(chunks).slice(1, 3)).toEqual([
      ['preamble', 'preamble\r\n--P--'],
      ['delimiter', '\r\n--P\r\n'],
    ]);
  });

  test('reports the boundary of each multipart', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUT\r\n' +
        '\r\n' +
        '--OUT\r\n' +
        'Content-Type: multipart/alternative; boundary=IN\r\n' +
        '\r\n' +
        '--IN\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'plain\r\n' +
        '--IN--\r\n' +
        '--OUT--\r\n',
      ['multipart/mixed', 'multipart/alternative', 'text/plain'],
    );
    const parts = chunks.filter((chunk) => chunk.type === 'headers').map((chunk) => chunk.part);
    expect(parts.map((part) => part.boundary)).toEqual(['OUT', 'IN', undefined]);
  });

  test('gives the body the same bytes at any chunk size', async () => {
    const body = 'P'.repeat(120);
    const message =
      'Content-Type: multipart/mixed; boundary=BB\r\n\r\n--BB\r\nContent-Type: text/plain\r\n\r\n' +
      body +
      '\r\n--BB--\r\n';
    for (const size of [16, 39, 47, 78, 117, 137, 234, 235, 411, 64 * 1024]) {
      const chunks = chunked(binary(message), size);
      expect(bodies(await decode(chunks))).toEqual([body]);
      expect(latin1(await roundTrip(chunks))).toBe(message);
    }
  });

  test('reads a delimiter at the end of a long line as body', async () => {
    const preamble =
      'Content-Type: multipart/mixed; boundary=BB\r\n\r\n--BB\r\nContent-Type: text/plain\r\n\r\n';
    const size = 64 * 1024;
    const longLine = 'x'.repeat(3 * size - preamble.length) + '--BB--';
    const message =
      preamble + longLine + '\r\n--BB\r\nContent-Type: text/plain\r\n\r\nsecond\r\n--BB--\r\n';
    for (const chunks of [[binary(message)], chunked(binary(message), size)]) {
      const parts = await decode(chunks);
      expect(contentTypes(parts)).toEqual(['multipart/mixed', 'text/plain', 'text/plain']);
      expect(bodies(parts)).toEqual([longLine, 'second']);
      expect(latin1(await roundTrip(chunks))).toBe(message);
    }
  });

  test('fails on a header line over maxHeaderBytes before the input ends', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('Subject: ' + 'h'.repeat(500)));
      },
    });
    const reader = stream
      .pipeThrough(new MimeStream.DecoderStream({ maxHeaderBytes: 100 }))
      .getReader();
    await expect(reader.read()).rejects.toThrow(MimeStream.MaxHeaderBytesError);
  });

  test('does not count a delimiter line against maxHeaderBytes', async () => {
    const header = 'X-Pad: ' + 'y'.repeat(80);
    const message =
      'Content-Type: multipart/mixed; boundary=B\r\n\r\n--B\r\n' + header + '\r\n--B--\r\n';
    for (const size of [1, 7, 64, 88, 89, 90, 91, 145, 146, 4096]) {
      const parts = await decode(chunked(binary(message), size), { maxHeaderBytes: header.length });
      expect(contentTypes(parts)).toEqual(['multipart/mixed', 'text/plain']);
    }
  });

  test('streams a long preamble line', async () => {
    const longLine = 'z'.repeat(200 * 1024);
    const message =
      'Content-Type: multipart/mixed; boundary=BB\r\n\r\n' +
      longLine +
      '\r\n--BB\r\nContent-Type: text/plain\r\n\r\nhi\r\n--BB--\r\n';
    const chunks = chunked(binary(message), 8 * 1024);
    const parts = await decode(chunks);
    expect(contentTypes(parts)).toEqual(['multipart/mixed', 'text/plain']);
    expect(parts.filter((chunk) => chunk.type === 'preamble').length).toBeGreaterThan(1);
    expect(latin1(await roundTrip(chunks))).toBe(message);
  });

  test('reads a close delimiter outside any multipart as body', async () => {
    const chunks = await structure(
      'Subject: t\r\nContent-Type: text/plain\r\n\r\nbody\r\n--NOPE--\r\n',
      ['text/plain'],
    );
    expect(bodies(chunks)).toEqual(['body\r\n--NOPE--\r\n']);
  });

  test('counts header bytes, not lines, against maxHeaderBytes', async () => {
    const message = 'Subject: t\r\n' + 'a\r\n'.repeat(20) + '\r\nbody\r\n';
    await expect(decode(message, { maxHeaderBytes: 73 })).rejects.toThrow(
      MimeStream.MaxHeaderBytesError,
    );
    expect(contentTypes(await decode(message, { maxHeaderBytes: 74 }))).toEqual(['text/plain']);
  });

  test('fails on more than maxParts parts', async () => {
    let message = 'Content-Type: multipart/mixed; boundary=B\r\n\r\n';
    for (let i = 0; i < 12; i++) {
      message += `--B\r\nContent-Type: text/plain\r\n\r\npart${i}\r\n`;
    }
    message += '--B--\r\n';
    const error = await decode(message, { maxParts: 5 }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(MimeStream.MaxPartsError);
    expect(error).toMatchObject({ maxParts: 5 });
    expect(contentTypes(await decode(message, { maxParts: 13 }))).toHaveLength(13);
  });

  test('keeps reading parts after a boundary parameter on a message/rfc822 part', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUT\r\n' +
        '\r\n' +
        '--OUT\r\n' +
        'Content-Type: message/rfc822; boundary=FOO\r\n' +
        '\r\n' +
        '--FOO\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'inner\r\n' +
        '--FOO--\r\n' +
        '--OUT\r\n' +
        'Content-Type: application/octet-stream\r\n' +
        'Content-Disposition: attachment; filename=payload.bin\r\n' +
        '\r\n' +
        'PAYLOAD\r\n' +
        '--OUT--\r\n',
      ['multipart/mixed', 'message/rfc822', 'text/plain', 'application/octet-stream'],
      { embedded: true },
    );
    expect(bodies(chunks)).toEqual(['', 'inner\r\n--FOO--', 'PAYLOAD']);
  });

  test('gives the line break before a delimiter to the delimiter, even when it is the whole body', async () => {
    const message =
      'Content-Type: multipart/mixed; boundary=B\r\n' +
      '\r\n' +
      '--B\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n' +
      '\r\n' +
      '--B\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n' +
      'second\r\n' +
      '--B--\r\n';
    const chunks = await structure(message, ['multipart/mixed', 'text/plain', 'text/plain']);
    expect(bodies(chunks)).toEqual(['', 'second']);
    expect(summary(chunks).slice(2, 4)).toEqual([
      ['headers', 'Content-Type: text/plain\r\n\r\n'],
      ['delimiter', '\r\n--B\r\n'],
    ]);
  });

  test('never ends a body with the CR of the line break before a delimiter', async () => {
    const line = 'y'.repeat(65535);
    const message =
      'Content-Type: multipart/mixed; boundary=BB\r\n\r\n--BB\r\nContent-Type: text/plain\r\n\r\n' +
      line +
      '\r\n--BB--\r\n';
    for (const size of [7, 100, 1024, 65536]) {
      expect(bodies(await decode(chunked(binary(message), size)))).toEqual([line]);
    }
  });

  test('keeps reading parts after a nested embedded message ends', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=OUT\r\n' +
        '\r\n' +
        '--OUT\r\n' +
        'Content-Type: message/rfc822; boundary=MID\r\n' +
        'Content-Disposition: inline\r\n' +
        '\r\n' +
        'Content-Type: message/rfc822\r\n' +
        'Content-Disposition: inline\r\n' +
        '\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'inner body\r\n' +
        '--MID--\r\n' +
        '--OUT\r\n' +
        'Content-Type: application/octet-stream\r\n' +
        'Content-Disposition: attachment; filename=payload.bin\r\n' +
        '\r\n' +
        'PAYLOAD\r\n' +
        '--OUT--\r\n',
      [
        'multipart/mixed',
        'message/rfc822',
        'message/rfc822',
        'text/plain',
        'application/octet-stream',
      ],
      { embedded: true },
    );
    expect(bodies(chunks)).toEqual(['', '', 'inner body\r\n--MID--', 'PAYLOAD']);
  });

  test('reads a body of 100,000 empty lines', async () => {
    const lines = 100 * 1000;
    const parts = await decode('Subject: test\r\n\r\n' + '\n'.repeat(lines));
    expect(bodies(parts)[0]).toHaveLength(lines);
  });

  test('closes unterminated nested multiparts on an outer delimiter', async () => {
    const chunks = await structure(
      'Content-Type: multipart/mixed; boundary=b1\r\n' +
        '\r\n' +
        '--b1\r\n' +
        'Content-Type: multipart/alternative; boundary=b2\r\n' +
        '\r\n' +
        '--b2\r\n' +
        'Content-Type: multipart/related; boundary=b3\r\n' +
        '\r\n' +
        '--b3\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'Hello\r\n' +
        '--b1\r\n' +
        'Content-Type: application/pdf; name=hidden.pdf\r\n' +
        'Content-Disposition: attachment; filename=hidden.pdf\r\n' +
        '\r\n' +
        'JVBERi0=\r\n' +
        '--b1--\r\n',
      [
        'multipart/mixed',
        'multipart/alternative',
        'multipart/related',
        'text/plain',
        'application/pdf',
      ],
    );
    expect(bodies(chunks)).toEqual(['Hello', 'JVBERi0=']);
    const parts = chunks.filter((chunk) => chunk.type === 'headers').map((chunk) => chunk.part);
    expect(parts[4]!.parent).toBe(parts[0]);
  });
});

describe('headers', () => {
  const block =
    'Subject: test\nX-row: row1\nMIME-Version: 1.0\nX-Row: row2\nX-row: row3\nMessage-ID: <abc@def>\n\n';

  test('returns the header block as received', async () => {
    const headers = 'Subject: test\nMIME-Version: 1.0\nMessage-ID: <abc@def>\n\n';
    expect(summary(await decode(headers))).toEqual([['headers', headers]]);
  });

  test('returns an mbox header block as received and skips its From line', async () => {
    const headers =
      'From MAILER-DAEMON Fri Jul  8 12:08:34 2011\nSubject: test\nMIME-Version: 1.0\nMessage-ID: <abc@def>\n\n';
    const chunks = await decode(headers + 'body');
    expect(summary(chunks)[0]).toEqual(['headers', headers]);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual([
      'Subject',
      'MIME-Version',
      'Message-ID',
    ]);
  });

  test('lists every header field in order', async () => {
    const [chunk] = await decode(block);
    expect(chunk!.part.headers).toEqual([
      { name: 'Subject', value: 'test' },
      { name: 'X-row', value: 'row1' },
      { name: 'MIME-Version', value: '1.0' },
      { name: 'X-Row', value: 'row2' },
      { name: 'X-row', value: 'row3' },
      { name: 'Message-ID', value: '<abc@def>' },
    ]);
  });

  test('writes a replaced header block instead of the original', async () => {
    const output = await toBytes(
      fromIterable([binary(block + 'body')])
        .pipeThrough(new MimeStream.DecoderStream())
        .pipeThrough(
          new TransformStream<MimeStream.Chunk, MimeStream.Chunk>({
            transform(chunk, controller) {
              if (chunk.type === 'headers') {
                chunk = { ...chunk, bytes: encode('X-Test: tere\r\n' + latin1(chunk.bytes)) };
              }
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeThrough(new MimeStream.EncoderStream()),
    );
    expect(latin1(output)).toBe('X-Test: tere\r\n' + block + 'body');
  });

  test('decodes UTF-8 header values and keeps their bytes', async () => {
    const headers = 'From: "Jöhn Dœ" <öäöä@wildduck.äää.test>\r\n\r\n';
    const chunks = await decode([encode(headers)]);
    expect(chunks[0]!.part.headers).toEqual([
      { name: 'From', value: '"Jöhn Dœ" <öäöä@wildduck.äää.test>' },
    ]);
    expect(chunks[0]!.bytes).toEqual(encode(headers));
  });

  test('does not end a header line at a bare CR', async () => {
    const raw =
      'From: victim@example.com\r\nSubject: hello\rBcc: attacker@example.com\r\nTo: user@example.com\r\n\r\n';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual(['From', 'Subject', 'To']);
    expect(summary(chunks)).toEqual([['headers', raw]]);
  });

  test('does not end the header block at a bare CR before a line break', async () => {
    const raw =
      'From: a@example.com\r\nSubject: hi\r\r\nTo: user@example.com\r\nX-Important: yes\r\n\r\n';
    const [chunk] = await decode(raw);
    expect(chunk!.part.headers.map((header) => header.name)).toEqual([
      'From',
      'Subject',
      'To',
      'X-Important',
    ]);
  });

  test('does not read an indented first line as a header field', async () => {
    const [chunk] = await decode(
      ' Bcc: attacker@example.com\r\nFrom: victim@example.com\r\nSubject: s\r\n\r\n',
    );
    expect(chunk!.part.headers.map((header) => header.name)).toEqual(['From', 'Subject']);
  });

  test('does not end the header block at a line of whitespace', async () => {
    const raw = '  \r\nSubject: secret\r\nTo: user@example.com\r\n\r\nbody';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual(['Subject', 'To']);
    expect(summary(chunks)[1]).toEqual(['body', 'body']);
  });

  test('unfolds folded header fields', async () => {
    const raw =
      'From sender@example.com Mon Jan  1 00:00:00 2024\r\nSubject: first\r\n\tsecond\r\n third\r\nX-A: a\r\nX-B: b\r\n  folded\r\n\r\n';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers).toEqual([
      { name: 'Subject', value: 'first\tsecond third' },
      { name: 'X-A', value: 'a' },
      { name: 'X-B', value: 'b  folded' },
    ]);
    expect(summary(chunks)).toEqual([['headers', raw]]);
  });

  test('reads a block of many folded lines and keeps it byte for byte', async () => {
    const raw = 'X-A: a\r\n b\r\n'.repeat(10000) + '\r\n';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers).toHaveLength(10000);
    expect(latin1(chunks[0]!.bytes)).toBe(raw);
  });

  test('keeps a header line of carriage returns byte for byte', async () => {
    const raw = 'X-A: ' + '\r'.repeat(40000) + '\r\nX-B: b\r\n\r\n';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual(['X-A', 'X-B']);
    expect(latin1(chunks[0]!.bytes)).toBe(raw);
  });

  test('skips a line without a colon and its continuation lines', async () => {
    const raw = 'Subject: a\r\nX\r\n' + ' y\r\n'.repeat(50000) + '\r\n';
    const chunks = await decode(raw);
    expect(chunks[0]!.part.headers.map((header) => header.name)).toEqual(['Subject']);
    expect(latin1(chunks[0]!.bytes)).toBe(raw);
  });
});

describe('mime-node', () => {
  test('reads Content-Transfer-Encoding without comments', async () => {
    const cases = {
      base64: 'base64',
      'base64 (comment)': 'base64',
      '(comment) Base64': 'base64',
      'quoted-printable (a) x (b)': 'quoted-printable  x',
      '7bit ()': '7bit',
      'BASE64 (a (nested) comment)': 'base64',
    };
    for (const [value, encoding] of Object.entries(cases)) {
      const [chunk] = await decode(`Content-Transfer-Encoding: ${value}\r\n\r\n`);
      expect(chunk!.part.encoding).toBe(encoding);
    }
  });

  test('reads Content-Transfer-Encoding with many comment openers in linear time', async () => {
    const [chunk] = await decode(`Content-Transfer-Encoding: base64 ${'('.repeat(100000)}\r\n\r\n`);
    expect(chunk!.part.encoding).toBe('base64');
  });

  test('reads a filename from the header fields with MimeHeaders.parseValue', async () => {
    const [chunk] = await decode(
      'Content-Disposition:attachment;\r\n' +
        "    filename*0*=UTF-8''%C3%95%C3%84;\r\n" +
        '    filename*1*=%C3%96%C3%9C\r\n' +
        'Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\n',
    );
    const disposition = chunk!.part.headers.find(
      (header) => header.name.toLowerCase() === 'content-disposition',
    )!;
    expect(MimeHeaders.parseValue(disposition.value)).toEqual({
      value: 'attachment',
      params: { filename: 'ÕÄÖÜ' },
    });
    expect(chunk!.part.encoding).toBe('quoted-printable');
  });
});

describe('message-joiner', () => {
  test('joins chunks, bytes and text', async () => {
    const output = await toBytes(
      fromIterable<MimeStream.EncoderStream.Input>([
        { bytes: encode('Subject: test\r\n') },
        'MIME-Version: 1.0\r\n\r\n',
        encode('Hello world!'),
      ]).pipeThrough(new MimeStream.EncoderStream()),
    );
    expect(new TextDecoder().decode(output)).toBe(
      'Subject: test\r\nMIME-Version: 1.0\r\n\r\nHello world!',
    );
  });
});

describe('node-rewriter and node-streamer', () => {
  const image = Uint8Array.from({ length: 30000 }, (_, i) => (i * 31 + (i >> 8)) % 256);
  const base64 = btoa(latin1(image)).replace(/.{76}/g, '$&\r\n');
  const message =
    'From: a@example.com\r\nContent-Type: multipart/mixed; boundary="Apple-Mail=_8EB0C91B"\r\n\r\n' +
    '--Apple-Mail=_8EB0C91B\r\nContent-Type: text/plain\r\n\r\nSee the picture.\r\n' +
    '--Apple-Mail=_8EB0C91B\r\nContent-Type: image/jpeg; name=photo.jpg\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64 +
    '\r\n--Apple-Mail=_8EB0C91B--\r\n';

  test('gets the image out of the message and writes the message back unchanged', async () => {
    for (const size of [1, 50, 16384]) {
      const chunks = await toArray(
        fromIterable(chunked(binary(message), size)).pipeThrough(new MimeStream.DecoderStream()),
      );
      const encoded = chunks
        .filter((chunk) => chunk.type === 'body' && chunk.part.contentType === 'image/jpeg')
        .map((chunk) => latin1(chunk.bytes))
        .join('');
      expect(binary(atob(encoded.replace(/\r\n/g, '')))).toEqual(image);
      const output = await toBytes(
        fromIterable(chunks).pipeThrough(new MimeStream.EncoderStream()),
      );
      expect(latin1(output)).toBe(message);
    }
  });

  test('writes message.eml back unchanged when read one byte at a time', async () => {
    const bytes = await fixture('message.eml');
    expect(await roundTrip(chunked(bytes, 1))).toEqual(bytes);
  });
});
