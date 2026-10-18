const base = 36
const tMin = 1
const tMax = 26
const skew = 38
const damp = 700
const initialBias = 72
const initialN = 128
const maxInt = 0x7fffffff

function adapt(delta: number, points: number, first: boolean): number {
  delta = first ? Math.floor(delta / damp) : delta >> 1
  delta += Math.floor(delta / points)
  let k = 0
  for (; delta > ((base - tMin) * tMax) >> 1; k += base) delta = Math.floor(delta / (base - tMin))
  return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew))
}

function digitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 22
  if (code >= 0x41 && code <= 0x5a) return code - 0x41
  if (code >= 0x61 && code <= 0x7a) return code - 0x61
  return base
}

const digitCode = (digit: number) => digit + (digit < 26 ? 0x61 : 22)

/** RFC 3492 decoding of one label without its `xn--` prefix. Returns `undefined` for invalid input. */
export function decode(input: string): string | undefined {
  const delimiter = input.lastIndexOf('-')
  const output: number[] = []
  for (let i = 0; i < delimiter; i++) {
    const code = input.charCodeAt(i)
    if (code >= 0x80) return undefined
    output.push(code)
  }

  let n = initialN
  let bias = initialBias
  let i = 0
  for (let at = delimiter > 0 ? delimiter + 1 : 0; at < input.length;) {
    const old = i
    for (let w = 1, k = base; ; k += base) {
      if (at >= input.length) return undefined
      const digit = digitValue(input.charCodeAt(at++))
      if (digit >= base || digit > Math.floor((maxInt - i) / w)) return undefined
      i += digit * w
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (digit < t) break
      if (w > Math.floor(maxInt / (base - t))) return undefined
      w *= base - t
    }
    const length = output.length + 1
    bias = adapt(i - old, length, old === 0)
    if (Math.floor(i / length) > maxInt - n) return undefined
    n += Math.floor(i / length)
    i %= length
    if (n > 0x10ffff) return undefined
    output.splice(i++, 0, n)
  }
  let text = ''
  for (const code of output) text += String.fromCodePoint(code)
  return text
}

/** RFC 3492 encoding of one label, without the `xn--` prefix. Returns `undefined` on overflow. */
export function encode(input: string): string | undefined {
  const codePoints: number[] = []
  let output = ''
  for (let i = 0; i < input.length; i++) {
    const code = input.codePointAt(i)!
    if (code > 0xffff) i++
    codePoints.push(code)
    if (code < 0x80) output += input[i]
  }

  const basic = output.length
  let handled = basic
  if (basic > 0) output += '-'

  let n = initialN
  let delta = 0
  let bias = initialBias
  while (handled < codePoints.length) {
    let m = maxInt
    for (const code of codePoints) if (code >= n && code < m) m = code
    if (m - n > Math.floor((maxInt - delta) / (handled + 1))) return undefined
    delta += (m - n) * (handled + 1)
    n = m
    for (const code of codePoints) {
      if (code < n && ++delta > maxInt) return undefined
      if (code !== n) continue
      let q = delta
      for (let k = base; ; k += base) {
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
        if (q < t) break
        output += String.fromCharCode(digitCode(t + ((q - t) % (base - t))))
        q = Math.floor((q - t) / (base - t))
      }
      output += String.fromCharCode(digitCode(q))
      bias = adapt(delta, handled + 1, handled === basic)
      delta = 0
      handled++
    }
    delta++
    n++
  }
  return output
}
