import * as upstream from 'dns-packet'
import { expect, test } from 'vite-plus/test'
import { decode, encode, type Packet } from '@portable/dns-packet'
import responses from './fixtures/responses.json' with { type: 'json' }
import { hex } from './utils.js'

const messages = responses.map(({ hex: text }) => hex(text))
const buffers = messages.map((message) => Buffer.from(message))
const packets = messages.map((message) => decode(message))
const upstreamPackets = buffers.map((buffer) => upstream.decode(buffer))

test(`decodes ${messages.length} real responses within 25% of dns-packet`, async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dns-packet', () => {
      for (const message of messages) {
        decode(message)
      }
    }),
    bench('dns-packet', () => {
      for (const buffer of buffers) {
        upstream.decode(buffer)
      }
    }),
  )
  expect(result.get('dns-packet')).not.toBeFasterThan(result.get('@portable/dns-packet'), {
    delta: 0.25,
  })
})

test(`encodes ${messages.length} real responses within 25% of dns-packet`, async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dns-packet', () => {
      for (const packet of packets) {
        encode(packet)
      }
    }),
    bench('@portable/dns-packet, compress', () => {
      for (const packet of packets) {
        encode(packet, { compress: true })
      }
    }),
    bench('dns-packet', () => {
      for (const packet of upstreamPackets) {
        upstream.encode(packet)
      }
    }),
  )
  expect(result.get('dns-packet')).not.toBeFasterThan(result.get('@portable/dns-packet'), {
    delta: 0.25,
  })
})

const query = {
  id: 1,
  flags: { rd: true },
  questions: [{ type: 'A', name: 'example.com' }],
  additionals: [{ type: 'OPT', dnssecOk: true }],
} satisfies Packet
const upstreamQuery = {
  id: 1,
  flags: upstream.RECURSION_DESIRED,
  questions: [{ type: 'A', name: 'example.com' }],
  additionals: [{ type: 'OPT', name: '.', flags: upstream.DNSSEC_OK }],
} as upstream.Packet

test('encodes a DNS-over-HTTPS query within 25% of dns-packet', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/dns-packet', () => {
      encode(query)
    }),
    bench('dns-packet', () => {
      upstream.encode(upstreamQuery)
    }),
  )
  expect(result.get('dns-packet')).not.toBeFasterThan(result.get('@portable/dns-packet'), {
    delta: 0.25,
  })
})
