import * as Smtp from '@portable/smtp'
import { describe, expect, test } from 'vite-plus/test'
import { failure, fakeServer, type Script } from './utils.js'

const starttls = {
  EHLO: (_, connection) =>
    connection.secure
      ? '250-test\r\n250-PIPELINING\r\n250 AUTH PLAIN LOGIN\r\n'
      : '250-test\r\n250-STARTTLS\r\n250 SIZE 1000\r\n',
  STARTTLS: '220 2.0.0 Ready to start TLS\r\n',
} satisfies Script

const connect = (script: Script, options: Partial<Smtp.connect.Options> = {}) => {
  const server = fakeServer(script)
  return {
    server,
    client: Smtp.connect({ connect: server.connect, host: 'mx.example.com', ...options }),
  }
}

describe('STARTTLS', () => {
  test('upgrades the connection and sends EHLO again', async () => {
    const { server, client } = connect(starttls)
    const { secure, extensions } = await client
    expect(secure).toBe(true)
    expect(extensions).toEqual(['PIPELINING', 'AUTH PLAIN LOGIN'])
    expect(server.commands).toEqual(['EHLO [127.0.0.1]', 'STARTTLS', 'EHLO [127.0.0.1]'])
    expect(server.sockets[0]!.secureTransport).toBe('starttls')
  })

  test('sends LHLO again after STARTTLS in LMTP mode', async () => {
    const { server, client } = connect({ ...starttls, LHLO: starttls.EHLO }, { lmtp: true })
    expect((await client).extensions).toContain('PIPELINING')
    expect(server.commands).toEqual(['LHLO [127.0.0.1]', 'STARTTLS', 'LHLO [127.0.0.1]'])
  })

  test('fails when the server does not offer STARTTLS', async () => {
    const { server, client } = connect({ EHLO: '250-test\r\n250 AUTH PLAIN\r\n' })
    const error = await failure(client)
    expect(error.code).toBe('ETLS')
    expect(error.command).toBe('STARTTLS')
    expect(server.commands).toEqual(['EHLO [127.0.0.1]'])
    expect(server.closed).toBe(1)
  })

  test('fails when the server refuses STARTTLS, and never continues in plaintext', async () => {
    const { server, client } = connect({ ...starttls, STARTTLS: '454 4.7.0 TLS not available\r\n' })
    const error = await failure(client)
    expect(error.code).toBe('ETLS')
    expect(error.command).toBe('STARTTLS')
    expect(error.responseCode).toBe(454)
    expect(server.commands).toEqual(['EHLO [127.0.0.1]', 'STARTTLS'])
  })

  test('reports a 421 reply to STARTTLS as the server closing', async () => {
    const { client } = connect({ ...starttls, STARTTLS: '421 4.3.2 Shutting down\r\n' })
    const error = await failure(client)
    expect(error.code).toBe('ECONNECTION')
    expect(error.responseCode).toBe(421)
  })

  test('reports a failed TLS handshake', async () => {
    const server = fakeServer(starttls, { failTls: true })
    const error = await failure(Smtp.connect({ connect: server.connect, host: 'mx.example.com' }))
    expect(error.code).toBe('ETLS')
    expect(error.command).toBe('STARTTLS')
  })

  test('reports a connect function whose socket cannot start TLS', async () => {
    const server = fakeServer(starttls)
    const error = await failure(
      Smtp.connect({
        connect: (address, options) =>
          server.connect(address, { ...options, secureTransport: 'off' }),
        host: 'mx.example.com',
      }),
    )
    expect(error.code).toBe('ETLS')
  })

  test('discards plaintext sent after the STARTTLS reply, so it cannot inject capabilities', async () => {
    const { client } = connect({
      ...starttls,
      STARTTLS: '220 2.0.0 Ready to start TLS\r\n250-SMTPUTF8 INJECTED-MARKER ',
    })
    const { extensions } = await client
    expect(extensions).toEqual(['PIPELINING', 'AUTH PLAIN LOGIN'])
  })

  test('discards a whole injected reply sent with the STARTTLS reply', async () => {
    const { client } = connect({
      ...starttls,
      STARTTLS: '220 2.0.0 Ready\r\n250-injected\r\n250 SMTPUTF8\r\n',
    })
    expect((await client).extensions).toEqual(['PIPELINING', 'AUTH PLAIN LOGIN'])
  })

  test('never sends STARTTLS when secure is off', async () => {
    const { server, client } = connect(starttls, { secure: 'off' })
    expect((await client).secure).toBe(false)
    expect(server.commands).toEqual(['EHLO [127.0.0.1]'])
  })

  test('opens a TLS socket and skips STARTTLS when secure is on', async () => {
    const { server, client } = connect(starttls, { secure: 'on' })
    expect((await client).secure).toBe(true)
    expect(server.sockets[0]!.secureTransport).toBe('on')
    expect(server.commands).toEqual(['EHLO [127.0.0.1]'])
  })

  test('reports a TLS socket that fails to open as a connection failure', async () => {
    const server = fakeServer({}, { refuse: true })
    const error = await failure(
      Smtp.connect({ connect: server.connect, host: 'mx.example.com', secure: 'on' }),
    )
    expect(error.code).toBe('ECONNECTION')
    expect(error.command).toBe('CONNECT')
  })
})
