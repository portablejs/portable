import * as Smtp from '@portable/smtp'
import { describe, expect, test } from 'vite-plus/test'
import { failure, fakeServer, type Script } from './utils.js'

const b64 = (text: string) => {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const login = (script: Script, auth: Smtp.Auth, options: Partial<Smtp.connect.Options> = {}) => {
  const server = fakeServer(script)
  const client = Smtp.connect({
    connect: server.connect,
    host: 'mx.example.com',
    secure: 'on',
    auth,
    ...options,
  })
  return { server, client }
}

const password = { user: 'testuser', pass: 'testpass' }

const loginOnly = {
  EHLO: '250-test\r\n250 AUTH LOGIN\r\n',
  AUTH: '334 VXNlcm5hbWU6\r\n',
  DEFAULT: (line) =>
    line === b64('testuser') ? '334 UGFzc3dvcmQ6\r\n' : '235 2.7.0 Authentication successful\r\n',
} satisfies Script

function expectNoSecrets(error: Smtp.CommandError, ...secrets: string[]) {
  const { message, command, response } = error
  const text = JSON.stringify({ message, command, response })
  for (const secret of secrets) {
    expect(text).not.toContain(secret)
  }
}

describe('refusing plaintext', () => {
  test('refuses to send credentials over an unencrypted connection', async () => {
    const { server, client } = login({ EHLO: '250-test\r\n250 AUTH PLAIN\r\n' }, password, {
      secure: 'off',
    })
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(server.commands.some((line) => line.startsWith('AUTH'))).toBe(false)
    expectNoSecrets(error, 'testpass', b64('\0testuser\0testpass'))
  })

  test('sends credentials over plaintext with allowInsecureAuth', async () => {
    const { server, client } = login({ EHLO: '250-test\r\n250 AUTH PLAIN\r\n' }, password, {
      secure: 'off',
      allowInsecureAuth: true,
    })
    await client
    expect(server.commands).toContain(`AUTH PLAIN ${b64('\0testuser\0testpass')}`)
  })

  test('sends credentials after STARTTLS', async () => {
    const { server, client } = login(
      {
        EHLO: (_, connection) =>
          connection.secure ? '250-test\r\n250 AUTH PLAIN\r\n' : '250-test\r\n250 STARTTLS\r\n',
        STARTTLS: '220 Go ahead\r\n',
      },
      password,
      { secure: 'starttls' },
    )
    await client
    expect(server.commands.at(-1)).toBe(`AUTH PLAIN ${b64('\0testuser\0testpass')}`)
  })
})

describe('method selection', () => {
  test('sends AUTH PLAIN without an authorization identity', async () => {
    const { server, client } = login({ EHLO: '250-test\r\n250 AUTH LOGIN PLAIN\r\n' }, password)
    await client
    expect(server.commands.at(-1)).toBe(`AUTH PLAIN ${b64('\0testuser\0testpass')}`)
  })

  test('tries AUTH PLAIN when the server advertises no AUTH', async () => {
    const { server, client } = login({}, password)
    await client
    expect(server.commands.at(-1)).toBe(`AUTH PLAIN ${b64('\0testuser\0testpass')}`)
  })

  test('fails when the server refuses AUTH it did not advertise', async () => {
    const { client } = login({ AUTH: '502 5.5.1 Command not implemented\r\n' }, password)
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.responseCode).toBe(502)
  })

  test('answers a PLAIN challenge when the server takes no initial response', async () => {
    const { server, client } = login(
      { EHLO: '250-test\r\n250 AUTH PLAIN\r\n', AUTH: '334 \r\n', DEFAULT: '235 2.7.0 OK\r\n' },
      password,
    )
    await client
    expect(server.commands.slice(-2)).toEqual([
      `AUTH PLAIN ${b64('\0testuser\0testpass')}`,
      b64('\0testuser\0testpass'),
    ])
  })

  test('reads every advertised method in either AUTH spelling', async () => {
    const { server, client } = login(
      {
        ...loginOnly,
        EHLO: '250-test\r\n250-AUTH=login xoauth2\r\n250 AUTH\tCRAM-MD5  X-PLAIN\r\n',
      },
      password,
    )
    await client
    expect(server.commands).toContain('AUTH LOGIN')
  })

  test('does not take a method name that only starts with PLAIN or LOGIN', async () => {
    const { server, client } = login(
      { EHLO: '250-test\r\n250 AUTH PLAINX X-LOGIN CRAM-MD5-PLUS\r\n' },
      password,
    )
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.message).toContain('PLAINX')
    expect(server.commands.some((line) => line.startsWith('AUTH'))).toBe(false)
  })

  test('fails without sending a password when the server offers only XOAUTH2 or CRAM-MD5', async () => {
    for (const methods of ['XOAUTH2', 'CRAM-MD5']) {
      const { server, client } = login({ EHLO: `250-test\r\n250 AUTH ${methods}\r\n` }, password)
      const error = await failure(client)
      expect(error.code).toBe('EAUTH')
      expect(server.commands.some((line) => line.startsWith('AUTH'))).toBe(false)
    }
  })

  test('reads an AUTH line padded with 200 KiB of whitespace within the test timeout', async () => {
    const padding = ' '.repeat(200 * 1024)
    const { server, client } = login(
      {
        ...loginOnly,
        EHLO: `250-test\r\n250-AUTH${padding}NOMATCH\r\n250 AUTH=${padding}LOGIN\r\n`,
      },
      password,
    )
    await client
    expect(server.commands).toContain('AUTH LOGIN')
  })

  test('uses the method the caller names', async () => {
    const { server, client } = login(
      { ...loginOnly, EHLO: '250-test\r\n250 AUTH PLAIN LOGIN\r\n' },
      { ...password, method: 'LOGIN' },
    )
    await client
    expect(server.commands).toContain('AUTH LOGIN')
  })
})

