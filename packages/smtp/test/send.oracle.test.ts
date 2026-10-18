import { Readable } from 'node:stream'
import * as Smtp from '@portable/smtp'
import { fromIterable } from '@portable/streams'
import nodemailer from 'nodemailer'
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'
import { connect, startCapture, type Capture } from './node.js'
import { startServer, type TestServer } from './server.js'
import { encode } from './utils.js'

function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

function randomChunks(bytes: Uint8Array, seed: number): Uint8Array[] {
  const next = random(seed)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(next() * 64)
    chunks.push(bytes.subarray(i, i + size))
    i += size
  }
  return chunks
}

function randomMessage(seed: number, length: number): Uint8Array {
  const pieces = ['a', 'b', '.', '..', '\r', '\n', '\r\n', '\n.', '\r.\r', '.\r\n', 'ö', ' ', '\t']
  const next = random(seed)
  let text = 'Subject: random\r\n\r\n'
  while (text.length < length) text += pieces[Math.floor(next() * pieces.length)]
  return encode(text)
}

const binary = new Uint8Array(4096).map((_, i) => (i * 7919) % 256)

const inputs: Record<string, Uint8Array> = {
  crlf: encode('Subject: test\r\n\r\nline one\r\nline two\r\n'),
  'bare LF': encode('Subject: test\n\nline one\nline two\n'),
  'bare CR': encode('Subject: test\r\rline one\rline two\r'),
  dots: encode('Subject: dots\r\n\r\n.\r\n..\r\n.leading\r\nmiddle.dot\n.\n.end'),
  'no final line break': encode('Subject: test\r\n\r\nno newline at the end'),
  'final CR': encode('Subject: test\r\n\r\nends with CR\r'),
  '8-bit': encode('Subject: õäöü\r\n\r\nПривет мир 🚀\r\n'),
  'smuggling attempt': encode('Subject: x\r\n\r\na\r.\rMAIL FROM:<x@evil.example>\r\n\n.\n'),
  binary,
  'random 1': randomMessage(1, 2000),
  'random 2': randomMessage(2, 20000),
  'random 3': randomMessage(3, 70000),
}

let capture: Capture
let delivered: TestServer

beforeAll(async () => {
  capture = await startCapture()
  delivered = await startServer({ disabledCommands: ['STARTTLS', 'AUTH'] })
})

afterAll(async () => {
  await capture.close()
  await delivered.close()
})

const envelope = { from: 'test@valid.sender', to: ['test@valid.recipient'] }

async function viaNodemailer(port: number, message: Uint8Array, chunks?: Uint8Array[]) {
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port, ignoreTLS: true })
  try {
    return await transport.sendMail({
      envelope,
      raw: chunks ? Readable.from(chunks.map((chunk) => Buffer.from(chunk))) : Buffer.from(message),
    })
  } finally {
    transport.close()
  }
}

async function viaSmtp(port: number, message: Uint8Array, chunks?: Uint8Array[]) {
  return Smtp.send(
    { ...envelope, message: chunks ? fromIterable(chunks) : message },
    { connect, host: 'localhost', port, secure: 'off' },
  )
}

describe('sends the same bytes as nodemailer', () => {
  for (const [name, message] of Object.entries(inputs)) {
    test(`${name}, on the wire and as delivered`, async () => {
      for (const chunks of [undefined, randomChunks(message, 1), randomChunks(message, 2)]) {
        await viaNodemailer(capture.port, message, chunks)
        await viaSmtp(capture.port, message, chunks)
        const [theirs, ours] = capture.data.splice(-2)
        expect(ours).toEqual(theirs)

        await viaNodemailer(delivered.port, message, chunks)
        await viaSmtp(delivered.port, message, chunks)
        const [theirMessage, ourMessage] = delivered.received.splice(-2)
        expect(ourMessage!.data).toEqual(theirMessage!.data)
        expect([ourMessage!.from, ourMessage!.to]).toEqual([theirMessage!.from, theirMessage!.to])
      }
    })
  }
})

describe('reports the same recipients as nodemailer', () => {
  test('a partly refused envelope', async () => {
    const to = ['a@valid.recipient', 'b@invalid.recipient', 'c@valid.recipient']
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: delivered.port,
      ignoreTLS: true,
    })
    const theirs = await transport.sendMail({ envelope: { from: envelope.from, to }, raw: 'test' })
    transport.close()
    const ours = await Smtp.send(
      { from: envelope.from, to, message: 'test' },
      { connect, host: 'localhost', port: delivered.port, secure: 'off' },
    )
    expect(ours.accepted).toEqual(theirs.accepted)
    expect(ours.rejected.map((r) => r.recipient)).toEqual(theirs.rejected)
    expect(ours.response).toBe(theirs.response)
    delivered.received.splice(0)
  })

  test('an envelope refused for every recipient', async () => {
    const to = ['a@invalid.recipient', 'b@invalid.recipient']
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: delivered.port,
      ignoreTLS: true,
    })
    const theirs = await transport
      .sendMail({ envelope: { from: envelope.from, to }, raw: 'test' })
      .catch((error: { code: string; responseCode: number; rejected: string[] }) => error)
    transport.close()
    const ours = await Smtp.send(
      { from: envelope.from, to, message: 'test' },
      { connect, host: 'localhost', port: delivered.port, secure: 'off' },
    ).catch((error: Smtp.CommandError) => error)
    expect(ours).toBeInstanceOf(Smtp.CommandError)
    const error = ours as Smtp.CommandError
    const expected = theirs as { code: string; responseCode: number; rejected: string[] }
    expect(error.code).toBe(expected.code)
    expect(error.responseCode).toBe(expected.responseCode)
    expect(error.rejected?.map((r) => r.recipient)).toEqual(expected.rejected)
  })
})
