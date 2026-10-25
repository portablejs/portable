import * as Smtp from '@portable/smtp';
import { fromIterable } from '@portable/streams';
import { describe, expect, test } from 'vite-plus/test';
import { encode, failure, fakeServer, plain, type FakeServer, type Script } from './utils.js';

const PIPELINING = '250-test\r\n250 PIPELINING\r\n';
const envelope = { from: 'sender@example.com', to: ['a@example.com'] };
const message = 'Subject: test\r\n\r\nhello\r\n';

function rejecting(pattern: RegExp, reply = '550 5.1.1 No such user\r\n'): Script['RCPT'] {
  return (line) => (pattern.test(line) ? reply : '250 2.1.5 OK\r\n');
}

function tracked(chunks: readonly string[]) {
  let cancelled: unknown = undefined;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encode(chunks[i++]!));
      } else {
        controller.close();
      }
    },
    cancel(reason) {
      cancelled = reason ?? true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

describe('sending', () => {
  test('sends a message and reports the delivery', async () => {
    const server = fakeServer();
    const client = await plain(server);
    const result = await client.send({ ...envelope, message });
    expect(result).toEqual({
      accepted: ['a@example.com'],
      rejected: [],
      response: '250 2.0.0 OK queued',
    });
    expect(server.commands.slice(1)).toEqual([
      'MAIL FROM:<sender@example.com>',
      'RCPT TO:<a@example.com>',
      'DATA',
    ]);
    expect(server.messages).toEqual(['Subject: test\r\n\r\nhello']);
  });

  test('sends a string, bytes and a stream as the same bytes', async () => {
    const text = `Subject: test\n\n${'teretere, vana kere\n'.repeat(1023)}.dot line\n`;
    const server = fakeServer();
    const client = await plain(server);
    await client.send({ ...envelope, message: text });
    await client.send({ ...envelope, message: encode(text) });
    const chunks = [text.slice(0, 7), text.slice(7, 5000), text.slice(5000)].map(encode);
    await client.send({ ...envelope, message: fromIterable(chunks) });
    const expected = text.trimEnd().replaceAll('\n', '\r\n');
    expect(server.messages).toEqual([expected, expected, expected]);
  });

  test('sends several messages over one connection', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.send({ from: 'a@example.com', to: 'b@example.com', message: 'one' });
    await client.send({ from: 'c@example.com', to: 'd@example.com', message: 'two' });
    expect(server.messages).toEqual(['one', 'two']);
    expect(server.sockets).toHaveLength(1);
    expect(server.commands.filter((line) => line.startsWith('RSET'))).toEqual([]);
  });

  test('runs concurrent sends one after another', async () => {
    const server = fakeServer({ EHLO: PIPELINING });
    const client = await plain(server);
    const results = await Promise.all(
      ['one', 'two', 'three'].map((text) => client.send({ ...envelope, message: text })),
    );
    expect(results.map((result) => result.accepted)).toEqual([
      ['a@example.com'],
      ['a@example.com'],
      ['a@example.com'],
    ]);
    expect(server.messages).toEqual(['one', 'two', 'three']);
  });

  test('sends the null sender as MAIL FROM:<>', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.send({ from: '', to: 'a@example.com', message });
    expect(server.commands).toContain('MAIL FROM:<>');
  });

  test('decodes a UTF-8 reply', async () => {
    const server = fakeServer({ DATA_END: '250 2.0.0 OK queued öõ Привет\r\n' });
    const client = await plain(server);
    expect((await client.send({ ...envelope, message })).response).toBe(
      '250 2.0.0 OK queued öõ Привет',
    );
  });

  test('decodes a UTF-8 character split across chunks', async () => {
    const server = fakeServer({
      MAIL: (_, connection) => {
        connection.write('451 4.7.1 split: ');
        connection.write(new Uint8Array([0xc3]));
        setTimeout(() => connection.write(new Uint8Array([0xb6, 13, 10])), 0);
      },
    });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.response).toBe('451 4.7.1 split: ö');
  });

  test('keeps the bytes of a reply that is not UTF-8', async () => {
    const server = fakeServer({
      MAIL: (_, connection) => {
        connection.write('451 4.7.1 binary: ');
        connection.write(new Uint8Array([0xff, 0xfe, 13, 10]));
      },
    });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.response).toBe('451 4.7.1 binary: \xff\xfe');
    expect(error.response).not.toContain('�');
  });
});

