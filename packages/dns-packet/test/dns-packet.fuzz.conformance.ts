import * as DnsPacket from '@portable/dns-packet'
import { fc, fuzz, mutated, outcome } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'
import responses from './fixtures/responses.json' with { type: 'json' }
import { hex } from './utils.js'

const errors = [DnsPacket.TruncatedError, DnsPacket.InvalidInputError]
const captured = responses.map((response) => hex(response.hex))
const response = fc.constantFrom(...captured)
const corrupted = response.chain((bytes) => mutated(bytes))

test('decode returns or throws TruncatedError or InvalidInputError for a corrupted response', () => {
  fuzz(
    fc.property(corrupted, fc.boolean(), (bytes, tcp) => {
      const input = tcp ? Uint8Array.of(bytes.length >> 8, bytes.length & 255, ...bytes) : bytes
      outcome(errors, () => DnsPacket.decode(input, tcp ? { framing: 'tcp' } : {}))
    }),
    { scale: 20 },
  )
})

test('decode returns or throws TruncatedError or InvalidInputError for random bytes', () => {
  fuzz(
    fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
      outcome(errors, () => DnsPacket.decode(bytes))
    }),
    { scale: 5 },
  )
})

test('a decoded packet encodes to bytes that decode to the same packet', () => {
  fuzz(
    fc.property(
      fc.oneof(response, corrupted),
      fc.constantFrom<DnsPacket.encode.Options>({}, { compress: true }, { framing: 'tcp' }),
      (bytes, options) => {
        const result = outcome(errors, () => DnsPacket.decode(bytes))
        const packet = 'value' in result ? result.value : DnsPacket.decode(captured[0]!)
        const encoded = outcome([DnsPacket.UnsupportedError], () =>
          DnsPacket.encode(packet, options),
        )
        const again =
          'value' in encoded
            ? DnsPacket.decode(encoded.value, { framing: options.framing })
            : packet
        expect(again).toEqual(packet)
      },
    ),
    { scale: 10 },
  )
})
