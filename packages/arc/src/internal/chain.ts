import { binaryToText, type Field, parseTags } from '@portable/dkim/internal'

export type ArcSet = {
  instance: number
  results: Field
  signature: Field
  seal: Field
}

export const maxInstance = 50

const short: Record<string, string> = {
  'arc-seal': 'as',
  'arc-message-signature': 'ams',
  'arc-authentication-results': 'aar',
}

const cfws = '(?:[ \\t\\r\\n]|\\([^()\\\\]*\\))*'
const resultsInstance = new RegExp(`^${cfws}i${cfws}=${cfws}([0-9]{1,2})${cfws};`)
const anyResultsInstance = new RegExp(`^${cfws}i${cfws}=${cfws}([0-9]+)`)

export const isArcField = (field: Field): boolean => Object.hasOwn(short, field.name)

const value = (field: Field): string => field.raw.slice(field.raw.indexOf(':') + 1)

/**
 * The instance as RFC 8617 section 3.9 writes it, 1 to 50 in one or two digits. An
 * ARC-Authentication-Results field starts with it (section 4.1.1); the other two have it as the
 * `i=` tag.
 */
function instanceOf(field: Field): number | undefined {
  const text =
    field.name === 'arc-authentication-results'
      ? resultsInstance.exec(value(field))?.[1]
      : parseTags(value(field)).tags.get('i')
  if (text === undefined || !/^[0-9]{1,2}$/.test(text)) return undefined
  const instance = Number(text)
  return instance >= 1 && instance <= maxInstance ? instance : undefined
}

/**
 * Groups the ARC fields into sets and checks the structure of the chain (RFC 8617 section 5.2
 * step 3): instances 1 to N with no gap, and each set with exactly one field of each kind.
 */
export function readChain(fields: readonly Field[]): ArcSet[] | string {
  const byInstance = new Map<number, Partial<Record<string, Field>>>()
  for (const field of fields) {
    if (!isArcField(field)) continue
    const instance = instanceOf(field)
    if (instance === undefined) return `invalid ${short[field.name]} instance`
    const set = byInstance.get(instance) ?? {}
    if (set[field.name]) return `i=${instance} has more than one ${short[field.name]}`
    set[field.name] = field
    byInstance.set(instance, set)
  }
  const sets: ArcSet[] = []
  for (let instance = 1; instance <= byInstance.size; instance++) {
    const set = byInstance.get(instance)
    if (!set) return `i=${instance} is missing`
    const results = set['arc-authentication-results']
    const signature = set['arc-message-signature']
    const seal = set['arc-seal']
    if (!results) return `i=${instance} has no aar`
    if (!signature) return `i=${instance} has no ams`
    if (!seal) return `i=${instance} has no as`
    sets.push({ instance, results, signature, seal })
  }
  return sets
}

/**
 * The highest instance on any ARC field, read leniently so that a new set never reuses one, and
 * the `cv=` of the seal with that instance (RFC 8617 section 5.1 steps 2 and 3).
 */
export function newest(fields: readonly Field[]): { instance: number; cv: string | undefined } {
  let instance = 0
  let cv: string | undefined
  for (const field of fields) {
    if (!isArcField(field)) continue
    const text =
      field.name === 'arc-authentication-results'
        ? anyResultsInstance.exec(value(field))?.[1]
        : parseTags(value(field)).tags.get('i')
    const number = text !== undefined && /^[0-9]+$/.test(text) ? Number(text) : 0
    if (number > instance) {
      instance = number
      cv = undefined
    }
    if (number > 0 && number === instance && field.name === 'arc-seal') cv = chainValidation(field)
  }
  return { instance, cv }
}

/** The `cv=` value of an ARC-Seal in lower case: the tag is case-insensitive (RFC 8617 section 3.9). */
export const chainValidation = (seal: Field): string | undefined =>
  parseTags(value(seal)).tags.get('cv')?.toLowerCase()

/** The text of an ARC-Authentication-Results field after its instance, unfolded. */
export function authResultsOf(field: Field): string {
  const text = value(field)
  const match = resultsInstance.exec(text)
  return binaryToText(text.slice(match ? match[0].length : 0))
    .replaceAll('\r\n', '')
    .trim()
}