describe('pipelining', () => {
  test('sends the whole envelope and DATA in one write before reading any reply', async () => {
    const server = fakeServer({
      EHLO: PIPELINING,
      MAIL: false,
      RCPT: false,
      DATA: () => '250 2.1.0 OK\r\n250 2.1.5 OK\r\n250 2.1.5 OK\r\n354 go ahead\r\n',
    });
    const client = await plain(server);
    const result = await client.send({
      ...envelope,
      to: ['a@example.com', 'b@example.com'],
      message,
    });
    expect(result.accepted).toEqual(['a@example.com', 'b@example.com']);
    expect(server.writes).toContain(
      'MAIL FROM:<sender@example.com>\r\nRCPT TO:<a@example.com>\r\nRCPT TO:<b@example.com>\r\nDATA\r\n',
    );
  });

  test('sends one command per write without PIPELINING', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.send({ ...envelope, to: ['a@example.com', 'b@example.com'], message });
    expect(server.writes.slice(1, 5)).toEqual([
      'MAIL FROM:<sender@example.com>\r\n',
      'RCPT TO:<a@example.com>\r\n',
      'RCPT TO:<b@example.com>\r\n',
      'DATA\r\n',
    ]);
  });

  for (const ehlo of [PIPELINING, '250 test\r\n']) {
    const mode = ehlo === PIPELINING ? 'with' : 'without';

    test(`reports accepted and refused recipients ${mode} PIPELINING`, async () => {
      const server = fakeServer({ EHLO: ehlo, RCPT: rejecting(/invalid/) });
      const client = await plain(server);
      const result = await client.send({
        ...envelope,
        to: ['a@valid.example', 'b@invalid.example', 'c@valid.example'],
        message,
      });
      expect(result.accepted).toEqual(['a@valid.example', 'c@valid.example']);
      expect(result.rejected).toEqual([
        {
          recipient: 'b@invalid.example',
          responseCode: 550,
          enhancedCode: '5.1.1',
          response: '550 5.1.1 No such user',
        },
      ]);
      expect(server.messages).toHaveLength(1);
    });

    test(`fails when every recipient is refused ${mode} PIPELINING, and recovers`, async () => {
      const server = fakeServer({ EHLO: ehlo, RCPT: rejecting(/invalid/) });
      const client = await plain(server);
      const to = ['a@invalid.example', 'b@invalid.example'];
      const error = await failure(client.send({ ...envelope, to, message }));
      expect(error.code).toBe('EENVELOPE');
      expect(error.command).toBe('RCPT TO');
      expect(error.responseCode).toBe(550);
      expect(error.rejected?.map((r) => r.recipient)).toEqual(to);
      expect(server.commands).toContain('RSET');
      expect(server.messages.filter(Boolean)).toEqual([]);

      const result = await client.send({ ...envelope, to: 'c@valid.example', message });
      expect(result.accepted).toEqual(['c@valid.example']);
    });

    test(`ends the session on a 421 reply to RCPT TO ${mode} PIPELINING`, async () => {
      const server = fakeServer({ EHLO: ehlo, RCPT: '421 4.3.2 Shutting down\r\n', DATA: false });
      const client = await plain(server);
      const error = await failure(
        client.send({ ...envelope, to: ['a@example.com', 'b@example.com'], message }),
      );
      expect(error.code).toBe('ECONNECTION');
      expect(error.responseCode).toBe(421);
      expect(server.closed).toBe(1);
      const next = await failure(client.send({ ...envelope, message }));
      expect(next.code).toBe('ECONNECTION');
    });

    test(`reports a refused sender ${mode} PIPELINING and stays usable`, async () => {
      let refused = true;
      const server = fakeServer({
        EHLO: ehlo,
        MAIL: () => (refused ? '550 5.7.1 Sender refused\r\n' : '250 OK\r\n'),
        RCPT: () => (refused ? '503 5.5.1 Need MAIL first\r\n' : '250 OK\r\n'),
        DATA: () => (refused ? '503 5.5.1 Need RCPT first\r\n' : '354 Go ahead\r\n'),
      });
      const client = await plain(server);
      const error = await failure(client.send({ ...envelope, message }));
      expect(error.code).toBe('EENVELOPE');
      expect(error.command).toBe('MAIL FROM');
      expect(error.responseCode).toBe(550);

      refused = false;
      expect((await client.send({ ...envelope, message })).accepted).toEqual(['a@example.com']);
    });
  }

  test('reports the temporary code when one of the refused recipients was only deferred', async () => {
    const server = fakeServer({
      RCPT: (line) =>
        line.includes('first@') ? '550 5.1.1 No such user\r\n' : '452 4.2.2 Mailbox full\r\n',
    });
    const client = await plain(server);
    const error = await failure(
      client.send({ ...envelope, to: ['first@example.com', 'second@example.com'], message }),
    );
    expect(error.responseCode).toBe(452);
    expect(error.response).toBe('452 4.2.2 Mailbox full');
    expect(error.rejected?.map((r) => r.responseCode)).toEqual([550, 452]);
  });

  test('ends the data of a server that took DATA without a recipient', async () => {
    const server: FakeServer = fakeServer({
      EHLO: PIPELINING,
      RCPT: rejecting(/missing/),
      DATA_END: () =>
        server.messages.at(-1) === '' ? '554 5.5.1 No valid recipients\r\n' : '250 2.0.0 OK\r\n',
    });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, to: 'missing@example.com', message }));
    expect(error.code).toBe('EENVELOPE');
    expect(server.messages).toEqual(['']);
    expect((await client.send({ ...envelope, message })).accepted).toEqual(['a@example.com']);
  });

  test('drops the connection instead of sending data after a refused sender', async () => {
    const server = fakeServer({ EHLO: PIPELINING, MAIL: '550 5.7.1 Sender refused\r\n' });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.command).toBe('MAIL FROM');
    expect(server.messages).toEqual([]);
    expect(server.closed).toBe(1);
  });

  test('reports a server that closes after a 421 reply to MAIL FROM', async () => {
    const server = fakeServer({
      EHLO: PIPELINING,
      MAIL: (_, connection) => connection.end('421 4.3.2 Shutting down\r\n'),
    });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.code).toBe('ECONNECTION');
    expect(error.command).toBe('MAIL FROM');
    expect(error.responseCode).toBe(421);
  });
});

