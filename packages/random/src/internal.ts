export type Next = () => number

export type Fill = (bytes: Uint8Array<ArrayBuffer>) => void

export const urlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const two32 = 2 ** 32
const two53 = 2 ** 53

export function below(next: Next, n: number): number {
  if (n <= 0x7fffffff) {
    const max = 0x7fffffff - (((0x7fffffff % n) + 1) % n)
    let x = next() >>> 1
    while (x > max) x = next() >>> 1
    return x % n
  }
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

export type Alphabet = {
  readonly characters: readonly string[]
  readonly table: Uint8Array | undefined
}

function parse(text: string): Alphabet {
  if (text === '') throw new RangeError('Expected a non-empty alphabet.')
  const characters = Array.from(text)
  const n = characters.length
  if (n > 256 || characters.some((character) => character.charCodeAt(0) > 0x7f))
    return { characters, table: undefined }
  const limit = 256 - (256 % n)
  const table = new Uint8Array(256).fill(255)
  for (let byte = 0; byte < limit; byte++) table[byte] = text.charCodeAt(byte % n)
  return { characters, table }
}

let cachedText = urlAlphabet
let cached = parse(urlAlphabet)

export function alphabet(text: string): Alphabet {
  if (text !== cachedText) {
    cached = parse(text)
    cachedText = text
  }
  return cached
}

const decoder = new TextDecoder()

export function string(next: Next, fill: Fill, length: number, alphabet: Alphabet): string {
  const { characters, table } = alphabet
  if (table === undefined) {
    let result = ''
    for (let i = 0; i < length; i++) result += characters[below(next, characters.length)]
    return result
  }
  const out = new Uint8Array(length)
  if (256 % characters.length === 0) {
    fill(out)
    for (let j = 0; j < length; j++) out[j] = table[out[j]!]!
    return decoder.decode(out)
  }
  let i = 0
  while (i < length) {
    const start = i
    fill(out.subarray(start))
    for (let j = start; j < length; j++) {
      const code = table[out[j]!]!
      if (code < 128) out[i++] = code
    }
  }
  return decoder.decode(out)
}

export function shuffle<value>(next: Next, array: readonly value[]): value[] {
  const result = array.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = below(next, i + 1)
    const value = result[i]!
    result[i] = result[j]!
    result[j] = value
  }
  return result
}

export function pick<value>(next: Next, array: readonly value[]): value {
  if (array.length === 0) throw new RangeError('Cannot pick from an empty array.')
  return array[below(next, array.length)]!
}

export function checkLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 0)
    throw new RangeError(`Expected length to be a non-negative integer, got ${length}.`)
}
