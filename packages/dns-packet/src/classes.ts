const names = { IN: 1, CS: 2, CH: 3, HS: 4, ANY: 255 } as const

/** A record class name. Classes without a name are written `UNKNOWN_<number>`. */
export type RecordClass = keyof typeof names | `UNKNOWN_${number}`

const byNumber = new Map<number, RecordClass>(
  Object.entries(names).map(([name, klass]) => [klass, name as RecordClass]),
)

/**
 * Returns the name of a class number, or `UNKNOWN_<number>`.
 *
 * @example
 * ```ts
 * import { classes } from '@portable/dns-packet'
 *
 * classes.toString(3) // 'CH'
 * ```
 */
export function toString(klass: number): RecordClass {
  return byNumber.get(klass) ?? `UNKNOWN_${klass}`
}

/**
 * Returns the number of a class name, case-insensitive. `UNKNOWN_<number>` is that number, and
 * any other name is 0.
 *
 * @example
 * ```ts
 * import { classes } from '@portable/dns-packet'
 *
 * classes.toClass('in') // 1
 * ```
 */
export function toClass(name: string): number {
  const upper = name.toUpperCase()
  if (Object.hasOwn(names, upper)) return names[upper as keyof typeof names]
  if (upper.startsWith('UNKNOWN_')) return Number.parseInt(upper.slice(8), 10)
  return 0
}