describe('DATA', () => {
  test('reports a refused DATA command and sends no message', async () => {
    const server = fakeServer({ DATA: '554 5.7.1 Message refused\r\n' });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.code).toBe('EENVELOPE');
    expect(error.command).toBe('DATA');
    expect(error.responseCode).toBe(554);
    expect(server.messages).toEqual([]);
    expect(server.commands.at(-1)).toBe('RSET');
  });

  test('reports a message the server refused after receiving it', async () => {
    const server = fakeServer({ DATA_END: '554 5.7.1 Spam detected\r\n' });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.code).toBe('EMESSAGE');
    expect(error.command).toBe('DATA');
    expect(error.enhancedCode).toBe('5.7.1');
    expect(error.message).toContain('554 5.7.1 Spam detected');
  });

  test('reports a refused sender with the server text and enhanced code', async () => {
    const server = fakeServer({ MAIL: '451 4.7.1 Temporary failure: öõüä Привет мир\r\n' });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.responseCode).toBe(451);
    expect(error.enhancedCode).toBe('4.7.1');
    expect(error.response).toContain('öõüä Привет мир');
    expect(error.message).toContain('öõüä Привет мир');
  });

  for (const [fragment, code] of [
    ['55', undefined],
    ['250 2.1.0 Sender OK', undefined],
    ['421 4.7.0 Shutting down', 421],
  ] as const) {
    test(`reports an unterminated "${fragment}" when the server closes`, async () => {
      const server = fakeServer({ MAIL: (_, connection) => connection.end(fragment) });
      const client = await plain(server);
      const error = await failure(client.send({ ...envelope, message }));
      expect(error.code).toBe('ECONNECTION');
      expect(error.responseCode).toBe(code);
    });
  }

  test('reports a server that drops the connection while the message is in flight', async () => {
    for (const drop of ['end', 'destroy'] as const) {
      const server = fakeServer({ DATA: (_, connection) => connection[drop]('354 Go\r\n') });
      const client = await plain(server);
      const error = await failure(client.send({ ...envelope, message }));
      expect(['ECONNECTION', 'EMESSAGE']).toContain(error.code);
    }
  });

  test('closes the connection when the message stream fails, and reports it', async () => {
    const server = fakeServer();
    const client = await plain(server);
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(new Error('Disk read failed'));
        } else {
          controller.enqueue(encode('Subject: test\r\n\r\n'));
        }
        sent = true;
      },
    });
    const error = await failure(client.send({ ...envelope, message: stream }));
    expect(error.code).toBe('EMESSAGE');
    expect((error.cause as Error).message).toBe('Disk read failed');
    expect(server.messages).toEqual([]);
    expect(server.closed).toBe(1);
  });

  test('cancels the message stream when every recipient is refused', async () => {
    const server = fakeServer({ RCPT: '550 5.1.1 No such user\r\n' });
    const client = await plain(server);
    const { stream, cancelled } = tracked([message]);
    await failure(client.send({ ...envelope, message: stream }));
    expect(cancelled()).toBeInstanceOf(Smtp.CommandError);
  });

  test('cancels the message stream when the envelope is invalid', async () => {
    const client = await plain(fakeServer());
    const { stream, cancelled } = tracked([message]);
    await failure(client.send({ ...envelope, to: [], message: stream }));
    expect(cancelled()).toBeInstanceOf(Smtp.CommandError);
  });

  test('cancels the message stream when Smtp.send cannot connect', async () => {
    const { stream, cancelled } = tracked([message]);
    const server = fakeServer({}, { refuse: true });
    await failure(
      Smtp.send(
        { ...envelope, message: stream },
        { connect: server.connect, host: 'mx.example.com' },
      ),
    );
    expect(cancelled()).toBeInstanceOf(Smtp.CommandError);
  });
});

