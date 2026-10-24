/// <reference types="node" />
// Builds src/internal/table.ts from the Unicode IDNA mapping table and the UCD properties that
// UTS #46 validation reads. Run with `pnpm generate` in packages/idna.
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const version = '18.0.0'
const base = `https://www.unicode.org/Public/${version}`
const size = 0x110000

async function lines(path: string): Promise<string[][]> {
  const response = await fetch(`${base}/${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  const text = await response.text()
  if (!text.includes(version)) throw new Error(`${path} is not version ${version}`)
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line !== '')
    .map((line) => line.split(';').map((field) => field.trim()))
}

async function property(path: string, value: (name: string) => number): Promise<Uint8Array> {
  const result = new Uint8Array(size)
  for (const [field, name] of await lines(path)) {
    const [start, end = start] = field.split('..').map((hex) => parseInt(hex, 16))
    result.fill(value(name), start, end + 1)
  }
  return result
}

// The numbering is shared with src/internal/lookup.ts.
const bidiClasses = ['L', 'R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'BN', 'NSM']
const joiningTypes = ['L', 'D', 'T', 'R']
const bidi = await property('ucd/extracted/DerivedBidiClass.txt', (name) => {
  return bidiClasses.indexOf(name) + 1
})
const joining = await property('ucd/extracted/DerivedJoiningType.txt', (name) => {
  return joiningTypes.indexOf(name) + 1
})
const mark = await property('ucd/extracted/DerivedGeneralCategory.txt', (name) => {
  return name === 'Mn' || name === 'Mc' || name === 'Me' ? 1 : 0
})
const virama = await property('ucd/extracted/DerivedCombiningClass.txt', (name) => {
  return name === '9' ? 1 : 0
})

const disallowed = 0
const valid = 1
const mappedToCodePoint = 2
const mappedToString = 3

// Deviation characters are valid, because only nontransitional processing is supported.
const kinds = new Uint8Array(size).fill(disallowed)
const targets = new Int32Array(size)
const props = new Int32Array(size)
const strings = new Array<string>()
const stringIndex = new Map<string, number>()

for (const [field, status, mapping = ''] of await lines('idna/IdnaMappingTable.txt')) {
  const [start, end = start] = field.split('..').map((hex) => parseInt(hex, 16))
  for (let cp = start; cp <= end; cp++) {
    if (status === 'valid' || status === 'deviation') {
      kinds[cp] = valid
      props[cp] = bidi[cp] | (joining[cp] << 4) | (mark[cp] << 7) | (virama[cp] << 8)
    } else if (status === 'mapped' || status === 'ignored') {
      const target = mapping === '' ? [] : mapping.split(' ').map((hex) => parseInt(hex, 16))
      if (target.length === 1) {
        kinds[cp] = mappedToCodePoint
        targets[cp] = target[0]!
      } else {
        const text = String.fromCodePoint(...target)
        if (!stringIndex.has(text)) {
          stringIndex.set(text, strings.length)
          strings.push(text)
        }
        kinds[cp] = mappedToString
        targets[cp] = stringIndex.get(text)!
      }
    } else if (status !== 'disallowed') throw new Error(`Unknown status ${status}`)
  }
}

const zigzag = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// unpackInts() in src/internal/lookup.ts reads this format.
function packInts(numbers: readonly number[]): string {
  let text = ''
  for (let value of numbers) {
    while (value >= 32) {
      text += alphabet[32 | (value & 31)]
      value = Math.floor(value / 32)
    }
    text += alphabet[value]
  }
  return text
}

// Runs of code points with the same status. A run mapped to code points maps each one to the
// next code point after the previous one's target, so its value is the first target's distance
// from the end of the previous mapped run. A run mapped to a string stores the string index's
// distance from the one after the previous string index. Both are small, which packs well.
const lengths = new Array<number>()
const values = new Array<number>()
let previousTarget = 0
let previousIndex = -1
for (let start = 0; start < size;) {
  const kind = kinds[start]
  const same = (cp: number) => {
    if (kinds[cp] !== kind) return false
    if (kind === mappedToCodePoint) return targets[cp] === targets[cp - 1] + 1
    if (kind === mappedToString) return targets[cp] === targets[start]
    return true
  }
  let end = start + 1
  while (end < size && same(end)) end++
  lengths.push(end - start - 1)
  if (kind === mappedToCodePoint) {
    values.push(kind | (zigzag(targets[start] - previousTarget) << 2))
    previousTarget = targets[end - 1]!
  } else if (kind === mappedToString) {
    values.push(kind | (zigzag(targets[start] - previousIndex - 1) << 2))
    previousIndex = targets[start]!
  } else values.push(kind)
  start = end
}

// Runs of validation properties, as pairs of (length - 1, properties). Only valid code points
// are ever looked up, so the others join whichever run they sit in.
const propertyRuns = new Array<number>()
let current = -1
let length = 0
for (let cp = 0; cp < size; cp++) {
  if (kinds[cp] !== valid || props[cp] === current) length++
  else {
    if (current >= 0) propertyRuns.push(length - 1, current)
    current = props[cp]!
    length = 1
  }
}
propertyRuns.push(length - 1, current)

// Each string as its length, then its code points as zigzag deltas from the previous code point.
const packedStrings = new Array<number>()
let previous = 0
for (const text of strings) {
  const codePoints = Array.from(text, (char) => char.codePointAt(0)!)
  packedStrings.push(codePoints.length)
  for (const cp of codePoints) {
    packedStrings.push(zigzag(cp - previous))
    previous = cp
  }
}

const source =
  `// Generated by scripts/generate.ts from Unicode ${version}. Do not edit.\n` +
  `export const lengths: string =\n  '${packInts(lengths)}'\n` +
  `export const values: string =\n  '${packInts(values)}'\n` +
  `export const properties: string =\n  '${packInts(propertyRuns)}'\n` +
  `export const strings: string =\n  '${packInts(packedStrings)}'\n`
writeFileSync(new URL('../src/internal/table.ts', import.meta.url), source)

console.log(
  `${lengths.length} status runs, ${propertyRuns.length / 2} property runs, ${strings.length} strings: ` +
    `${source.length} bytes, ${gzipSync(source).length} gzipped`,
)
