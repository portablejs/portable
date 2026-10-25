import * as Mail from '@portable/mail';
import * as Charset from '@portable/charset';
import { iso2022Jp } from '@portable/charset/iso-2022-jp';
import * as Streams from '@portable/streams';
import { describe, expect, test } from 'vite-plus/test';
import { bodyOf, compose, head } from './utils.js';

const field = (raw: string, name: string) =>
  new RegExp(`^${name}: (.*(?:\\r\\n[ \\t].*)*)$`, 'm').exec(head(raw))?.[1];

describe('message headers', () => {
  test('a single part message lists generated headers last', async () => {
    expect(await compose({ text: 'Hello world!', messageId: '67890', date: '12345' })).toBe(
      'Message-ID: <67890>\r\n' +
        'Date: 12345\r\n' +
        'Content-Transfer-Encoding: 7bit\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        '\r\n' +
        'Hello world!\r\n',
    );
  });

  test('a Date is written in RFC 5322 form', async () => {
    const raw = await compose({ text: 'x', date: new Date('2014-06-21T10:52:44Z') });
    expect(field(raw, 'Date')).toBe('Sat, 21 Jun 2014 10:52:44 +0000');
  });

  test('an instant with epochMilliseconds, such as a Temporal.Instant, is written in UTC', async () => {
    const instant = { epochMilliseconds: Date.UTC(2014, 5, 21, 10, 52, 44) };
    const raw = await compose({ text: 'x', date: instant });
    expect(field(raw, 'Date')).toBe('Sat, 21 Jun 2014 10:52:44 +0000');
  });

  test('an invalid Date throws', () => {
    expect(() => Mail.encodeStream({ date: new Date('nope') })).toThrow(Mail.InvalidInputError);
  });

  test('Date, Message-ID and MIME-Version are generated', async () => {
    const before = Date.now() - 1000;
    const raw = await Streams.toText(Mail.encodeStream({ text: 'x' }));
    expect(Date.parse(field(raw, 'Date')!)).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    expect(field(raw, 'Message-ID')).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@localhost>$/,
    );
    expect(field(raw, 'MIME-Version')).toBe('1.0');
  });

  test('a generated Message-ID uses the From domain', async () => {
    const raw = await Streams.toText(Mail.encodeStream({ from: 'test@example.com', text: 'x' }));
    expect(field(raw, 'Message-ID')).toMatch(/^<[0-9a-f-]+@example\.com>$/);
  });

  test('Bcc is left out unless keepBcc is set', async () => {
    const message = {
      from: 'test1@example.com',
      to: 'test2@example.com',
      bcc: 'test3@example.com',
      text: 'def',
    };
    const expected = (bcc: string) =>
      'From: test1@example.com\r\n' +
      'To: test2@example.com\r\n' +
      bcc +
      'Message-ID: <zzzzzz>\r\n' +
      'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
      'Content-Transfer-Encoding: 7bit\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      '\r\n' +
      'def\r\n';
    expect(await compose(message)).toBe(expected(''));
    expect(await compose(message, { keepBcc: true })).toBe(expected('Bcc: test3@example.com\r\n'));
  });

  test('address headers come in a fixed order', async () => {
    const raw = await compose({
      replyTo: 'r@example.com',
      cc: 'c@example.com',
      to: 't@example.com',
      sender: 's@example.com',
      from: 'f@example.com',
      inReplyTo: 'parent@example.com',
      references: 'root@example.com parent@example.com',
      subject: 'Hi',
    });
    expect(
      head(raw)
        .split('\r\n')
        .map((line) => line.split(':')[0]),
    ).toEqual([
      'From',
      'Sender',
      'To',
      'Cc',
      'Reply-To',
      'In-Reply-To',
      'References',
      'Subject',
      'Message-ID',
      'Date',
      'MIME-Version',
      'Content-Type',
    ]);
  });

  test('non-ASCII text is encoded, Q for mostly Latin text and B otherwise', async () => {
    expect(
      await compose({
        from: 'ÄÄÄÄ test1@example.com',
        to: 'AAAÄ test2@example.com',
        subject: 'def ÄÄÄÄ foo AAAÄ',
        text: 'def ÄÄÄÄ foo AAAÄ',
      }),
    ).toBe(
      'From: =?UTF-8?B?w4TDhMOEw4Q=?= <test1@example.com>\r\n' +
        'To: =?UTF-8?Q?AAA=C3=84?= <test2@example.com>\r\n' +
        'Subject: =?UTF-8?Q?def_=C3=84=C3=84=C3=84=C3=84_foo_AAA?=\r\n' +
        ' =?UTF-8?Q?=C3=84?=\r\n' +
        'Message-ID: <zzzzzz>\r\n' +
        'Date: Sat, 21 Jun 2014 10:52:44 +0000\r\n' +
        'Content-Transfer-Encoding: quoted-printable\r\n' +
        'MIME-Version: 1.0\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        '\r\n' +
        'def =C3=84=C3=84=C3=84=C3=84 foo AAA=C3=84\r\n',
    );
  });

  test('a unicode subject is one Q word', async () => {
    const raw = await compose({ subject: 'jõgeval istus kägu metsas' });
    expect(field(raw, 'Subject')).toBe('=?UTF-8?Q?j=C3=B5geval_istus_k=C3=A4gu_metsas?=');
  });

  test('a subject of mostly symbols is split into B words', async () => {
    const raw = await compose({
      subject: 'ˆ¸ÁÌÓıÏˇÁÛ^¸\\ÁıˆÌÁÛØ^\\˜Û˝™ˇıÓ¸^\\˜ﬁ^\\·\\˜Ø^£˜#ﬁ^\\£ﬁ^\\£ﬁ^\\',
    });
    expect(field(raw, 'Subject')).toBe(
      '=?UTF-8?B?y4bCuMOBw4zDk8Sxw4/Lh8OBw5tewrhcw4HEscuG?=\r\n =?UTF-8?B?w4zDgcObw5heXMucw5vLneKEosuHxLHDk8K4Xlw=?=\r\n =?UTF-8?B?y5zvrIFeXMK3XMucw5hewqPLnCPvrIFeXMKj76yB?=\r\n =?UTF-8?B?XlzCo++sgV5c?=',
    );
  });

  test('a subject that reads as an encoded word is encoded', async () => {
    const raw = await compose({ subject: '=?UTF-8?Q?Urgent?=' });
    expect(field(raw, 'Subject')).toBe('=?UTF-8?Q?=3D=3FUTF-8=3FQ=3FUrgent=3F=3D?=');
  });

  test('quotes in a subject stay readable', async () => {
    const raw = await compose({ subject: 'Say "hi"' });
    expect(field(raw, 'Subject')).toBe('Say "hi"');
  });

  test('a line break in a header value becomes a space', async () => {
    const raw = await compose({
      subject: 'one\r\ntwo\nthree',
      headers: { 'X-Track': 'a\r\nBcc: attacker@example.com' },
    });
    expect(field(raw, 'Subject')).toBe('one two three');
    expect(field(raw, 'X-Track')).toBe('a Bcc: attacker@example.com');
    expect(head(raw)).not.toMatch(/^Bcc:/m);
  });

  test('a control character in a header value is encoded', async () => {
    const raw = await compose({
      subject: 'in\x01voice',
      headers: { 'X-Custom': 'a\x7fb', 'X-Tab': 'a\tb' },
      messageId: '<a\x01b@example.test>',
      inReplyTo: '<c\x1bd@example.test>',
      references: '<e\x00f@example.test>',
    });
    expect(field(raw, 'Subject')).toBe('=?UTF-8?Q?in=01voice?=');
    expect(field(raw, 'X-Custom')).toBe('=?UTF-8?Q?a=7Fb?=');
    expect(field(raw, 'X-Tab')).toBe('a\tb');
    // oxlint-disable-next-line no-control-regex
    expect(head(raw)).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
  });

  test('Message-ID and In-Reply-To get angle brackets', async () => {
    const raw = await compose({ messageId: 'abc', inReplyTo: 'c\x1bd' });
    expect(field(raw, 'Message-ID')).toBe('<abc>');
    expect(field(raw, 'In-Reply-To')).toBe('<cd>');
  });

  test('References are split at whitespace and each id gets angle brackets', async () => {
    const references = async (value: string | readonly string[]) =>
      field(await compose({ references: value }), 'References');
    expect(await references('abc def')).toBe('<abc> <def>');
    expect(await references(['abc', 'def'])).toBe('<abc> <def>');
    expect(await references('a\x00b c\x7fd')).toBe('<ab> <cd>');
    expect(await references('<a@x.test>\t<b@x.test>')).toBe('<a@x.test> <b@x.test>');
    expect(await references('<a b> c <d e')).toBe('<ab> <c> <d> <e>');
    expect(await references('<a <b c>')).toBe('<a<bc>');
  });

  test('References of 100,000 ids finish within the test timeout, which quadratic splitting would not', async () => {
    const count = 100_000;
    const raw = await compose({ references: '<a b@x.test> '.repeat(count) + '<'.repeat(count) });
    const value = field(raw, 'References')!.replace(/\r\n /g, ' ');
    expect(value.startsWith('<ab@x.test> <ab@x.test> ')).toBe(true);
    expect(value.endsWith(' ' + '<'.repeat(count) + '>')).toBe(true);
  });

  test('a long References list is folded', async () => {
    const list = Array.from({ length: 1000 }, (_, i) => `<${i}@x.test>`);
    const raw = await compose({ references: list });
    expect(field(raw, 'References')!.replace(/\r\n /g, ' ')).toBe(list.join(' '));
    expect(
      Math.max(
        ...head(raw)
          .split('\r\n')
          .map((line) => line.length),
      ),
    ).toBeLessThanOrEqual(76);
  });

  test('empty values leave the header out', async () => {
    const raw = await compose({ to: [], cc: '', subject: '', text: 'x' });
    expect(head(raw)).not.toMatch(/^(To|Cc|Subject):/m);
  });

  test('custom headers come first and keep the given name and order', async () => {
    const raw = await compose({
      text: 'x',
      headers: { 'x-a': 'b', 'X-SMTPAPI': '{}', 'X-List': ['one', 'two'] },
    });
    expect(head(raw).split('\r\n').slice(0, 4)).toEqual([
      'x-a: b',
      'X-SMTPAPI: {}',
      'X-List: one',
      'X-List: two',
    ]);
  });

  test('a long custom header is folded at whitespace', async () => {
    const raw = await compose({ headers: { Unprepared: 'a b'.repeat(99) } });
    expect(field(raw, 'Unprepared')).toBe(
      'a ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba\r\n' +
        ' ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba\r\n' +
        ' ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba\r\n' +
        ' ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba ba\r\n' +
        ' ba ba ba b',
    );
  });

  test.each(['From: ceo@example.com (', 'x-my key', 'x-cu\x01stom', 'Ä', ''])(
    'the header name %j throws because it is outside printable ASCII or holds a colon',
    (name) => {
      expect(() => Mail.encodeStream({ headers: { [name]: 'x' } })).toThrow(Mail.InvalidInputError);
    },
  );

  test.each(['From', 'bcc', 'Subject', 'Message-ID', 'Content-Type', 'MIME-Version'])(
    'the header %s is refused in headers because encode writes it',
    (name) => {
      expect(() => Mail.encodeStream({ headers: { [name]: 'x' } })).toThrow(Mail.InvalidInputError);
    },
  );

  test('a charset writes encoded words and string bodies in that charset', async () => {
    const raw = await compose(
      { from: 'テスト <a@example.com>', subject: 'こんにちは', text: 'こんにちは' },
      { charset: iso2022Jp },
    );
    expect(field(raw, 'Subject')).toBe('=?ISO-2022-JP?B?GyRCJDMkcyRLJEEkTxsoQg==?=');
    expect(field(raw, 'From')).toBe('=?ISO-2022-JP?B?GyRCJUYlOSVIGyhC?= <a@example.com>');
    expect(field(raw, 'Content-Type')).toBe('text/plain; charset=ISO-2022-JP');
    expect(bodyOf(raw)).toBe('GyRCJDMkcyRLJEEkTxsoQg==\r\n');
  });

  test('a CharsetEncoder object works the same as a charset', async () => {
    const message = { from: 'テスト <a@example.com>', subject: 'こんにちは', text: 'こんにちは' };
    const encoder = {
      name: 'ISO-2022-JP',
      encode: (text: string) => Charset.encode(text, iso2022Jp),
    };
    expect(await compose(message, { charset: encoder })).toBe(
      await compose(message, { charset: iso2022Jp }),
    );
  });
});