describe('envelope validation', () => {
  test('rejects an envelope without recipients', async () => {
    const server = fakeServer();
    const client = await plain(server);
    const error = await failure(client.send({ from: 'a@example.com', to: [], message }));
    expect(error.code).toBe('EENVELOPE');
    expect(server.commands).toHaveLength(1);
  });

  test('rejects addresses with control characters or angle brackets before sending anything', async () => {
    const server = fakeServer();
    const client = await plain(server);
    const bad = [
      { from: 'a@example.com\r\nRCPT TO:<x@example.com>', to: 'b@example.com' },
      { from: '<a@example.com>', to: 'b@example.com' },
      { from: 'a@example.com', to: ['b@example.com', '"address\r\n with folding"@example.com'] },
      { from: 'a@example.com', to: 'b@example.com>\nDATA' },
      { from: 'a@example.com', to: 'b@example.com\r' },
      { from: 'a@example.com', to: '' },
      { from: 'a@example.com', to: `b@example.com${String.fromCharCode(0)}` },
      { from: `a${String.fromCharCode(0x7f)}@example.com`, to: 'b@example.com' },
    ];
    for (const mail of bad) {
      const error = await failure(client.send({ ...mail, message }));
      expect(error.code).toBe('EENVELOPE');
    }
    expect(server.commands).toHaveLength(1);
    expect(server.writes.join('')).not.toContain('x@example.com');
  });

  test('rejects a size that is not a non-negative integer', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 SIZE 1000\r\n' });
    const client = await plain(server);
    const size = '100\r\nRCPT TO:<attacker@evil.com>' as unknown as number;
    for (const value of [size, -1, 1.5, Number.NaN]) {
      await expect(client.send({ ...envelope, message, size: value })).rejects.toThrow(RangeError);
    }
    expect(server.commands).toHaveLength(1);
  });
});

