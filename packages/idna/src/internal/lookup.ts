import * as table from './table.js'

export const disallowed = 0
export const valid = 1
export const mappedToCodePoint = 2
export const mappedToString = 3

export const bidiL = 1
export const bidiR = 2
export const bidiAL = 3
export const bidiAN = 4
export const bidiEN = 5
export const bidiES = 6
export const bidiCS = 7
export const bidiET = 8
export const bidiON = 9
export const bidiBN = 10
export const bidiNSM = 11

export const joiningL = 1
export const joiningD = 2
export const joiningT = 3
export const joiningR = 4

function digit(code: number): number {
  if (code >= 97) {
    return code - 71
  }
  if (code >= 65) {
    return code === 95 ? 63 : code - 65
  }
  return code === 45 ? 62 : code + 4
}

/** Decodes the base64url varints written by `packInts` in scripts/generate.ts. */
function unpackInts(text: string): number[] {
  const values: number[] = []
  for (let i = 0; i < text.length;) {
    let value = 0
    let scale = 1
    let next: number
    do {
      next = digit(text.charCodeAt(i++))
      value += (next & 31) * scale
      scale *= 32
    } while (next & 32)
    values.push(value)
  }
  return values
}

const size = 0x110000
const unzigzag = (n: number) => (n & 1 ? -(n + 1) / 2 : n / 2)

type Table = {
  starts: Int32Array
  /** For each block of 256 code points, the index of the run that holds its first code point. */
  blocks: Int32Array
  /**
   * The kind in the low two bits, and above it the properties, the mapping delta or the string
   * index.
   */
  values: Int32Array
  strings: string[]
}

let decoded: Table | undefined

function decode(): Table {
  const strings: string[] = []
  const packed = unpackInts(table.strings)
  let previous = 0
  for (let i = 0; i < packed.length;) {
    let text = ''
    for (let end = i + 1 + packed[i]!, j = i + 1; j < end; j++) {
      previous += unzigzag(packed[j]!)
      text += String.fromCodePoint(previous)
    }
    strings.push(text)
    i += 1 + packed[i]!
  }

  const properties = unpackInts(table.properties)
  const propertyStarts: number[] = []
  for (let i = 0, start = 0; i < properties.length; i += 2) {
    propertyStarts.push(start)
    start += properties[i]! + 1
  }

  const lengths = unpackInts(table.lengths)
  const kinds = unpackInts(table.values)
  const starts: number[] = []
  const values: number[] = []
  let previousTarget = 0
  let previousIndex = -1
  let p = 0
  for (let i = 0, start = 0; i < lengths.length; i++) {
    const end = start + lengths[i]! + 1
    const kind = kinds[i]! & 3
    if (kind === valid) {
      while ((propertyStarts[p + 1] ?? size) <= start) {
        p++
      }
      for (let at = start; at < end; at = propertyStarts[++p]!) {
        starts.push(at)
        values.push(valid | (properties[p * 2 + 1]! << 2))
        if ((propertyStarts[p + 1] ?? size) >= end) {
          break
        }
      }
    } else if (kind === mappedToCodePoint) {
      const first = previousTarget + unzigzag(kinds[i]! >> 2)
      starts.push(start)
      values.push(kind | ((first - start) * 4))
      previousTarget = first + end - start - 1
    } else if (kind === mappedToString) {
      previousIndex += 1 + unzigzag(kinds[i]! >> 2)
      starts.push(start)
      values.push(kind | (previousIndex << 2))
    } else {
      starts.push(start)
      values.push(kind)
    }
    start = end
  }
  const blocks = new Int32Array((size >> 8) + 1)
  for (let block = 0, run = 0; block < blocks.length; block++) {
    while (run + 1 < starts.length && starts[run + 1]! <= block << 8) {
      run++
    }
    blocks[block] = run
  }
  return { starts: Int32Array.from(starts), blocks, values: Int32Array.from(values), strings }
}

/** The table entry for a code point: the kind in the low two bits, its data above. */
export function lookup(codePoint: number): number {
  const { starts, blocks, values } = (decoded ??= decode())
  let low = blocks[codePoint >> 8]!
  let high = blocks[(codePoint >> 8) + 1]!
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (starts[middle]! <= codePoint) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return values[low]!
}

/** The mapping of a code point whose entry is `mappedToCodePoint` or `mappedToString`. */
export function mapping(codePoint: number, entry: number): string {
  if ((entry & 3) === mappedToCodePoint) {
    return String.fromCodePoint(codePoint + (entry >> 2))
  }
  return decoded!.strings[entry >> 2]!
}
