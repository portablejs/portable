import { p256, p384, p521 } from '@noble/curves/nist.js'
import { fc, fuzz, mutated, outcome } from '@portable/fuzz'
import * as WebCrypto from '@portable/web-crypto'
import { expect, test } from 'vite-plus/test'

const curves = {
  'P-256': { size: 32, noble: p256 },
  'P-384': { size: 48, noble: p384 },
  'P-521': { size: 66, noble: p521 },
} as const
type Curve = keyof typeof curves

/** Each half of a raw signature, biased toward leading zero bytes and a set top bit. */
const half = (size: number) =>
  fc
    .tuple(fc.uint8Array({ minLength: size, maxLength: size }), fc.nat(size), fc.boolean())
    .map(([bytes, zeros, high]) => {
      bytes.fill(0, 0, zeros)
      if (high && zeros < size) {
        bytes[zeros]! |= 0x80
      }
      return bytes
    })

const signature = fc
  .constantFrom(...(Object.keys(curves) as Curve[]))
  .chain((namedCurve) =>
    fc
      .tuple(half(curves[namedCurve].size), half(curves[namedCurve].size))
      .map(([r, s]) => ({ namedCurve, raw: Uint8Array.of(...r, ...s) })),
  )

test('rawToDerEcdsa writes the DER @noble/curves writes', () => {
  fuzz(
    fc.property(signature, ({ namedCurve, raw }) => {
      const { noble } = curves[namedCurve]
      let expected: Uint8Array
      try {
        expected = noble.Signature.fromBytes(raw, 'compact').toBytes('der')
      } catch {
        return
      }
      expect(WebCrypto.rawToDerEcdsa(raw)).toEqual(expected)
    }),
  )
})

test('derToRawEcdsa accepts the DER @noble/curves accepts, and reads it the same way', () => {
  fuzz(
    fc.property(
      signature.chain(({ namedCurve, raw }) =>
        fc.record({
          namedCurve: fc.constant(namedCurve),
          der: fc.oneof(
            fc.constant(WebCrypto.rawToDerEcdsa(raw)),
            mutated(WebCrypto.rawToDerEcdsa(raw)),
          ),
        }),
      ),
      ({ namedCurve, der }) => {
        const { noble } = curves[namedCurve]
        let expected: Uint8Array
        try {
          expected = noble.Signature.fromBytes(der, 'der').toBytes('compact')
        } catch {
          return
        }
        expect(
          outcome([WebCrypto.InvalidInputError], () =>
            WebCrypto.derToRawEcdsa(der, { namedCurve }),
          ),
        ).toEqual({ value: expected })
      },
    ),
  )
})