describe('extensions', () => {
  test('declares SMTPUTF8 for an internationalized address', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 SMTPUTF8\r\n' });
    const client = await plain(server);
    await client.send({ from: 'tõst@example.com', to: 'b@example.com', message });
    await client.send({ from: 'a@example.com', to: 'tõst@example.com', message });
    expect(server.commands).toContain('MAIL FROM:<tõst@example.com> SMTPUTF8');
    expect(server.commands).toContain('MAIL FROM:<a@example.com> SMTPUTF8');
    expect(server.commands).toContain('RCPT TO:<tõst@example.com>');
  });

  test('fails before sending when an internationalized address meets a server without SMTPUTF8', async () => {
    const server = fakeServer();
    const client = await plain(server);
    const error = await failure(
      client.send({ from: 'a@example.com', to: 'tõst@example.com', message }),
    );
    expect(error.code).toBe('EENVELOPE');
    expect(server.commands).toHaveLength(1);
  });

  test('reports an internationalized recipient the server refused', async () => {
    const server = fakeServer({
      EHLO: '250-test\r\n250 SMTPUTF8\r\n',
      RCPT: '553 5.6.7 Internationalized recipient not allowed\r\n',
    });
    const client = await plain(server);
    const error = await failure(
      client.send({ from: 'a@example.com', to: 'tõst@example.com', message }),
    );
    expect(error.rejected).toEqual([
      {
        recipient: 'tõst@example.com',
        responseCode: 553,
        enhancedCode: '5.6.7',
        response: '553 5.6.7 Internationalized recipient not allowed',
      },
    ]);
    expect(server.commands.some((line) => line === 'DATA')).toBe(false);
  });

  test('declares BODY=8BITMIME when the server offers it', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 8BITMIME\r\n' });
    const client = await plain(server);
    await client.send({ ...envelope, message: 'Subject: õ\r\n\r\nõõõ' });
    expect(server.commands).toContain('MAIL FROM:<sender@example.com> BODY=8BITMIME');
    expect(server.messages).toEqual(['Subject: õ\r\n\r\nõõõ']);
  });

  test('declares the encoded size of bytes and the given size of a stream', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 SIZE 1000\r\n' });
    const client = await plain(server);
    await client.send({ ...envelope, message: 'a\n.b' });
    await client.send({ ...envelope, message: fromIterable([encode('hi')]), size: 300 });
    await client.send({ ...envelope, message: fromIterable([encode('hi')]) });
    expect(server.commands.filter((line) => line.startsWith('MAIL'))).toEqual([
      'MAIL FROM:<sender@example.com> SIZE=11',
      'MAIL FROM:<sender@example.com> SIZE=300',
      'MAIL FROM:<sender@example.com>',
    ]);
  });

  test('fails before MAIL FROM when the message exceeds the server limit', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 SIZE 100\r\n' });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message: 'x'.repeat(200) }));
    expect(error.code).toBe('EMESSAGE');
    const stream = await failure(
      client.send({ ...envelope, message: fromIterable([encode('x')]), size: 101 }),
    );
    expect(stream.code).toBe('EMESSAGE');
    expect(server.commands).toHaveLength(1);
  });

  test('omits SIZE when the server does not offer it', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.send({ ...envelope, message, size: 100 });
    expect(server.commands).toContain('MAIL FROM:<sender@example.com>');
  });

  test('sends DSN parameters when the server offers DSN', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250 DSN\r\n' });
    const client = await plain(server);
    await client.send({
      ...envelope,
      message,
      dsn: { ret: 'FULL', envid: 'env id+1=2', notify: ['SUCCESS', 'FAILURE'] },
    });
    await client.send({ ...envelope, message, dsn: { ret: 'HDRS', notify: 'NEVER' } });
    expect(server.commands).toContain(
      'MAIL FROM:<sender@example.com> RET=FULL ENVID=env+20id+2B1+3D2',
    );
    expect(server.commands).toContain('RCPT TO:<a@example.com> NOTIFY=SUCCESS,FAILURE');
    expect(server.commands).toContain('MAIL FROM:<sender@example.com> RET=HDRS');
    expect(server.commands).toContain('RCPT TO:<a@example.com> NOTIFY=NEVER');
  });

  test('omits DSN parameters when the server does not offer DSN', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.send({
      ...envelope,
      message,
      dsn: { ret: 'FULL', envid: 'abc', notify: ['SUCCESS'] },
    });
    expect(server.commands.slice(1, 3)).toEqual([
      'MAIL FROM:<sender@example.com>',
      'RCPT TO:<a@example.com>',
    ]);
  });

  test('sends REQUIRETLS over TLS when the server offers it', async () => {
    const server = fakeServer({ EHLO: '250-test\r\n250-REQUIRETLS\r\n250 DSN\r\n' });
    const client = await Smtp.connect({
      connect: server.connect,
      host: 'mx.example.com',
      secure: 'on',
    });
    await client.send({ ...envelope, message, requireTls: true, dsn: { ret: 'HDRS' } });
    expect(server.commands).toContain('MAIL FROM:<sender@example.com> RET=HDRS REQUIRETLS');
  });

  test('fails before MAIL FROM when REQUIRETLS cannot be honored', async () => {
    const offered = fakeServer({ EHLO: '250-test\r\n250 REQUIRETLS\r\n' });
    const plaintext = await plain(offered);
    expect((await failure(plaintext.send({ ...envelope, message, requireTls: true }))).code).toBe(
      'EENVELOPE',
    );
    const missing = fakeServer();
    const tls = await Smtp.connect({
      connect: missing.connect,
      host: 'mx.example.com',
      secure: 'on',
    });
    expect((await failure(tls.send({ ...envelope, message, requireTls: true }))).code).toBe(
      'EENVELOPE',
    );
    expect([...offered.commands, ...missing.commands].some((line) => line.startsWith('MAIL'))).toBe(
      false,
    );
  });
});

