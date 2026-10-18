const invalidChars = /[\s"<>(),;:\\@[\]\p{Cc}]|[^\P{Cf}\u200c\u200d]/u
const hostName = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/
const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/

export type Domain = { kind: 'name'; name: string } | { kind: 'address' } | { kind: 'invalid' }

export function parseDomain(value: string): Domain {
  const domain = value.trim().toLowerCase()
  if (/^\[[^[\]\\]*\]$/.test(domain)) return { kind: 'address' }
  if (invalidChars.test(domain)) return { kind: 'invalid' }
  const name = toALabel(domain).replace(/\.$/, '')
  if (!hostName.test(name)) return { kind: 'invalid' }
  return ipv4.test(name) ? { kind: 'address' } : { kind: 'name', name }
}

export function canExist(name: string): boolean {
  return name.length <= 253 && name.split('.').every((label) => label.length && label.length <= 63)
}

function toALabel(domain: string): string {
  if (/^\p{ASCII}*$/u.test(domain)) return domain
  return domain
    .split('.')
    .map((label) =>
      /^\p{ASCII}*$/u.test(label) ? label : `xn--${punycode(label.normalize('NFC').toLowerCase())}`,
    )
    .join('.')
}

function punycode(label: string): string {
  const points = Array.from(label, (char) => char.codePointAt(0)!)
  let output = points
    .filter((point) => point < 0x80)
    .map((point) => String.fromCharCode(point))
    .join('')
  const basic = output.length
  if (basic) output += '-'
  let n = 0x80
  let delta = 0
  let bias = 72
  for (let handled = basic; handled < points.length; n++) {
    const next = Math.min(...points.filter((point) => point >= n))
    delta += (next - n) * (handled + 1)
    n = next
    for (const point of points) {
      if (point < n) delta++
      if (point !== n) continue
      let q = delta
      for (let k = 36; ; k += 36) {
        const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias
        if (q < t) break
        output += digit(t + ((q - t) % (36 - t)))
        q = Math.floor((q - t) / (36 - t))
      }
      output += digit(q)
      bias = adapt(delta, handled + 1, handled === basic)
      delta = 0
      handled++
    }
    delta++
  }
  return output
}

function digit(value: number): string {
  return String.fromCharCode(value < 26 ? 97 + value : 22 + value)
}

function adapt(delta: number, points: number, first: boolean): number {
  delta = first ? Math.floor(delta / 700) : delta >> 1
  delta += Math.floor(delta / points)
  let k = 0
  for (; delta > 455; k += 36) delta = Math.floor(delta / 35)
  return k + Math.floor((36 * delta) / (delta + 38))
}
