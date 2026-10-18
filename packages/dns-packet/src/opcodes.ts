const names = ['QUERY', 'IQUERY', 'STATUS', 'OPCODE_3', 'NOTIFY', 'UPDATE'] as const

/** An opcode name from the 4-bit header field. Unassigned codes are written `OPCODE_<number>`. */
export type Opcode = (typeof names)[number] | `OPCODE_${number}`

/**
 * Returns the name of an opcode.
 *
 * @example
 * ```ts
 * import { opcodes } from '@portable/dns-packet'
 *
 * opcodes.toString(4) // 'NOTIFY'
 * ```
 */
export function toString(opcode: number): Opcode {
  return names[opcode] ?? `OPCODE_${opcode}`
}

/**
 * Returns the number of an opcode name, case-insensitive, or 0 for an unknown name.
 *
 * @example
 * ```ts
 * import { opcodes } from '@portable/dns-packet'
 *
 * opcodes.toOpcode('update') // 5
 * ```
 */
export function toOpcode(name: string): number {
  const upper = name.toUpperCase()
  const index = names.indexOf(upper as (typeof names)[number])
  if (index !== -1) return index
  const match = /^OPCODE_([6-9]|1[0-5])$/.exec(upper)
  return match ? Number(match[1]) : 0
}
