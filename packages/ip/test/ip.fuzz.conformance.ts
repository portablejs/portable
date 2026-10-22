import * as Ip from '@portable/ip'
import { fc, fuzz, outcome } from '@portable/fuzz'
import { expect, test } from 'vite-plus/test'

const errors = [Ip.InvalidInputError]

const v4 = fc.uint8Array({ minLength: 4, maxLength: 4 })
const v6 = fc.uint8Array({ minLength: 16, maxLength: 16 })
const address = fc.oneof(v4, v6).map((bytes) => Ip.fromBytes(bytes))

const ipLike = fc.string({
  unit: fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom('0', '1', '9', '25', '255', 'f', 'ffff', 'a') },
    { weight: 1, arbitrary: fc.constantFrom('::ffff:', '1.2.3.4', '::', '0:0:0:0:0:0:') },
    { weight: 4, arbitrary: fc.constantFrom('.', ':', '::', '%', '/', 'x', ' ') },
    { weight: 1, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }) },
  ),
  maxLength: 40,
})

test('parses what format writes back to the same address', () => {
  fuzz(
    fc.property(address, (address) => {
      expect(Ip.parse(Ip.format(address))).toEqual(address)
      expect(Ip.compare(address, Ip.format(address))).toBe(0)
    }),
  )
})

test('format writes the same text for every way of writing an address, as URL reads it', () => {
  fuzz(
    fc.property(ipLike, (text) => {
      const parsed = outcome(errors, () => Ip.parse(text))
      expect(Ip.canParse(text)).toBe('value' in parsed)
      if (!('value' in parsed)) return
      const address = parsed.value
      const formatted = Ip.format(address)
      expect(Ip.format(formatted)).toBe(formatted)
      if (address.version === 6 && address.zone) return
      const host = address.version === 4 ? text : `[${text}]`
      const hostname = new URL(`http://${host}/`).hostname.replace(/^\[|\]$/g, '')
      expect(Ip.parse(hostname)).toEqual(address)
    }),
  )
})

test('parseCidr reads its own output and contains its network address', () => {
  fuzz(
    fc.property(address, fc.nat(128), (address, n) => {
      const prefix = n % (address.version === 4 ? 33 : 129)
      const cidr = Ip.parseCidr(`${Ip.format(address)}/${prefix}`)
      expect(Ip.parseCidr(Ip.formatCidr(cidr))).toEqual(cidr)
      expect(Ip.contains(cidr, address)).toBe(true)
      expect(Ip.contains(cidr, cidr.address)).toBe(true)
    }),
  )
})

test('parseCidr throws only InvalidInputError', () => {
  fuzz(
    fc.property(ipLike, (text) => {
      outcome(errors, () => Ip.parseCidr(text))
    }),
  )
})

test('compare is a total order', () => {
  fuzz(
    fc.property(address, address, address, (a, b, c) => {
      expect(Math.sign(Ip.compare(a, b))).toBe(-Math.sign(Ip.compare(b, a)))
      const [first, , last] = [a, b, c].sort(Ip.compare)
      expect(Ip.compare(first!, last!)).toBeLessThanOrEqual(0)
    }),
  )
})

test('range, unmap, toIpv6 and reverseName accept every address', () => {
  fuzz(
    fc.property(address, (address) => {
      expect(typeof Ip.range(address)).toBe('string')
      expect(Ip.compare(Ip.toIpv6(address), Ip.toIpv6(Ip.unmap(address)))).toBe(0)
      expect(Ip.reverseName(address)).toMatch(/\.(in-addr|ip6)\.arpa$/)
    }),
  )
})
