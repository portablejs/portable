const names = {
  LLQ: 1,
  UL: 2,
  NSID: 3,
  DAU: 5,
  DHU: 6,
  N3U: 7,
  CLIENT_SUBNET: 8,
  EXPIRE: 9,
  COOKIE: 10,
  TCP_KEEPALIVE: 11,
  PADDING: 12,
  CHAIN: 13,
  KEY_TAG: 14,
  DEVICEID: 26946,
} as const

/** An EDNS option code name. Codes without a name are written `OPTION_<number>`. */
export type OptionCode = keyof typeof names | `OPTION_${number}`

const byNumber = new Map<number, OptionCode>(
  Object.entries(names).map(([name, code]) => [code, name as OptionCode]),
)

/**
 * Returns the name of an EDNS option code, `OPTION_<number>` for one without a name, or `null`
 * for a negative number.
 *
 * @example
 * ```ts
 * import { optioncodes } from '@portable/dns-packet'
 *
 * optioncodes.toString(8) // 'CLIENT_SUBNET'
 * ```
 */
export function toString(code: number): OptionCode | null {
  if (code < 0) return null
  return byNumber.get(code) ?? `OPTION_${code}`
}

/**
 * Returns the number of an EDNS option code name, case-insensitive. A number is returned as is,
 * a name ending in `_<number>` is that number, and anything else is -1.
 *
 * @example
 * ```ts
 * import { optioncodes } from '@portable/dns-packet'
 *
 * optioncodes.toCode('padding') // 12
 * ```
 */
export function toCode(name: string | number | null | undefined): number {
  if (typeof name === 'number') return name
  if (!name) return -1
  const upper = name.toUpperCase()
  if (Object.hasOwn(names, upper)) return names[upper as keyof typeof names]
  const match = /_(\d+)$/.exec(upper)
  return match ? Number.parseInt(match[1]!, 10) : -1
}
