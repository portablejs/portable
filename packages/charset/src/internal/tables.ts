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
export function unpackInts(text: string): number[] {
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

/** Calls `entry` for each pointer and code point of an index written by `packIndex` in scripts/generate.ts. */
export function unpackIndex(
  text: string,
  start: number,
  entry: (pointer: number, codePoint: number) => void,
): void {
  let pointer = start
  let codePoint = 0
  for (const value of unpackInts(text)) {
    const size = Math.floor(value / 4)
    switch (value & 3) {
      case 0:
        codePoint += size
        entry(pointer++, codePoint)
        break
      case 1:
        codePoint -= size
        entry(pointer++, codePoint)
        break
      case 2:
        for (let i = 0; i < size; i++) {
          entry(pointer++, ++codePoint)
        }
        break
      default:
        pointer += size
    }
  }
}

/**
 * Fills `table` with `code(pointer)` for the first pointer of each BMP code point in an index,
 * leaving code points that already have a value.
 */
export function codeTable(
  table: Uint16Array,
  index: string,
  code: (pointer: number) => number,
  start = 0,
  skip?: (pointer: number) => boolean,
): Uint16Array {
  unpackIndex(index, start, (pointer, codePoint) => {
    if (codePoint < 0x10000 && table[codePoint] === 0 && !skip?.(pointer)) {
      table[codePoint] = code(pointer)
    }
  })
  return table
}

let ascii: Uint16Array | undefined

/** A table for `Encoder.table` with ASCII mapped to itself. */
export function byteTable(): Uint16Array {
  const table = new Uint16Array(0x10000)
  for (let i = 0; i < 0x80; i++) {
    table[i] = 0x100 | i
  }
  return table
}

/** The byte table of charsets whose only single bytes are ASCII. */
export function asciiTable(): Uint16Array {
  return (ascii ??= byteTable())
}
