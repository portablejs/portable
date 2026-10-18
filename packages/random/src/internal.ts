/** Returns a uniformly distributed unsigned 32-bit integer. */
export type Next = () => number

export const urlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const two32 = 2 ** 32
const two53 = 2 ** 53

export function below(next: Next, n: number): number {
  const limit = two32 - (two32 % n)
  let x = next()
  while (x >= limit) x = next()
  return x % n
}

export function int(next: Next, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))
    throw new RangeError(`Expected safe integers, got ${min} and ${max}.`)
  if (min > max) throw new RangeError(`Expected min <= max, got ${min} and ${max}.`)
  if (max - min > Number.MAX_SAFE_INTEGER)
    throw new RangeError(`The range ${min} to ${max} has more than 2^53 integers.`)
  const n = max - min + 1
  if (n <= two32) return min + below(next, n)
  const limit = two53 - (two53 % n)
  let x: number
  do x = (next() >>> 11) * two32 + next()
  while (x >= limit)
  return min + (x % n)
}

export function float(next: Next): number {
  return ((next() >>> 11) * two32 + next()) / two53
}

let cachedAlphabet = urlAlphabet
let cachedCharacters: readonly string[] = Array.from(urlAlphabet)

export function string(next: Next, length: number, alphabet: string): string {
  checkLength(length)
  if (alphabet !== cachedAlphabet) {
    if (alphabet === '') throw new RangeError('Expected a non-empty alphabet.')
    cachedCharacters = Array.from(alphabet)
    cachedAlphabet = alphabet
  }
  const characters = cachedCharacters
  const n = characters.length
  let result = ''
  if (n > 256) {
    for (let i = 0; i < length; i++) result += characters[below(next, n)]
    return result
  }
  const limit = 256 - (256 % n)
  let word = 0
  let left = 0
  for (let i = 0; i < length;) {
    if (left === 0) {
      word = next()
      left = 4
    }
    const byte = word & 255
    word >>>= 8
    left--
    if (byte < limit) {
      result += characters[byte % n]
      i++
    }
  }
  return result
}

export function shuffle<T>(next: Next, array: readonly T[]): T[] {
  const result = array.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = below(next, i + 1)
    const value = result[i]!
    result[i] = result[j]!
    result[j] = value
  }
  return result
}

export function pick<T>(next: Next, array: readonly T[]): T {
  if (array.length === 0) throw new RangeError('Cannot pick from an empty array.')
  return array[below(next, array.length)]!
}

export function checkLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 0)
    throw new RangeError(`Expected length to be a non-negative integer, got ${length}.`)
}