describe('LMTP', () => {
  test('reports one result per recipient after the message', async () => {
    const server = fakeServer({
      LHLO: PIPELINING,
      RCPT: rejecting(/invalid/),
      DATA_END:
        '250 2.1.5 <a> delivered\r\n452 4.2.2 <c> mailbox full\r\n250 2.1.5 <d> delivered\r\n',
    });
    const client = await plain(server, { lmtp: true });
    const result = await client.send({
      ...envelope,
      to: ['a@example.com', 'b@invalid.example', 'c@example.com', 'd@example.com'],
      message,
    });
    expect(result.accepted).toEqual(['a@example.com', 'd@example.com']);
    expect(result.rejected.map((r) => [r.recipient, r.responseCode])).toEqual([
      ['b@invalid.example', 550],
      ['c@example.com', 452],
    ]);
  });

  test('fails when the message is refused for every recipient', async () => {
    const server = fakeServer({ DATA_END: '550 5.1.1 <a> unknown\r\n' });
    const client = await plain(server, { lmtp: true });
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.code).toBe('EMESSAGE');
    expect(error.rejected?.map((r) => r.recipient)).toEqual(['a@example.com']);
  });
});

describe('signals and closing', () => {
  test('rejects with the signal reason when the server stalls, and closes the connection', async () => {
    const server = fakeServer({ DATA_END: false });
    const client = await plain(server);
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('Send timeout')), 20);
    await expect(
      client.send({ ...envelope, message }, { signal: controller.signal }),
    ).rejects.toThrow('Send timeout');
    expect(server.closed).toBe(1);
    expect((await failure(client.send({ ...envelope, message }))).code).toBe('ECONNECTION');
  });

  test('cancels a stalled message stream with the signal reason', async () => {
    const server = fakeServer();
    const client = await plain(server);
    let cancelled: unknown;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('Subject: test\r\n\r\n'));
      },
      pull: () => new Promise(() => {}),
      cancel(reason) {
        cancelled = reason;
      },
    });
    const reason = new Error('Send timeout');
    const controller = new AbortController();
    setTimeout(() => controller.abort(reason), 20);
    await expect(
      client.send({ ...envelope, message: stream }, { signal: controller.signal }),
    ).rejects.toBe(reason);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(reason);
  });

  test('a queued send rejects with the signal reason without waiting for the send before it', async () => {
    const server = fakeServer({ DATA_END: false });
    const client = await plain(server);
    const first = new AbortController();
    const sent = client.send({ ...envelope, message }, { signal: first.signal });
    const queued = tracked(['Subject: queued\r\n\r\n']);
    const reason = new Error('Queued send timeout');
    const controller = new AbortController();
    const waiting = client.send(
      { ...envelope, message: queued.stream },
      { signal: controller.signal },
    );
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(queued.cancelled()).toBe(reason);
    expect(server.closed).toBe(0);
    first.abort(new Error('done'));
    await expect(sent).rejects.toThrow('done');
  });

  test('close() sends QUIT and closes the socket', async () => {
    const server = fakeServer();
    const client = await plain(server);
    await client.close();
    await client.close();
    expect(server.commands.at(-1)).toBe('QUIT');
    expect(server.closed).toBe(1);
    expect((await failure(client.send({ ...envelope, message }))).code).toBe('ECONNECTION');
  });

  test.runIf(typeof Symbol.asyncDispose === 'symbol')(
    'Symbol.asyncDispose sends QUIT and closes the socket, as await using does',
    async () => {
      const server = fakeServer();
      const client = await plain(server);
      await client.send({ ...envelope, message });
      await client[Symbol.asyncDispose]();
      expect(server.commands.at(-1)).toBe('QUIT');
      expect(server.closed).toBe(1);
    },
  );

  test('close() waits for queued sends', async () => {
    const server = fakeServer();
    const client = await plain(server);
    const sent = client.send({ ...envelope, message });
    await client.close();
    expect((await sent).accepted).toEqual(['a@example.com']);
    expect(server.commands.slice(-2)).toEqual(['DATA', 'QUIT']);
  });

  test('close() stops waiting for the QUIT reply when its signal aborts', async () => {
    const server = fakeServer({ QUIT: false });
    const client = await plain(server);
    await client.close({ signal: AbortSignal.timeout(20) });
    expect(server.closed).toBe(1);
  });

  test('reports a send after the server closed an idle connection', async () => {
    const server = fakeServer({ EHLO: (_, connection) => connection.end('250 test\r\n') });
    const client = await plain(server);
    const error = await failure(client.send({ ...envelope, message }));
    expect(error.code).toBe('ECONNECTION');
  });

  test('Smtp.send connects, sends and quits', async () => {
    const server = fakeServer();
    const result = await Smtp.send(
      { ...envelope, message },
      { connect: server.connect, host: 'mx.example.com', secure: 'off' },
    );
    expect(result.accepted).toEqual(['a@example.com']);
    expect(server.commands.at(-1)).toBe('QUIT');
    expect(server.closed).toBe(1);
  });

  test('Smtp.send quits after a failed send', async () => {
    const server = fakeServer({ MAIL: '550 5.7.1 Sender refused\r\n' });
    const error = await failure(
      Smtp.send(
        { ...envelope, message },
        { connect: server.connect, host: 'mx.example.com', secure: 'off' },
      ),
    );
    expect(error.command).toBe('MAIL FROM');
    expect(server.commands.at(-1)).toBe('QUIT');
    expect(server.closed).toBe(1);
  });
});