describe('AUTH LOGIN', () => {
  test('sends the user name and password as separate base64 lines', async () => {
    const { server, client } = login(loginOnly, { user: 'testuser', pass: 'pässword' })
    await client
    expect(server.commands.slice(-3)).toEqual(['AUTH LOGIN', b64('testuser'), b64('pässword')])
  })

  test('sends no credentials when the server does not ask for the user name', async () => {
    const { server, client } = login({ ...loginOnly, AUTH: '503 5.5.1 Not now\r\n' }, password)
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.command).toBe('AUTH LOGIN')
    expect(error.responseCode).toBe(503)
    expect(server.commands.at(-1)).toBe('AUTH LOGIN')
  })

  test('sends no password when the server does not ask for it', async () => {
    const { server, client } = login(
      { ...loginOnly, DEFAULT: '535 5.7.8 Unknown user\r\n' },
      password,
    )
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.responseCode).toBe(535)
    expect(error.enhancedCode).toBe('5.7.8')
    expect(server.commands.slice(-2)).toEqual(['AUTH LOGIN', b64('testuser')])
  })

  test('reports a refused password without repeating it', async () => {
    const { client } = login(
      {
        ...loginOnly,
        DEFAULT: (line) =>
          line === b64('testuser') ? '334 UGFzc3dvcmQ6\r\n' : '535 5.7.8 Bad credentials\r\n',
      },
      password,
    )
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.command).toBe('AUTH LOGIN')
    expectNoSecrets(error, 'testpass', b64('testpass'))
  })
})

describe('AUTH XOAUTH2', () => {
  const token = { user: 'testuser', accessToken: 'ya29.token' }

  test('sends the user and bearer token in one command', async () => {
    const { server, client } = login({ EHLO: '250-test\r\n250 AUTH XOAUTH2\r\n' }, token)
    await client
    expect(server.commands.at(-1)).toBe(
      `AUTH XOAUTH2 ${b64('user=testuser\x01auth=Bearer ya29.token\x01\x01')}`,
    )
  })

  test('answers the error challenge with an empty line and reports the failure', async () => {
    const challenge = b64('{"status":"401","schemes":"bearer","scope":"https://mail.google.com/"}')
    const { server, client } = login(
      {
        EHLO: '250-test\r\n250 AUTH XOAUTH2\r\n',
        AUTH: `334 ${challenge}\r\n`,
        DEFAULT: '535 5.7.8 Username and Password not accepted\r\n',
      },
      token,
    )
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.command).toBe('AUTH XOAUTH2')
    expect(error.responseCode).toBe(535)
    expect(server.commands.at(-1)).toBe('')
    expectNoSecrets(error, 'ya29.token')
  })
})

describe('AUTH replies', () => {
  test('reports a refused PLAIN login with the reply and without the credentials', async () => {
    const { client } = login(
      { EHLO: '250-test\r\n250 AUTH PLAIN\r\n', AUTH: '535 5.7.8 Authentication failed\r\n' },
      password,
    )
    const error = await failure(client)
    expect(error.code).toBe('EAUTH')
    expect(error.command).toBe('AUTH PLAIN')
    expect(error.response).toBe('535 5.7.8 Authentication failed')
    expectNoSecrets(error, 'testpass', b64('\0testuser\0testpass'))
  })

  test('treats a 421 reply to AUTH as the server closing', async () => {
    const { server, client } = login(
      { EHLO: '250-test\r\n250 AUTH PLAIN\r\n', AUTH: '421 4.3.2 Shutting down\r\n' },
      password,
    )
    const error = await failure(client)
    expect(error.code).toBe('ECONNECTION')
    expect(error.responseCode).toBe(421)
    expect(server.closed).toBe(1)
  })
})
